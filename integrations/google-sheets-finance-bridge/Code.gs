const SPREADSHEET_ID = '1XnAQPfubyv80uEUgszDZZfRVAir35yIth718r7AERps';
const PEACH_TOKEN_SHA256 = 'a837eb5861426d57f2b47398aac8f43dc3852a4d74651aecfb0ccb6ccb73dc6f';

const INPUT_SHEET = 'Ввод операций';
const REFERENCE_SHEET = 'Справочники';
const INPUT_FIRST_ROW = 5;
const INPUT_LAST_ROW = 1004;

const ACCOUNT_LABEL = Object.freeze({
  cash_aed: 'Касса (AED)',
  ajman_aed: 'AJMAN (AED)',
  sber_rub: 'СБЕР (RUB)',
});

function doGet() {
  const period = activePeriod_();
  return json_({
    ok: true,
    service: 'Al Musafir Google Sheets Finance Bridge',
    spreadsheet_id: SPREADSHEET_ID,
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
    else if (action === 'get_context') result = getContext_();
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

function getContext_() {
  return {
    ok: true,
    action: 'get_context',
    period: activePeriod_(),
    accounts: Object.keys(ACCOUNT_LABEL).map(function (key) {
      return { account: key, label: ACCOUNT_LABEL[key] };
    }),
    input_sheet: INPUT_SHEET,
  };
}

function findArticles_(payload) {
  const account = validateAccount_(payload.account);
  const date = validateActiveDate_(payload.date);
  const query = normalize_(payload.query || '');
  if (!query) throw new Error('query is required.');

  const rows = referenceRows_();
  const tokens = query.split(' ').filter(Boolean);
  const matches = [];

  for (let i = 0; i < rows.length; i++) {
    const operation = String(rows[i][0] || '').trim();
    if (!operation) continue;

    const haystack = normalize_(operation);
    const matchedTokens = tokens.filter(function (token) {
      return haystack.indexOf(token) !== -1;
    }).length;

    if (!haystack.includes(query) && matchedTokens === 0) continue;

    const mappedRow = Number(account === 'sber_rub' ? rows[i][3] : rows[i][1]);
    if (!Number.isFinite(mappedRow) || mappedRow <= 0) continue;

    matches.push({
      row: mappedRow,
      article: operation,
      section: String(rows[i][2] || '').trim() || null,
      reference_row: i + 2,
      score: haystack.includes(query) ? 100 + tokens.length : matchedTokens,
    });
  }

  matches.sort(function (a, b) {
    return b.score - a.score || a.row - b.row;
  });

  return {
    ok: true,
    action: 'find_articles',
    account,
    account_label: ACCOUNT_LABEL[account],
    date,
    period: activePeriod_(),
    count: matches.length,
    matches: matches.slice(0, 20),
  };
}

function recordEntry_(payload) {
  const account = validateAccount_(payload.account);
  const date = validateActiveDate_(payload.date);
  const article = String(payload.article || '').trim();
  const note = String(payload.note || '').trim();
  const amount = Number(payload.amount);

  if (!article) throw new Error('article is required.');
  if (article.length > 250) throw new Error('article is too long.');
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('amount must be greater than zero.');
  if (note.length > 500) throw new Error('note is too long.');

  const ref = resolveReference_(article, account, payload.row);
  if (!ref) throw new Error('Operation not found in Справочники.');

  const sheet = spreadsheet_().getSheetByName(INPUT_SHEET);
  if (!sheet) throw new Error('Лист «Ввод операций» не найден.');

  const lock = LockService.getDocumentLock();
  lock.waitLock(15000);
  try {
    const targetRow = nextEmptyInputRow_(sheet);
    if (!targetRow) throw new Error('В листе «Ввод операций» закончились свободные строки.');

    const dateValue = parseYmd_(date);
    sheet.getRange(targetRow, 1, 1, 5).setValues([[
      dateValue,
      ACCOUNT_LABEL[account],
      ref.operation,
      amount,
      note,
    ]]);

    SpreadsheetApp.flush();

    const status = String(sheet.getRange(targetRow, 9).getDisplayValue() || '').trim();
    const mappedRow = Number(sheet.getRange(targetRow, 8).getValue());
    const key = String(sheet.getRange(targetRow, 10).getDisplayValue() || '').trim();
    const type = String(sheet.getRange(targetRow, 6).getDisplayValue() || '').trim();
    const currency = String(sheet.getRange(targetRow, 7).getDisplayValue() || '').trim();

    if (status !== '✓ Готово' || !Number.isFinite(mappedRow) || mappedRow <= 0 || !key) {
      sheet.getRange(targetRow, 1, 1, 5).clearContent();
      SpreadsheetApp.flush();
      throw new Error('Таблица не подтвердила операцию. Запись отменена.');
    }

    if (mappedRow !== ref.mappedRow) {
      sheet.getRange(targetRow, 1, 1, 5).clearContent();
      SpreadsheetApp.flush();
      throw new Error('Строка операции изменилась. Запись отменена.');
    }

    return {
      ok: true,
      action: 'record_entry',
      account,
      account_label: ACCOUNT_LABEL[account],
      date,
      period: activePeriod_(),
      input_sheet: INPUT_SHEET,
      input_row: targetRow,
      article: ref.operation,
      mapped_row: mappedRow,
      type,
      currency,
      amount,
      note: note || null,
      status,
      key,
    };
  } finally {
    lock.releaseLock();
  }
}

function spreadsheet_() {
  const active = SpreadsheetApp.getActiveSpreadsheet();
  if (active && active.getId() === SPREADSHEET_ID) return active;
  return SpreadsheetApp.openById(SPREADSHEET_ID);
}

function referenceRows_() {
  const sheet = spreadsheet_().getSheetByName(REFERENCE_SHEET);
  if (!sheet) throw new Error('Лист «Справочники» не найден.');
  return sheet.getRange('A2:D256').getDisplayValues();
}

function resolveReference_(article, account, requestedRow) {
  const target = normalize_(article);
  const rows = referenceRows_();
  const candidates = [];

  for (let i = 0; i < rows.length; i++) {
    const operation = String(rows[i][0] || '').trim();
    if (!operation || normalize_(operation) !== target) continue;

    const mappedRow = Number(account === 'sber_rub' ? rows[i][3] : rows[i][1]);
    if (!Number.isFinite(mappedRow) || mappedRow <= 0) continue;

    candidates.push({ operation, mappedRow, referenceRow: i + 2 });
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

function nextEmptyInputRow_(sheet) {
  const rowCount = INPUT_LAST_ROW - INPUT_FIRST_ROW + 1;
  const values = sheet.getRange(INPUT_FIRST_ROW, 1, rowCount, 5).getDisplayValues();

  for (let i = 0; i < values.length; i++) {
    const occupied = values[i].some(function (value) {
      return String(value || '').trim() !== '';
    });
    if (!occupied) return INPUT_FIRST_ROW + i;
  }
  return null;
}

function activePeriod_() {
  const sheet = spreadsheet_().getSheetByName(INPUT_SHEET);
  if (!sheet) throw new Error('Лист «Ввод операций» не найден.');

  const rule = sheet.getRange('A5').getDataValidation();
  if (!rule || rule.getCriteriaType() !== SpreadsheetApp.DataValidationCriteria.DATE_BETWEEN) {
    throw new Error('Не удалось определить активный месяц финансовой таблицы.');
  }

  const values = rule.getCriteriaValues();
  const start = values[0];
  const end = values[1];
  if (!(start instanceof Date) || !(end instanceof Date)) {
    throw new Error('Некорректный период в «Ввод операций».');
  }

  const tz = spreadsheet_().getSpreadsheetTimeZone() || 'Asia/Dubai';
  return {
    start: Utilities.formatDate(start, tz, 'yyyy-MM-dd'),
    end: Utilities.formatDate(end, tz, 'yyyy-MM-dd'),
    label: Utilities.formatDate(start, tz, 'MMMM yyyy'),
  };
}

function validateAccount_(value) {
  const account = String(value || '').trim().toLowerCase();
  if (!Object.prototype.hasOwnProperty.call(ACCOUNT_LABEL, account)) {
    throw new Error('account must be cash_aed, ajman_aed, or sber_rub.');
  }
  return account;
}

function validateActiveDate_(value) {
  const date = validateDate_(value);
  const period = activePeriod_();
  if (date < period.start || date > period.end) {
    throw new Error(
      'Дата ' + date + ' вне активного периода таблицы: ' + period.start + ' — ' + period.end + '.'
    );
  }
  return date;
}

function validateDate_(value) {
  const date = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('date must be YYYY-MM-DD.');

  const parsed = parseYmd_(date);
  const tz = spreadsheet_().getSpreadsheetTimeZone() || 'Asia/Dubai';
  if (Utilities.formatDate(parsed, tz, 'yyyy-MM-dd') !== date) {
    throw new Error('date is invalid.');
  }
  return date;
}

function parseYmd_(date) {
  const parts = String(date).split('-').map(Number);
  return new Date(parts[0], parts[1] - 1, parts[2], 12, 0, 0, 0);
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
