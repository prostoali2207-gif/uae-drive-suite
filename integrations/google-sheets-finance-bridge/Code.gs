const SPREADSHEET_ID = '1XnAQPfubyv80uEUgszDZZfRVAir35yIth718r7AERps';
const PEACH_TOKEN_SHA256 = 'a837eb5861426d57f2b47398aac8f43dc3852a4d74651aecfb0ccb6ccb73dc6f';

// Verified 1:1 accounting template layout.
const ACCOUNT_BLOCK = Object.freeze({
  cash_aed: Object.freeze({ articleCol: 2, nextArticleCol: 68 }),
  ajman_aed: Object.freeze({ articleCol: 68, nextArticleCol: 134 }),
  sber_rub: Object.freeze({ articleCol: 134, nextArticleCol: 200 }),
});

const ACCOUNT_LABEL = Object.freeze({
  cash_aed: 'Наличные AED',
  ajman_aed: 'AJMAN AED',
  sber_rub: 'СБЕР RUB',
});

const DIRECT_WRITE_EXCEPTIONS = Object.freeze([
  'платные дороги',
  'мойка авто',
]);

// Amount/formula parent rows are identical in the first three verified account blocks.
// Keeping this index in code removes a slow formula scan from every read-only lookup.
const FORMULA_PARENT_ROWS = new Set([
  4, 5, 85, 91, 92, 98, 104, 110, 116, 122, 128, 134, 140, 146, 155,
  161, 162, 242, 248, 255, 256, 262, 268, 274, 280, 286, 292, 298, 305,
  313, 319, 328, 331, 337, 343, 354, 364, 369, 384,
]);

const FIRST_ARTICLE_ROW = 3;
const LAST_ARTICLE_ROW = 384;

const MONTHS_RU = Object.freeze([
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь',
]);

