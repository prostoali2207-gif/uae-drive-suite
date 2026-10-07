const RENTAL_SPREADSHEET_ID = '1XnAQPfubyv80uEUgszDZZfRVAir35yIth718r7AERps';
const SHOWROOM_SPREADSHEET_ID = '16Nb1bP-u5ox9RX4kH5fWa-GaYvAIoisyLMFSiGbtvJA';
const PEACH_TOKEN_SHA256 = ['a837eb5861426d57','f2b47398aac8f43d','c3852a4d74651aec','fb0ccb6ccb73dc6f'].join('');

const INPUT_SHEET = 'Ввод операций';
const REFERENCE_SHEET = 'Справочники';
const INPUT_FIRST_ROW = 5;
const INPUT_LAST_ROW = 1004;
const FINANCE_TIME_ZONE = 'Asia/Dubai';
const MONTH_GRACE_DAYS = 3;
const MONTH_TEMPLATE_SHEET = 'Октябрь 2026';
const MONTH_NAMES_RU = Object.freeze([
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь',
]);

const LEDGER_CONFIG = Object.freeze({
  rental: Object.freeze({
    spreadsheetId: RENTAL_SPREADSHEET_ID,
    accounts: Object.freeze({
      cash_aed: 'Касса (AED)',
      ajman_aed: 'AJMAN (AED)',
      sber_rub: 'СБЕР (RUB)',
    }),
    referenceRange: 'A2:D256',
    templateMonthSheet: MONTH_TEMPLATE_SHEET,
    openingCells: Object.freeze(['C3', 'BQ3', 'EE3']),
    closingRowLabel: 'остаток на конец',
    closingColumns: Object.freeze(['BM', 'EA', 'GO']),
    literalDataRanges: Object.freeze(['C4:BL383', 'BQ4:DZ383', 'EE4:GN383']),
    dateHeaderGroups: Object.freeze([
      Object.freeze({ startColumn: 3, step: 2 }),
      Object.freeze({ startColumn: 69, step: 2 }),
      Object.freeze({ startColumn: 135, step: 2 }),
      Object.freeze({ startColumn: 201, step: 1 }),
      Object.freeze({ startColumn: 236, step: 1 }),
    ]),
    hideMonthSheet: false,
  }),
  showroom: Object.freeze({
    spreadsheetId: SHOWROOM_SPREADSHEET_ID,
    accounts: Object.freeze({
      cash_aed: 'Касса',
      ajman_aed: 'AJMAN',
    }),
    referenceRange: 'A2:E31',
    templateMonthSheet: MONTH_TEMPLATE_SHEET,
    openingCells: Object.freeze(['C3', 'BQ3']),
    closingRowLabel: 'остаток на конец',
    closingColumns: Object.freeze(['BM', 'EA']),
    literalDataRanges: Object.freeze(['C4:BL145', 'BQ4:DZ145']),
    dateHeaderGroups: Object.freeze([
      Object.freeze({ startColumn: 3, step: 2 }),
      Object.freeze({ startColumn: 69, step: 2 }),
      Object.freeze({ startColumn: 135, step: 1 }),
    ]),
    hideMonthSheet: true,
  }),
});

function doGet(e) {
  const ledger = validateLedger_((e && e.parameter && e.parameter.ledger) || 'rental');
  ensureFinanceCalendar_(ledger);
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
  ensureFinanceCalendar_(ledger);
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
  ensureFinanceCalendar_(ledger);
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
  ensureFinanceCalendar_(ledger);
  const config = ledgerConfig_(ledger);
  const account = validateAccount_(payload.account, ledger);
  const date = validatePostingDate_(payload.date, ledger);
  const period = activePeriod_(ledger);

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
  validateLedger_(ledger);
  const window = postingWindow_();
  return {
    start: window.currentStart,
    end: window.currentEnd,
    label: monthSheetNameFromYmd_(window.currentStart),
    previous_month_grace: window.graceActive ? {
      start: window.previousStart,
      end: window.previousEnd,
      until: window.graceUntil,
    } : null,
  };
}

