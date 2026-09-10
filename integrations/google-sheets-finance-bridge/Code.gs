const SPREADSHEET_ID = '1XnAQPfubyv80uEUgszDZZfRVAir35yIth718r7AERps';
const PEACH_TOKEN_SHA256 = 'a837eb5861426d57f2b47398aac8f43dc3852a4d74651aecfb0ccb6ccb73dc6f';

const ACCOUNT_INDEX = Object.freeze({
  cash_aed: 0,
  ajman_aed: 1,
  sber_rub: 2,
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
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const token = String(body.token || '');
    if (!token || sha256Hex_(token) !== PEACH_TOKEN_SHA256) {
      return json_({ ok: false, error: 'Unauthorized' });
    }

    const action = String(body.action || '').trim();
    const payload = body.payload && typeof body.payload === 'object' ? body.payload : {};

    if (action === 'find_articles') return json_(findArticles_(payload));
    if (action === 'record_entry') return json_(recordEntry_(payload));

    return json_({ ok: false, error: 'Unsupported finance bridge action.' });
  } catch (error) {
    return json_({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

function findArticles_(payload) {
  const account = validateAccount_(payload.account);
  const date = validateDate_(payload.date);
  const query = normalize_(payload.query || '');
  if (!query) throw new Error('query is required.');

  const sheet = sheetForDate_(date);
  const block = blockForAccount_(sheet, account);
  const rowCount = Math.max(1, sheet.getLastRow() - 2);
  const values = sheet
    .getRange(3, block.articleCol, rowCount, 1)
    .getDisplayValues();
  const dateCol = dateColumn_(sheet, block, date);
  const formulas = sheet
    .getRange(3, dateCol, rowCount, 1)
    .getFormulas();

  const matches = [];
  for (let i = 0; i < values.length; i++) {
    const label = String(values[i][0] || '').trim();
    if (!label) continue;
    const normalized = normalize_(label);
    if (!normalized.includes(query)) continue;
    const row = i + 3;
    matches.push({
      row,
      article: label,
      section: parentContextFromArrays_(values, formulas, i),
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
  const block = blockForAccount_(sheet, account);
  const dateCol = dateColumn_(sheet, block, date);
  const articleRow = resolveArticleRow_(sheet, block.articleCol, article, payload.row);

  if (!articleRow) {
    const suggestions = findArticles_({ account, date, query: article });
    throw new Error(
      suggestions.count
        ? 'Exact article not found. Use one of the returned article names.'
        : 'Article not found in this account block.'
    );
  }

  const amountCell = sheet.getRange(articleRow, dateCol);
  const noteCell = sheet.getRange(articleRow, dateCol + 1);
  const amountFormula = amountCell.getFormula();
  const noteFormula = noteCell.getFormula();
  const directException = isDirectWriteException_(article);

  if (amountFormula && !directException) {
    throw new Error('This is an automatic parent/formula row. Write to its subrow instead.');
  }
  if (noteFormula) {
    throw new Error('The note cell is calculated automatically and cannot be overwritten.');
  }

  const currentAmount = amountCell.getValue();
  const currentNote = noteCell.getValue();
  const amountOccupied = currentAmount !== '' && currentAmount !== null && Number(currentAmount) !== 0;
  const noteOccupied = String(currentNote || '').trim() !== '';

  if (amountOccupied || noteOccupied) {
    throw new Error('This article/date cell already contains data. Nothing was overwritten.');
  }

  const lock = LockService.getDocumentLock();
  lock.waitLock(15000);
  try {
    const freshAmount = amountCell.getValue();
    const freshNote = noteCell.getValue();
    const freshFormula = amountCell.getFormula();
    const freshAmountOccupied = freshAmount !== '' && freshAmount !== null && Number(freshAmount) !== 0;
    const freshNoteOccupied = String(freshNote || '').trim() !== '';

    if ((freshFormula && !directException) || freshAmountOccupied || freshNoteOccupied) {
      throw new Error('The target cell changed before write. Nothing was overwritten.');
    }

    amountCell.setValue(amount);
    if (note) noteCell.setValue(note);
    SpreadsheetApp.flush();

    const writtenAmount = Number(amountCell.getValue());
    if (Math.abs(writtenAmount - amount) > 0.0001) {
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
    amount,
    note: note || null,
    amount_cell: a1_(articleRow, dateCol),
    note_cell: a1_(articleRow, dateCol + 1),
  };
}

function sheetForDate_(dateString) {
  const parts = dateString.split('-').map(Number);
  const year = parts[0];
  const month = parts[1];
  const sheetName = MONTHS_RU[month - 1] + ' ' + year;
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) throw new Error('No finance sheet exists for ' + sheetName + '.');
  return sheet;
}

function blockForAccount_(sheet, account) {
  const row2 = sheet.getRange(2, 1, 1, sheet.getLastColumn()).getDisplayValues()[0];
  const articleCols = [];
  for (let i = 0; i < row2.length; i++) {
    if (normalize_(row2[i]) === normalize_('Наименование статьи')) articleCols.push(i + 1);
  }

  if (articleCols.length < 3) throw new Error('Finance block headers were not found.');
  const blockIndex = ACCOUNT_INDEX[account];
  const articleCol = articleCols[blockIndex];
  const nextArticleCol = articleCols[blockIndex + 1] || (sheet.getLastColumn() + 1);

  return { articleCol, nextArticleCol };
}

function dateColumn_(sheet, block, dateString) {
  const width = Math.max(1, block.nextArticleCol - block.articleCol - 1);
  const values = sheet.getRange(2, block.articleCol + 1, 1, width).getValues()[0];
  const timezone = SpreadsheetApp.openById(SPREADSHEET_ID).getSpreadsheetTimeZone() || 'Asia/Dubai';

  for (let i = 0; i < values.length; i++) {
    const value = values[i];
    if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value)) {
      if (Utilities.formatDate(value, timezone, 'yyyy-MM-dd') === dateString) {
        return block.articleCol + 1 + i;
      }
    }
  }

  throw new Error('Date ' + dateString + ' was not found in ' + accountLabelByBlock_(block.articleCol) + '.');
}

function resolveArticleRow_(sheet, articleCol, article, requestedRow) {
  const target = normalize_(article);

  if (requestedRow !== undefined && requestedRow !== null && requestedRow !== '') {
    const row = Number(requestedRow);
    if (!Number.isInteger(row) || row < 3 || row > sheet.getLastRow()) {
      throw new Error('row is invalid.');
    }
    const actual = String(sheet.getRange(row, articleCol).getDisplayValue() || '').trim();
    if (normalize_(actual) !== target) {
      throw new Error('The selected row no longer matches the requested article.');
    }
    return row;
  }

  const values = sheet
    .getRange(3, articleCol, Math.max(1, sheet.getLastRow() - 2), 1)
    .getDisplayValues();

  const rows = [];
  for (let i = 0; i < values.length; i++) {
    if (normalize_(values[i][0]) === target) rows.push(i + 3);
  }

  if (rows.length > 1) {
    throw new Error('More than one exact article matches. Call find_articles and pass the returned row.');
  }
  return rows[0] || null;
}

function parentContextFromArrays_(labels, formulas, index) {
  for (let i = index - 1; i >= 0 && i >= index - 120; i--) {
    const label = String((labels[i] && labels[i][0]) || '').trim();
    if (!label) continue;
    const formula = String((formulas[i] && formulas[i][0]) || '');
    if (formula) return label;
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
  if (!Object.prototype.hasOwnProperty.call(ACCOUNT_INDEX, account)) {
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

function accountLabelByBlock_(articleCol) {
  if (articleCol === 2) return ACCOUNT_LABEL.cash_aed;
  if (articleCol === 68) return ACCOUNT_LABEL.ajman_aed;
  if (articleCol === 134) return ACCOUNT_LABEL.sber_rub;
  return 'finance block';
}

function json_(body) {
  return ContentService
    .createTextOutput(JSON.stringify(body))
    .setMimeType(ContentService.MimeType.JSON);
}
