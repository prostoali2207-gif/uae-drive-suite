/* Durable autosave recovery: no network, Sheets, money or live triggers. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync(__dirname+'/ShowroomGrid.gs','utf8');
let tests=0;
function check(name,fn){fn();tests++;console.log('PASS '+name);}
function fixture(){
 const data={},processed=[],financial=new Map(); let busy=true,seq=0,throws='',during=null,flushFails=false,released=0;
 const props={getProperties:()=>({...data}),setProperty:(k,v)=>{data[k]=v;},deleteProperty:k=>{delete data[k];}};
 const sheet={getName:()=> 'Ввод операций',getMaxColumns:()=>27};
 const ss={getId:()=> '16Nb1bP-u5ox9RX4kH5fWa-GaYvAIoisyLMFSiGbtvJA',getSheetByName:()=>sheet,toast(){}};
 const ctx=vm.createContext({console,PropertiesService:{getScriptProperties:()=>props},
  Utilities:{getUuid:()=>String(++seq)},LockService:{getScriptLock:()=>({tryLock:ms=>{assert.equal(ms,1000);return !busy;},releaseLock:()=>{released++;}})},
  SpreadsheetApp:{openById:id=>{assert.equal(id,ss.getId());return ss;},flush:()=>{if(flushFails){flushFails=false;throw Error('Transient flush');}}},
  row:(sh,r,edited)=>{if(throws)throw Error(throws);processed.push({row:r,columns:edited.getEditedColumns().slice().sort()});financial.set(r,1);if(during){const callback=during;during=null;callback();}}
 });
 const api=vm.runInContext(source+'\nsgiModel_=()=>[];sgiFilter_=()=>{};sgiRow_=row;({showroomGridOnEdit,showroomResumeGridAutosave,sgiEditedColumns_});',ctx);
 const edit=(row=92,col=26,lastRow=row,lastCol=col)=>api.showroomGridOnEdit({source:ss,range:{getSheet:()=>sheet,getRow:()=>row,getLastRow:()=>lastRow,getColumn:()=>col,getLastColumn:()=>lastCol}});
 return {data,processed,financial,api,edit,ss,setBusy:v=>{busy=v;},setError:v=>{throws=v;},during:fn=>{during=fn;},failFlush:()=>{flushFails=true;},releases:()=>released};
}
check('busy lock preserves edit before returning; timer saves it once',()=>{
 const f=fixture();f.edit();assert.equal(Object.keys(f.data).length,1);assert.equal(f.processed.length,0);
 f.setBusy(false);f.api.showroomResumeGridAutosave();assert.equal(f.processed.length,1);assert.equal(Object.keys(f.data).length,0);
 f.api.showroomResumeGridAutosave();assert.equal(f.processed.length,1);
});
check('rapid edits coalesce by row, keeping exact changed columns',()=>{
 const f=fixture();f.edit(92,21);f.edit(92,26);f.edit(92,25);f.edit(93,26);
 f.setBusy(false);f.api.showroomResumeGridAutosave();assert.equal(f.processed.length,2);
 assert.deepEqual(Array.from(f.processed[0].columns),[21,25,26]);
 assert.equal(Object.keys(f.data).length,0);
});
check('edit arriving during save is not acknowledged or lost by earlier save',()=>{
 const f=fixture();f.edit();f.during(()=>{f.setBusy(true);f.edit(92,27);f.setBusy(false);});
 f.setBusy(false);f.api.showroomResumeGridAutosave();assert.equal(Object.keys(f.data).length,1);
 f.api.showroomResumeGridAutosave();assert.equal(Object.keys(f.data).length,0);assert.equal(f.processed.length,2);
});
check('transient service error remains queued and execution reports failure',()=>{
 const f=fixture();f.edit();f.setBusy(false);f.setError('Sheets temporarily unavailable');
 assert.throws(()=>f.api.showroomResumeGridAutosave(),/temporarily unavailable/);
 assert.equal(Object.keys(f.data).length,1);assert.equal(f.releases(),1);
 f.setError('');f.api.showroomResumeGridAutosave();assert.equal(f.financial.size,1);assert.equal(Object.keys(f.data).length,0);
});
check('duplicate is retained as blocked; new user correction retries safely',()=>{
 const f=fixture();f.edit();f.setBusy(false);f.setError('Похожая операция уже есть в строке 90');
 assert.throws(()=>f.api.showroomResumeGridAutosave(),/Похожая операция/);assert.equal(f.financial.size,0);
 assert.equal(JSON.parse(Object.values(f.data)[0]).blocked,true);
 f.api.showroomResumeGridAutosave();assert.equal(f.financial.size,0);
 f.setError('');f.setBusy(true);f.edit(92,27);f.setBusy(false);f.api.showroomResumeGridAutosave();assert.equal(f.financial.size,1);assert.equal(Object.keys(f.data).length,0);
});
check('flush interruption is not acknowledged and can resume',()=>{
 const f=fixture();f.edit();f.setBusy(false);f.failFlush();assert.throws(()=>f.api.showroomResumeGridAutosave(),/Transient flush/);
 assert.equal(Object.keys(f.data).length,1);f.api.showroomResumeGridAutosave();assert.equal(f.financial.size,1);
});
check('irrelevant financial storage edits do not enqueue or invoke grid saving',()=>{
 const f=fixture();f.edit(92,4);assert.equal(Object.keys(f.data).length,0);assert.equal(f.processed.length,0);
});
check('different spreadsheet cannot enqueue work',()=>{
 const f=fixture();f.api.showroomGridOnEdit({source:{getId:()=> 'RENTAL'},range:{}});assert.equal(Object.keys(f.data).length,0);
});
check('idle recovery never scans or posts an existing draft such as row 92',()=>{
 const f=fixture();f.setBusy(false);f.api.showroomResumeGridAutosave();assert.equal(f.financial.size,0);assert.equal(f.processed.length,0);
});
console.log(tests+' durable autosave scenarios passed.');
