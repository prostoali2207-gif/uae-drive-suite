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
      getFormulas: () => [legacy(5), legacy(6)],
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
console.log(tests + ' showroom grid regression tests passed.');
