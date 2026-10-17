/* Focused regression tests for showroom U:AA mirrors; never writes financial data. */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const src = fs.readFileSync(path.join(__dirname, 'ShowroomGrid.gs'), 'utf8');
const api = vm.runInNewContext(src + '\n({sgiMirror_,sgiMirrorFormula_,sgiCheckMirrors_,sgiRow_,sgiRepairMirrors_})', {SpreadsheetApp:{flush(){}}});
const cols = ['A','F','B','C','T','D','E'];
const legacy = (row) => cols.map(c => '=IF(' + c + row + '="";"";' + c + row + ')');
const editingAmount = { getColumn: () => 26, getLastColumn: () => 26 };
let tests = 0;
function check(what, fn) { fn(); tests++; process.stdout.write('✓ ' + what + '\n'); }
function grid(formulas) {
  const state = { repairs: 0, clearedNotes: 0, saved: null };
  state.sheet = { getRange: (r,c,h,w) => ({
    getFormulas: () => [formulas],
    getValues: () => [[new Date('2026-10-16'), '', '', 100, '']],
    setFormulas: (next) => { state.repairs++; state.saved = next[0]; },
    clearContent: () => { state.repairs++; state.saved=Array(7).fill(''); },
    setFormula: (f) => { state.saved[c-21]=f; },
    clearNote: () => { state.clearedNotes++; },
  }) };
  return state;
}
check('formula binds to current ROW instead of stale row number', () => {
  assert.match(api.sgiMirrorFormula_('A'), /ROW\(\)/);
  assert.doesNotMatch(api.sgiMirrorFormula_('A'), /A51/);
});
check('existing correct legacy formulas remain usable before migration', () => {
  const s = grid(legacy(51));
  api.sgiCheckMirrors_(s.sheet, 51, editingAmount, false);
  assert.equal(s.repairs, 0);
});
check('new ROW-based formulas accepted', () => {
  const s = grid(cols.map(api.sgiMirrorFormula_));
  api.sgiCheckMirrors_(s.sheet, 51, editingAmount, false);
  assert.equal(s.repairs, 0);
});
check('shifted A53 reference in U51 never writes to financial ledger', () => {
  const vals = legacy(51);
  vals[0] = '=IF(A53="";"";A53)';
  const s = grid(vals);
  assert.throws(() => api.sgiCheckMirrors_(s.sheet, 51, editingAmount, false), /повреждена связь/);
  assert.equal(s.repairs, 1);
  assert.equal(s.saved[0], api.sgiMirrorFormula_('A'));
});
check('unmarked static value gets restored instead of copied to another row', () => {
  const vals = legacy(51);
  vals[0] = '';
  const s = grid(vals);
  assert.throws(() => api.sgiCheckMirrors_(s.sheet, 51, editingAmount, false), /повреждена связь/);
  assert.equal(s.repairs, 1);
});
check('marked in-progress draft remains editable', () => {
  const vals = legacy(51);
  vals[0] = '';
  const s = grid(vals);
  api.sgiCheckMirrors_(s.sheet, 51, editingAmount, true);
  assert.equal(s.repairs, 0);
});
check('rapid new-row edits before draft note do not get discarded', () => {
  const vals = legacy(51); vals[0] = ''; vals[1] = '';
  const s = grid(vals);
  api.sgiCheckMirrors_(s.sheet,51,editingAmount,false,true);
  assert.equal(s.repairs,0);
});
check('new-row allowance still rejects a shifted formula', () => {
  const vals=legacy(51);vals[0]='=IF(A53="";"";A53)';
  const s=grid(vals);
  assert.throws(()=>api.sgiCheckMirrors_(s.sheet,51,editingAmount,false,true),/повреждена связь/);
});
check('empty dates and amounts restore as real blanks under strict validation', () => {
  let mirrors=Array(7).fill('old');
  const sh={getRange:(r,c)=>c===1?{getValues:()=>[Array(20).fill('')]}:{clearContent:()=>{mirrors.fill('');},setFormula:f=>{mirrors[c-21]=f;},clearNote(){}}};
  api.sgiMirror_(sh,51);
  assert.equal(mirrors[0],'');assert.equal(mirrors[5],'');
  assert.ok(mirrors.every(v=>v===''));
});
check('repair migration skips draft and changes only fully mirrored rows', () => {
  const captured = [];
  const sheet = {
    getMaxRows: () => 6,
    getRange: (r, c, n, w) => ({
      getFormulas: () => [legacy(5), [''].concat(legacy(6).slice(1))],
      getNotes: () => [[''],['sgi:draft']],
      setFormulas: (v) => captured.push({ r, c, n, w, v }),
    }),
  };
  const context = {
    SpreadsheetApp: { openById: () => ({ getSheetByName: () => sheet }), flush() {} },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
  };
  const local = vm.runInNewContext(src + '\nsgiRepairMirrors_', context);
  const result = local();
  assert.equal(result.repaired, 1);
  assert.equal(result.skipped, 1);
  assert.equal(captured.length, 1);
  assert.equal(captured[0].r, 5);
  assert.match(captured[0].v[0][0], /ROW\(\)/);
});

