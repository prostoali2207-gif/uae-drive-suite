const RENTAL_SPREADSHEET_ID = '1XnAQPfubyv80uEUgszDZZfRVAir35yIth718r7AERps';
const SHOWROOM_SPREADSHEET_ID = '16Nb1bP-u5ox9RX4kH5fWa-GaYvAIoisyLMFSiGbtvJA';
const PEACH_TOKEN_SHA256 = ['a837eb5861426d57','f2b47398aac8f43d','c3852a4d74651aec','fb0ccb6ccb73dc6f'].join('');

const INPUT_SHEET = 'Ввод операций';
const REFERENCE_SHEET = 'Справочники';
const INPUT_FIRST_ROW = 5;
const INPUT_LAST_ROW = 1004;

const LEDGER_CONFIG = Object.freeze({
  rental: Object.freeze({
    spreadsheetId: RENTAL_SPREADSHEET_ID,
    accounts: Object.freeze({
      cash_aed: 'Касса (AED)',
      ajman_aed: 'AJMAN (AED)',
      sber_rub: 'СБЕР (RUB)',
    }),
    referenceRange: 'A2:D256',
    monthSheet: null,
  }),
  showroom: Object.freeze({
    spreadsheetId: SHOWROOM_SPREADSHEET_ID,
    accounts: Object.freeze({
      cash_aed: 'Касса',
      ajman_aed: 'AJMAN',
    }),
    referenceRange: 'A2:E31',
    monthSheet: 'Октябрь 2026',
  }),
});

function doGet(e) {
  const ledger = validateLedger_((e && e.parameter && e.parameter.ledger) || 'rental');
  const config = ledgerConfig_(ledger);
  const period = activePeriod_(ledger);

  return json_({
    ok: true,
    service: 'Al Musafir Google Sheets Finance Bridge',
    ledger,
    spreadsheet_id: config.spreadsheetId,
    input_sheet: INPUT_SHEET,
    period,
  });
}

function doPost(e) {
  const startedAt = Date.now();
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const token = String(body.token || '');
    if (!token || sha256Hex_(token) !== PEACH_TOKEN_SHA256) {
      return json_({ ok: false, error: 'Unauthorized', bridge_ms: Date.now() - startedAt });
    }

    const action = String(body.action || '').trim();
    const payload = body.payload && typeof body.payload === 'object' ? body.payload : {};
    let result;

    if (action === 'find_articles') result = findArticles_(payload);
    else if (action === 'record_entry') result = recordEntry_(payload);
    else if (action === 'get_context') result = getContext_(payload);
    else result = { ok: false, error: 'Unsupported finance bridge action.' };

    result.bridge_ms = Date.now() - startedAt;
    return json_(result);
  } catch (error) {
    return json_({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      bridge_ms: Date.now() - startedAt,
    });
  }
}

function getContext_(payload) {
  const ledger = validateLedger_(payload && payload.ledger);
  const config = ledgerConfig_(ledger);
  const period = activePeriod_(ledger);

  return {
    ok: true,
    action: 'get_context',
    ledger,
    period,
    accounts: Object.keys(config.accounts).map(function (key) {
      return { account: key, label: config.accounts[key] };
    }),
    input_sheet: INPUT_SHEET,
    spreadsheet_id: config.spreadsheetId,
  };
}

