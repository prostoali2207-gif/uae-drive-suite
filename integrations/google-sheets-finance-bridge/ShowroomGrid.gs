/** Inline showroom entry, U:AA. Storage A:T and existing handlers remain unchanged. */
const SGI_ID = '16Nb1bP-u5ox9RX4kH5fWa-GaYvAIoisyLMFSiGbtvJA';
const SGI_COLS = ['A','F','B','C','T','D','E'];

function onEdit(e) {
  if (!e || !e.range || !e.source || e.source.getId() !== SGI_ID) return;
  const sh = e.range.getSheet();
  if (sh.getName() !== 'Ввод операций' || sh.getMaxColumns() < 27) return;
  if (e.range.getRow() <= 3 && e.range.getLastRow() >= 3 && e.range.getColumn() <= 22 && e.range.getLastColumn() >= 22) {
    sgiFilter_(sh); return;
  }
  if (e.range.getLastColumn() < 21 || e.range.getColumn() > 27 || e.range.getLastRow() < 5) return;
  const first = Math.max(5, e.range.getRow()), last = Math.min(1004, e.range.getLastRow());
  if (last < first) return;
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) { e.source.toast('Строка ещё не сохранена. Повторите правку после завершения предыдущей.', 'Ввод операций', 8); return; }
  try {
    const model = sgiModel_(e.source);
    for (let r = first; r <= last; r++) sgiRow_(sh, r, e.range, model);
    SpreadsheetApp.flush();
    sgiFilter_(sh);
  } catch (err) {
    e.source.toast(String(err.message || err), 'Строка не сохранена', 10);
    console.error(err);
  } finally { lock.releaseLock(); }
}

function sgiModel_(ss) {
  const rows = ss.getSheetByName('Справочники').getRange('A2:I100').getDisplayValues();
  const sub = {};
  rows.forEach(r => {
    const op = r[7].trim(), value = r[8].trim();
    if (op && value) { if (!sub[op]) sub[op] = []; if (!sub[op].includes(value)) sub[op].push(value); }
  });
  return rows.filter(r => r[0].trim()).map(r => ({
    name:r[0].trim(), type:r[1].trim(),
    accounts: [Number(r[2]) > 0 ? 'Касса' : '', Number(r[3]) > 0 ? 'AJMAN' : ''].filter(Boolean),
    sub:sub[r[0].trim()] || []
  }));
}

/** ROW() keeps a mirror bound to its own physical row after sorting or inserting rows. */
function sgiMirrorFormula_(col) {
  const source = 'INDEX($' + col + ':$' + col + ';ROW())';
  return '=IF(' + source + '="";"";' + source + ')';
}

function sgiMirror_(sh, r) {
  sh.getRange(r,21,1,7).setFormulas([SGI_COLS.map(sgiMirrorFormula_)]);
  sh.getRange(r,21).clearNote();
}

/** Never copy stale mirror values into a different financial record. */
function sgiCheckMirrors_(sh, r, edited, draft) {
  const formulas = sh.getRange(r,21,1,7).getFormulas()[0];
  const from = edited.getColumn(), to = edited.getLastColumn();
  const clean = function(value) { return String(value || '').replace(/\s/g,'').replace(/,/g,';'); };
  for (let i = 0; i < 7; i++) {
    const col = 21 + i;
    if (col >= from && col <= to) continue; // The user explicitly changed this cell.
    const legacy = '=IF(' + SGI_COLS[i] + r + '="";"";' + SGI_COLS[i] + r + ')';
    const correct = sgiMirrorFormula_(SGI_COLS[i]);
    if ((formulas[i] && clean(formulas[i]) !== clean(legacy) && clean(formulas[i]) !== clean(correct)) ||
        (!formulas[i] && !draft)) {
      sgiMirror_(sh,r);
      throw new Error('В строке ' + r + ' была повреждена связь с данными. Показаны исходные значения; повторите ввод.');
    }
  }
}

function sgiSignature_(v) {
  return JSON.stringify(v.slice(0,5).concat(v.slice(13,20)));
}

function sgiChoice_(v, model, controlsChanged) {
  const next = v.slice();
  if (controlsChanged) {
    if (!['Приход','Расход'].includes(next[1])) next[1] = '';
    if (!model.some(op => op.type === next[1] && op.accounts.includes(next[2]))) next[2] = '';
    const op = model.find(op => op.name === next[3] && op.type === next[1] && op.accounts.includes(next[2]));
    if (!op) next[3] = '';
    if (!op || !op.sub.includes(next[4])) next[4] = '';
  }
  return next;
}