function postingWindow_() {
  const today = dubaiTodayYmd_();
  const currentStart = monthStartYmd_(today);
  const currentEnd = monthEndYmd_(currentStart);
  const previousStart = addMonthsYmd_(currentStart, -1);
  const previousEnd = monthEndYmd_(previousStart);
  const day = Number(today.slice(8, 10));
  const graceActive = day <= MONTH_GRACE_DAYS;

  return {
    today,
    currentStart,
    currentEnd,
    previousStart,
    previousEnd,
    graceActive,
    graceUntil: currentStart.slice(0, 8) + String(MONTH_GRACE_DAYS).padStart(2, '0'),
    allowedStart: graceActive ? previousStart : currentStart,
    allowedEnd: currentEnd,
  };
}

function validatePostingDate_(value, ledger) {
  const date = validateDate_(value, ledger);
  const window = postingWindow_();
  if (date >= window.currentStart && date <= window.currentEnd) return date;
  if (window.graceActive && date >= window.previousStart && date <= window.previousEnd) return date;

  let message = 'Дата ' + date + ' вне активного месяца: ' +
    window.currentStart + ' — ' + window.currentEnd + '.';
  if (window.graceActive) {
    message += ' До ' + window.graceUntil +
      ' также разрешён прошлый месяц: ' + window.previousStart + ' — ' + window.previousEnd + '.';
  }
  throw new Error(message);
}

function validateActiveDate_(value, ledger) {
  return validatePostingDate_(value, ledger);
}

function ensureFinanceCalendar_(ledger) {
  const config = ledgerConfig_(ledger);
  const ss = spreadsheet_(ledger);
  const window = postingWindow_();
  const currentSheet = ensureMonthSheet_(ss, ledger, window.currentStart);
  refreshMonthOpeningBalances_(ss, ledger, currentSheet, window.currentStart);
  ensureInputDateValidation_(ss, window);
  syncDashboardMonth_(ss, ledger, currentSheet);
  ensureFinanceMonthTrigger_();
}

function financeMonthMaintenance() {
  ['rental', 'showroom'].forEach(function (ledger) {
    ensureFinanceCalendar_(ledger);
  });
}

function financeMonthPrecreateNext() {
  const today = dubaiTodayYmd_();
  const tomorrow = addDaysYmd_(today, 1);
  if (monthStartYmd_(tomorrow) === monthStartYmd_(today)) return;

  ['rental', 'showroom'].forEach(function (ledger) {
    const ss = spreadsheet_(ledger);
    ensureMonthSheet_(ss, ledger, monthStartYmd_(tomorrow));
  });
}

function installFinanceMonthAutomation() {
  ensureFinanceMonthTriggers_();
  financeMonthMaintenance();
  return {
    ok: true,
    timezone: FINANCE_TIME_ZONE,
    maintenance: 'daily around 00:10',
    precreate: 'daily around 23:10; creates next month only when tomorrow is day 1',
  };
}

function ensureFinanceMonthTrigger_() {
  ensureFinanceMonthTriggers_();
}

function ensureFinanceMonthTriggers_() {
  const existing = {};
  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    existing[trigger.getHandlerFunction()] = true;
  });

  if (!existing.financeMonthMaintenance) {
    ScriptApp.newTrigger('financeMonthMaintenance')
      .timeBased()
      .everyDays(1)
      .atHour(0)
      .nearMinute(10)
      .inTimezone(FINANCE_TIME_ZONE)
      .create();
  }

  if (!existing.financeMonthPrecreateNext) {
    ScriptApp.newTrigger('financeMonthPrecreateNext')
      .timeBased()
      .everyDays(1)
      .atHour(23)
      .nearMinute(10)
      .inTimezone(FINANCE_TIME_ZONE)
      .create();
  }
}

