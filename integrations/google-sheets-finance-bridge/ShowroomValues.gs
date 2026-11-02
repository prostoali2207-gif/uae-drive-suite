/** Visible cells contain values; the hidden baseline separates saved rows from real drafts. */
const SGV_CACHE=new WeakMap();
function sgvEnabled_(sh) {
  if(!SGV_CACHE.has(sh))SGV_CACHE.set(sh,sh.getRange('AB2').getValue()==='sgi.values.v1');
  return SGV_CACHE.get(sh);
}
function sgvBase_(sh) {
  const base=sh.getParent().getSheetByName('_Ввод_значения');
  if(!base)throw Error('Не найден исходный снимок ввода. Запись остановлена.');
  return base;
}
function sgvEqual_(a,b){return JSON.stringify(a)===JSON.stringify(b);}
function sgvHasDraft_(sh,values,formulas) {
  const saved=sgvBase_(sh).getRange(5,1,values.length,7).getValues();
  return values.some((row,r)=>!sgvEqual_(row,saved[r])||formulas[r].some(Boolean));
}
function sgvPublish_(sh,row,values) {
  const base=sgvBase_(sh),buffer=base.getRange(row,1,values.length,7);
  buffer.setValues(sgvLiteralValues_(values));
  buffer.copyTo(sh.getRange(row,21,values.length,7),SpreadsheetApp.CopyPasteType.PASTE_VALUES,false);
}
function sgvCheckRow_(sh,r,edited) {
  const area=sh.getRange(r,21,1,7),visible=area.getValues()[0],formulas=area.getFormulas()[0];
  const saved=sgvBase_(sh).getRange(r,1,1,7).getValues()[0];
  if(formulas.some(Boolean))throw Error('Введите обычные значения, без формул.');
  if(visible.some((v,i)=>!sgiEditedColumns_(edited).includes(i+21)&&!sgvEqual_(v,saved[i])))throw Error('Есть другая незавершённая правка строки. Завершите её перед сохранением.');
}
function sgvBanner_(sh) {
  const state=sh.getRange('AC1:AD1').getValues()[0],controls=sh.getRange('V3:X3').getValues()[0];
  sh.getRange('Y3').setValue(state[0]===String(controls[2])&&state[1]===String(controls[0])?'ВВОД: '+controls[2]:'ОБНОВЛЕНИЕ СПИСКА…');
}
/** Own narrow listener; does not duplicate or replace the existing grid autosave handler. */
function showroomValuesOnEdit(e) {
  if(!e||!e.range||e.source.getId()!==SGI_ID)return;
  const sh=e.range.getSheet(),name=sh.getName();
  if(!sgvEnabled_(e.source.getSheetByName('Ввод операций')))return;
  if(name==='Месяц'){
    sh.getRange('H4').setValue('Обновление отчёта…');
    const lock=LockService.getScriptLock();if(!lock.tryLock(20000))return;
    try{sgvReportRefresh_(e.source);}finally{lock.releaseLock();}return;
  }
  if(name!=='Ввод операций'||e.range.getLastColumn()<21||e.range.getColumn()>27||e.range.getRow()<5||e.range.getRow()>1004)return;
  // Wait for the existing autosave to commit a complete edit. Never post money here.
  const first=Math.max(5,e.range.getRow()),count=Math.min(1004,e.range.getLastRow())-first+1;
  const start=Date.now();
  while(Date.now()-start<25000){
    const values=sh.getRange(first,21,count,7).getValues(),saved=sgvBase_(sh).getRange(first,1,count,7).getValues();
    if(sgvEqual_(values,saved))break;
    if(values.some(v=>!(v[0] instanceof Date)||!v[1]||!v[2]||!v[3]||!(Number(v[5])>0)))return;
    Utilities.sleep(500);
  }
  const lock=LockService.getScriptLock();if(!lock.tryLock(20000))return;
  try{sgvReportRefresh_(e.source);}finally{lock.releaseLock();}
}
function showroomInstallValuesListener(){
  const ss=SpreadsheetApp.getActiveSpreadsheet();if(!ss||ss.getId()!==SGI_ID)throw Error('Неверная таблица.');
  const list=ScriptApp.getProjectTriggers().filter(t=>t.getHandlerFunction()==='showroomValuesOnEdit');
  if(list.length>1)throw Error('Повторные обработчики отчёта.');
  if(!list.length)ScriptApp.newTrigger('showroomValuesOnEdit').forSpreadsheet(ss).onEdit().create();
}
/** Explicit migration, only after native QA. No A:T or historical money writes. */
function showroomEnableValuesView(){
  const ss=SpreadsheetApp.getActiveSpreadsheet();if(!ss||ss.getId()!==SGI_ID)throw Error('Неверная таблица.');
  const lock=LockService.getScriptLock();lock.waitLock(20000);
  try{
    const sh=ss.getSheetByName('Ввод операций'),view=ss.getSheetByName('Месяц');
    const journal=()=>JSON.stringify([sh.getRange('A5:T1004').getValues(),sh.getRange('A5:T1004').getFormulas()]);
    const before=journal(),report=JSON.stringify(view.getRange('A1:J346').getValues());
    const result=sgvInstall_(ss);
    if(journal()!==before)throw Error('Журнал изменился во время проверки. Требуется сверка.');
    if(JSON.stringify(view.getRange('A1:J346').getValues())!==report)throw Error('Значения отчёта отличаются. Требуется сверка.');
    if(view.getRange('A1:J346').getFormulas().some(r=>r.some(Boolean))||sh.getRange('U1:AA1004').getFormulas().some(r=>r.some(Boolean)))throw Error('В видимых ячейках остались формулы.');
    console.log(JSON.stringify({result:result,journalUnchanged:true,reportUnchanged:true,visibleFormulas:0}));
    return result;
  }finally{lock.releaseLock();}
}
function sgvInstall_(ss){
  const sh=ss.getSheetByName('Ввод операций');
  if(sgvEnabled_(sh))return {already:true};
  if(sgcHasDraft_(sh))throw Error('Завершите незавершённый ввод.');
  const pending=Object.keys(PropertiesService.getScriptProperties().getProperties()).some(k=>k.indexOf('sgi.queue.v1.')===0&&!JSON.parse(PropertiesService.getScriptProperties().getProperty(k)).blocked);
  if(pending)throw Error('Дождитесь завершения автосохранения.');
  const view=ss.getSheetByName('Месяц'),rows=view.getMaxRows(),cols=view.getMaxColumns();
  const before=view.getRange(1,1,rows,cols).getValues();
  if(ss.getSheetByName('_Месяц_расчёт')||ss.getSheetByName('_Ввод_значения'))throw Error('Миграция уже подготовлена. Требуется проверка.');
  const calc=view.copyTo(ss).setName('_Месяц_расчёт');calc.hideSheet();
  calc.getRange('B2').clearDataValidations().setFormula("='Месяц'!B2");SpreadsheetApp.flush();
  if(!sgvEqual_(before,calc.getRange(1,1,rows,cols).getValues()))throw Error('Расчётная копия отличается. Видимые формулы не заменены.');
  view.getRange('B2').setNumberFormat('mmmm yyyy');
  calc.getRange('B2').setNumberFormat('mmmm yyyy');
  const base=ss.insertSheet('_Ввод_значения');base.hideSheet();
  if(base.getMaxRows()<1004)base.insertRowsAfter(base.getMaxRows(),1004-base.getMaxRows());
  base.getRange('A5:A1004').setNumberFormat('yyyy-mm-dd hh:mm:ss');
  sh.getRange('U5:AA1004').copyTo(base.getRange(5,1,1000,7),SpreadsheetApp.CopyPasteType.PASTE_VALUES,false);
  base.getRange(5,1,1000,7).copyTo(sh.getRange('U5:AA1004'),SpreadsheetApp.CopyPasteType.PASTE_VALUES,false);
  const area=view.getRange(3,1,rows-2,cols);area.copyTo(area,SpreadsheetApp.CopyPasteType.PASTE_VALUES,false);
  const nav=view.getRange('G2');nav.setRichTextValue(SpreadsheetApp.newRichTextValue().setText('＋ ДОБАВИТЬ ОПЕРАЦИЮ').setLinkUrl('https://docs.google.com/spreadsheets/d/'+ss.getId()+'/edit#gid=589146974').build());
  sh.getRange('AB2').setValue('sgi.values.v1');SGV_CACHE.delete(sh);sgvBanner_(sh);
  SpreadsheetApp.flush();sgvReportRefresh_(ss);
  return {enabled:true};
}
