const fs=require('node:fs');
const assert=require('node:assert/strict');
const old=fs.readFileSync(__dirname+'/FinanceBridgeLive_2026-10-28.gs','utf8').trim();
const candidate=fs.readFileSync(__dirname+'/FinanceBridgeLive_2026-10-29.gs','utf8');
const restored=candidate.replace("    showroom_vehicle_commission_subcategory_supported: ledger === 'showroom',\n",'').replace("    'комиссия от продажи авто (наши средства 100%)',\n",'').trim();
assert.equal(restored,old,'Only commission capability and allow-list change from exact v16 source');
console.log('PASS commission Bridge: only capability and allowed vehicle article differ from v16.');
