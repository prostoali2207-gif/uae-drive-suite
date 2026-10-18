/* Test vehicle subcategory persistence without touching live showroom finances. */
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const script=fs.readFileSync(path.join(__dirname,'Code.gs'),'utf8');
const car='Lexus';
function fixture(existing=false,storedVehicle='') {
  const state={journalWrites:0,vehicleWrites:0,requestWrites:0,storage:[new Date('2026-10-14T08:00:00Z'),'Касса','покупка авто для перепродажи',173,'Lexus: запчасти'],car:storedVehicle,stored:existing,lockCount:0,released:0};
  const main={getRange:(r,c,h,w)=>{
    if(r===50&&c===1&&h===1&&w===5)return{getValues:()=>[state.storage],setValues:([val])=>{state.storage=val;state.journalWrites++;}};
    if(r===50&&c===1&&h===1&&w===20)return{getValues:()=>[state.storage.concat(Array(14).fill(''),state.car)]};
    if(r===50&&c===20)return{getValue:()=>state.car,setValue:v=>{state.car=v;state.vehicleWrites++;}};
    if(r===50&&c===14)return{setValue:()=>{state.requestWrites++;}};
    throw Error('Unexpected journal range: '+[r,c,h,w].join(','));
  }};
  const references={getRange:(range)=>{assert.equal(range,'H2:I100');return{getDisplayValues:()=>[['покупка авто для перепродажи','Lexus'],['покупка авто для перепродажи','Шевролет абдуллы']]}}};
  const context=vm.createContext({Date,state,
    Utilities:{formatDate:d=>d.toISOString().slice(0,10)},
    LockService:{getScriptLock:()=>({waitLock:()=>{state.lockCount++;},releaseLock:()=>{state.released++;}})}
  });
  const overrides=[
    'ensureFinanceCalendar_ = () => {};',
    'validateLedger_ = x => x;',
    'ledgerConfig_ = () => ({accounts:{cash_aed:"Касса"}});',
    'validateAccount_ = x => x;',
    'validatePostingDate_ = x => x;',
    'activePeriod_ = () => ({start:"2026-10-01",end:"2026-10-31"});',
    'resolveReference_ = () => ({operation:"покупка авто для перепродажи",mappedRow:66,direction:"Расход"});',
    'isSystemIncomingTransferArticle_ = () => false;',
    'spreadsheet_ = () => ({getSheetByName:name=>name===REFERENCE_SHEET ? references : main});',
    'inspectInputRows_ = () => ({existingRow:state.stored?50:0,emptyRow:50});',
    'findDuplicateShowroomPosting_ = () => 0;',
    'ensureTransferPairForRow_ = () => null;',
    'parseYmd_ = () => new Date("2026-10-14T08:00:00Z");'
  ];
  // References are globals for the overrides, not live Google objects.
  context.main=main;context.references=references;
  vm.runInContext(script+'\n'+overrides.join('\n'),context);
  const request={ledger:'showroom',account:'cash_aed',date:'2026-10-14',
    article:'покупка авто для перепродажи',amount:173,note:'Lexus: запчасти',
    vehicle:'Lexus',request_id:'vehicle-payment-123'};
  return{state,context,request};
}
const a=fixture(false);
assert.equal(a.context.recordEntry_(a.request).duplicate,false);
assert.equal(a.state.car,'Lexus');
assert.equal(a.state.vehicleWrites,1);
assert.equal(a.state.journalWrites,1);
assert.equal(a.state.requestWrites,1);
a.state.stored=true;
assert.equal(a.context.recordEntry_(a.request).duplicate,true);
assert.equal(a.state.vehicleWrites,1,'Same replay does not change stored car');
assert.equal(a.state.journalWrites,1,'Same replay does not create new payment');
assert.equal(a.state.lockCount,a.state.released);
const b=fixture(false);
assert.throws(()=>b.context.recordEntry_({...b.request,vehicle:'unknown'}),/нет в справочнике/);
assert.equal(b.state.journalWrites,0);
const c=fixture(true,'Шевролет абдуллы');
assert.throws(()=>c.context.recordEntry_(c.request),/другому автомобилю/);
assert.equal(c.state.journalWrites,0);
const d=fixture(true,'');
assert.equal(d.context.recordEntry_(d.request).duplicate,true,'Interrupted write can complete car field');
assert.equal(d.state.car,'Lexus');
assert.equal(d.state.journalWrites,0);
console.log('PASS showroom car accounting: journal T, safe retry, unknown vehicle blocked, mismatched car blocked.');