function findArticles_(payload) {
  const ledger = validateLedger_(payload.ledger);
  const account = validateAccount_(payload.account, ledger);
  const date = validateActiveDate_(payload.date, ledger);
  const period = activePeriod_(ledger);
  const query = normalize_(payload.query || '');
  const requestedDirection = String(payload.direction || '').trim();

  if (!query) throw new Error('query is required.');

  const rows = referenceRows_(ledger);
  const tokens = query.split(' ').filter(Boolean);
  const matches = [];

  for (let i = 0; i < rows.length; i++) {
    const parsed = parseReferenceRow_(rows[i], ledger, account, i + 2);
    if (!parsed || !parsed.operation) continue;
    if (requestedDirection && parsed.direction !== requestedDirection) continue;

    const haystack = normalize_(parsed.operation + ' ' + parsed.searchTerms);
    const matchedTokens = tokens.filter(function (token) {
      return haystack.indexOf(token) !== -1;
    }).length;

    if (!haystack.includes(query) && matchedTokens === 0) continue;

    matches.push({
      row: parsed.mappedRow,
      article: parsed.operation,
      section: parsed.direction || null,
      reference_row: parsed.referenceRow,
      score: haystack.includes(query) ? 100 + tokens.length : matchedTokens,
    });
  }

  matches.sort(function (a, b) {
    return b.score - a.score || a.row - b.row;
  });

  const config = ledgerConfig_(ledger);
  return {
    ok: true,
    action: 'find_articles',
    ledger,
    account,
    account_label: config.accounts[account],
    date,
    period,
    count: matches.length,
    matches: matches.slice(0, 20),
  };
}

function recordEntry_(payload) {
  const ledger = validateLedger_(payload.ledger);
  const config = ledgerConfig_(ledger);
  const account = validateAccount_(payload.account, ledger);
  const date = validateDate_(payload.date, ledger);
  const period = activePeriod_(ledger);

  if (date < period.start || date > period.end) {
    throw new Error(
      'Дата ' + date + ' вне активного периода таблицы: ' + period.start + ' — ' + period.end + '.'
    );
  }

  const article = String(payload.article || '').trim();
  const note = String(payload.note || '').trim();
  const amount = Number(payload.amount);

  if (!article) throw new Error('article is required.');
  if (article.length > 250) throw new Error('article is too long.');
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('amount must be greater than zero.');
  if (note.length > 500) throw new Error('note is too long.');

  const ref = resolveReference_(article, account, payload.row, ledger);
  if (!ref) throw new Error('Operation not found in Справочники.');

  const requestId = String(payload.request_id || '').trim();
  const sheet = spreadsheet_(ledger).getSheetByName(INPUT_SHEET);
  if (!sheet) throw new Error('Лист «Ввод операций» не найден.');

  const lock = LockService.getScriptLock();
  lock.waitLock(15000);

  try {
    const inputState = inspectInputRows_(sheet, requestId);

    if (requestId && inputState.existingRow) {
      return recordResult_(
        ledger,
        account,
        config.accounts[account],
        date,
        period,
        inputState.existingRow,
        ref,
        amount,
        note,
        requestId,
        true
      );
    }

    const targetRow = inputState.emptyRow;
    if (!targetRow) throw new Error('В листе «Ввод операций» закончились свободные строки.');

    const dateValue = parseYmd_(date);
    sheet.getRange(targetRow, 1, 1, 5).setValues([[
      dateValue,
      config.accounts[account],
      ref.operation,
      amount,
      note,
    ]]);

    if (requestId) {
      sheet.getRange(targetRow, 14).setValue(requestId);
    }

    return recordResult_(
      ledger,
      account,
      config.accounts[account],
      date,
      period,
      targetRow,
      ref,
      amount,
      note,
      requestId || null,
      false
    );
  } finally {
    lock.releaseLock();
  }
}

function recordResult_(ledger, account, accountLabel, date, period, inputRow, ref, amount, note, requestId, duplicate) {
  return {
    ok: true,
    action: 'record_entry',
    ledger,
    duplicate: Boolean(duplicate),
    account,
    account_label: accountLabel,
    date,
    period,
    input_sheet: INPUT_SHEET,
    input_row: inputRow,
    article: ref.operation,
    mapped_row: ref.mappedRow,
    type: ref.direction,
    currency: account === 'sber_rub' ? 'RUB' : 'AED',
    amount,
    note: note || null,
    status: '✓ Готово',
    key: date.replace(/-/g, '') + '|' + accountLabel + '|' + ref.mappedRow,
    request_id: requestId,
  };
}

