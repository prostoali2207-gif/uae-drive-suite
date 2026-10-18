/* Tests production v15 correction and driver append. No live spreadsheet writes. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const src = fs.readFileSync(path.join(__dirname, 'FinanceBridgeLive_2026-10-18.gs'), 'utf8');
const finance = vm.runInNewContext(src + '\n({bridgeMirrorsAreSafe_,bridgeTransferEmptyRow_,inspectShowroomEntries_})', {
  Date,
  Utilities:{formatDate:d=>d.toISOString().slice(0,10)}
});
const cols = ['A','F','B','C','T','D','E'];
const oldStyle = row => cols.map(c=>'=IF('+c+row+'="";"";'+c+row+')');
const rowStyle = () => cols.map(c=>{
  const ref='INDEX($'+c+':$'+c+';ROW())';
  return '=IF('+ref+'="";"";'+ref+')';
});
const shown = ['18.10.2026','Расход','Касса','Прочие (мелочь)','','39','За такси'];
assert.equal(finance.bridgeMirrorsAreSafe_(51,rowStyle(),shown), true,
  'Existing row 51 is a valid ROW()-based mirror, not a manual draft');
assert.equal(finance.bridgeMirrorsAreSafe_(51,oldStyle(51),shown), true, 'Legacy mirror remains valid');
assert.equal(finance.bridgeMirrorsAreSafe_(51,['bad formula',...rowStyle().slice(1)],shown), false,
  'Unknown formulas remain blocked');
assert.equal(finance.bridgeMirrorsAreSafe_(51,['',...rowStyle().slice(1)],shown), false,
  'Real literal draft still blocked');
assert.equal(finance.bridgeMirrorsAreSafe_(51,['',...rowStyle().slice(1)],['',...shown.slice(1)]), true,
  'Blank formula-free cell does not falsely create a draft');

function rowFixture({draftAt64=false,tailUsed=false}={}) {
  const values=Array.from({length:1000},()=>Array(27).fill(''));
  const formulas=Array.from({length:1000},()=>Array(27).fill(''));
  const notes=Array.from({length:1000},()=>['']);
  for(let i=0;i<1000;i++)for(let k=0;k<7;k++)
    formulas[i][20+k]=rowStyle()[k];
  for(const r of [...Array.from({length:47},(_,i)=>i+5),53,54,55,56,57,58,59,60,61,62,63]) {
    values[r-5][0]=new Date('2026-10-18T08:00:00Z');
    values[r-5][1]='Касса';
    values[r-5][2]='Прочие (мелочь)';
    values[r-5][3]=r===51?39:r;
  }
  if(draftAt64){
    values[64-5][20]='2026-10-18';
    formulas[64-5][20]='';
    notes[64-5][0]='sgi:pending';
  }
  if(tailUsed)values[1004-5][1]='Касса';
  return {getRange:(r,c,h,w)=>{
    assert.equal(r,5);
    assert.equal(h,1000);
    if(c===1&&w===27)return {getValues:()=>values,getFormulas:()=>formulas};
    if(c===21&&w===1)return {getNotes:()=>notes};
    throw Error('Unexpected getRange '+[r,c,h,w].join(':'));
  }};
}
assert.equal(finance.bridgeTransferEmptyRow_(rowFixture(),0),64,'Postings go after row 63, not inside old row 52');
assert.equal(finance.bridgeTransferEmptyRow_(rowFixture({draftAt64:true}),0),65,'Pending row 64 draft is preserved');
assert.equal(finance.bridgeTransferEmptyRow_(rowFixture(),64),65,'Auto transfer peer follows source row 64');
assert.equal(finance.bridgeTransferEmptyRow_(rowFixture({tailUsed:true}),0),52,
  'Only when no trailing row exists may old blank holes be reused');

console.log('PASS: existing row 51 safe mirrors, true drafts blocked, new postings appended, drafts and paired transfers preserved.');
