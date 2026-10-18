/* Focused showroom finance replay tests. No live spreadsheet writes. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const code = fs.readFileSync(path.join(__dirname,'Code.gs'),'utf8');

function fixture(existing = true) {
  const calls={writes:0,transfers:0,acquired:0,released:0};
  const saved=[new Date('2026-10-14T08:00:00.000Z'),'Касса','покупка авто для перепродажи',173,''];
  const sheet={
    getMaxRows:()=>1004,
    getRange:(r,c,h,w)=>({
      getValues:()=>{
        if (r===5 && c===1 && h===1000 && w===20) {
          const rows=Array.from({length:1000},()=>Array(20).fill(''));
          rows[44]=saved.slice(0,5).concat(Array(15).fill('')); // Existing posting A49:E49
          return rows;
        }
        return [saved];
      },
      setValues:()=>{calls.writes++;},
      setValue:()=>{calls.writes++;}
    })
  };
  const context=vm.createContext({
    Date, sheet, calls,
    Utilities:{formatDate:d=>d.toISOString().slice(0,10)},
    LockService:{getScriptLock:()=>({waitLock:()=>{calls.acquired++;},releaseLock:()=>{calls.released++;}})}
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
    'spreadsheet_ = () => ({getSheetByName:()=>sheet});',
    'inspectInputRows_ = () => ({existingRow:'+(existing?49:0)+',emptyRow:50});',
    'ensureTransferPairForRow_ = () => { calls.transfers++;return null; };',
    'parseYmd_ = () => new Date("2026-10-14T08:00:00.000Z");'
  ];
  vm.runInContext(code+'\n'+overrides.join('\n'),context);
  const entry={
    ledger:'showroom',account:'cash_aed',date:'2026-10-14',
    article:'покупка авто для перепродажи',amount:173,note:'',request_id:'showroom-event-123'
  };
  return {context,calls,entry};
}

const a=fixture();
assert.throws(()=>a.context.recordEntry_({...a.entry,request_id:''}),/request_id обязателен/);
assert.throws(()=>a.context.recordEntry_({...a.entry,request_id:'bad?id'}),/request_id обязателен/);
const response=a.context.recordEntry_(a.entry);
assert.equal(response.duplicate,true);
assert.equal(response.input_row,49);
assert.throws(()=>a.context.recordEntry_({...a.entry,amount:174}),/относится к другой операции/);
assert.throws(()=>a.context.recordEntry_({...a.entry,note:'changed'}),/относится к другой операции/);
assert.equal(a.calls.writes,0);
assert.equal(a.calls.acquired,a.calls.released);

const b=fixture(false);
assert.throws(()=>b.context.recordEntry_({...b.entry,request_id:'different-event-123'}),/Похожая операция уже есть в строке 49/);
assert.equal(b.calls.writes,0,'Different request ID with identical payment must not duplicate');
assert.doesNotThrow(()=>b.context.recordEntry_({...b.entry,request_id:'different-event-456',note:'second independent payment'}));
assert.equal(b.calls.writes,2,'Separate explained payment writes journal and request ID');
const c=fixture(false);
assert.doesNotThrow(()=>c.context.recordEntry_({...c.entry,ledger:'rental',request_id:''}));
assert.equal(c.calls.writes,1,'Rental keeps its established flow');
console.log('PASS: showroom ID required; repeat or mismatched IDs fail; explained payment allowed; Rental unchanged.');
