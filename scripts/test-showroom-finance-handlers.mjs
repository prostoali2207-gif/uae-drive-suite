// Node >=22.6; loads the production TypeScript handlers without serving or network.
// Run: node scripts/test-showroom-finance-handlers.mjs
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { stripTypeScriptTypes } from 'node:module';
const source = fs.readFileSync(new URL('../supabase/functions/fleetdesk-telegram-finance/index.ts', import.meta.url), 'utf8')
  .replace(/^import .*;\r?\n/gm, '');
const context = vm.createContext({ TextEncoder, console: { error() {} }, Deno: { serve() {} },
  fetch() { throw new Error('Network forbidden in local handler tests'); } });
vm.runInContext(stripTypeScriptTypes(source, { mode: 'strip' }) + '\nglobalThis.handlers={correctFinance,finishFinanceCorrection,getFinanceHistory};', context);
const { correctFinance, finishFinanceCorrection, getFinanceHistory } = context.handlers;
let bridgeCalls = [], bridgeImpl;
context.bridgeStub = async (...args) => { bridgeCalls.push(args); return await bridgeImpl(...args); };
vm.runInContext('callBridge = bridgeStub;', context);
const owner = 'owner-tenant', staff = {id:'manager-id',owner_id:owner,role:'manager'};
const before = { ledger:'showroom',account:'cash_aed',date:'2026-10-15',direction:'expense',article:'Fuel',row:10,amount:100,note:'Old' };
const snapshot = {request_id:'creation_001',amount:100,article:'Fuel',date:before.date,account_label:'Касса',note:'Old',vehicle:'',version:0};
const after = {...before,amount:150,article:'Wash',row:11,vehicle:'CAR',note:'',sheet_note:''};
const correction = {id:'correction-id',owner_id:owner,original_id:'original-id',actor_staff_id:staff.id,actor_name:'Manager',request_id:'correction_001',kind:'edit',version:1,status:'pending',after_payload:after,sheet_before:snapshot,driver_before:null};
const original = {id:'original-id',actor_staff_id:staff.id,owner_id:owner,payload:before,result:{request_id:'creation_001',note:'Old'},created_at:'2026-10-15'};
const body = {action:'correct_showroom_finance',ledger:'showroom',audit_id:original.id,request_id:'correction_001',expected_version:0,kind:'edit',expected_sheet:snapshot,values:{amount:150,article:'Wash',row:11,vehicle:'CAR',note:''}};
let checks=0;
const ok = value => {assert.ok(value);checks++;};
const rejects = async (fn,pattern) => {await assert.rejects(fn,pattern);checks++;};
function database(routes=[], rpc=async()=>({data:correction,error:null})) {
 const calls=[];return {calls,
 from(table) { const filters=[];const q={};for(const method of ['select','eq','in','order','limit'])q[method]=(...args)=>{filters.push([method,...args]);return q;};
 const resolve=async()=>{calls.push({table,filters});const route=routes.shift();assert.ok(route,'Unexpected table read '+table);assert.equal(route.table,table);route.check?.(filters);return {data:route.data,error:route.error??null};};
 q.single=resolve;q.maybeSingle=resolve;q.then=(yes,no)=>resolve().then(yes,no);return q;},
 async rpc(name,args){calls.push({rpc:name,args});return rpc(name,args);}
 };
}
function resetBridge(fn=async(_db,action)=>action==='inspect_showroom_entries'?{entries:[{audit_id:original.id,snapshot}]}:{ok:true,correction_id:correction.id,version:1}){bridgeCalls=[];bridgeImpl=fn;}
const empty=()=>database();
for (const role of ['driver','admin','mechanic'])await rejects(()=>correctFinance(empty(),{...staff,role},body),/владельцу/);
await rejects(()=>correctFinance(empty(),staff,{...body,ledger:'rental'}),/владельцу/);
resetBridge();
let db=database([{table:'showroom_finance_corrections',data:correction}]);
let result=await correctFinance(db,staff,body);ok(result.status==='applied');ok(db.calls.length===2&&db.calls[1].rpc==='showroom_finalize_finance_correction');
ok(bridgeCalls[0][1]==='correct_showroom_entry'&&bridgeCalls[0][2].correction_id===correction.id);
// Existing immutable journal wins over current original/catalog, including lost responses.
resetBridge();db=database([{table:'showroom_finance_corrections',data:{...correction,status:'applied'}}]);
result=await correctFinance(db,staff,body);ok(result.status==='applied'&&bridgeCalls.length===0&&db.calls.length===1);
for(const mutate of [{values:{...body.values,amount:151}},{expected_sheet:{...snapshot,request_id:'other'}},{audit_id:'foreign-original'},{expected_version:2}]){
 db=database([{table:'showroom_finance_corrections',data:correction}]);
 await rejects(()=>correctFinance(db,staff,{...body,...mutate}),/другие значения/);
}
db=database([{table:'showroom_finance_corrections',data:{...correction,actor_staff_id:'other-manager'}}]);
await rejects(()=>correctFinance(db,staff,body),/другие значения/);
// Unknown bridge failure retains pending; no finalize or second financial creation.
resetBridge(async()=>{throw new Error('timeout after sheet write');});
db=database([{table:'showroom_finance_corrections',data:correction}]);
result=await correctFinance(db,staff,body);ok(result.status==='pending'&&db.calls.length===1);
// DB failure after successful bridge remains pending and can retry exact correction.
resetBridge();db=database([],async()=>({error:{code:'08006',message:'connection lost'}}));
result=await finishFinanceCorrection(db,staff,correction);ok(result.status==='pending'&&bridgeCalls.length===1);
// New correction: tenant-scoped lookup, transaction begin before bridge call.
resetBridge();db=database([{table:'showroom_finance_corrections',data:null},{table:'telegram_operation_requests',data:original,check:f=>ok(f.some(x=>x[0]==='eq'&&x[1]==='owner_id'&&x[2]===owner))}],async(name,args)=>{
 if(name==='showroom_begin_finance_correction'){ok(bridgeCalls.every(x=>x[1]==='inspect_showroom_entries'));ok(args.p_after_payload.note===''&&args.p_after_payload.amount===150);}
 return {data:correction,error:null};});
