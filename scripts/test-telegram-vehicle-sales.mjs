// Execute the real Edge validation without network or database writes.
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { stripTypeScriptTypes } from 'node:module';
const source=fs.readFileSync(new URL('../supabase/functions/fleetdesk-telegram-finance/index.ts',import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,'');
const context=vm.createContext({TextEncoder,console,Deno:{serve(){}},fetch(){throw Error('Network forbidden');}});
vm.runInContext(stripTypeScriptTypes(source,{mode:'strip'})+'\nglobalThis.record=recordFinance;',context);
const groups=[['покупка авто для перепродажи','expense',['yaris 2021 abdullah','xpander abdullah','ertiga abdullah','camry 2017','Шевролет абдуллы','Lexus']],['Приход от продажи инвесторских авто','income',['yaris 2021 abdullah','xpander abdullah','ertiga abdullah','Шевролет абдуллы']],['Приход от продажи собственных авто','income',['camry 2017','Lexus']]];
let capable=true,calls=0,captured;
context.bridge=async(_db,action,payload)=>{assert.equal(action,'get_context');assert.equal(payload.ledger,'showroom');calls++;return{showroom_vehicle_sale_subcategory_supported:capable};};
context.existing=async()=>null;
vm.runInContext('callBridge=bridge;findExistingAudit=existing;',context);
const stop=new Error('LOCAL_INSERT_CAPTURED');
const staff={id:'manager',owner_id:'owner',role:'manager'};
let checks=0;
for(const [article,direction,cars] of groups){
 const db={from(table){const q={};for(const m of ['select','eq'])q[m]=()=>q;
 q.maybeSingle=async()=>({data:{sort_order:1,search_terms:'[[vehicles:'+cars.join('|')+']]'},error:null});
 q.insert=data=>{assert.equal(table,'telegram_operation_requests');captured=data;return q;};
 q.single=async()=>({error:stop});return q;}};
 const base={ledger:'showroom',account:'cash_aed',direction,article,row:20,amount:12.34,request_id:'local_fixture_001'};
 const run=body=>context.record(db,'',{id:1},staff,{...base,...body});
 for(const vehicle of cars){captured=null;await assert.rejects(()=>run({vehicle,note:vehicle}),e=>e===stop);assert.equal(captured.payload.vehicle,vehicle);checks++;}
 await assert.rejects(()=>run({vehicle:'unknown',note:'unknown'}),/Выбери машину/);checks++;
 if(direction==='income'){
  captured=null;await assert.rejects(()=>run({vehicle:'',note:''}),/Выбери машину/);assert.equal(captured,null);checks++;
  capable=false;await assert.rejects(()=>run({vehicle:cars[0],note:cars[0]}),/обновляется/);assert.equal(captured,null);checks++;capable=true;
  await assert.rejects(()=>run({vehicle:cars[0],note:'different car'}),/Выбери машину/);checks++;
 }
}
assert.equal(calls,8);
console.log(JSON.stringify({pass:true,checks,networkCalls:0,productionWrites:0,scope:'12 vehicle/category combinations, wrong car, missing car, note mismatch, rollout capability'}));