function doGet() {
  return json_({
    ok: true,
    service: 'Al Musafir Google Sheets Finance Bridge',
    spreadsheet_id: SPREADSHEET_ID,
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

function findArticles_(payload) {
  const account = validateAccount_(payload.account);
  const date = validateDate_(payload.date);
  const query = normalize_(payload.query || '');
  if (!query) throw new Error('query is required.');

  const sheet = sheetForDate_(date);
  const block = blockForAccount_(account);
  const rowCount = LAST_ARTICLE_ROW - FIRST_ARTICLE_ROW + 1;
  const labels = sheet
    .getRange(FIRST_ARTICLE_ROW, block.articleCol, rowCount, 1)
    .getDisplayValues();

  const matches = [];
  for (let i = 0; i < labels.length; i++) {
    const label = String(labels[i][0] || '').trim();
    if (!label || !normalize_(label).includes(query)) continue;
    const row = i + FIRST_ARTICLE_ROW;
    matches.push({
      row,
      article: label,
      section: parentContextFromRows_(labels, row),
      formula_row: FORMULA_PARENT_ROWS.has(row),
      direct_write_exception: isDirectWriteException_(label),
    });
    if (matches.length >= 20) break;
  }

  return {
    ok: true,
    action: 'find_articles',
    account,
    account_label: ACCOUNT_LABEL[account],
    date,
    sheet: sheet.getName(),
    count: matches.length,
    matches,
  };
}

function recordEntry_(payload) {
  const account = validateAccount_(payload.account);
  const date = validateDate_(payload.date);
  const article = String(payload.article || '').trim();
  const note = String(payload.note || '').trim();
  const amount = Number(payload.amount);

  if (!article) throw new Error('article is required.');
  if (article.length > 200) throw new Error('article is too long.');
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('amount must be greater than zero.');
  if (note.length > 500) throw new Error('note is too long.');

  const sheet = sheetForDate_(date);
  const block = blockForAccount_(account);
  const dateCol = dateColumn_(block, date);
  const articleRow = resolveArticleRow_(sheet, block.articleCol, article, payload.row);
  if (!articleRow) throw new Error('Article not found in this account block.');

  const directException = isDirectWriteException_(article);
  const lock = LockService.getDocumentLock();
  lock.waitLock(15000);
  try {
    const actualArticle = String(sheet.getRange(articleRow, block.articleCol).getDisplayValue() || '').trim();
    if (normalize_(actualArticle) !== normalize_(article)) {
      throw new Error('The selected row no longer matches the requested article.');
    }

    const targetRange = sheet.getRange(articleRow, dateCol, 1, 2);
    const formulas = targetRange.getFormulas()[0];
    const values = targetRange.getValues()[0];
    const amountFormula = String(formulas[0] || '');
    const noteFormula = String(formulas[1] || '');

    if ((amountFormula || FORMULA_PARENT_ROWS.has(articleRow)) && !directException) {
      throw new Error('This is an automatic parent/formula row. Write to its subrow instead.');
    }
    if (noteFormula) {
      throw new Error('The note cell is calculated automatically and cannot be overwritten.');
    }

    const currentAmount = values[0];
    const currentNote = values[1];
    const amountOccupied = currentAmount !== '' && currentAmount !== null && Number(currentAmount) !== 0;
    const noteOccupied = String(currentNote || '').trim() !== '';
    if (amountOccupied || noteOccupied) {
      throw new Error('This article/date cell already contains data. Nothing was overwritten.');
    }

    targetRange.setValues([[amount, note]]);

    // Reading back forces pending SpreadsheetApp writes to be applied and verifies the value.
    const written = targetRange.getValues()[0];
    if (Math.abs(Number(written[0]) - amount) > 0.0001 || String(written[1] || '') !== note) {
      throw new Error('Write verification failed.');
    }
  } finally {
    lock.releaseLock();
  }

  return {
    ok: true,
    action: 'record_entry',
    account,
    account_label: ACCOUNT_LABEL[account],
    date,
    sheet: sheet.getName(),
    article,
    row: articleRow,
    amount,
    note: note || null,
    amount_cell: a1_(articleRow, dateCol),
    note_cell: a1_(articleRow, dateCol + 1),
  };
}

function spreadsheet_() {
  const active = SpreadsheetApp.getActiveSpreadsheet();
  if (active && active.getId() === SPREADSHEET_ID) return active;
  return SpreadsheetApp.openById(SPREADSHEET_ID);
}

function sheetForDate_(dateString) {
  const parts = dateString.split('-').map(Number);
  const year = parts[0];
  const month = parts[1];
  const sheetName = MONTHS_RU[month - 1] + ' ' + year;
  const sheet = spreadsheet_().getSheetByName(sheetName);
  if (!sheet) throw new Error('No finance sheet exists for ' + sheetName + '.');
  return sheet;
}

function blockForAccount_(account) {
  const block = ACCOUNT_BLOCK[account];
  if (!block) throw new Error('Finance account block was not found.');
  return block;
}

function dateColumn_(block, dateString) {
  const day = Number(dateString.slice(8, 10));
  const dateCol = block.articleCol + (day * 2 - 1);
  if (dateCol <= block.articleCol || dateCol >= block.nextArticleCol) {
    throw new Error('Date ' + dateString + ' is outside this finance block.');
  }
  return dateCol;
}

function resolveArticleRow_(sheet, articleCol, article, requestedRow) {
  const target = normalize_(article);

  if (requestedRow !== undefined && requestedRow !== null && requestedRow !== '') {
    const row = Number(requestedRow);
    if (!Number.isInteger(row) || row < FIRST_ARTICLE_ROW || row > LAST_ARTICLE_ROW) {
      throw new Error('row is invalid.');
    }
    return row;
  }

  const rowCount = LAST_ARTICLE_ROW - FIRST_ARTICLE_ROW + 1;
  const values = sheet
    .getRange(FIRST_ARTICLE_ROW, articleCol, rowCount, 1)
    .getDisplayValues();

  const rows = [];
  for (let i = 0; i < values.length; i++) {
    if (normalize_(values[i][0]) === target) rows.push(i + FIRST_ARTICLE_ROW);
  }

  if (rows.length > 1) {
    throw new Error('More than one exact article matches. Call find_articles and pass the returned row.');
  }
  return rows[0] || null;
}

function parentContextFromRows_(labels, row) {
  const minRow = Math.max(FIRST_ARTICLE_ROW, row - 120);
  for (let candidate = row - 1; candidate >= minRow; candidate--) {
    if (!FORMULA_PARENT_ROWS.has(candidate)) continue;
    const label = String((labels[candidate - FIRST_ARTICLE_ROW] || [])[0] || '').trim();
    if (label) return label;
  }
  return null;
}

function isDirectWriteException_(article) {
  const normalized = normalize_(article);
  return DIRECT_WRITE_EXCEPTIONS.some(function (allowed) {
    const target = normalize_(allowed);
    return normalized === target || normalized.indexOf(target + ' ') === 0 || normalized.indexOf(target + '(') === 0;
  });
}

function validateAccount_(value) {
  const account = String(value || '').trim().toLowerCase();
  if (!Object.prototype.hasOwnProperty.call(ACCOUNT_BLOCK, account)) {
    throw new Error('account must be cash_aed, ajman_aed, or sber_rub.');
  }
  return account;
}

function validateDate_(value) {
  const date = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('date must be YYYY-MM-DD.');
  const parsed = new Date(date + 'T12:00:00Z');
  if (isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
    throw new Error('date is invalid.');
  }
  return date;
}

function normalize_(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/ё/g, 'е')
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

function a1_(row, col) {
  let n = col;
  let letters = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    letters = String.fromCharCode(65 + rem) + letters;
    n = Math.floor((n - 1) / 26);
  }
  return letters + row;
}

function json_(body) {
  return ContentService
    .createTextOutput(JSON.stringify(body))
    .setMimeType(ContentService.MimeType.JSON);
}
