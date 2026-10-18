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
    ...(ledger === 'showroom' ? { duplicate_guard: 'request-id-and-content-v1' } : {}),
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
    else if (action === 'record_driver_movement') result = recordDriverMovement_(payload);
    else if (action === 'inspect_showroom_entries') result = inspectShowroomEntries_(payload);
    else if (action === 'correct_showroom_entry') result = correctShowroomEntry_(payload);
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

/** Showroom driver cash ledger; never changes the main A:E journal or Rental. */
function recordDriverMovement_(payload) {
  if (String(payload.ledger || '') !== 'showroom') throw new Error('Only showroom driver ledger is supported.');
  const kind = String(payload.kind || '');
  const names = {
    advance: 'Выдача',
    expense: 'Расход',
    return: 'Возврат',
    reimbursement: 'Компенсация'
  };
  if (!Object.prototype.hasOwnProperty.call(names, kind)) throw new Error('Unknown driver movement.');
  const requestId = String(payload.request_id || '').trim();
  if (!/^[a-zA-Z0-9:_-]{8,200}$/.test(requestId)) throw new Error('Invalid request_id.');
  const driver = String(payload.driver_name || '').trim();
  if (!driver || driver.length > 140) throw new Error('Driver name is required.');
  const amount = Number(payload.amount);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('Amount must be positive.');
  const article = String(payload.article || '').trim();
  const vehicle = String(payload.vehicle || '').trim();
  const note = String(payload.note || '').trim();
  if (article.length > 250 || vehicle.length > 160 || note.length > 500) throw new Error('Movement fields too long.');

  const ss = SpreadsheetApp.openById(SHOWROOM_SPREADSHEET_ID);
  const sh = ss.getSheetByName('Водители');
  if (!sh) throw new Error('Лист «Водители» не найден.');
  const registered = sh.getRange('A4:A5').getDisplayValues().flat().map(String);
  if (registered.indexOf(driver) < 0) throw new Error('Водитель не зарегистрирован в листе.');
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const firstRow = 11;
    const lastRow = sh.getMaxRows();
    const rows = sh.getRange(firstRow, 1, lastRow - firstRow + 1, 9).getValues();
    const duplicateIndex = rows.findIndex(function (r) { return String(r[8] || '') === requestId; });
    if (duplicateIndex >= 0) return {
      ok: true, duplicate: true, input_sheet: 'Водители', input_row: firstRow + duplicateIndex
    };
    const emptyIndex = rows.findIndex(function (r) {
      return r.every(function (v) { return v === '' || v === null; });
    });
    if (emptyIndex < 0) throw new Error('Лист «Водители» заполнен.');
    const targetRow = firstRow + emptyIndex;
    // Always record actual processing date, so historic driver balances are auditable.
    const date = Utilities.parseDate(String(payload.date || ''), 'Asia/Dubai', 'yyyy-MM-dd');
    if (Utilities.formatDate(date, 'Asia/Dubai', 'yyyy-MM-dd') !== String(payload.date)) {
      throw new Error('Invalid movement date.');
    }
    sh.getRange(targetRow, 1, 1, 9).setValues([[
      date, driver, names[kind], amount, article, vehicle, note, 'Учтено', requestId
    ]]);
    sh.getRange(targetRow, 1).setNumberFormat('dd.mm.yyyy');
    SpreadsheetApp.flush();
    return { ok: true, duplicate: false, input_sheet: 'Водители', input_row: targetRow };
  } finally {
    lock.releaseLock();
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
    driver_wallet_supported: ledger === 'showroom' && Boolean(spreadsheet_(ledger).getSheetByName('Водители')),
    showroom_corrections_supported: ledger === 'showroom',
    showroom_vehicle_subcategory_supported: ledger === 'showroom',
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

function findDuplicateShowroomPosting_(sheet, dateYmd, accountLabel, article, amount, note, vehicle) {
  const count = Math.min(INPUT_LAST_ROW, sheet.getMaxRows()) - INPUT_FIRST_ROW + 1;
  if (count <= 0) return 0;
  const rows = sheet.getRange(INPUT_FIRST_ROW, 1, count, 20).getValues();
  const key = function (value) { return String(value == null ? '' : value).trim().toLowerCase().replace(/\s+/g, ' '); };
  for (let i = 0; i < rows.length; i++) {
    const v = rows[i];
    if (v[17] === 'auto' || !(v[0] instanceof Date) || Number(v[3]) !== amount) continue;
    if (Utilities.formatDate(v[0], 'Asia/Dubai', 'yyyy-MM-dd') === dateYmd &&
        key(v[1]) === key(accountLabel) && key(v[2]) === key(article) &&
        key(v[4]) === key(note) && (!vehicle || !v[19] || key(v[19]) === key(vehicle))) return INPUT_FIRST_ROW + i;
  }
  return 0;
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
  const vehicle = ledger === 'showroom' ? String(payload.vehicle || '').trim() : '';
  let canonicalVehicle = vehicle;
  const amount = Number(payload.amount);

  if (!article) throw new Error('article is required.');
  if (article.length > 250) throw new Error('article is too long.');
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('amount must be greater than zero.');
  if (note.length > 500) throw new Error('note is too long.');
  if (vehicle.length > 160 || (vehicle && article !== 'покупка авто для перепродажи')) {
    throw new Error('Некорректная подкатегория автомобиля.');
  }
  if (vehicle) {
    // Use the existing Excel-derived showroom subcategory list, not free-form text.
    const available = spreadsheet_(ledger).getSheetByName(REFERENCE_SHEET)
      .getRange('H2:I100').getDisplayValues();
    const match = available.find(function(r) {
      return r[0].trim() === article && r[1].trim().toLowerCase() === vehicle.toLowerCase();
    });
    if (!match) throw new Error('Выбранного автомобиля нет в справочнике подкатегорий.');
    canonicalVehicle = match[1].trim();
  }


  const ref = resolveReference_(article, account, payload.row, ledger);
  if (!ref) throw new Error('Operation not found in Справочники.');

  const requestId = String(payload.request_id || '').trim();
  // Showroom money must never be posted from an external request without a stable replay key.
  // Rental keeps its existing contract and optional-ID behavior.
  if (ledger === 'showroom' && !/^[a-zA-Z0-9:_-]{8,200}$/.test(requestId)) {
    throw new Error('Автосалон: request_id обязателен. Повторите запрос с тем же ID; не создавайте новый.');
  }
  const sheet = spreadsheet_(ledger).getSheetByName(INPUT_SHEET);
  if (!sheet) throw new Error('Лист «Ввод операций» не найден.');

  const lock = LockService.getScriptLock();
  lock.waitLock(15000);

  try {
    const inputState = inspectInputRows_(sheet, requestId);

    if (requestId && inputState.existingRow) {
      if (ledger === 'showroom') {
        const saved = sheet.getRange(inputState.existingRow, 1, 1, 5).getValues()[0];
        const savedDate = saved[0] instanceof Date
          ? Utilities.formatDate(saved[0], 'Asia/Dubai', 'yyyy-MM-dd')
          : '';
        if (savedDate !== date || String(saved[1]) !== config.accounts[account] ||
            String(saved[2]) !== ref.operation || Number(saved[3]) !== amount ||
            String(saved[4] || '') !== note) {
          throw new Error('Этот request_id уже относится к другой операции. Повторите исходный запрос.');
        }
        // Safe retry after an interrupted A:E write can finish the missing car subcategory.
        if (vehicle) {
          const storedVehicle = String(sheet.getRange(inputState.existingRow, 20).getValue() || '');
          if (storedVehicle && storedVehicle.toLowerCase() !== canonicalVehicle.toLowerCase()) {
            throw new Error('Этот request_id уже относится к другому автомобилю.');
          }
          if (!storedVehicle) sheet.getRange(inputState.existingRow, 20).setValue(canonicalVehicle);
        }
      }

      if (ledger === 'showroom') {
        bridgeEnsureTransfer_(sheet, inputState.existingRow);
        bridgeDisplayRow_(sheet, inputState.existingRow);
      }
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

    if (ledger === 'showroom') {
      const matchingRow = findDuplicateShowroomPosting_(
        sheet, date, config.accounts[account], ref.operation, amount, note, canonicalVehicle
      );
      if (matchingRow) {
        throw new Error('Похожая операция уже есть в строке ' + matchingRow +
          '. Повтор не сохранён. Если это отдельный платёж, укажите отдельное пояснение.');
      }
    }

    const targetRow = ledger === 'showroom' ? bridgeTransferEmptyRow_(sheet, 0) : inputState.emptyRow;
    if (!targetRow) throw new Error('В листе «Ввод операций» закончились свободные строки.');

    if (ledger === 'showroom' && bridgeTransferDefinition_(config.accounts[account], ref.operation)) {
      bridgeTransferEmptyRow_(sheet, targetRow);
    }

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
    if (vehicle) sheet.getRange(targetRow, 20).setValue(canonicalVehicle);

    if (ledger === 'showroom') {
      bridgeEnsureTransfer_(sheet, targetRow);
      bridgeDisplayRow_(sheet, targetRow);
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
// API writes do not fire spreadsheet edit triggers. Keep Q:S compatible with ShowroomTransfers.
function bridgeTransferDefinition_(account, operation) {
  if (account === 'Касса' && operation === 'перевод на счет в AJMAN') return ['AJMAN', 'приход из кассы'];
  if (account === 'AJMAN' && operation === 'перевод в КАССУ') return ['Касса', 'приход со счета AJMAN'];
  return null;
}

function bridgeTransferEmptyRow_(sheet, excludeRow) {
  const range = sheet.getRange(INPUT_FIRST_ROW, 1, INPUT_LAST_ROW - INPUT_FIRST_ROW + 1, 27);
  const values = range.getValues(), formulas = range.getFormulas();
  const notes = sheet.getRange(INPUT_FIRST_ROW, 21, INPUT_LAST_ROW - INPUT_FIRST_ROW + 1, 1).getNotes();
  const free = [];
  let lastOccupied = INPUT_FIRST_ROW - 1;
  for (let i = 0; i < values.length; i++) {
    const row = INPUT_FIRST_ROW + i, v = values[i];
    const occupied = v.slice(0, 5).concat(v.slice(13, 14), v.slice(15, 20))
      .some(function(x) { return String(x == null ? '' : x).trim() !== ''; });
    if (occupied) lastOccupied = row;
    if (row === excludeRow || row === 9 || row === 13 || occupied) continue;
    const displayDraft = v.slice(20,27).some(function(x,j) {
      return !formulas[i][20+j] && String(x == null ? '' : x).trim() !== '';
    });
    const pendingDraft = String(notes[i][0] || '').indexOf('sgi:') === 0 &&
      formulas[i].slice(20,27).some(function(f) { return !f; });
    if (!displayDraft && !pendingDraft) free.push(row);
  }
  // Prefer chronological journal order; do not overwrite drafts or re-use
  // old holes from deleted duplicates while a free trailing row exists.
  const next = free.find(function(row) { return row > lastOccupied; });
  if (next) return next;
  if (free.length) return free[0]; // Full journal: safely reuse a blank hole.
  throw new Error('Нет свободных строк для автоперевода.');
}
function bridgeEnsureTransfer_(sheet, sourceRow) {
  const source = sheet.getRange(sourceRow, 1, 1, 20).getValues()[0];
  const def = bridgeTransferDefinition_(String(source[1] || '').trim(), String(source[2] || '').trim());
  if (!def || source[17] === 'auto') return;
  if (!source[0] || !Number.isFinite(Number(source[3])) || Number(source[3]) <= 0) throw new Error('Неполная исходная запись перевода.');
  const pairId = String(source[16] || source[13] || Utilities.getUuid()).trim();
  const rows = sheet.getRange(INPUT_FIRST_ROW, 1, INPUT_LAST_ROW - INPUT_FIRST_ROW + 1, 20).getValues();
  let peerRow = 0;
  for (let i = 0; i < rows.length; i++) {
    const row = INPUT_FIRST_ROW + i;
    if (row === sourceRow || row === 9 || row === 13) continue;
    if (String(rows[i][16] || '').trim() !== pairId) continue;
    if (peerRow || rows[i][17] !== 'auto') throw new Error('Конфликт Pair ID автоперевода.');
    peerRow = row;
  }
  if (peerRow) {
    const peer = rows[peerRow - INPUT_FIRST_ROW];
    const occupied = peer.slice(0, 5).some(function(v) { return String(v == null ? '' : v).trim() !== ''; });
    if (occupied) {
      // A repeat request must never overwrite an existing financial record.
      if (String(peer[0]) !== String(source[0]) || peer[1] !== def[0] || peer[2] !== def[1] || Number(peer[3]) !== Number(source[3])) throw new Error('Существующая пара перевода не соответствует исходной записи.');
      bridgeDisplayRow_(sheet, peerRow);
      return;
    }
  } else {
    peerRow = bridgeTransferEmptyRow_(sheet, sourceRow);
    // Reserve a peer before publishing the source metadata; retries find this same row.
    sheet.getRange(peerRow, 17, 1, 3).setValues([[pairId, 'auto', 1]]);
  }
  if (source[16] !== pairId || source[17] !== 'source' || source[18] !== 1) {
    sheet.getRange(sourceRow, 17, 1, 3).setValues([[pairId, 'source', 1]]);
  }
  sheet.getRange(peerRow, 1, 1, 5).setValues([[source[0], def[0], def[1], Number(source[3]), '↔ АВТО · парная строка']]);
  bridgeDisplayRow_(sheet, peerRow);
  SpreadsheetApp.flush();
}

// Both old direct mirrors and new ROW()-based mirrors are valid after sorting.
function bridgeMirrorsAreSafe_(row, formulas, values) {
  const columns = ['A','F','B','C','T','D','E'];
  const clean = function(value) { return String(value || '').replace(/\s/g,'').replace(/,/g,';').toUpperCase(); };
  return !formulas.some(function(f,i) {
    if (!f) return values[i] !== '' && values[i] !== null;
    const col = columns[i], direct = '=IF(' + col + row + '="";"";' + col + row + ')';
    const source = 'INDEX(
function bridgeDisplayRow_(sheet, row) {
  const columns = ['A','F','B','C','T','D','E'];
  for (let i = 0; i < columns.length; i++) {
    const cell = sheet.getRange(row, 21 + i);
    if (!cell.getFormula() && cell.getValue() === '') {
      cell.setFormula('=IF(' + columns[i] + row + '="";"";' + columns[i] + row + ')');
    }
  }
  // Only a fully mirrored row has no active manual draft.
  const formulas = sheet.getRange(row, 21, 1, 7).getFormulas()[0];
  if (formulas.every(Boolean) && bridgeMirrorsAreSafe_(row, formulas, sheet.getRange(row, 21, 1, 7).getValues()[0])) {
    const cell = sheet.getRange(row,21);
    if (cell.getNote().indexOf('sgi:') === 0) cell.clearNote();
  }
}

/** Showroom-only correction protocol. No row deletion, append expense, or Rental writes. */
function showroomCorrectionTransfer_(article) {
  return /^(перевод|приход из кассы|приход со счета AJMAN)/i.test(String(article || '').trim());
}

function showroomCorrectionMarker_(sheet, row) {
  const note = sheet.getRange(row, 14).getNote();
  if (note.indexOf('fleetdesk-correction:') !== 0) return { version: 0, previous_note: note };
  try { return JSON.parse(note.slice('fleetdesk-correction:'.length)); }
  catch (_) { throw new Error('Повреждена отметка исправления. Требуется сверка.'); }
}

function showroomCorrectionSnapshot_(sheet, row, values) {
  const marker = showroomCorrectionMarker_(sheet, row);
  return {
    input_row: row, request_id: String(values[13] || ''),
    date: values[0] instanceof Date ? Utilities.formatDate(values[0], 'Asia/Dubai', 'yyyy-MM-dd') : String(values[0] || ''),
    account_label: String(values[1] || ''), article: String(values[2] || ''),
    amount: Number(values[3] || 0), note: String(values[4] || ''), vehicle: String(values[19] || ''),
    version: Number(marker.version || 0), pending: marker.state === 'pending', cancelled: Boolean(marker.cancelled),
  };
}

function inspectShowroomEntries_(payload) {
  if (payload.ledger !== 'showroom') throw new Error('Only showroom corrections are supported.');
  if (!Array.isArray(payload.entries) || payload.entries.length > 100) throw new Error('Invalid entries.');
  const sheet = SpreadsheetApp.openById(SHOWROOM_SPREADSHEET_ID).getSheetByName(INPUT_SHEET);
  const rows = sheet.getRange(INPUT_FIRST_ROW, 1, INPUT_LAST_ROW - INPUT_FIRST_ROW + 1, 20).getValues();
  return { ok: true, entries: payload.entries.map(function(entry) {
    const matches = [];
    rows.forEach(function(r, i) { if (entry.request_id && String(r[13] || '') === entry.request_id) matches.push(i); });
    if (matches.length !== 1) return { audit_id: entry.audit_id, error: 'Не найдена единственная запись по Request ID.' };
    const index = matches[0];
    const row = INPUT_FIRST_ROW + index;
    if (rows[index][16] || rows[index][17] || rows[index][18] || showroomCorrectionTransfer_(rows[index][2])) {
      return { audit_id: entry.audit_id, error: 'Перевод нельзя исправлять отдельно от парной записи.' };
    }
    const display = sheet.getRange(row,21,1,7), columns = ['A','F','B','C','T','D','E'];
    const displayValues = display.getValues()[0];
    if (!bridgeMirrorsAreSafe_(row, display.getFormulas()[0], displayValues)) {
      return { audit_id: entry.audit_id, error: 'В строке есть ручной черновик. Заверши его в таблице перед исправлением.' };
    }
    return { audit_id: entry.audit_id, snapshot: showroomCorrectionSnapshot_(sheet, INPUT_FIRST_ROW + index, rows[index]) };
  }) };
}

function correctShowroomEntry_(payload) {
  if (payload.ledger !== 'showroom') throw new Error('Only showroom corrections are supported.');
  const id = String(payload.correction_id || '');
  const version = Number(payload.version);
  const kind = String(payload.kind || '');
  if (!/^[a-zA-Z0-9_-]{8,100}$/.test(id) || !Number.isInteger(version) || version < 1 ||
      ['edit', 'cancel'].indexOf(kind) < 0) throw new Error('Invalid correction.');
  const before = payload.before || {};
  const after = payload.after || {};
  if (!before.request_id || showroomCorrectionTransfer_(before.article) ||
      showroomCorrectionTransfer_(after.article)) throw new Error('Переводы нельзя исправлять: необходимо сохранить обе парные записи.');
  if (kind === 'edit' && (!Number.isFinite(Number(after.amount)) || Number(after.amount) <= 0 ||
      String(after.note || '').length > 500 || String(after.sheet_note || after.note || '').length > 700 ||
      String(after.vehicle || '').length > 160 || /^[=+@]/.test(String(after.vehicle || '')) ||
      /^=/.test(String(after.sheet_note || after.note || '')))) throw new Error('Некорректные поля исправления.');
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const ss = SpreadsheetApp.openById(SHOWROOM_SPREADSHEET_ID);
    const sheet = ss.getSheetByName(INPUT_SHEET);
    const rows = sheet.getRange(INPUT_FIRST_ROW, 1, INPUT_LAST_ROW - INPUT_FIRST_ROW + 1, 20).getValues();
    const matches = [];
    rows.forEach(function(r, i) { if (String(r[13] || '') === before.request_id) matches.push(i); });
    if (matches.length !== 1) throw new Error('Не найдена единственная исходная запись. Требуется сверка.');
    const index = matches[0], row = INPUT_FIRST_ROW + index, current = rows[index];
    // Any pair metadata or incoming/outgoing transfer article blocks BOTH edit and cancellation.
    if (current[16] || current[17] || current[18] || showroomCorrectionTransfer_(current[2])) {
      throw new Error('Переводы нельзя исправлять: необходимо сохранить обе парные записи.');
    }
    const digest = sha256Hex_(JSON.stringify({id:id,version:version,kind:kind,before:before,after:after,driver:payload.driver || null}));
    let marker = showroomCorrectionMarker_(sheet, row);
    if (marker.correction_id === id) {
      if (marker.digest !== digest) throw new Error('ID исправления уже использован для других значений.');
      if (marker.state === 'applied') return {ok:true,duplicate:true,correction_id:id,version:version,input_row:row};
    } else {
      if (marker.state === 'pending' || marker.cancelled || Number(marker.version || 0) !== version - 1) {
        throw new Error('Запись уже изменена или ожидает синхронизации. Обнови историю.');
      }
    }
    const snapshot = showroomCorrectionSnapshot_(sheet, row, current);
    const expected = [before.date,before.account_label,before.article,Number(before.amount),String(before.note || ''),String(before.vehicle || '')];
    const desired = kind === 'cancel' ? ['', '', '', 0, '', ''] :
      [before.date,before.account_label,after.article,Number(after.amount),String(after.sheet_note !== undefined ? after.sheet_note : after.note || ''),String(after.vehicle || '')];
    const actual = [snapshot.date,snapshot.account_label,snapshot.article,snapshot.amount,snapshot.note,snapshot.vehicle];
    const equal = function(a,b) { return JSON.stringify(a) === JSON.stringify(b); };
    // Validate all ranges before the first write; after a timeout allow only the exact before/after states.
    const resuming = marker.correction_id === id && marker.state === 'pending';
    const mainBefore = equal(actual.slice(0,5),expected.slice(0,5));
    const mainAfter = equal(actual.slice(0,5),desired.slice(0,5));
    if ((!mainBefore && !(resuming && mainAfter)) ||
        (actual[5] !== expected[5] && !(resuming && actual[5] === desired[5]))) {
      throw new Error('Запись изменена вручную. Обнови историю и сверь значения.');
    }
    if (kind === 'edit') {
      const account = before.account_label === 'Касса' ? 'cash_aed' : before.account_label === 'AJMAN' ? 'ajman_aed' : '';
      const ref = resolveReference_(after.article, account, after.row, 'showroom');
      if (!ref || ref.direction !== (after.direction === 'income' ? 'Приход' : 'Расход')) throw new Error('Операция изменилась в справочнике.');
    }
    const displayColumns = ['A','F','B','C','T','D','E'];
    const display = sheet.getRange(row,21,1,7);
    const displayValues = display.getValues()[0], formulas = display.getFormulas()[0];
    if (!bridgeMirrorsAreSafe_(row, formulas, displayValues)) {
      throw new Error('В строке есть ручной черновик. Сначала заверши его в таблице.');
    }

    let driverSheet, driverRow, driverDesired;
    if (payload.driver) {
      const driver = payload.driver;
      driverSheet = ss.getSheetByName('Водители');
      if (!driverSheet) throw new Error('Лист «Водители» не найден.');
      const values = driverSheet.getRange(11,1,driverSheet.getMaxRows()-10,9).getValues();
      const found = [];
      values.forEach(function(r,i) { if (String(r[8] || '') === driver.event_key) found.push(i); });
      if (found.length !== 1) throw new Error('Расход водителя не синхронизирован. Сначала повтори синхронизацию.');
      driverRow = 11 + found[0];
      const d = values[found[0]];
      const driverBefore = [Number(driver.amount),String(driver.article || ''),String(driver.vehicle || ''),String(driver.note || ''),'Учтено'];
      driverDesired = kind === 'cancel' ? driverBefore.slice(0,4).concat(['Отменено']) :
        [Number(after.amount),String(after.article),String(after.vehicle || ''),String(after.note || ''),'Учтено'];
      const dActual = [Number(d[3]),String(d[4] || ''),String(d[5] || ''),String(d[6] || ''),String(d[7] || '')];
      if (d[2] !== 'Расход' || (!equal(dActual,driverBefore) && !(resuming && equal(dActual,driverDesired)))) {
        throw new Error('Расход водителя изменён вручную. Требуется сверка.');
      }
    }
    if (!resuming) {
      marker = {version:version-1,correction_id:id,digest:digest,state:'pending',previous_note:marker.previous_note || '',
        before:before,actor:String(payload.actor || ''),kind:kind};
      sheet.getRange(row,14).setNote('fleetdesk-correction:' + JSON.stringify(marker));
      SpreadsheetApp.flush();
    }
    if (!mainAfter) sheet.getRange(row,1,1,5).setValues([kind === 'cancel' ? ['','','','',''] :
      [parseYmd_(before.date),before.account_label,after.article,Number(after.amount),desired[4]]]);
    if (actual[5] !== desired[5]) sheet.getRange(row,20).setValue(desired[5]);
    if (driverSheet) driverSheet.getRange(driverRow,4,1,5).setValues([driverDesired]);
    if (typeof bridgeDisplayRow_ === 'function') bridgeDisplayRow_(sheet,row);
    SpreadsheetApp.flush();
    marker.version = version; marker.state = 'applied'; marker.cancelled = kind === 'cancel';
    sheet.getRange(row,14).setNote('fleetdesk-correction:' + JSON.stringify(marker));
    SpreadsheetApp.flush();
    return {ok:true,duplicate:false,correction_id:id,version:version,input_row:row,cancelled:kind === 'cancel',driver_row:driverRow || null};
  } finally { lock.releaseLock(); }
}


 + col + ':
function bridgeDisplayRow_(sheet, row) {
  const columns = ['A','F','B','C','T','D','E'];
  for (let i = 0; i < columns.length; i++) {
    const cell = sheet.getRange(row, 21 + i);
    if (!cell.getFormula() && cell.getValue() === '') {
      cell.setFormula('=IF(' + columns[i] + row + '="";"";' + columns[i] + row + ')');
    }
  }
  // Only a fully mirrored row has no active manual draft.
  const formulas = sheet.getRange(row, 21, 1, 7).getFormulas()[0];
  if (formulas.every(function(f,i) { return f === '=IF(' + columns[i] + row + '="";"";' + columns[i] + row + ')'; })) {
    const cell = sheet.getRange(row,21);
    if (cell.getNote().indexOf('sgi:') === 0) cell.clearNote();
  }
}

/** Showroom-only correction protocol. No row deletion, append expense, or Rental writes. */
function showroomCorrectionTransfer_(article) {
  return /^(перевод|приход из кассы|приход со счета AJMAN)/i.test(String(article || '').trim());
}

function showroomCorrectionMarker_(sheet, row) {
  const note = sheet.getRange(row, 14).getNote();
  if (note.indexOf('fleetdesk-correction:') !== 0) return { version: 0, previous_note: note };
  try { return JSON.parse(note.slice('fleetdesk-correction:'.length)); }
  catch (_) { throw new Error('Повреждена отметка исправления. Требуется сверка.'); }
}

function showroomCorrectionSnapshot_(sheet, row, values) {
  const marker = showroomCorrectionMarker_(sheet, row);
  return {
    input_row: row, request_id: String(values[13] || ''),
    date: values[0] instanceof Date ? Utilities.formatDate(values[0], 'Asia/Dubai', 'yyyy-MM-dd') : String(values[0] || ''),
    account_label: String(values[1] || ''), article: String(values[2] || ''),
    amount: Number(values[3] || 0), note: String(values[4] || ''), vehicle: String(values[19] || ''),
    version: Number(marker.version || 0), pending: marker.state === 'pending', cancelled: Boolean(marker.cancelled),
  };
}

function inspectShowroomEntries_(payload) {
  if (payload.ledger !== 'showroom') throw new Error('Only showroom corrections are supported.');
  if (!Array.isArray(payload.entries) || payload.entries.length > 100) throw new Error('Invalid entries.');
  const sheet = SpreadsheetApp.openById(SHOWROOM_SPREADSHEET_ID).getSheetByName(INPUT_SHEET);
  const rows = sheet.getRange(INPUT_FIRST_ROW, 1, INPUT_LAST_ROW - INPUT_FIRST_ROW + 1, 20).getValues();
  return { ok: true, entries: payload.entries.map(function(entry) {
    const matches = [];
    rows.forEach(function(r, i) { if (entry.request_id && String(r[13] || '') === entry.request_id) matches.push(i); });
    if (matches.length !== 1) return { audit_id: entry.audit_id, error: 'Не найдена единственная запись по Request ID.' };
    const index = matches[0];
    const row = INPUT_FIRST_ROW + index;
    if (rows[index][16] || rows[index][17] || rows[index][18] || showroomCorrectionTransfer_(rows[index][2])) {
      return { audit_id: entry.audit_id, error: 'Перевод нельзя исправлять отдельно от парной записи.' };
    }
    const display = sheet.getRange(row,21,1,7), columns = ['A','F','B','C','T','D','E'];
    const displayValues = display.getValues()[0];
    if (display.getFormulas()[0].some(function(f,i) {
      return f ? f !== '=IF(' + columns[i] + row + '="";"";' + columns[i] + row + ')' : displayValues[i] !== '' && displayValues[i] !== null;
    })) return { audit_id: entry.audit_id, error: 'В строке есть ручной черновик. Заверши его в таблице перед исправлением.' };
    return { audit_id: entry.audit_id, snapshot: showroomCorrectionSnapshot_(sheet, INPUT_FIRST_ROW + index, rows[index]) };
  }) };
}

function correctShowroomEntry_(payload) {
  if (payload.ledger !== 'showroom') throw new Error('Only showroom corrections are supported.');
  const id = String(payload.correction_id || '');
  const version = Number(payload.version);
  const kind = String(payload.kind || '');
  if (!/^[a-zA-Z0-9_-]{8,100}$/.test(id) || !Number.isInteger(version) || version < 1 ||
      ['edit', 'cancel'].indexOf(kind) < 0) throw new Error('Invalid correction.');
  const before = payload.before || {};
  const after = payload.after || {};
  if (!before.request_id || showroomCorrectionTransfer_(before.article) ||
      showroomCorrectionTransfer_(after.article)) throw new Error('Переводы нельзя исправлять: необходимо сохранить обе парные записи.');
  if (kind === 'edit' && (!Number.isFinite(Number(after.amount)) || Number(after.amount) <= 0 ||
      String(after.note || '').length > 500 || String(after.sheet_note || after.note || '').length > 700 ||
      String(after.vehicle || '').length > 160 || /^[=+@]/.test(String(after.vehicle || '')) ||
      /^=/.test(String(after.sheet_note || after.note || '')))) throw new Error('Некорректные поля исправления.');
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const ss = SpreadsheetApp.openById(SHOWROOM_SPREADSHEET_ID);
    const sheet = ss.getSheetByName(INPUT_SHEET);
    const rows = sheet.getRange(INPUT_FIRST_ROW, 1, INPUT_LAST_ROW - INPUT_FIRST_ROW + 1, 20).getValues();
    const matches = [];
    rows.forEach(function(r, i) { if (String(r[13] || '') === before.request_id) matches.push(i); });
    if (matches.length !== 1) throw new Error('Не найдена единственная исходная запись. Требуется сверка.');
    const index = matches[0], row = INPUT_FIRST_ROW + index, current = rows[index];
    // Any pair metadata or incoming/outgoing transfer article blocks BOTH edit and cancellation.
    if (current[16] || current[17] || current[18] || showroomCorrectionTransfer_(current[2])) {
      throw new Error('Переводы нельзя исправлять: необходимо сохранить обе парные записи.');
    }
    const digest = sha256Hex_(JSON.stringify({id:id,version:version,kind:kind,before:before,after:after,driver:payload.driver || null}));
    let marker = showroomCorrectionMarker_(sheet, row);
    if (marker.correction_id === id) {
      if (marker.digest !== digest) throw new Error('ID исправления уже использован для других значений.');
      if (marker.state === 'applied') return {ok:true,duplicate:true,correction_id:id,version:version,input_row:row};
    } else {
      if (marker.state === 'pending' || marker.cancelled || Number(marker.version || 0) !== version - 1) {
        throw new Error('Запись уже изменена или ожидает синхронизации. Обнови историю.');
      }
    }
    const snapshot = showroomCorrectionSnapshot_(sheet, row, current);
    const expected = [before.date,before.account_label,before.article,Number(before.amount),String(before.note || ''),String(before.vehicle || '')];
    const desired = kind === 'cancel' ? ['', '', '', 0, '', ''] :
      [before.date,before.account_label,after.article,Number(after.amount),String(after.sheet_note !== undefined ? after.sheet_note : after.note || ''),String(after.vehicle || '')];
    const actual = [snapshot.date,snapshot.account_label,snapshot.article,snapshot.amount,snapshot.note,snapshot.vehicle];
    const equal = function(a,b) { return JSON.stringify(a) === JSON.stringify(b); };
    // Validate all ranges before the first write; after a timeout allow only the exact before/after states.
    const resuming = marker.correction_id === id && marker.state === 'pending';
    const mainBefore = equal(actual.slice(0,5),expected.slice(0,5));
    const mainAfter = equal(actual.slice(0,5),desired.slice(0,5));
    if ((!mainBefore && !(resuming && mainAfter)) ||
        (actual[5] !== expected[5] && !(resuming && actual[5] === desired[5]))) {
      throw new Error('Запись изменена вручную. Обнови историю и сверь значения.');
    }
    if (kind === 'edit') {
      const account = before.account_label === 'Касса' ? 'cash_aed' : before.account_label === 'AJMAN' ? 'ajman_aed' : '';
      const ref = resolveReference_(after.article, account, after.row, 'showroom');
      if (!ref || ref.direction !== (after.direction === 'income' ? 'Приход' : 'Расход')) throw new Error('Операция изменилась в справочнике.');
    }
    const displayColumns = ['A','F','B','C','T','D','E'];
    const display = sheet.getRange(row,21,1,7);
    const displayValues = display.getValues()[0], formulas = display.getFormulas()[0];
    if (formulas.some(function(f,i) {
      return f ? f !== '=IF(' + displayColumns[i] + row + '="";"";' + displayColumns[i] + row + ')' : displayValues[i] !== '' && displayValues[i] !== null;
    })) throw new Error('В строке есть ручной черновик. Сначала заверши его в таблице.');

    let driverSheet, driverRow, driverDesired;
    if (payload.driver) {
      const driver = payload.driver;
      driverSheet = ss.getSheetByName('Водители');
      if (!driverSheet) throw new Error('Лист «Водители» не найден.');
      const values = driverSheet.getRange(11,1,driverSheet.getMaxRows()-10,9).getValues();
      const found = [];
      values.forEach(function(r,i) { if (String(r[8] || '') === driver.event_key) found.push(i); });
      if (found.length !== 1) throw new Error('Расход водителя не синхронизирован. Сначала повтори синхронизацию.');
      driverRow = 11 + found[0];
      const d = values[found[0]];
      const driverBefore = [Number(driver.amount),String(driver.article || ''),String(driver.vehicle || ''),String(driver.note || ''),'Учтено'];
      driverDesired = kind === 'cancel' ? driverBefore.slice(0,4).concat(['Отменено']) :
        [Number(after.amount),String(after.article),String(after.vehicle || ''),String(after.note || ''),'Учтено'];
      const dActual = [Number(d[3]),String(d[4] || ''),String(d[5] || ''),String(d[6] || ''),String(d[7] || '')];
      if (d[2] !== 'Расход' || (!equal(dActual,driverBefore) && !(resuming && equal(dActual,driverDesired)))) {
        throw new Error('Расход водителя изменён вручную. Требуется сверка.');
      }
    }
    if (!resuming) {
      marker = {version:version-1,correction_id:id,digest:digest,state:'pending',previous_note:marker.previous_note || '',
        before:before,actor:String(payload.actor || ''),kind:kind};
      sheet.getRange(row,14).setNote('fleetdesk-correction:' + JSON.stringify(marker));
      SpreadsheetApp.flush();
    }
    if (!mainAfter) sheet.getRange(row,1,1,5).setValues([kind === 'cancel' ? ['','','','',''] :
      [parseYmd_(before.date),before.account_label,after.article,Number(after.amount),desired[4]]]);
    if (actual[5] !== desired[5]) sheet.getRange(row,20).setValue(desired[5]);
    if (driverSheet) driverSheet.getRange(driverRow,4,1,5).setValues([driverDesired]);
    if (typeof bridgeDisplayRow_ === 'function') bridgeDisplayRow_(sheet,row);
    SpreadsheetApp.flush();
    marker.version = version; marker.state = 'applied'; marker.cancelled = kind === 'cancel';
    sheet.getRange(row,14).setNote('fleetdesk-correction:' + JSON.stringify(marker));
    SpreadsheetApp.flush();
    return {ok:true,duplicate:false,correction_id:id,version:version,input_row:row,cancelled:kind === 'cancel',driver_row:driverRow || null};
  } finally { lock.releaseLock(); }
}


 + col + ';ROW())';
    const indexed = '=IF(' + source + '="";"";' + source + ')';
    return clean(f) !== clean(direct) && clean(f) !== clean(indexed);
  });
}

// Restore missing display formulas without replacing manual values or existing formulas.
function bridgeDisplayRow_(sheet, row) {
  const columns = ['A','F','B','C','T','D','E'];
  for (let i = 0; i < columns.length; i++) {
    const cell = sheet.getRange(row, 21 + i);
    if (!cell.getFormula() && cell.getValue() === '') {
      cell.setFormula('=IF(' + columns[i] + row + '="";"";' + columns[i] + row + ')');
    }
  }
  // Only a fully mirrored row has no active manual draft.
  const formulas = sheet.getRange(row, 21, 1, 7).getFormulas()[0];
  if (formulas.every(function(f,i) { return f === '=IF(' + columns[i] + row + '="";"";' + columns[i] + row + ')'; })) {
    const cell = sheet.getRange(row,21);
    if (cell.getNote().indexOf('sgi:') === 0) cell.clearNote();
  }
}

/** Showroom-only correction protocol. No row deletion, append expense, or Rental writes. */
function showroomCorrectionTransfer_(article) {
  return /^(перевод|приход из кассы|приход со счета AJMAN)/i.test(String(article || '').trim());
}

function showroomCorrectionMarker_(sheet, row) {
  const note = sheet.getRange(row, 14).getNote();
  if (note.indexOf('fleetdesk-correction:') !== 0) return { version: 0, previous_note: note };
  try { return JSON.parse(note.slice('fleetdesk-correction:'.length)); }
  catch (_) { throw new Error('Повреждена отметка исправления. Требуется сверка.'); }
}

function showroomCorrectionSnapshot_(sheet, row, values) {
  const marker = showroomCorrectionMarker_(sheet, row);
  return {
    input_row: row, request_id: String(values[13] || ''),
    date: values[0] instanceof Date ? Utilities.formatDate(values[0], 'Asia/Dubai', 'yyyy-MM-dd') : String(values[0] || ''),
    account_label: String(values[1] || ''), article: String(values[2] || ''),
    amount: Number(values[3] || 0), note: String(values[4] || ''), vehicle: String(values[19] || ''),
    version: Number(marker.version || 0), pending: marker.state === 'pending', cancelled: Boolean(marker.cancelled),
  };
}

function inspectShowroomEntries_(payload) {
  if (payload.ledger !== 'showroom') throw new Error('Only showroom corrections are supported.');
  if (!Array.isArray(payload.entries) || payload.entries.length > 100) throw new Error('Invalid entries.');
  const sheet = SpreadsheetApp.openById(SHOWROOM_SPREADSHEET_ID).getSheetByName(INPUT_SHEET);
  const rows = sheet.getRange(INPUT_FIRST_ROW, 1, INPUT_LAST_ROW - INPUT_FIRST_ROW + 1, 20).getValues();
  return { ok: true, entries: payload.entries.map(function(entry) {
    const matches = [];
    rows.forEach(function(r, i) { if (entry.request_id && String(r[13] || '') === entry.request_id) matches.push(i); });
    if (matches.length !== 1) return { audit_id: entry.audit_id, error: 'Не найдена единственная запись по Request ID.' };
    const index = matches[0];
    const row = INPUT_FIRST_ROW + index;
    if (rows[index][16] || rows[index][17] || rows[index][18] || showroomCorrectionTransfer_(rows[index][2])) {
      return { audit_id: entry.audit_id, error: 'Перевод нельзя исправлять отдельно от парной записи.' };
    }
    const display = sheet.getRange(row,21,1,7), columns = ['A','F','B','C','T','D','E'];
    const displayValues = display.getValues()[0];
    if (display.getFormulas()[0].some(function(f,i) {
      return f ? f !== '=IF(' + columns[i] + row + '="";"";' + columns[i] + row + ')' : displayValues[i] !== '' && displayValues[i] !== null;
    })) return { audit_id: entry.audit_id, error: 'В строке есть ручной черновик. Заверши его в таблице перед исправлением.' };
    return { audit_id: entry.audit_id, snapshot: showroomCorrectionSnapshot_(sheet, INPUT_FIRST_ROW + index, rows[index]) };
  }) };
}

function correctShowroomEntry_(payload) {
  if (payload.ledger !== 'showroom') throw new Error('Only showroom corrections are supported.');
  const id = String(payload.correction_id || '');
  const version = Number(payload.version);
  const kind = String(payload.kind || '');
  if (!/^[a-zA-Z0-9_-]{8,100}$/.test(id) || !Number.isInteger(version) || version < 1 ||
      ['edit', 'cancel'].indexOf(kind) < 0) throw new Error('Invalid correction.');
  const before = payload.before || {};
  const after = payload.after || {};
  if (!before.request_id || showroomCorrectionTransfer_(before.article) ||
      showroomCorrectionTransfer_(after.article)) throw new Error('Переводы нельзя исправлять: необходимо сохранить обе парные записи.');
  if (kind === 'edit' && (!Number.isFinite(Number(after.amount)) || Number(after.amount) <= 0 ||
      String(after.note || '').length > 500 || String(after.sheet_note || after.note || '').length > 700 ||
      String(after.vehicle || '').length > 160 || /^[=+@]/.test(String(after.vehicle || '')) ||
      /^=/.test(String(after.sheet_note || after.note || '')))) throw new Error('Некорректные поля исправления.');
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const ss = SpreadsheetApp.openById(SHOWROOM_SPREADSHEET_ID);
    const sheet = ss.getSheetByName(INPUT_SHEET);
    const rows = sheet.getRange(INPUT_FIRST_ROW, 1, INPUT_LAST_ROW - INPUT_FIRST_ROW + 1, 20).getValues();
    const matches = [];
    rows.forEach(function(r, i) { if (String(r[13] || '') === before.request_id) matches.push(i); });
    if (matches.length !== 1) throw new Error('Не найдена единственная исходная запись. Требуется сверка.');
    const index = matches[0], row = INPUT_FIRST_ROW + index, current = rows[index];
    // Any pair metadata or incoming/outgoing transfer article blocks BOTH edit and cancellation.
    if (current[16] || current[17] || current[18] || showroomCorrectionTransfer_(current[2])) {
      throw new Error('Переводы нельзя исправлять: необходимо сохранить обе парные записи.');
    }
    const digest = sha256Hex_(JSON.stringify({id:id,version:version,kind:kind,before:before,after:after,driver:payload.driver || null}));
    let marker = showroomCorrectionMarker_(sheet, row);
    if (marker.correction_id === id) {
      if (marker.digest !== digest) throw new Error('ID исправления уже использован для других значений.');
      if (marker.state === 'applied') return {ok:true,duplicate:true,correction_id:id,version:version,input_row:row};
    } else {
      if (marker.state === 'pending' || marker.cancelled || Number(marker.version || 0) !== version - 1) {
        throw new Error('Запись уже изменена или ожидает синхронизации. Обнови историю.');
      }
    }
    const snapshot = showroomCorrectionSnapshot_(sheet, row, current);
    const expected = [before.date,before.account_label,before.article,Number(before.amount),String(before.note || ''),String(before.vehicle || '')];
    const desired = kind === 'cancel' ? ['', '', '', 0, '', ''] :
      [before.date,before.account_label,after.article,Number(after.amount),String(after.sheet_note !== undefined ? after.sheet_note : after.note || ''),String(after.vehicle || '')];
    const actual = [snapshot.date,snapshot.account_label,snapshot.article,snapshot.amount,snapshot.note,snapshot.vehicle];
    const equal = function(a,b) { return JSON.stringify(a) === JSON.stringify(b); };
    // Validate all ranges before the first write; after a timeout allow only the exact before/after states.
    const resuming = marker.correction_id === id && marker.state === 'pending';
    const mainBefore = equal(actual.slice(0,5),expected.slice(0,5));
    const mainAfter = equal(actual.slice(0,5),desired.slice(0,5));
    if ((!mainBefore && !(resuming && mainAfter)) ||
        (actual[5] !== expected[5] && !(resuming && actual[5] === desired[5]))) {
      throw new Error('Запись изменена вручную. Обнови историю и сверь значения.');
    }
    if (kind === 'edit') {
      const account = before.account_label === 'Касса' ? 'cash_aed' : before.account_label === 'AJMAN' ? 'ajman_aed' : '';
      const ref = resolveReference_(after.article, account, after.row, 'showroom');
      if (!ref || ref.direction !== (after.direction === 'income' ? 'Приход' : 'Расход')) throw new Error('Операция изменилась в справочнике.');
    }
    const displayColumns = ['A','F','B','C','T','D','E'];
    const display = sheet.getRange(row,21,1,7);
    const displayValues = display.getValues()[0], formulas = display.getFormulas()[0];
    if (formulas.some(function(f,i) {
      return f ? f !== '=IF(' + displayColumns[i] + row + '="";"";' + displayColumns[i] + row + ')' : displayValues[i] !== '' && displayValues[i] !== null;
    })) throw new Error('В строке есть ручной черновик. Сначала заверши его в таблице.');

    let driverSheet, driverRow, driverDesired;
    if (payload.driver) {
      const driver = payload.driver;
      driverSheet = ss.getSheetByName('Водители');
      if (!driverSheet) throw new Error('Лист «Водители» не найден.');
      const values = driverSheet.getRange(11,1,driverSheet.getMaxRows()-10,9).getValues();
      const found = [];
      values.forEach(function(r,i) { if (String(r[8] || '') === driver.event_key) found.push(i); });
      if (found.length !== 1) throw new Error('Расход водителя не синхронизирован. Сначала повтори синхронизацию.');
      driverRow = 11 + found[0];
      const d = values[found[0]];
      const driverBefore = [Number(driver.amount),String(driver.article || ''),String(driver.vehicle || ''),String(driver.note || ''),'Учтено'];
      driverDesired = kind === 'cancel' ? driverBefore.slice(0,4).concat(['Отменено']) :
        [Number(after.amount),String(after.article),String(after.vehicle || ''),String(after.note || ''),'Учтено'];
      const dActual = [Number(d[3]),String(d[4] || ''),String(d[5] || ''),String(d[6] || ''),String(d[7] || '')];
      if (d[2] !== 'Расход' || (!equal(dActual,driverBefore) && !(resuming && equal(dActual,driverDesired)))) {
        throw new Error('Расход водителя изменён вручную. Требуется сверка.');
      }
    }
    if (!resuming) {
      marker = {version:version-1,correction_id:id,digest:digest,state:'pending',previous_note:marker.previous_note || '',
        before:before,actor:String(payload.actor || ''),kind:kind};
      sheet.getRange(row,14).setNote('fleetdesk-correction:' + JSON.stringify(marker));
      SpreadsheetApp.flush();
    }
    if (!mainAfter) sheet.getRange(row,1,1,5).setValues([kind === 'cancel' ? ['','','','',''] :
      [parseYmd_(before.date),before.account_label,after.article,Number(after.amount),desired[4]]]);
    if (actual[5] !== desired[5]) sheet.getRange(row,20).setValue(desired[5]);
    if (driverSheet) driverSheet.getRange(driverRow,4,1,5).setValues([driverDesired]);
    if (typeof bridgeDisplayRow_ === 'function') bridgeDisplayRow_(sheet,row);
    SpreadsheetApp.flush();
    marker.version = version; marker.state = 'applied'; marker.cancelled = kind === 'cancel';
    sheet.getRange(row,14).setNote('fleetdesk-correction:' + JSON.stringify(marker));
    SpreadsheetApp.flush();
    return {ok:true,duplicate:false,correction_id:id,version:version,input_row:row,cancelled:kind === 'cancel',driver_row:driverRow || null};
  } finally { lock.releaseLock(); }
}