const duplicateCtx = {
  Utilities: {
    formatDate: (d) => d.toISOString().slice(0, 10),
    getUuid: () => 'test-request-id',
  },
  SpreadsheetApp: { flush() {} },
  stSyncRow_: () => { throw new Error('No transfer sync expected on duplicate.'); },
};
const posting = vm.runInNewContext(
  src + '\n({sgiDuplicateRow_,sgiRow_,sgiSignature_,sgiMirrorFormula_, Date})',
  duplicateCtx
);
const postingDate = new posting.Date('2026-10-14T08:00:00.000Z');
function duplicateFixture() {
  const input = Array.from({ length: 1000 }, () => Array(20).fill(''));
  input[44][0] = postingDate; // A49
  input[44][1] = 'Касса';
  input[44][2] = 'покупка авто для перепродажи';
  input[44][3] = 173;
  input[44][19] = 'Lexus';
  return input;
}
const sample = [postingDate, 'Касса', 'покупка авто для перепродажи', 173, ''];
check('identical expense in another physical row detected', () => {
  const fixture = duplicateFixture();
  const sh = { getMaxRows: () => 1004, getRange: () => ({ getValues: () => fixture }) };
  assert.equal(posting.sgiDuplicateRow_(sh, 52, sample, 'Lexus'), 49);
});
check('a real second payment with its own note remains possible', () => {
  const fixture = duplicateFixture();
  const sh = { getMaxRows: () => 1004, getRange: () => ({ getValues: () => fixture }) };
  assert.equal(posting.sgiDuplicateRow_(sh, 52, [...sample.slice(0, 4), 'второй отдельный платёж'], 'Lexus'), 0);
  assert.equal(posting.sgiDuplicateRow_(sh, 52, sample, 'Xpander'), 0);
  assert.equal(posting.sgiDuplicateRow_(sh, 52, [...sample.slice(0, 3), 174, ''], 'Lexus'), 0);
});
check('similar payment warns even when its note differs', () => {
  const fixture = duplicateFixture();
  const sh = { getMaxRows: () => 1004, getRange: () => ({ getValues: () => fixture }) };
  assert.equal(posting.sgiDuplicateRow_(sh,52,[...sample.slice(0,4),'отдельный платёж'],'Lexus',true),49);
});
check('same physical row never self-matches', () => {
  const fixture = duplicateFixture();
  fixture[47] = fixture[44];
  fixture[44] = Array(20).fill('');
  const sh = { getMaxRows: () => 1004, getRange: () => ({ getValues: () => fixture }) };
  assert.equal(posting.sgiDuplicateRow_(sh, 52, sample, 'Lexus'), 0);
});
check('attempted duplicate cannot write any A:T financial cells', () => {
  const stored = Array(20).fill('');
  const mirrorCols = ['A','F','B','C','T','D','E'];
  const draft = [postingDate,'Расход','Касса','покупка авто для перепродажи','Lexus',173,''];
  const writes = [];
  let note = 'sgi:' + posting.sgiSignature_(stored);
  const area = {
    getFormulas: () => [mirrorCols.map((col, i) => i === 5 ? '' : posting.sgiMirrorFormula_(col))],
    getValues: () => [draft],
    setValues: () => {},
    setFormulas: () => {},
  };
  const sh = {
    getMaxRows: () => 1004,
    getRange: (r,c,h,w) => {
      if (r === 'A5') return { getDataValidation: () => null };
      if (r === 52 && c === 21 && !h) return { getNote: () => note, setNote: v => {note = v;}, clearNote: () => {note = '';} };
      if (r === 52 && c === 21 && h === 1 && w === 7) return area;
      if (r === 52 && c === 1 && h === 1 && w === 20) return { getValues: () => [stored] };
      if (r === 5 && c === 1 && h === 1000 && w === 20) return { getValues: duplicateFixture };
      if (r === 52) return { setValue: (v) => writes.push(v), setValues: (v) => writes.push(v) };
      throw new Error('Unexpected test range ' + [r,c,h,w]);
    },
  };
  const model = [{ name:'покупка авто для перепродажи',type:'Расход',accounts:['Касса'],sub:['Lexus'] }];
  assert.throws(() => posting.sgiRow_(sh, 52, editingAmount, model), /Похожая операция уже есть в строке 49/);
  assert.equal(writes.length, 0);
  assert.deepEqual(draft[5], 173);
});