result=await correctFinance(db,staff,body);ok(result.status==='applied'&&db.calls.filter(x=>x.rpc).length===2);
for(const code of ['P0001','23514','22P02']){
 resetBridge();db=database([{table:'showroom_finance_corrections',data:null},{table:'telegram_operation_requests',data:original}],async()=>({error:{code,message:'Invalid fixture'}}));
 result=await correctFinance(db,staff,body);ok(result.status==='rejected'&&result.correction_rejected&&bridgeCalls.every(x=>x[1]==='inspect_showroom_entries'));
}
resetBridge();db=database([{table:'showroom_finance_corrections',data:null},{table:'telegram_operation_requests',data:original}],async()=>({error:{code:'08006',message:'unknown transaction result'}}));
await rejects(()=>correctFinance(db,staff,body),/Повтори тот же запрос/);ok(bridgeCalls.every(x=>x[1]==='inspect_showroom_entries'));
// Explicit retry endpoint scopes original actor as well as owner.
resetBridge();db=database([{table:'showroom_finance_corrections',data:correction,check:f=>ok(f.some(x=>x[0]==='eq'&&x[1]==='actor_staff_id'&&x[2]===staff.id))}]);
result=await correctFinance(db,staff,{action:'retry_showroom_correction',ledger:'showroom',correction_id:correction.id});ok(result.status==='applied');
// History stays readable when Sheets fails, and correction controls fail closed.
const historyRoutes=(row=original,pending=[])=>[
 {table:'telegram_operation_requests',data:[row]}, {table:'staff',data:[{id:staff.id,full_name:'Manager'}]},
 {table:'showroom_finance_corrections',data:pending}];