function ensureMonthSheet_(ss, ledger, monthStartYmd) {
  const config = ledgerConfig_(ledger);
  const monthName = monthSheetNameFromYmd_(monthStartYmd);
  let sheet = ss.getSheetByName(monthName);
  if (sheet) return sheet;

  const previousStart = addMonthsYmd_(monthStartYmd, -1);
  const previousName = monthSheetNameFromYmd_(previousStart);
  const previousSheet = ss.getSheetByName(previousName);
  if (!previousSheet) {
    throw new Error('Не найден предыдущий месячный лист «' + previousName + '».');
  }

  const template = ss.getSheetByName(config.templateMonthSheet);
  if (!template) {
    throw new Error('Не найден шаблон месячного листа «' + config.templateMonthSheet + '».');
  }

  sheet = template.copyTo(ss);
  sheet.setName(monthName);
  sheet.getRange('B1').setValue(parseYmd_(monthStartYmd));
  setMonthDateHeaders_(sheet, monthStartYmd, config.dateHeaderGroups);

  config.literalDataRanges.forEach(function (a1) {
    clearLiteralCellsPreserveFormulas_(sheet.getRange(a1));
  });

  const closingRow = findUniqueRowByLabel_(previousSheet, config.closingRowLabel);
  for (let i = 0; i < config.openingCells.length; i++) {
    const sourceCell = config.closingColumns[i] + closingRow;
    sheet.getRange(config.openingCells[i]).setFormula(
      previousMonthLinkFormula_(previousName, sourceCell)
    );
  }

  if (config.hideMonthSheet) sheet.hideSheet();
  return sheet;
}

function refreshMonthOpeningBalances_(ss, ledger, monthSheet, monthStartYmd) {
  const config = ledgerConfig_(ledger);
  const previousName = monthSheetNameFromYmd_(addMonthsYmd_(monthStartYmd, -1));
  const previousSheet = ss.getSheetByName(previousName);
  if (!previousSheet) {
    throw new Error('Не найден предыдущий месячный лист «' + previousName + '».');
  }

  const closingRow = findUniqueRowByLabel_(previousSheet, config.closingRowLabel);
  for (let i = 0; i < config.openingCells.length; i++) {
    const sourceCell = config.closingColumns[i] + closingRow;
    monthSheet.getRange(config.openingCells[i]).setFormula(
      previousMonthLinkFormula_(previousName, sourceCell)
    );
  }
}

function findUniqueRowByLabel_(sheet, label) {
  const target = String(label || '').trim().toLowerCase();
  const values = sheet.getRange(1, 2, sheet.getLastRow(), 1).getDisplayValues();
  const rows = [];

  for (let i = 0; i < values.length; i++) {
    if (String(values[i][0] || '').trim().toLowerCase() === target) {
      rows.push(i + 1);
    }
  }

  if (rows.length !== 1) {
    throw new Error(
      'На листе «' + sheet.getName() + '» в колонке B ожидалась ровно одна строка «' +
      label + '», найдено: ' + rows.length + '.'
    );
  }

  return rows[0];
}

