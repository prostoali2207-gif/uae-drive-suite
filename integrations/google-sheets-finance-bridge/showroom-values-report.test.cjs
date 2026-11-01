const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto');
const code=fs.readFileSync(__dirname+'/ShowroomReportValues.gs','utf8');
function fixture(){
 let period=new Date('2026-10-31T20:00:00Z'),publicRows=[['Расход',810]],calculated=[['Расход',810]],staged=[],writes=0,changeAt=0,reads=0;
 const props=new Map();
 function range(kind){return {getValue:()=>{if(++reads===changeAt)period=new Date('2026-09-30T20:00:00Z');return period;},getValues:()=>kind==='calc'?calculated:publicRows,setValues:v=>{staged=v;},clearContent:()=>{staged=[];},copyTo:()=>{publicRows=staged.map(r=>r.slice());writes++;}};}
 const view={getRange:(r)=>range(r==='B2'?'period':'view')},calc={getMaxRows:()=>3,getMaxColumns:()=>2,getRange:r=>range(r==='B2'?'period':'calc')},stage={getMaxRows:()=>3,getMaxColumns:()=>2,getRange:()=>range('stage')};
 const ss={getId:()=> 'qa-only',getSheetByName:n=>({'Месяц':view,'_Месяц_расчёт':calc,'_Месяц_значения':stage}[n])};
 const context=vm.createContext({Date,JSON,SpreadsheetApp:{CopyPasteType:{PASTE_VALUES:'values'}},Utilities:{DigestAlgorithm:{SHA_256:'sha256'},computeDigest:(_,v)=>Array.from(crypto.createHash('sha256').update(v).digest())},PropertiesService:{getScriptProperties:()=>({getProperty:k=>props.get(k),setProperty:(k,v)=>props.set(k,v)})}});
 vm.runInContext(code,context);
 return {api:context,refresh:()=>context.sgvReportRefresh_(ss),rows:()=>publicRows,writes:()=>writes,edit:v=>{publicRows=v;},raceAt:n=>{changeAt=n;reads=0;}};
}
{
 const f=fixture();assert.equal(f.refresh().updated,true);assert.equal(f.writes(),1);assert.equal(f.refresh().unchanged,true);assert.equal(f.writes(),1);
 f.edit([['Расход','accidental owner edit']]);assert.equal(f.refresh().updated,true);assert.deepEqual(f.rows(),[['Расход',810]]);
 console.log('PASS report refresh skips unchanged content and repairs owner edits');
}
{
 const f=fixture();f.raceAt(3);assert.equal(f.refresh().pending,true);assert.equal(f.writes(),0);
 console.log('PASS period race before staging cannot publish another month');
}
{
 const f=fixture();f.raceAt(4);assert.equal(f.refresh().pending,true);assert.equal(f.writes(),0);
 console.log('PASS period race after staging cannot publish another month');
}
{
 const f=fixture(),literal=f.api.sgvLiteralValues_([['=hello',0,false,'ordinary']]);
 assert.equal(literal[0][0],"'=hello");assert.equal(literal[0][1],0);assert.equal(literal[0][2],false);assert.equal(literal[0][3],'ordinary');
 console.log('PASS literal staging escapes formula text and preserves zero/false');
}
