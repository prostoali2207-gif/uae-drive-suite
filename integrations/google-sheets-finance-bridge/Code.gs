const SPREADSHEET_ID = '1XnAQPfubyv80uEUgszDZZfRVAir35yIth718r7AERps';
const PEACH_TOKEN_SHA256 = 'a837eb5861426d57f2b47398aac8f43dc3852a4d74651aecfb0ccb6ccb73dc6f';

// These are the verified article columns in the 1:1 accounting template.
// Each date uses two columns immediately after the article column: amount, note.
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
  const dateCol = dateColumn_(block, date);
  const rowCount = Math.max(1, sheet.getLastRow() - 2);
  const labels = sheet
    .getRange(3, block.articleCol, rowCount, 1)
    .getDisplayValues();

  const rawMatches = [];
  for (let i = 0; i < labels.length; i++) {
    const label = String(labels[i][0] || '').trim();
    if (!label || !normalize_(label).includes(query)) continue;
    rawMatches.push({ index: i, row: i + 3, article: label });
    if (rawMatches.length >= 20) break;
  }

  let formulaStartIndex = 0;
  let formulaRows = [];
  if (rawMatches.length) {
    const minIndex = rawMatches[0].index;
    const maxIndex = rawMatches[rawMatches.length - 1].index;
    formulaStartIndex = Math.max(0, minIndex - 120);
    const formulaRowCount = maxIndex - formulaStartIndex + 1;
    formulaRows = sheet
      .getRange(formulaStartIndex + 3, dateCol, formulaRowCount, 1)
      .getFormulas();
  }

  const matches = rawMatches.map(function (match) {
    const formulaIndex = match.index - formulaStartIndex;
    const formula = formulaRows.length && formulaIndex >= 0
      ? String((formulaRows[formulaIndex] && formulaRows[formulaIndex][0]) || '')
      : '';

    return {
      row: match.row,
      article: match.article,
      section: parentContextFromWindow_(labels, formulaRows, formulaStartIndex, match.index),
      formula_row: Boolean(formula),
      direct_write_exception: isDirectWriteException_(match.article),
    };
  });

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

    if (amountFormula && !directException) {
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
    SpreadsheetApp.flush();

    const writtenAmount = Number(sheet.getRange(articleRow, dateCol).getValue());
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
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(sheetName);
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

function parentContextFromWindow_(labels, formulas, formulaStartIndex, index) {
  for (let i = index - 1; i >= 0 && i >= index - 120; i--) {
    const label = String((labels[i] && labels[i][0]) || '').trim();
    if (!label) continue;
    const formulaIndex = i - formulaStartIndex;
    if (formulaIndex < 0 || formulaIndex >= formulas.length) continue;
    const formula = String((formulas[formulaIndex] && formulas[formulaIndex][0]) || '');
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
