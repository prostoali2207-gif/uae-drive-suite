/* Focused regression for driver expense permissions and car choices; no live calls. */
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const root = path.join(__dirname,'..');
const source = fs.readFileSync(path.join(root,'supabase/functions/fleetdesk-telegram-finance/index.ts'),'utf8');
const start = source.indexOf('const DRIVER_NON_EXPENSE_ARTICLES =');
const end = source.indexOf('const MANAGER_ROLES =',start);
assert.ok(start >= 0 && end > start,'Driver authorization helper exists');
const helper = source.slice(start,end)
  .replace(/item: \{ article: string; direction: string; rows: \{ cash_aed\?: number \| null \} \}/,'item')
  .replace('searchTerms: string','searchTerms');
const api = vm.runInNewContext(helper+'\n({driverCashExpenseAllowed,showroomVehicleOptions})');
const item = (article,direction='Расход',cashRow=66)=>({article,direction,rows:{cash_aed:cashRow}});
assert.equal(api.driverCashExpenseAllowed(item('покупка авто для перепродажи')),true,'Drivers can select purchase');
assert.equal(api.driverCashExpenseAllowed(item('Оплата труда з/п', 'Расход', 101)),true,'Other actual expenses available');
assert.equal(api.driverCashExpenseAllowed(item('перевод на счет в AJMAN','Расход',142)),false,'Transfers not driver expenses');
assert.equal(api.driverCashExpenseAllowed(item('Налоги','Приход',119)),false,'Income never available');
assert.equal(api.driverCashExpenseAllowed(item('Расходы связанные с регистрацией авто','Расход',null)),false,'Unmapped AJMAN-only operation cannot debit cash wallet');
const options=api.showroomVehicleOptions('покупка выкуп авто [[vehicles:Lexus|Шевролет абдуллы|Xpander Abdullah]]');
assert.deepEqual(Array.from(options),['Lexus','Шевролет абдуллы','Xpander Abdullah']);
assert.match(source,/showroomCatalog\.filter\(driverCashExpenseAllowed\)/,'Session catalog shares permission rule');
assert.match(source,/DRIVER_NON_EXPENSE_ARTICLES\.has\(String\(item\.article/,'Search excludes transfers');
assert.match(source,/vehicle: payload\.vehicle \|\| ""/,'Finance Bridge sends selected car');
assert.match(source,/finance_audit_id: auditId, article: payload\.article, vehicle:/,'Driver wallet tracks car separately');
assert.match(source,/!options\.includes\(vehicle\)/,'Server validates car against catalog');
const ui=fs.readFileSync(path.join(root,'src/telegram-finance/TelegramFinanceApp.tsx'),'utf8');
assert.match(ui,/vehicle: isVehiclePurchaseOperation \? note\.trim\(\) : ""/,'Client sends separate car');
assert.match(ui,/id="tg-purchase-details"/,'Purchase note editable');
console.log('PASS driver catalog: all cash expenses, no transfers/income, valid car options, wallet + Bridge integration.');
