// Offline Apps Script protocol tests: no credentials, network, or real sheet writes.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const crypto = require('node:crypto');
const source = fs.readFileSync(__dirname + '/ShowroomCorrections.gs', 'utf8');

function fixture() {
  let writes = 0, failAt = 0, locks = 0;
  const write = fn => { fn(); if (++writes === failAt) throw Error('simulated lost response after write'); };
  class Sheet {
    constructor(rows, cols) { this.cells = Array.from({length: rows}, () => Array(cols).fill('')); this.notes = {}; this.formulas = {}; }
    getMaxRows() { return this.cells.length; }
    getRange(row, col, height = 1, width = 1) {
      const self = this, key = row + ':' + col;
      return {
        getValues: () => Array.from({length:height}, (_,r) => self.cells[row+r-1].slice(col-1,col+width-1)),
        getFormulas: () => Array.from({length:height}, (_,r) => Array.from({length:width}, (_,c) => self.formulas[(row+r)+':'+(col+c)] || '')),
        getNote: () => self.notes[key] || '',
        setNote: note => write(() => { self.notes[key] = note; }),
        setValue: value => write(() => { self.cells[row-1][col-1] = value; }),
        setValues: values => write(() => values.forEach((valuesRow,r) => valuesRow.forEach((value,c) => {self.cells[row+r-1][col+c-1]=value;}))),
      };
    }
  }
  const input = new Sheet(20,27), driver = new Sheet(20,9);
  Object.assign(input.cells[4], {0:'2026-10-03',1:'Касса',2:'Топливо',3:100,4:'До',13:'original-request',19:'Toyota'});
  Object.assign(driver.cells[10], {0:'2026-10-03',1:'Driver',2:'Расход',3:100,4:'Топливо',5:'Toyota',6:'До',7:'Учтено',8:'driver-event'});
  const ctx = vm.createContext({
    SHOWROOM_SPREADSHEET_ID:'SHOWROOM_ONLY', INPUT_SHEET:'Ввод операций',INPUT_FIRST_ROW:5,INPUT_LAST_ROW:20,
    Utilities:{formatDate:date => date.toISOString().slice(0,10)},
    SpreadsheetApp:{openById:id => { assert.equal(id,'SHOWROOM_ONLY'); return {getSheetByName:name => name==='Ввод операций'?input:name==='Водители'?driver:null}; },flush(){}},
    LockService:{getScriptLock:() => ({waitLock(){locks++;},releaseLock(){locks--;}})},
    sha256Hex_: value => crypto.createHash('sha256').update(value).digest('hex'),
    parseYmd_: value => value,
    resolveReference_: (article,account,row,ledger) => { assert.equal(ledger,'showroom'); return ['Топливо','Ремонт'].includes(article)&&account==='cash_aed'&&row>0?{direction:'Расход'}:null; },
  });
  vm.runInContext(source,ctx);
  const before = {request_id:'original-request',date:'2026-10-03',account_label:'Касса',article:'Топливо',amount:100,note:'До',vehicle:'Toyota',version:0};
  const payload = {ledger:'showroom',correction_id:'correction-123',version:1,kind:'edit',before,
    after:{amount:175,article:'Ремонт',row:22,direction:'expense',vehicle:'Nissan',note:'После'},
    driver:{event_key:'driver-event',amount:100,article:'Топливо',vehicle:'Toyota',note:'До'},actor:'Manager'};
  return {ctx,input,driver,payload,run: p => ctx.correctShowroomEntry_(p || payload),
    failAt: n => {failAt=n;},writes:()=>writes,locks:()=>locks,
    expense:()=>input.cells.reduce((sum,row)=>sum+(row[1]==='Касса'?Number(row[3]||0):0),0),
    driverBalance:()=>50-driver.cells.reduce((sum,row)=>sum+(row[2]==='Расход'&&row[7]==='Учтено'?Number(row[3]||0):0),0)};
}

