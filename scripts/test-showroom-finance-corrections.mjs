// Local-only PostgreSQL tests. No network or production database connections.
// Setup: npm install --no-save --package-lock=false @electric-sql/pglite@0.5.10
// Run: node scripts/test-showroom-finance-corrections.mjs
// Or set PGLITE_MODULE to an installed package's dist/index.js path.
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
const { PGlite } = await import(process.env.PGLITE_MODULE
  ? pathToFileURL(resolve(process.env.PGLITE_MODULE)).href : '@electric-sql/pglite');
import fs from 'node:fs';import assert from 'node:assert/strict';
const db=new PGlite();await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
create table staff(id uuid primary key,owner_id uuid,full_name text,role text,status text);
create table telegram_operation_requests(id uuid primary key,owner_id uuid,actor_staff_id uuid,action text,payload jsonb,status text,result jsonb,processed_at timestamptz);
create table showroom_finance_operation_catalog(article text,direction text,cash_row int,ajman_row int,active bool);`);
for(const f of ['20261014183000_add_showroom_driver_movements.sql','20261015111742_showroom_finance_corrections.sql'])await db.exec(fs.readFileSync(new URL('../supabase/migrations/'+f,import.meta.url),'utf8'));
const ids=Array.from({length:6},(_,i)=>'00000000-0000-4000-8000-00000000000'+(i+1));const [owner,manager,driver,other,orig,movement]=ids;
await db.query("insert into staff values($1,$2,'Manager','manager','active'),($3,$2,'Driver','driver','active'),($4,$4,'Other','owner','active')",[manager,owner,driver,other]);
await db.query("insert into showroom_finance_operation_catalog values('Fuel','Расход',10,20,true),('Wash','Расход',11,21,true)");
let payload={ledger:'showroom',account:'cash_aed',date:'2026-10-15',direction:'expense',article:'Fuel',row:10,amount:100,note:'Original',received_amount:null};
await db.query("insert into telegram_operation_requests values($1,$2,$3,'record_showroom_finance_entry',$4,'applied',jsonb_build_object('request_id','creation_001','transfer_pair',null),now())",[orig,owner,driver,payload]);
await db.query("insert into showroom_driver_movements(id,owner_id,driver_staff_id,actor_staff_id,kind,amount,status,sheet_sync_status,event_key,finance_audit_id,article,note) values($1,$2,$3,$3,'expense',100,'applied','synced','expense:fixture',$4,'Fuel','Original')",[movement,owner,driver,orig]);
const snap=(p,v)=>({request_id:'creation_001',date:p.date,account_label:'Касса',input_row:5,
  amount:p.amount,article:p.article,note:p.sheet_note??p.note,version:v});
const begin=async(key,after,version=0,kind='edit',who=manager,own=owner,sheet=snap(payload,version))=>(await db.query('select showroom_begin_finance_correction($1,$2,$3,$4,$5,$6,$7,$8) as x',[own,who,orig,key,version,kind,after,sheet])).rows[0].x;
const finish=async(c,result={ok:true,correction_id:c.id,version:c.version})=>(await db.query('select showroom_finalize_finance_correction($1,$2,$3,$4) as x',[owner,manager,c.id,result])).rows[0].x;
let checks=0;const rejects=async(fn,p)=>{await assert.rejects(fn,p);checks++};const ok=(v)=>{assert.ok(v);checks++};
await rejects(()=>begin('role_driver',{...payload,amount:120},0,'edit',driver),/Only active owner/);
await rejects(()=>begin('wrong_owner',{...payload,amount:120},0,'edit',other,other),/not found/);
await rejects(()=>begin('bad_amount',{...payload,amount:0}),/Invalid correction amount/);
await rejects(()=>begin('bad_catalog',{...payload,article:'Imaginary'}),/catalog/);
await rejects(()=>begin('bad_direction',{...payload,direction:'income'}),/cannot be changed/);
await rejects(()=>begin('bad_snapshot',{...payload,amount:120},0,'edit',manager,owner,{...snap(payload,0),amount:90}),/snapshot/);
// A matching amount/article is insufficient: the snapshot must identify this original.
for (const bad of [{request_id:'another_entry'},{request_id:null},{date:'2026-09-01'},{account_label:'AJMAN'}]) {
 await rejects(()=>begin('bad_identity',{...payload,amount:120},0,'edit',manager,owner,{...snap(payload,0),...bad}),/snapshot/);
}
await db.query("update showroom_driver_movements set sheet_sync_status='pending'");
await rejects(()=>begin('unsynced_driver',{...payload,amount:120}),/finish synchronization/);
await db.query("update showroom_driver_movements set sheet_sync_status='synced'");
await db.query("update telegram_operation_requests set result=result || jsonb_build_object('transfer_pair','pair_001')");
await rejects(()=>begin('paired_transfer',{...payload,amount:120}),/Paired transfers/);
await db.query("update telegram_operation_requests set result=result || jsonb_build_object('transfer_pair',null)");
await db.query("update telegram_operation_requests set action='record_finance_entry',payload=jsonb_set(payload,'{ledger}','\"rental\"')");
await rejects(()=>begin('rental_entry',{...payload,amount:120}),/Showroom operation not found/);
await db.query("update telegram_operation_requests set action='record_showroom_finance_entry',payload=jsonb_set(payload,'{ledger}','\"showroom\"')");
const after={...payload,amount:150,article:'Wash',row:11,vehicle:'CAR-1',note:'New',sheet_note:'CAR-1 · New'};
let c=await begin('request_001',after);ok(c.status==='pending'&&c.driver_before.id===movement);ok((await begin('request_001',after)).id===c.id);
await rejects(()=>begin('request_001',{...after,amount:160}),/different correction/);
await rejects(()=>begin('request_002',after),/still syncing/);
await rejects(()=>begin('request_001',after,0,'edit',manager,owner,{...snap(payload,0),vehicle:'changed'}),/different correction/);
await db.query("update staff set owner_id=$1 where id=$2",[owner,other]);
await rejects(()=>begin('request_001',after,0,'edit',other),/different correction/);
await rejects(()=>db.query('select showroom_finalize_finance_correction($1,$2,$3,$4)',[owner,other,c.id,{ok:true,correction_id:c.id,version:1}]),/Correction not found/);
await rejects(()=>finish(c,{ok:true,correction_id:c.id,version:2}),/did not confirm/);
ok((await db.query('select amount from showroom_driver_movements')).rows[0].amount==='100.00');
// Simulate a DB write failure after the driver update: the entire RPC must roll back.
await db.exec(`create function fixture_failure() returns trigger language plpgsql as $fixture$ begin raise exception 'simulated db failure'; end $fixture$;
create trigger fixture_failure before update on telegram_operation_requests for each row execute function fixture_failure();`);
await rejects(()=>finish(c),/simulated db failure/);
ok((await db.query('select amount from showroom_driver_movements')).rows[0].amount==='100.00');
ok((await db.query('select status from showroom_finance_corrections')).rows[0].status==='pending');
await db.exec('drop trigger fixture_failure on telegram_operation_requests; drop function fixture_failure()');
let done=await finish(c);ok(done.status==='applied');ok((await finish(c)).id===c.id);ok((await begin('request_001',after)).status==='applied');
let d=(await db.query('select * from showroom_driver_movements')).rows[0];ok(d.amount==='150.00'&&d.vehicle==='CAR-1'&&d.article==='Wash'&&d.note==='New');
await rejects(()=>begin('request_old',after,0),/snapshot|Entry changed/);
await rejects(()=>db.query("update showroom_finance_corrections set actor_name='Tampered'"),/immutable/);
await rejects(()=>db.query('delete from showroom_finance_corrections'),/cannot be deleted/);
// Legacy movement metadata may differ from the main payload. Cancel preserves it.
await db.query("update showroom_driver_movements set vehicle='LEGACY-CAR',note='Driver original note'");
payload=after;c=await begin('request_cancel',payload,1,'cancel');await finish(c);
d=(await db.query('select * from showroom_driver_movements')).rows[0];await finish(done); // A stale successful correction retry must never resurrect cancellation.
d=(await db.query('select * from showroom_driver_movements')).rows[0];
ok(d.status==='cancelled'&&d.amount==='150.00'&&d.vehicle==='LEGACY-CAR'&&d.note==='Driver original note'&&d.article==='Wash');
ok(Number((await db.query("select coalesce(sum(amount) filter(where status='applied'),0) as total from showroom_driver_movements")).rows[0].total)===0);
const a=(await db.query('select * from telegram_operation_requests')).rows[0];ok(a.status==='applied'&&a.result.cancelled&&a.result.correction_version===2);
await rejects(()=>begin('post_cancel',payload,2,'edit'),/snapshot|noncancelled/);
const priv=(await db.query("select has_function_privilege('anon','showroom_begin_finance_correction(uuid,uuid,uuid,text,integer,text,jsonb,jsonb)','execute') as anon,has_function_privilege('authenticated','showroom_finalize_finance_correction(uuid,uuid,uuid,jsonb)','execute') as usr,has_function_privilege('service_role','showroom_finalize_finance_correction(uuid,uuid,uuid,jsonb)','execute') as service")).rows[0];ok(!priv.anon&&!priv.usr&&priv.service);
// The audit retains original creation time and actor, plus before/after and cancelling actor.
const journal=(await db.query('select * from showroom_finance_corrections order by version')).rows;
ok(journal.length===2&&journal[0].before_payload.amount===100&&journal[0].after_payload.amount===150);
ok(journal[1].actor_staff_id===manager&&journal[1].driver_before.vehicle==='LEGACY-CAR');
await db.exec('set role anon');
await rejects(()=>db.query('select * from showroom_finance_corrections'),/permission denied/);
await rejects(()=>begin('anon_request',payload,2),/permission denied/);
await db.exec('reset role');
console.log(JSON.stringify({pass:true,checks,engine:'PGlite PostgreSQL',productionWrites:0}));await db.close();