resetBridge(async()=>{throw new Error('Sheets unavailable');});db=database(historyRoutes());
result=await getFinanceHistory(db,{id:42},staff,{ledger:'showroom'});ok(result.items.length===1&&!result.items[0].can_correct);
resetBridge(async()=>({entries:[{audit_id:original.id,snapshot}]}));db=database(historyRoutes());
result=await getFinanceHistory(db,{id:42},staff,{ledger:'showroom'});ok(result.items[0].can_correct);
db=database(historyRoutes({...original,payload:after,result:{...original.result,correction_version:1,cancelled:true,corrected_by:'Manager'}}));
result=await getFinanceHistory(db,{id:42},staff,{ledger:'showroom'});ok(result.items[0].cancelled&&!result.items[0].can_correct);
// A pending correction exposes retry only to its initiating manager.
db=database(historyRoutes(original,[correction]));result=await getFinanceHistory(db,{id:42},staff,{ledger:'showroom'});ok(result.items[0].pending_correction.id===correction.id&&!result.items[0].can_correct);
db=database(historyRoutes(original,[{...correction,actor_staff_id:'other'}]));result=await getFinanceHistory(db,{id:42},staff,{ledger:'showroom'});ok(result.items[0].pending_correction===null&&!result.items[0].can_correct);
// Clearing a note must not resurrect the original bridge result note.
resetBridge(async()=>({entries:[{audit_id:original.id,snapshot:{...snapshot,version:1}}]}));
db=database(historyRoutes({...original,payload:after,result:{...original.result,correction_version:1}}));
result=await getFinanceHistory(db,{id:42},staff,{ledger:'showroom'});ok(result.items[0].note==='');
// Cancel submits untouched payload to the journal; it does not synthesize a new expense.
resetBridge();db=database([{table:'showroom_finance_corrections',data:null},{table:'telegram_operation_requests',data:original}],async(name,args)=>{
 if(name==='showroom_begin_finance_correction'){assert.deepEqual(args.p_after_payload,before);checks++;}
 return {data:{...correction,kind:'cancel',after_payload:before},error:null};});
result=await correctFinance(db,staff,{...body,kind:'cancel',values:undefined});ok(result.status==='applied');
// A changed sheet is rejected before a durable journal or mutating bridge call.
resetBridge(async()=>({entries:[{audit_id:original.id,snapshot:{...snapshot,amount:999}}]}));
db=database([{table:'showroom_finance_corrections',data:null},{table:'telegram_operation_requests',data:original}]);
result=await correctFinance(db,staff,body);ok(result.status==='rejected'&&db.calls.every(x=>!x.rpc)&&bridgeCalls.length===1);
resetBridge();db=database([{table:'showroom_finance_corrections',data:null},{table:'telegram_operation_requests',data:original}]);
result=await correctFinance(db,staff,{...body,expected_sheet:{...snapshot,request_id:'foreign'}});ok(result.status==='rejected'&&bridgeCalls.length===0);
resetBridge();db=database([{table:'showroom_finance_corrections',data:null},{table:'telegram_operation_requests',data:{...original,payload:{...before,article:'перевод в КАССУ'}}}]);
result=await correctFinance(db,staff,body);ok(result.status==='rejected'&&bridgeCalls.length===0);
// Rental history avoids correction tables and bridge inspection altogether.
resetBridge();db=database([{table:'telegram_operation_requests',data:[original]},{table:'staff',data:[]}]);
result=await getFinanceHistory(db,{id:42},staff,{ledger:'rental'});ok(result.items.length===1&&bridgeCalls.length===0&&db.calls.length===2);
console.log(JSON.stringify({pass:true,checks,scope:'showroom handlers',networkCalls:0,productionWrites:0}));