test('edit replaces amount/category/vehicle/note in place and recalculates negative driver balance',()=>{
  const f=fixture(); assert.equal(f.driverBalance(),-50); f.run();
  assert.equal(f.expense(),175); assert.equal(f.driverBalance(),-125);
  assert.deepEqual(f.input.cells[4].slice(0,5),['2026-10-03','Касса','Ремонт',175,'После']);
  assert.equal(f.input.cells[4][19],'Nissan'); assert.equal(f.input.cells[4][13],'original-request');
  assert.equal(f.input.cells.filter(r=>r[13]).length,1); assert.equal(f.locks(),0);
});
test('repeated request performs no more writes or expenses',()=>{
  const f=fixture(); f.run(); const count=f.writes(); assert.equal(f.run().duplicate,true);
  assert.equal(f.writes(),count); assert.equal(f.expense(),175);
});
test('same correction ID cannot be reused with changed values',()=>{
  const f=fixture(); f.run(); f.payload.after.amount=200; assert.throws(()=>f.run(),/ID/); assert.equal(f.expense(),175);
});
test('cancel removes month effect and restores driver balance while preserving cancellation actor and request ID',()=>{
  const f=fixture(); f.payload.kind='cancel'; f.run();
  assert.equal(f.expense(),0); assert.equal(f.driverBalance(),50);
  assert.equal(f.driver.cells[10][7],'Отменено'); assert.equal(f.input.cells[4][13],'original-request');
  const marker=JSON.parse(f.input.notes['5:14'].slice('fleetdesk-correction:'.length));
  assert.equal(marker.cancelled,true); assert.equal(marker.actor,'Manager'); assert.equal(marker.before.amount,100);
  assert.equal(f.run().duplicate,true);
});
for (const kind of ['edit','cancel']) for(let n=1;n<=5;n++) test(`${kind}: retry after partial write ${n} converges without duplicate`,()=>{
  const f=fixture(); f.payload.kind=kind; f.failAt(n); assert.throws(()=>f.run(),/simulated/); assert.equal(f.locks(),0);
  f.failAt(0); f.run(); assert.equal(f.expense(),kind==='edit'?175:0); assert.equal(f.driverBalance(),kind==='edit'?-125:50);
  assert.equal(f.input.cells.filter(r=>r[13]).length,1); assert.equal(f.run().duplicate,true);
});
test('stale manual input edit is refused before any writes',()=>{
  const f=fixture(); f.input.cells[4][3]=105; assert.throws(()=>f.run(),/вручную/); assert.equal(f.writes(),0);
});
test('manual driver edit is refused before any input writes',()=>{
  const f=fixture(); f.driver.cells[10][3]=105; assert.throws(()=>f.run(),/вручную/); assert.equal(f.writes(),0);
});
test('manual display draft is preserved and blocks changes',()=>{
  const f=fixture(); f.input.cells[4][20]='draft'; assert.throws(()=>f.run(),/черновик/); assert.equal(f.writes(),0);
});
for (const value of [0,false]) test(`manual ${value} display draft blocks inspection and correction`,()=>{
  const f=fixture(); f.input.cells[4][20]=value;
  const result=f.ctx.inspectShowroomEntries_({ledger:'showroom',entries:[{audit_id:'audit',request_id:'original-request'}]});
  assert.match(result.entries[0].error,/черновик/);
  assert.throws(()=>f.run(),/черновик/); assert.equal(f.writes(),0); assert.equal(f.input.cells[4][20],value);
});
test('expected mirror formulas remain untouched',()=>{
  const f=fixture(); ['A','F','B','C','T','D','E'].forEach((col,i)=>{f.input.formulas['5:'+(21+i)]=`=IF(${col}5="";"";${col}5)`;});
  const before=JSON.stringify(f.input.formulas); f.run(); assert.equal(JSON.stringify(f.input.formulas),before);
});
for(const kind of ['edit','cancel']) for(const marker of [16,17,18]) test(`${kind}: pair metadata ${marker} blocks all writes`,()=>{
  const f=fixture(); f.payload.kind=kind; f.input.cells[4][marker]='pair'; assert.throws(()=>f.run(),/парные/); assert.equal(f.writes(),0);
});
for(const article of ['Перевод в AJMAN','Приход из кассы','Приход со счета AJMAN']) test(`transfer ${article} is forbidden`,()=>{
  const f=fixture(); f.payload.before.article=article; assert.throws(()=>f.run(),/парные/); assert.equal(f.writes(),0);
});
test('duplicate original request IDs fail closed',()=>{
  const f=fixture(); f.input.cells[5][13]='original-request'; assert.throws(()=>f.run(),/единственная/); assert.equal(f.writes(),0);
});
test('Rental rejected before sheet opens or writes',()=>{
  const f=fixture(); f.payload.ledger='rental'; assert.throws(()=>f.run(),/Only showroom/); assert.equal(f.writes(),0);
});
test('new correction blocked while previous correction pending',()=>{
  const f=fixture(); f.failAt(1); assert.throws(()=>f.run()); f.failAt(0); f.payload.correction_id='different-id';
  assert.throws(()=>f.run(),/ожидает/); assert.equal(f.writes(),1);
});
test('read inspection returns unique snapshot and never writes',()=>{
  const f=fixture(); const result=f.ctx.inspectShowroomEntries_({ledger:'showroom',entries:[{audit_id:'audit',request_id:'original-request'},{audit_id:'missing',request_id:'missing'}]});
  assert.equal(result.entries[0].snapshot.amount,100); assert.equal(result.entries[0].snapshot.vehicle,'Toyota');
  assert.ok(result.entries[1].error); assert.equal(f.writes(),0);
});
test('second edit and then cancellation use monotonic versions and current driver values',()=>{
  const f=fixture(); f.run();
  f.payload.before={...f.payload.before,article:'Ремонт',amount:175,note:'После',vehicle:'Nissan',version:1};
  f.payload.driver={...f.payload.driver,amount:175,article:'Ремонт',vehicle:'Nissan',note:'После'};
  f.payload.after={...f.payload.after,amount:80}; f.payload.correction_id='correction-456'; f.payload.version=2;
  f.run(); assert.equal(f.expense(),80); assert.equal(f.driverBalance(),-30);
  f.payload.before={...f.payload.before,amount:80,version:2}; f.payload.driver.amount=80;
  f.payload.kind='cancel'; f.payload.version=3; f.payload.correction_id='correction-789';
  f.run(); assert.equal(f.expense(),0); assert.equal(f.driverBalance(),50);
  assert.equal(JSON.parse(f.input.notes['5:14'].slice('fleetdesk-correction:'.length)).version,3);
});
test('manual edit after partial failure blocks recovery instead of overwriting new data',()=>{
  const f=fixture(); f.failAt(2); assert.throws(()=>f.run()); f.failAt(0);
  f.input.cells[4][3]=900; const count=f.writes(); assert.throws(()=>f.run(),/вручную/);
  assert.equal(f.input.cells[4][3],900); assert.equal(f.writes(),count);
});
test('stale version cannot overwrite completed correction',()=>{
  const f=fixture(); f.run(); const count=f.writes(); f.payload.correction_id='correction-other';
  assert.throws(()=>f.run(),/изменена/); assert.equal(f.writes(),count);
});
test('category correction moves only original month/account total; cancellation removes it',()=>{
  const f=fixture();
  Object.assign(f.input.cells[5],{0:'2026-09-03',1:'Касса',2:'Топливо',3:30,13:'other-month'});
  Object.assign(f.input.cells[6],{0:'2026-10-03',1:'AJMAN',2:'Топливо',3:50,13:'other-account'});
  const sum=(month,account,article)=>f.input.cells.reduce((n,r)=>n+(String(r[0]).startsWith(month)&&r[1]===account&&r[2]===article?Number(r[3]||0):0),0);
  f.run();
  assert.equal(sum('2026-10','Касса','Топливо'),0); assert.equal(sum('2026-10','Касса','Ремонт'),175);
  assert.equal(sum('2026-09','Касса','Топливо'),30); assert.equal(sum('2026-10','AJMAN','Топливо'),50);
  f.payload.before={...f.payload.before,article:'Ремонт',amount:175,note:'После',vehicle:'Nissan',version:1};
  f.payload.driver={...f.payload.driver,amount:175,article:'Ремонт',vehicle:'Nissan',note:'После'};
  f.payload.correction_id='correction-next';f.payload.version=2;f.payload.kind='cancel';f.run();
  assert.equal(sum('2026-10','Касса','Ремонт'),0); assert.equal(sum('2026-09','Касса','Топливо'),30);
  assert.equal(sum('2026-10','AJMAN','Топливо'),50);
});
