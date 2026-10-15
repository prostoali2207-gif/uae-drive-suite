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