function ledgerConfig_(ledger) {
  const config = LEDGER_CONFIG[ledger];
  if (!config) throw new Error('Неизвестный раздел финансов.');
  return config;
}

function validateLedger_(value) {
  const ledger = String(value || 'rental').trim().toLowerCase();
  if (!Object.prototype.hasOwnProperty.call(LEDGER_CONFIG, ledger)) {
    throw new Error('ledger must be rental or showroom.');
  }
  return ledger;
}

function spreadsheet_(ledger) {
  const config = ledgerConfig_(ledger);
  const active = SpreadsheetApp.getActiveSpreadsheet();
  if (active && active.getId() === config.spreadsheetId) return active;
  return SpreadsheetApp.openById(config.spreadsheetId);
}

function referenceRows_(ledger) {
  const config = ledgerConfig_(ledger);
  const cache = CacheService.getScriptCache();
  const cacheKey = 'finance_reference_rows_v2_' + ledger;
  const cached = cache.get(cacheKey);
  if (cached) return JSON.parse(cached);

  const sheet = spreadsheet_(ledger).getSheetByName(REFERENCE_SHEET);
  if (!sheet) throw new Error('Лист «Справочники» не найден.');

  const rows = sheet.getRange(config.referenceRange).getDisplayValues();
  cache.put(cacheKey, JSON.stringify(rows), 300);
  return rows;
}

function parseReferenceRow_(row, ledger, account, referenceRow) {
  if (ledger === 'showroom') {
    const operation = String(row[0] || '').trim();
    const direction = String(row[1] || '').trim();
    const mappedRow = Number(account === 'cash_aed' ? row[2] : row[3]);
    const searchTerms = String(row[4] || '').trim();

    if (!operation || !Number.isFinite(mappedRow) || mappedRow <= 0) return null;

    return {
      operation,
      direction,
      mappedRow,
      referenceRow,
      searchTerms,
    };
  }

  const operation = String(row[0] || '').trim();
  const mappedRow = Number(account === 'sber_rub' ? row[3] : row[1]);
  const direction = String(row[2] || '').trim();

  if (!operation || !Number.isFinite(mappedRow) || mappedRow <= 0) return null;

  return {
    operation,
    direction,
    mappedRow,
    referenceRow,
    searchTerms: '',
  };
}

function resolveReference_(article, account, requestedRow, ledger) {
  const target = normalize_(article);
  const rows = referenceRows_(ledger);
  const candidates = [];

  for (let i = 0; i < rows.length; i++) {
    const parsed = parseReferenceRow_(rows[i], ledger, account, i + 2);
    if (!parsed || normalize_(parsed.operation) !== target) continue;
    candidates.push(parsed);
  }

  if (requestedRow !== undefined && requestedRow !== null && requestedRow !== '') {
    const row = Number(requestedRow);
    const exact = candidates.find(function (candidate) {
      return candidate.mappedRow === row;
    });
    if (!exact) throw new Error('Выбранная строка больше не соответствует операции.');
    return exact;
  }

  if (candidates.length > 1) {
    throw new Error('Найдено несколько одинаковых операций. Сначала выбери строку.');
  }

  return candidates[0] || null;
}

function inspectInputRows_(sheet, requestId) {
  const rowCount = INPUT_LAST_ROW - INPUT_FIRST_ROW + 1;
  const values = sheet.getRange(INPUT_FIRST_ROW, 1, rowCount, 14).getDisplayValues();

  let existingRow = 0;
  let emptyRow = 0;

  for (let i = 0; i < values.length; i++) {
    if (!existingRow && requestId && String(values[i][13] || '').trim() === requestId) {
      existingRow = INPUT_FIRST_ROW + i;
    }

    if (!emptyRow) {
      const occupied = values[i].slice(0, 5).some(function (value) {
        return String(value || '').trim() !== '';
      });
      if (!occupied) emptyRow = INPUT_FIRST_ROW + i;
    }

    if (existingRow && emptyRow) break;
  }

  return { existingRow, emptyRow };
}

