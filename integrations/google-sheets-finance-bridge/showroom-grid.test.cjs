/* Focused regression tests for showroom U:AA mirrors; never writes financial data. */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const src = fs.readFileSync(path.join(__dirname, 'ShowroomGrid.gs'), 'utf8');
const api = vm.runInNewContext(src + '\n({sgiMirrorFormula_,sgiCheckMirrors_,sgiRow_,sgiRepairMirrors_})');
const cols = ['A','F','B','C','T','D','E'];
const legacy = (row) => cols.map(c => '=IF(' + c + row + '="";"";' + c + row + ')');
const editingAmount = { getColumn: () => 26, getLastColumn: () => 26 };
let tests = 0;
function check(what, fn) { fn(); tests++; process.stdout.write('✓ ' + what + '\n'); }
function grid(formulas) {
  const state = { repairs: 0, clearedNotes: 0, saved: null };
  state.sheet = { getRange: () => ({
    getFormulas: () => [formulas],
    setFormulas: (next) => { state.repairs++; state.saved = next[0]; },
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

console.log(tests + ' showroom grid regression tests passed.');
