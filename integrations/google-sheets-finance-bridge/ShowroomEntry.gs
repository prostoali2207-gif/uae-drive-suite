/** Showroom-only entry form. Writes to existing A:E and T layout. */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Операции автосалона')
    .addItem('Добавить операцию', 'showroomEntryShowForm_')
    .addToUi();
}

function showroomEntryShowForm_() {
  const html = HtmlService.createHtmlOutputFromFile('ShowroomEntryForm')
    .setTitle('Новая операция');
  SpreadsheetApp.getUi().showSidebar(html);
}

function showroomEntryGetData() {
  const model = showroomEntryModel_();
  model.request_id = 'sge-' + Utilities.getUuid();
  return model;
}

function showroomEntryModel_() {
  const ss = SpreadsheetApp.openById(SHOWROOM_SPREADSHEET_ID);
  const refs = ss.getSheetByName('Справочники');
  if (!refs) throw new Error('Не найден лист «Справочники».');
  const rows = refs.getRange(2, 1, Math.max(0, Math.min(99, refs.getLastRow() - 1)), 9).getDisplayValues();
  const excelOptions = {};
  rows.forEach(function (r) {
    const excelOperation = String(r[7] || '').trim();
    const subcategory = String(r[8] || '').trim();
    if (!excelOperation || !subcategory) return;
    if (!excelOptions[excelOperation]) excelOptions[excelOperation] = [];
    if (excelOptions[excelOperation].indexOf(subcategory) === -1) excelOptions[excelOperation].push(subcategory);
  });
  const operations = rows.filter(function (r) { return String(r[0] || '').trim(); }).map(function (r) {
    const excelOperation = String(r[7] || '').trim();
    const needsObject = String(r[5] || '').trim().toLowerCase() === 'авто';
    return {
      operation: String(r[0]).trim(),
      type: String(r[1] || '').trim(),
      subcategories: needsObject && excelOperation ? (excelOptions[excelOperation] || []).slice() : []
    };
  });
  return { accounts: ['Касса', 'AJMAN'], operations: operations };
}

function showroomEntrySubmit(form) {
  form = form || {};
  const requestId = String(form.request_id || '').trim();
  if (!/^sge-[a-zA-Z0-9-]{16,80}$/.test(requestId)) throw new Error('Обновите форму перед сохранением: нужен ID запроса.');
  const dateText = String(form.date || '').trim();
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateText);
  if (!dateMatch) throw new Error('Укажите дату.');
  const y = Number(dateMatch[1]), m = Number(dateMatch[2]), d = Number(dateMatch[3]);
  const dateValue = new Date(Date.UTC(y, m - 1, d, 8, 0, 0));
  if (dateValue.getUTCFullYear() !== y || dateValue.getUTCMonth() !== m - 1 || dateValue.getUTCDate() !== d) throw new Error('Некорректная дата.');
  const account = String(form.account || '').trim();
  if (account !== 'Касса' && account !== 'AJMAN') throw new Error('Выберите счёт.');
  const operation = String(form.operation || '').trim();
  const model = showroomEntryModel_();
  const op = model.operations.find(function (x) { return x.operation === operation; });
  if (!op) throw new Error('Выберите операцию из справочника.');
  const subcategory = String(form.subcategory || '').trim();
  if (op.subcategories.length) {
    if (!subcategory || op.subcategories.indexOf(subcategory) === -1) throw new Error('Выберите подкатегорию для этой операции.');
  } else if (subcategory) {
    throw new Error('У этой операции нет подкатегорий.');
  }
  const amount = Number(form.amount);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('Сумма должна быть больше нуля.');
  const note = String(form.note || '').trim();
  if (note.length > 500) throw new Error('Примечание должно быть не длиннее 500 символов.');

  const ss = SpreadsheetApp.openById(SHOWROOM_SPREADSHEET_ID);
  const sh = ss.getSheetByName('Ввод операций');
  if (!sh) throw new Error('Не найден лист «Ввод операций».');
  const firstRow = 5, lastRow = Math.min(1004, sh.getMaxRows());
  const count = lastRow - firstRow + 1;
  if (count < 1) throw new Error('Нет доступных строк для ввода.');
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  let targetRow = 0, similarRow = 0;
  try {
    const ids = sh.getRange(firstRow,14,count,1).getDisplayValues();
    const existingIndex = ids.findIndex(r => r[0] === requestId);
    if (existingIndex >= 0) {
      const row = firstRow + existingIndex;
      const saved = sh.getRange(row,1,1,20).getValues()[0];
      const expected = [dateValue,account,operation,amount,note];
      if (JSON.stringify(saved.slice(0,5)) !== JSON.stringify(expected) || saved[19] !== subcategory) throw new Error('Этот запрос уже сохранён с другими данными. Обновите форму.');
      if (row !== 9 && row !== 13) stSyncRow_(sh,row);
      SpreadsheetApp.flush();
      const meta = sh.getRange(row,17,1,2).getDisplayValues()[0];
      return {ok:true,row:row,paired:Boolean(meta[0]),role:meta[1] || '',duplicate:true};
    }
    const duplicateRow = sgiDuplicateRow_(sh,0,[dateValue,account,operation,amount,note],subcategory);
    if (duplicateRow) throw new Error('Похожая операция уже есть в строке ' + duplicateRow + '. Если это отдельный платёж, добавьте пояснение в Примечание.');
    similarRow = sgiDuplicateRow_(sh,0,[dateValue,account,operation,amount,note],subcategory,true);
    const main = sh.getRange(firstRow, 1, count, 5).getValues();
    const stamps = sh.getRange(firstRow, 16, count, 1).getValues();
    const pairs = sh.getRange(firstRow, 17, count, 3).getValues();
    const objects = sh.getRange(firstRow, 20, count, 1).getValues();
    for (let i = 0; i < count; i++) {
      const row = firstRow + i;
      if (row === 9 || row === 13) continue;
      const clean = main[i].concat(ids[i], stamps[i], pairs[i], objects[i]).every(function (v) { return v === '' || v === null; });
      if (clean) { targetRow = row; break; }
    }
    if (!targetRow) throw new Error('Нет безопасной пустой строки в A:E и служебных полях.');
    const dateForSheet = new Date(Date.UTC(y, m - 1, d, 8, 0, 0));
    sh.getRange(targetRow, 1, 1, 5).setValues([[dateForSheet, account, operation, amount, note]]);
    sh.getRange(targetRow, 20).setValue(subcategory);
    sh.getRange(targetRow,14).setValue(requestId);
    SpreadsheetApp.flush();
  } finally {
    lock.releaseLock();
  }

  const event = { source: ss, range: sh.getRange(targetRow, 1, 1, 5) };
  ddsOnEditStamp(event);
  showroomTransferOnEdit(event);
  SpreadsheetApp.flush();
  const pairMeta = sh.getRange(targetRow, 17, 1, 2).getDisplayValues()[0];
  return { ok: true, row: targetRow, paired: Boolean(pairMeta[0]), role: pairMeta[1] || '', warning: similarRow ? 'Возможный дубль со строкой '+similarRow+'. Проверьте, что это отдельный платёж.' : '' };
}