check('queued restored input is ignored, but a real value retry repairs its pair', () => {
  let syncs=0, mirrors=0, retry=false;
  const ctx={SpreadsheetApp:{flush(){}},stSyncRow_:()=>{syncs++;}};
  const f=vm.runInNewContext(src+'\n({sgiRow_,sgiMirrorFormula_,Date})',ctx);
  const date=new f.Date('2026-10-16T08:00:00Z');
  const stored=[date,'AJMAN','перевод в КАССУ',100,'', 'Расход',...Array(14).fill('')];
  const visible=[date,'Расход','AJMAN','перевод в КАССУ','',100,''];
  const area={getValues:()=>[visible],getFormulas:()=>[cols.map((c,i)=>retry&&i===5?'':f.sgiMirrorFormula_(c))],clearContent:()=>{mirrors++;}};
  const sh={getRange:(r,c,h,w)=>{
    if(r==='A5')return {getDataValidation:()=>null};
    if(c===1)return {getValues:()=>[stored]};
    if(c===21&&w===7)return area;
    return {getNote:()=>'',setNote(){},clearNote(){},setFormula(){}};
  }};
  const model=[{name:'перевод в КАССУ',type:'Расход',accounts:['AJMAN'],sub:[]}];
  f.sgiRow_(sh,52,editingAmount,model);assert.equal(syncs,0);assert.equal(mirrors,0);
  retry=true;f.sgiRow_(sh,52,editingAmount,model);assert.equal(syncs,1);assert.equal(mirrors,1);
});

function installerFixture(existing, target = '16Nb1bP-u5ox9RX4kH5fWa-GaYvAIoisyLMFSiGbtvJA') {
  const calls = [];
  const sheet = {getId: () => target};
  const builder = {forSpreadsheet: ss => {assert.equal(ss,sheet);return builder;},onEdit:()=>builder,create:()=>{calls.push('create');return {getUniqueId:()=> 'new-trigger'};}};
  const install = vm.runInNewContext(src + '\nshowroomInstallGridTrigger', {
    SpreadsheetApp:{getActiveSpreadsheet:()=>sheet},
    ScriptApp:{EventType:{ON_EDIT:'edit'},getUserTriggers:ss=>{assert.equal(ss,sheet);return existing;},newTrigger:name=>{calls.push(name);return builder;}}
  });
  return {install,calls};
}
check('installer binds only its own handler to the expected current spreadsheet',()=>{
  const f=installerFixture([{getHandlerFunction:()=> 'ddsOnEditStamp'}]);
  assert.equal(f.install(),'new-trigger');assert.deepEqual(f.calls,['showroomGridOnEdit','create']);
});
check('installer replay reuses its trigger and leaves unrelated triggers alone',()=>{
  const f=installerFixture([{getHandlerFunction:()=> 'showroomGridOnEdit',getEventType:()=> 'edit',getUniqueId:()=> 'existing'}]);
  assert.equal(f.install(),'existing');assert.deepEqual(f.calls,[]);
});
check('installer refuses a different spreadsheet before reading or creating triggers',()=>{
  const f=installerFixture([],'wrong-copy');assert.throws(f.install,/Неверная таблица/);assert.deepEqual(f.calls,[]);
});
check('installer refuses duplicate handlers instead of deleting triggers',()=>{
  const f=installerFixture([1,2].map(()=>({getHandlerFunction:()=> 'showroomGridOnEdit'})));
  assert.throws(f.install,/дубли/);assert.deepEqual(f.calls,[]);
});
console.log(tests + ' showroom grid regression tests passed.');