function activePeriod_(ledger) {
  const cache = CacheService.getScriptCache();
  const cacheKey = 'finance_active_period_v2_' + ledger;
  const cached = cache.get(cacheKey);
  if (cached) return JSON.parse(cached);

  const config = ledgerConfig_(ledger);
  const ss = spreadsheet_(ledger);
  let start;
  let end;

  if (ledger === 'showroom') {
    const monthSheet = ss.getSheetByName(config.monthSheet);
    if (!monthSheet) throw new Error('Активный лист автосалона не найден.');

    start = monthSheet.getRange('C2').getValue();
    if (!(start instanceof Date)) throw new Error('Не удалось определить активный месяц автосалона.');

    const tz = ss.getSpreadsheetTimeZone() || 'Asia/Dubai';
    const startYmd = Utilities.formatDate(start, tz, 'yyyy-MM-dd');
    const parts = startYmd.split('-').map(Number);
    const lastDayUtc = new Date(Date.UTC(parts[0], parts[1], 0, 12, 0, 0));
    end = Utilities.parseDate(
      Utilities.formatDate(lastDayUtc, 'UTC', 'yyyy-MM-dd'),
      'Asia/Dubai',
      'yyyy-MM-dd'
    );
  } else {
    const sheet = ss.getSheetByName(INPUT_SHEET);
    if (!sheet) throw new Error('Лист «Ввод операций» не найден.');

    const rule = sheet.getRange('A5').getDataValidation();
    if (!rule || rule.getCriteriaType() !== SpreadsheetApp.DataValidationCriteria.DATE_BETWEEN) {
      throw new Error('Не удалось определить активный месяц финансовой таблицы.');
    }

    const values = rule.getCriteriaValues();
    start = values[0];
    end = values[1];

    if (!(start instanceof Date) || !(end instanceof Date)) {
      throw new Error('Некорректный период в «Ввод операций».');
    }
  }

  const tz = ss.getSpreadsheetTimeZone() || 'Asia/Dubai';
  const period = {
    start: Utilities.formatDate(start, tz, 'yyyy-MM-dd'),
    end: Utilities.formatDate(end, tz, 'yyyy-MM-dd'),
    label: Utilities.formatDate(start, tz, 'MMMM yyyy'),
  };

  cache.put(cacheKey, JSON.stringify(period), 300);
  return period;
}

function validateAccount_(value, ledger) {
  const account = String(value || '').trim().toLowerCase();
  const config = ledgerConfig_(ledger);

  if (!Object.prototype.hasOwnProperty.call(config.accounts, account)) {
    throw new Error('Выбери счёт.');
  }

  return account;
}

function validateActiveDate_(value, ledger) {
  const date = validateDate_(value, ledger);
  const period = activePeriod_(ledger);

  if (date < period.start || date > period.end) {
    throw new Error(
      'Дата ' + date + ' вне активного периода таблицы: ' + period.start + ' — ' + period.end + '.'
    );
  }

  return date;
}

function validateDate_(value, ledger) {
  const date = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('date must be YYYY-MM-DD.');

  const parsed = parseYmd_(date);
  const tz = spreadsheet_(ledger).getSpreadsheetTimeZone() || 'Asia/Dubai';

  if (Utilities.formatDate(parsed, tz, 'yyyy-MM-dd') !== date) {
    throw new Error('date is invalid.');
  }

  return date;
}

function parseYmd_(date) {
  return Utilities.parseDate(String(date), 'Asia/Dubai', 'yyyy-MM-dd');
}

function normalize_(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^a-zа-я0-9]+/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function sha256Hex_(value) {
  const bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    value,
    Utilities.Charset.UTF_8
  );

  return bytes.map(function (byte) {
    const n = byte < 0 ? byte + 256 : byte;
    return ('0' + n.toString(16)).slice(-2);
  }).join('');
}

function json_(body) {
  return ContentService
    .createTextOutput(JSON.stringify(body))
    .setMimeType(ContentService.MimeType.JSON);
}