function sgiRow_(sh, r, edited, model) {
  const cell = sh.getRange(r,21), area = sh.getRange(r,21,1,7);
  const stored = sh.getRange(r,1,1,20).getValues()[0];
  const base = sgiSignature_(stored), oldNote = cell.getNote();
  if (oldNote.startsWith('sgi:') && oldNote.substring(4) !== base) {
    sgiMirror_(sh,r);
    throw new Error('Строка '+r+' обновлена другим источником. Показаны актуальные данные; повторите правку.');
  }
  sgiCheckMirrors_(sh,r,edited,oldNote.startsWith('sgi:'));

  const from = edited.getColumn(), to = edited.getLastColumn();
  const controls = from <= 24 && to >= 22;
  let v = area.getValues()[0];
  const occupied = stored.slice(0,5).some(x => x !== '' && x !== null);
  if (stored[17] === 'auto' && !(from === to && (from === 21 || from === 26))) {
    sgiMirror_(sh,r);
    throw new Error('Строка '+r+' — автоматическая пара. Меняйте здесь только дату или сумму.');
  }
  v = sgiChoice_(v,model,controls || (from <= 25 && to >= 25));
  // Incomplete input is an intentional draft; it is marked below and never changes A:T.
  area.setValues([v]);
  cell.setNote('sgi:'+base);
  if (v.every(x => x === '' || x === null)) { sgiMirror_(sh,r); return; }
  const op = model.find(op => op.name === v[3] && op.type === v[1] && op.accounts.includes(v[2]));
  if (!op || !(v[0] instanceof Date) || !Number.isFinite(Number(v[5])) || Number(v[5]) <= 0) return;
  const changingObject = controls || (from <= 25 && to >= 25) || !occupied;
  if (changingObject && ((op.sub.length && !op.sub.includes(v[4])) || (!op.sub.length && v[4] !== ''))) return;
  const dateRule = sh.getRange('A5').getDataValidation();
  if (dateRule && dateRule.getCriteriaType() === SpreadsheetApp.DataValidationCriteria.DATE_BETWEEN) {
    const bounds = dateRule.getCriteriaValues();
    const day = Utilities.formatDate(v[0], 'Asia/Dubai','yyyy-MM-dd');
    if (day < Utilities.formatDate(bounds[0],'Asia/Dubai','yyyy-MM-dd') || day > Utilities.formatDate(bounds[1],'Asia/Dubai','yyyy-MM-dd')) throw new Error('Дата вне активного месяца.');
  }
  if (String(v[6]).length > 500) throw new Error('Примечание должно быть не длиннее 500 символов.');
  const next = [v[0],v[2],v[3],Number(v[5]),v[6]];
  const same = JSON.stringify(next) === JSON.stringify(stored.slice(0,5)) && v[4] === stored[19];
  if (same) { sgiMirror_(sh,r); return; }
  // Keep financial storage untouched until the row is complete and valid.
  sh.getRange(r,1,1,5).setValues([next]);
  sh.getRange(r,20).setValue(v[4]);
  if (!stored[15]) sh.getRange(r,16).setValue(new Date());
  // Existing installed handlers ignore U:AA. Invoke the same pair logic under its shared lock.
  if (r !== 9 && r !== 13 && (JSON.stringify(next.slice(0,4)) !== JSON.stringify(stored.slice(0,4)))) stSyncRow_(sh,r);
  SpreadsheetApp.flush();
  sgiMirror_(sh,r);
}

/** One-time safe migration: only rows already containing seven formulas; never overwrite drafts. */
function sgiRepairMirrors_() {
  const sh = SpreadsheetApp.openById(SGI_ID).getSheetByName('Ввод операций');
  if (!sh) throw new Error('Не найден лист «Ввод операций».');
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const first = 5, count = Math.min(1004,sh.getMaxRows()) - first + 1;
    const existing = sh.getRange(first,21,count,7).getFormulas();
    const notes = sh.getRange(first,21,count,1).getNotes();
    let start = -1, buffered = [], repaired = 0, skipped = 0;
    const staleDraftNotes = [];
    const flush = function() {
      if (start >= 0 && buffered.length) sh.getRange(first+start,21,buffered.length,7).setFormulas(buffered);
      start = -1; buffered = [];
    };
    for (let i = 0; i < count; i++) {
      // A real draft has cells without formulas. Seven intact formulas mean no pending input.
      if (existing[i].some(f => !f)) { flush(); skipped++; continue; }
      if (start < 0) start = i;
      buffered.push(SGI_COLS.map(sgiMirrorFormula_));
      if (String(notes[i][0] || '').startsWith('sgi:')) staleDraftNotes.push(first+i);
      repaired++;
    }
    flush();
    staleDraftNotes.forEach(row => sh.getRange(row,21).clearNote());
    SpreadsheetApp.flush();
    return { repaired, skipped, stale_notes_cleared: staleDraftNotes.length, range: 'U5:AA1004' };
  } finally { lock.releaseLock(); }
}

function sgiFilter_(sh) {
  const mode = String(sh.getRange('V3').getValue());
  let filter = sh.getFilter();
  if (!filter) filter = sh.getRange('A4:AA1004').createFilter();
  if (mode === 'Приход' || mode === 'Расход') {
    filter.setColumnFilterCriteria(6,SpreadsheetApp.newFilterCriteria().whenFormulaSatisfied('=OR($A5="";$F5="'+mode+'")').build());
  } else filter.removeColumnFilterCriteria(6);
}
