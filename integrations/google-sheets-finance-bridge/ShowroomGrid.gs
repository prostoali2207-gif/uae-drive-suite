/** Inline showroom entry, U:AA. Storage A:T and existing handlers remain unchanged. */
const SGI_ID = '16Nb1bP-u5ox9RX4kH5fWa-GaYvAIoisyLMFSiGbtvJA';
const SGI_COLS = ['A','F','B','C','T','D','E'];

/** Run once from the bound editor. Creates only this handler; leaves all other triggers intact. */
function showroomInstallGridTrigger() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss || ss.getId() !== SGI_ID) throw new Error('Неверная таблица для установки автосохранения.');
  const existing = ScriptApp.getUserTriggers(ss).filter(t => t.getHandlerFunction() === 'showroomGridOnEdit');
  if (existing.length > 1 || (existing.length === 1 && existing[0].getEventType() !== ScriptApp.EventType.ON_EDIT)) {
    throw new Error('Проверьте дубли или тип триггера showroomGridOnEdit.');
  }
  if (existing.length === 1) return existing[0].getUniqueId();
  return ScriptApp.newTrigger('showroomGridOnEdit').forSpreadsheet(ss).onEdit().create().getUniqueId();
}

/** Install as spreadsheet On edit; a simple trigger can time out before its pair is saved. */
function showroomGridOnEdit(e) {
  if (!e || !e.range || !e.source || e.source.getId() !== SGI_ID) return;
  const sh = e.range.getSheet();
  if (sh.getName() !== 'Ввод операций' || sh.getMaxColumns() < 27) return;
  if (e.range.getRow() <= 3 && e.range.getLastRow() >= 3 && e.range.getColumn() <= 22 && e.range.getLastColumn() >= 22) {
    sgiFilter_(sh); return;
  }
  if (e.range.getLastColumn() < 21 || e.range.getColumn() > 27 || e.range.getLastRow() < 5) return;
  sgiQueueEdit_(e);
  try { sgiDrainGridQueue_(e.source); }
  catch (err) {
    e.source.toast(String(err.message || err), 'Автосохранение: требуется проверка', 10);
    throw err; // Execution must report failure, not a misleading Completed status.
  }
}

/** Durable work is recorded BEFORE attempting the shared lock. No financial data is stored here. */
function sgiQueueEdit_(e) {
  const first = Math.max(5,e.range.getRow()), last = Math.min(1004,e.range.getLastRow());
  const columns = sgiEditedColumns_(e.range);
  const props = PropertiesService.getScriptProperties();
  for (let row = first; row <= last; row++) {
    props.setProperty('sgi.queue.v1.' + row + '.' + Utilities.getUuid(), JSON.stringify({
      row:row, columns:columns, created:Date.now(), attempts:0
    }));
  }
}

function sgiEditedColumns_(range) {
  if (typeof range.getEditedColumns === 'function') return range.getEditedColumns();
  const result = [];
  for (let c=Math.max(21,range.getColumn());c<=Math.min(27,range.getLastColumn());c++) result.push(c);
  return result;
}

/** Add only a recovery timer; do not duplicate another account's existing On edit trigger. */
function showroomInstallAutosaveRecovery() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss || ss.getId() !== SGI_ID) throw new Error('Неверная таблица для установки восстановления.');
  const timers = ScriptApp.getProjectTriggers().filter(t=>t.getHandlerFunction()==='showroomResumeGridAutosave');
  if (timers.length > 1) throw new Error('Обнаружены повторные триггеры восстановления.');
  if (!timers.length) ScriptApp.newTrigger('showroomResumeGridAutosave').timeBased().everyMinutes(1).create();
  console.log('Autosave recovery installed; existing rows are not scanned or posted.');
}

function showroomResumeGridAutosave() {
  const all = PropertiesService.getScriptProperties().getProperties();
  if (!Object.keys(all).some(k=>k.indexOf('sgi.queue.v1.')===0)) return;
  sgiDrainGridQueue_(SpreadsheetApp.openById(SGI_ID));
}