function previousMonthLinkFormula_(sheetName, cellA1) {
  const escaped = String(sheetName || '').replace(/'/g, "''");
  return "='" + escaped + "'!" + cellA1;
}

function clearLiteralCellsPreserveFormulas_(range) {
  const formulas = range.getFormulas();
  const values = range.getValues();
  const output = new Array(values.length);

  for (let r = 0; r < values.length; r++) {
    output[r] = new Array(values[r].length);
    for (let c = 0; c < values[r].length; c++) {
      output[r][c] = formulas[r][c] || '';
    }
  }

  range.clearContent();
  range.setValues(output);
}

function setMonthDateHeaders_(sheet, monthStartYmd, groups) {
  const parts = monthStartYmd.split('-').map(Number);
  const daysInMonth = new Date(Date.UTC(parts[0], parts[1], 0, 12, 0, 0)).getUTCDate();

  groups.forEach(function (group) {
    for (let day = 1; day <= 31; day++) {
      const column = group.startColumn + (day - 1) * group.step;
      const cell = sheet.getRange(2, column);
      if (day <= daysInMonth) {
        const ymd = monthStartYmd.slice(0, 8) + String(day).padStart(2, '0');
        cell.setValue(parseYmd_(ymd));
      } else {
        cell.clearContent();
      }
    }
  });
}

function ensureInputDateValidation_(ss, window) {
  const sheet = ss.getSheetByName(INPUT_SHEET);
  if (!sheet) throw new Error('Лист «Ввод операций» не найден.');

  const start = parseYmd_(window.allowedStart);
  const end = parseYmd_(window.allowedEnd);
  const help = window.graceActive
    ? 'Текущий месяц + льгота на прошлый месяц до ' + window.graceUntil + '.'
    : monthSheetNameFromYmd_(window.currentStart);

  const rule = SpreadsheetApp.newDataValidation()
    .requireDateBetween(start, end)
    .setAllowInvalid(false)
    .setHelpText(help)
    .build();

  const rowCount = INPUT_LAST_ROW - INPUT_FIRST_ROW + 1;
  const dates = sheet.getRange(INPUT_FIRST_ROW, 1, rowCount, 1).getDisplayValues();
  const emptyDateCells = [];

  for (let i = 0; i < dates.length; i++) {
    if (String(dates[i][0] || '').trim() === '') {
      emptyDateCells.push('A' + (INPUT_FIRST_ROW + i));
    }
  }

  if (emptyDateCells.length) {
    sheet.getRangeList(emptyDateCells).setDataValidation(rule);
  }
}

function syncDashboardMonth_(ss, ledger, monthSheet) {
  const monthName = monthSheet.getName();
  const main = ss.getSheetByName('Главная');

  if (main) {
    replaceDashboardMonthReferences_(main, ss, monthName);
    main.getRange('C3').setValue(monthName);

    if (ledger === 'rental') {
      updateRentalQuickLinks_(main, ss, monthSheet);
    }
  }

  if (ledger === 'showroom') {
    const overview = ss.getSheetByName('Месяц');
    if (overview) {
      replaceDashboardMonthReferences_(overview, ss, monthName);
    }
  }
}

function replaceDashboardMonthReferences_(sheet, ss, monthName) {
  const oldNames = ss.getSheets()
    .map(function (candidate) { return candidate.getName(); })
    .filter(function (name) {
      return name !== monthName && isMonthSheetName_(name);
    });
  if (!oldNames.length) return;

  const range = sheet.getDataRange();
  const formulas = range.getFormulas();

  for (let r = 0; r < formulas.length; r++) {
    for (let c = 0; c < formulas[r].length; c++) {
      let formula = formulas[r][c];
      if (!formula) continue;

      let next = formula;
      oldNames.forEach(function (oldName) {
        next = next.split("'" + oldName + "'!").join("'" + monthName + "'!");
      });

      if (next !== formula) {
        sheet.getRange(r + 1, c + 1).setFormula(next);
      }
    }
  }
}

function isMonthSheetName_(name) {
  return /^(Январь|Февраль|Март|Апрель|Май|Июнь|Июль|Август|Сентябрь|Октябрь|Ноябрь|Декабрь) \d{4}$/.test(
    String(name || '')
  );
}

function updateRentalQuickLinks_(main, ss, monthSheet) {
  const spreadsheetId = ss.getId();
  const gid = monthSheet.getSheetId();
  const base = 'https://docs.google.com/spreadsheets/d/' + spreadsheetId + '/edit#gid=' + gid + '&range=';
  const links = [
    { cell: 'A12', range: 'A1', label: 'Касса' },
    { cell: 'C12', range: 'BO1', label: 'AJMAN' },
    { cell: 'E12', range: 'EC1', label: 'СБЕР ₽' },
    { cell: 'G12', range: 'GQ1', label: 'СБЕР AED' },
    { cell: 'I12', range: 'HZ1', label: 'Свод' },
  ];

  links.forEach(function (item) {
    const rich = SpreadsheetApp.newRichTextValue()
      .setText(item.label)
      .setLinkUrl(base + item.range)
      .build();
    main.getRange(item.cell).setRichTextValue(rich);
  });
}

function financeMonthDryRunNovember2026() {
  const dates = ['2026-11-01', '2026-11-03', '2026-11-04'];
  const report = dates.map(function (dateYmd) {
    return financeMonthDryRun_(dateYmd);
  });

  const audit = financeOctoberClosingAudit_();
  const errors = audit.errors.slice();

  report.splice(2, 0, {
    simulated_today: '2026-11-02',
    scenario: 'Октябрьская операция внесена 2 ноября во время льготы',
    result: [
      'операция записывается в Октябрь 2026',
      'октябрьский остаток на конец пересчитывается',
      'Ноябрь 2026 ссылается живой формулой на найденную строку «остаток на конец»',
      'остаток на начало ноября обновляется автоматически вместе с октябрём',
      'ручной пересчёт 4 ноября не нужен',
    ],
    writes_performed: false,
  });

  const output = {
    status: errors.length
      ? '🚨🚨🚨 ОШИБКА: ОСТАТКИ ИЛИ ССЫЛКИ НЕ СОВПАДАЮТ — НЕ РАЗВЁРТЫВАТЬ 🚨🚨🚨'
      : 'OK: проверка остатков пройдена',
    october_closing_audit: audit,
    scenarios: report,
    writes_performed: false,
  };

  if (errors.length) {
    console.error(output.status);
    console.error(JSON.stringify(errors, null, 2));
  }
  console.log(JSON.stringify(output, null, 2));
  return output;
}

function financeOctoberClosingAudit_() {
  const errors = [];
  const ledgers = [];

  ['rental', 'showroom'].forEach(function (ledger) {
    const config = ledgerConfig_(ledger);
    const ss = spreadsheet_(ledger);
    const sheet = ss.getSheetByName('Октябрь 2026');
    if (!sheet) {
      errors.push(ledger + ': не найден лист «Октябрь 2026».');
      return;
    }

    let closingRow;
    try {
      closingRow = findUniqueRowByLabel_(sheet, config.closingRowLabel);
    } catch (error) {
      errors.push(ledger + ': ' + error.message);
      return;
    }

    const rowLabel = sheet.getRange(closingRow, 2).getDisplayValue();
    const sources = [];

    for (let i = 0; i < config.closingColumns.length; i++) {
      const sourceCell = config.closingColumns[i] + closingRow;
      const range = sheet.getRange(sourceCell);
      sources.push({
        source_cell: sourceCell,
        row: closingRow,
        row_label_B: rowLabel,
        value: range.getValue(),
        display_value: range.getDisplayValue(),
        formula: range.getFormula(),
      });
    }

    if (ledger === 'showroom') {
      const expected = [
        { account: 'Касса', value: 33749.5 },
        { account: 'AJMAN', value: 12305.0 },
      ];

      for (let i = 0; i < expected.length; i++) {
        const actual = Number(sources[i].value);
        sources[i].account = expected[i].account;
        sources[i].expected_value = expected[i].value;
        sources[i].matches_expected = Math.abs(actual - expected[i].value) < 0.01;
        if (!sources[i].matches_expected) {
          errors.push(
            'showroom ' + expected[i].account + ': ожидалось ' + expected[i].value +
            ', найдено ' + sources[i].display_value + ' в ' + sources[i].source_cell + '.'
          );
        }
      }
    } else {
      const baselineCells = ['BM384', 'EA384', 'GO384'];
      for (let i = 0; i < baselineCells.length; i++) {
        const baseline = sheet.getRange(baselineCells[i]);
        const baselineRow = baseline.getRow();
        const baselineLabel = sheet.getRange(baselineRow, 2).getDisplayValue();
        const baselineValue = baseline.getValue();

        sources[i].october_baseline_cell = baselineCells[i];
        sources[i].october_baseline_value = baselineValue;
        sources[i].october_baseline_display_value = baseline.getDisplayValue();
        sources[i].october_baseline_row_label_B = baselineLabel;
        sources[i].matches_october_baseline =
          sources[i].source_cell === baselineCells[i] &&
          String(rowLabel).trim().toLowerCase() === 'остаток на конец' &&
          Math.abs(Number(sources[i].value) - Number(baselineValue)) < 0.01;

        if (!sources[i].matches_october_baseline) {
          errors.push(
            'rental: динамический источник ' + sources[i].source_cell +
            ' не совпал с контрольной октябрьской клеткой ' + baselineCells[i] + '.'
          );
        }
      }
    }

    ledgers.push({
      ledger: ledger,
      sheet: 'Октябрь 2026',
      closing_row_found_by_B_label: closingRow,
      closing_row_label_B: rowLabel,
      sources: sources,
    });
  });

  return {
    status: errors.length
      ? '🚨🚨🚨 ОШИБКА: ПРОВЕРКА ОКТЯБРЬСКИХ ОСТАТКОВ НЕ ПРОЙДЕНА 🚨🚨🚨'
      : 'OK',
    ledgers: ledgers,
    errors: errors,
  };
}

function financeMonthDryRun_(dateYmd) {
  const currentStart = monthStartYmd_(dateYmd);
  const currentEnd = monthEndYmd_(currentStart);
  const previousStart = addMonthsYmd_(currentStart, -1);
  const previousEnd = monthEndYmd_(previousStart);
  const day = Number(String(dateYmd).slice(8, 10));
  const graceActive = day <= MONTH_GRACE_DAYS;
  const currentMonthName = monthSheetNameFromYmd_(currentStart);
  const previousMonthName = monthSheetNameFromYmd_(previousStart);

  const ledgers = ['rental', 'showroom'].map(function (ledger) {
    const config = ledgerConfig_(ledger);
    const ss = spreadsheet_(ledger);
    const currentSheet = ss.getSheetByName(currentMonthName);
    const previousSheet = ss.getSheetByName(previousMonthName);
    const opening = [];

    if (previousSheet) {
      const closingRow = findUniqueRowByLabel_(previousSheet, config.closingRowLabel);
      for (let i = 0; i < config.openingCells.length; i++) {
        const sourceCell = config.closingColumns[i] + closingRow;
        opening.push({
          target: config.openingCells[i],
          source: previousMonthName + '!' + sourceCell,
          source_row_found_by_B_label: closingRow,
          source_row_label_B: previousSheet.getRange(closingRow, 2).getDisplayValue(),
          formula: previousMonthLinkFormula_(previousMonthName, sourceCell),
          previous_closing_value_now: previousSheet.getRange(sourceCell).getDisplayValue(),
          behavior_if_previous_month_changes: 'updates automatically',
        });
      }
    }

    return {
      ledger: ledger,
      active_month: currentMonthName,
      month_sheet_exists: Boolean(currentSheet),
      would_create_month_sheet: !currentSheet,
      template_sheet: config.templateMonthSheet,
      previous_month_sheet: previousMonthName,
      opening_balances: opening,
      would_switch_main_to: currentMonthName,
      would_switch_overview_to: ledger === 'showroom' ? currentMonthName : null,
      allowed_posting_start: graceActive ? previousStart : currentStart,
      allowed_posting_end: currentEnd,
      previous_month_grace: graceActive
        ? { start: previousStart, end: previousEnd, until: currentStart.slice(0, 8) + '03' }
        : null,
      writes_performed: false,
    };
  });

  return {
    simulated_today: dateYmd,
    timezone: FINANCE_TIME_ZONE,
    ledgers: ledgers,
    writes_performed: false,
  };
}


function dubaiTodayYmd_() {
  return Utilities.formatDate(new Date(), FINANCE_TIME_ZONE, 'yyyy-MM-dd');
}

function monthStartYmd_(ymd) {
  const value = String(ymd || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Некорректная дата месяца.');
  return value.slice(0, 7) + '-01';
}

function addMonthsYmd_(monthStartYmd, delta) {
  const parts = String(monthStartYmd).split('-').map(Number);
  const date = new Date(Date.UTC(parts[0], parts[1] - 1 + Number(delta || 0), 1, 12, 0, 0));
  return Utilities.formatDate(date, 'UTC', 'yyyy-MM-dd');
}

function monthEndYmd_(monthStartYmd) {
  const parts = String(monthStartYmd).split('-').map(Number);
  const date = new Date(Date.UTC(parts[0], parts[1], 0, 12, 0, 0));
  return Utilities.formatDate(date, 'UTC', 'yyyy-MM-dd');
}

function addDaysYmd_(ymd, delta) {
  const parts = String(ymd).split('-').map(Number);
  const date = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2] + Number(delta || 0), 12, 0, 0));
  return Utilities.formatDate(date, 'UTC', 'yyyy-MM-dd');
}

function monthSheetNameFromYmd_(monthStartYmd) {
  const parts = String(monthStartYmd).split('-').map(Number);
  const monthName = MONTH_NAMES_RU[parts[1] - 1];
  if (!monthName || !parts[0]) throw new Error('Некорректный месяц.');
  return monthName + ' ' + parts[0];
}

function validateAccount_(value, ledger) {
  const account = String(value || '').trim().toLowerCase();
  const config = ledgerConfig_(ledger);

  if (!Object.prototype.hasOwnProperty.call(config.accounts, account)) {
    throw new Error('Выбери счёт.');
  }

  return account;
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