/** Coalesce queued edits by row; acknowledge only the captured event IDs after processing. */
function sgiDrainGridQueue_(ss) {
  if (!ss || ss.getId() !== SGI_ID) throw new Error('Неверная таблица очереди.');
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return {pending:true}; // Timer retries; the edit is not discarded.
  const started = Date.now(), failures = [];
  let processed = 0;
  try {
    const props = PropertiesService.getScriptProperties(), all = props.getProperties(), groups = {};
    Object.keys(all).filter(k=>k.indexOf('sgi.queue.v1.')===0).forEach(key=>{
      const item = JSON.parse(all[key]);
      if (!Number.isInteger(item.row) || item.row<5 || item.row>1004 || !Array.isArray(item.columns) ||
          !item.columns.length || item.columns.some(c=>!Number.isInteger(c)||c<21||c>27)) throw new Error('Повреждена очередь автосохранения.');
      if (!groups[item.row]) groups[item.row] = {row:item.row,events:[],columns:[]};
      const group=groups[item.row];group.events.push({key:key,item:item});
      item.columns.forEach(c=>{if(!group.columns.includes(c))group.columns.push(c);});
    });
    const jobs = Object.keys(groups).map(k=>groups[k]).filter(g=>g.events.some(e=>!e.item.blocked));
    jobs.sort((a,b)=>Math.min(...a.events.map(e=>e.item.created))-Math.min(...b.events.map(e=>e.item.created)));
    if (!jobs.length) return {processed:0};
    const sh=ss.getSheetByName('Ввод операций'), model=sgiModel_(ss);
    for (const job of jobs) {
      if (Date.now()-started>90000) break; // Leave the remaining durable work for the next tick.
      const edited={getColumn:()=>Math.min(...job.columns),getLastColumn:()=>Math.max(...job.columns),
        getEditedColumns:()=>job.columns.slice()};
      try {
        sgiRow_(sh,job.row,edited,model);
        SpreadsheetApp.flush();
        job.events.forEach(e=>props.deleteProperty(e.key));
        processed++;
      } catch (err) {
        const message=String(err.message||err);
        job.events.forEach(e=>{
          const item=e.item;item.attempts=Number(item.attempts||0)+1;item.error=message;
          item.blocked=item.attempts>=3 || /Похожая операция|повреждена связь|обновлена другим|Дата вне|Примечание должно|автоматическая пара/.test(message);
          props.setProperty(e.key,JSON.stringify(item));
        });
        failures.push('Строка '+job.row+': '+message);
        console.error('sgi queue row '+job.row+': '+message);
      }
    }
    if (processed) sgiFilter_(sh);
    if (failures.length) throw new Error(failures.join('\n'));
    return {processed:processed};
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

function sgiMirror_(sh, r, expected) {
  const stored = sh.getRange(r,1,1,20).getValues()[0];
  // A user can edit while the script lock is held. Never erase that pending input.
  if (expected && JSON.stringify(sh.getRange(r,21,1,7).getValues()[0]) !== JSON.stringify(expected)) {
    sh.getRange(r,21).setNote('sgi:'+sgiSignature_(stored));
    console.log('sgi: preserved pending edit in row '+r);
    return;
  }
  const sourceIndexes = [0,5,1,2,19,3,4];
  // Strict date/number/dropdown rules accept a real blank, not a formula returning an empty string.
  const formulas = SGI_COLS.map((col,i) => stored[sourceIndexes[i]] === '' || stored[sourceIndexes[i]] === null ? '' : sgiMirrorFormula_(col));
  let pending = false;
  formulas.forEach((formula,i) => {
    const target = sh.getRange(r,21+i);
    if (expected && JSON.stringify(target.getValue()) !== JSON.stringify(expected[i])) { pending = true; return; }
    if (formula) target.setFormula(formula);
    else if (!expected) target.clearContent();
  });
  if (pending) { sh.getRange(r,21).setNote('sgi:'+sgiSignature_(stored)); return; }
  sh.getRange(r,21).clearNote();
}

/** Never copy stale mirror values into a different financial record. */
function sgiCheckMirrors_(sh, r, edited, draft, newRow, emptyMirrors) {
  const formulas = sh.getRange(r,21,1,7).getFormulas()[0];
  const from = edited.getColumn(), to = edited.getLastColumn();
  const clean = function(value) { return String(value || '').replace(/\s/g,'').replace(/,/g,';'); };
  for (let i = 0; i < 7; i++) {
    const col = 21 + i;
    if (sgiEditedColumns_(edited).includes(col)) continue; // The user explicitly changed this cell.
    const legacy = '=IF(' + SGI_COLS[i] + r + '="";"";' + SGI_COLS[i] + r + ')';
    const correct = sgiMirrorFormula_(SGI_COLS[i]);
    if ((formulas[i] && clean(formulas[i]) !== clean(legacy) && clean(formulas[i]) !== clean(correct)) ||
        (!formulas[i] && !draft && !newRow && !(emptyMirrors || []).includes(i))) {
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

/** Detect accidental replay before writing the journal; a distinct note permits a real second payment. */
function sgiDuplicateRow_(sh, currentRow, next, vehicle, ignoreNote) {
  const count = Math.min(1004, sh.getMaxRows()) - 4;
  if (count <= 0) return 0;
  const rows = sh.getRange(5,1,count,20).getValues();
  const dateKey = value => value instanceof Date && !isNaN(value.getTime()) ? Utilities.formatDate(value,'Asia/Dubai','yyyy-MM-dd') : '';
  const textKey = value => String(value == null ? '' : value).trim().toLowerCase().replace(/\s+/g,' ');
  const amountKey = value => Number(value).toFixed(2);
  const candidate = [dateKey(next[0]),textKey(next[1]),textKey(next[2]),amountKey(next[3]),textKey(next[4]),textKey(vehicle)];
  if (!candidate[0] || !Number.isFinite(Number(next[3]))) return 0;
  for (let i=0; i<rows.length; i++) {
    const row=rows[i], rowNumber=5+i;
    if (rowNumber === currentRow || row[17] === 'auto') continue;
    if (!row[0] || !row[1] || !row[2] || !Number(row[3])) continue;
    const current=[dateKey(row[0]),textKey(row[1]),textKey(row[2]),amountKey(row[3]),textKey(row[4]),textKey(row[19])];
    if (candidate.every((v,j)=>(ignoreNote && j === 4) || v===current[j])) return rowNumber;
  }
  return 0;
}

function sgiRow_(sh, r, edited, model) {
  const cell = sh.getRange(r,21), area = sh.getRange(r,21,1,7);
  const stored = sh.getRange(r,1,1,20).getValues()[0];
  const base = sgiSignature_(stored), oldNote = cell.getNote();
  if (oldNote.startsWith('sgi:') && oldNote.substring(4) !== base) {
    sgiMirror_(sh,r);
    throw new Error('Строка '+r+' обновлена другим источником. Показаны актуальные данные; повторите правку.');
  }
  const occupied = stored.slice(0,5).some(x => x !== '' && x !== null);
  const visible = area.getValues()[0];
  const sourceIndexes = [0,5,1,2,19,3,4];
  const emptyMirrors = sourceIndexes.map((index,i) =>
    (stored[index] === '' || stored[index] === null) && (visible[i] === '' || visible[i] === null) ? i : -1);
  sgiCheckMirrors_(sh,r,edited,oldNote.startsWith('sgi:'),!occupied && !stored[13] && !stored[16] && !stored[17],emptyMirrors);

  const from = edited.getColumn(), to = edited.getLastColumn();
  // A queued event can arrive after an earlier event has already saved and restored this input.
  // A real retry replaces the formula with a value and still reaches pair recovery below.
  const inputFormulas = area.getFormulas()[0];
  if (!oldNote.startsWith('sgi:') && occupied &&
      sgiEditedColumns_(edited).every(c=>Boolean(inputFormulas[c-21]))) return;
  const editedColumns = sgiEditedColumns_(edited);
  const controls = editedColumns.some(c=>c>=22&&c<=24);
  let v = visible;
  if (stored[17] === 'auto' && !editedColumns.every(c=>c===21||c===26)) {
    sgiMirror_(sh,r);
    throw new Error('Строка '+r+' — автоматическая пара. Меняйте здесь только дату или сумму.');
  }
  const beforeChoice = v.slice();
  v = sgiChoice_(v,model,controls || editedColumns.includes(25));
  // Mark first; never rewrite all seven input cells while the manager is typing.
  cell.setNote('sgi:'+base);
  for (let i=1; i<=4; i++) {
    if (v[i] !== beforeChoice[i]) sh.getRange(r,21+i).clearContent();
  }
  if (v.every(x => x === '' || x === null)) { sgiMirror_(sh,r); return; }
  const op = model.find(op => op.name === v[3] && op.type === v[1] && op.accounts.includes(v[2]));
  if (!op || !(v[0] instanceof Date) || !Number.isFinite(Number(v[5])) || Number(v[5]) <= 0) return;
  const changingObject = controls || editedColumns.includes(25) || !occupied;
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
  if (same) {
    // Retry must finish a pair interrupted after its source was saved.
    if (r !== 9 && r !== 13) stSyncRow_(sh,r);
    SpreadsheetApp.flush();
    sgiMirror_(sh,r,v); return;
  }
  const duplicateRow = sgiDuplicateRow_(sh,r,next,v[4]);
  if (duplicateRow) throw new Error('Похожая операция уже есть в строке ' + duplicateRow + '. Повтор не сохранён. Если это отдельный платёж, добавьте пояснение в Примечание.');
  const similarRow = sgiDuplicateRow_(sh,r,next,v[4],true);
  if (similarRow) sh.getParent().toast('Возможный дубль со строкой '+similarRow+'. Отдельный платёж сохранён с вашим пояснением.', 'Проверьте платёж', 10);
  // Keep financial storage untouched until the row is complete and valid.
  sh.getRange(r,1,1,5).setValues([next]);
  sh.getRange(r,20).setValue(v[4]);
  if (!occupied && !stored[13]) sh.getRange(r,14).setValue('sgi-' + Utilities.getUuid());
  if (!stored[15]) sh.getRange(r,16).setValue(new Date());
  // Existing installed handlers ignore U:AA. Invoke the same pair logic under its shared lock.
  if (r !== 9 && r !== 13 && (JSON.stringify(next.slice(0,4)) !== JSON.stringify(stored.slice(0,4)))) stSyncRow_(sh,r);
  SpreadsheetApp.flush();
  sgiMirror_(sh,r,v);
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

