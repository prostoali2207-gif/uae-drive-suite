/** Compact monthly U:AA projection. A:T remains the immutable-position source journal. */
const SGC_MODE_CACHE = new WeakMap();
function sgcEnabled_(sh) {
  if(!sh||typeof sh.getMaxColumns!=='function')return false;
  if(!SGC_MODE_CACHE.has(sh))SGC_MODE_CACHE.set(sh,Boolean(sh.getMaxColumns()>=32&&sh.getRange('AB1').getValue()==='sgi.compact.v1'));
  return SGC_MODE_CACHE.get(sh);
}
function sgcSourceRow_(sh,row) {
  const n=Number(sh.getRange(row,28).getValue()||0);
  if(!Number.isInteger(n)||n<0||n>1004||(n>0&&n<5)) throw new Error('Повреждена связь строки с журналом.');
  return n;
}
function sgcMirrorFormula_(col,row,sourceRow) {
  const value="'Ввод операций'!$"+col+'$'+sourceRow;
  return '=IF('+value+'="";"";'+value+')';
}
function sgcPlan_(rows,month,mode) {
  return rows.map((v,i)=>({row:i+5,values:v})).filter(item=>{
    const d=item.values[0];
    return d instanceof Date&&!isNaN(d.getTime())&&Utilities.formatDate(d,'Asia/Dubai','yyyy-MM')===month&&
      (!['Приход','Расход'].includes(mode)||item.values[5]===mode);
  }).sort((a,b)=>{
    const day=Utilities.formatDate(a.values[0],'Asia/Dubai','yyyy-MM-dd').localeCompare(Utilities.formatDate(b.values[0],'Asia/Dubai','yyyy-MM-dd'));
    return day||((a.values[15] instanceof Date?a.values[15].getTime():0)-(b.values[15] instanceof Date?b.values[15].getTime():0))||a.row-b.row;
  });
}
function sgcAllocate_(sh) {
  const rows=sh.getRange(5,1,1000,20).getValues();
  for(let i=0;i<rows.length;i++) {
    if(i+5===9||i+5===13) continue;
    if(rows[i].slice(0,5).concat(rows[i].slice(13,20)).every(v=>v===''||v===null)) return i+5;
  }
  throw new Error('Нет свободных строк в журнале. Операция не сохранена.');
}
function sgcHasDraft_(sh) {
  const area=sh.getRange('U5:AA1004'),values=area.getValues(),formulas=area.getFormulas();
  return values.some((row,r)=>row.some((value,c)=>value!==''&&value!==null&&!formulas[r][c]));
}
function sgcRefresh_(sh) {
  const lock=LockService.getScriptLock();
  if(!lock.tryLock(1000)) {sh.getRange('AF1').setValue('dirty:'+Utilities.getUuid());return {pending:true};}
  try{return sgcRender_(sh);}finally{lock.releaseLock();}
}
function sgcRender_(sh) {
  const label=String(sh.getRange('X3').getValue()),mode=String(sh.getRange('V3').getValue()||'Все');
  const month=sgiMonth_(label);
  if(!month) throw new Error('Выберите месяц. Общий список больше не используется.');
  const previous=sh.getRange('AC1:AD1').getValues()[0];
  if(sgcHasDraft_(sh)) {
    sh.getRange('AF1').setValue('draft'); // Do not rescan an unattended draft every minute.
    if(previous[0]&&(previous[0]!==label||previous[1]!==mode)) {
      sh.getRange('X3').setValue(previous[0]);sh.getRange('V3').setValue(previous[1]);
      sh.getParent().toast('Завершите или очистите черновик перед сменой месяца или типа.','Черновик сохранён',10);
    }
    return {draft:true};
  }
  const triggerToken=String(sh.getRange('AF1').getValue());
  const key=month.year+'-'+String(month.month).padStart(2,'0');
  const plan=sgcPlan_(sh.getRange(5,1,1000,20).getValues(),key,mode);
  const digest=Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,JSON.stringify([label,mode,plan.map(x=>[x.row,sgiSignature_(x.values)])])).map(b=>('0'+((b+256)%256).toString(16)).slice(-2)).join('');
  if(triggerToken===digest) return {unchanged:true,count:plan.length};
  const pending=Object.keys(PropertiesService.getScriptProperties().getProperties()).some(k=>k.indexOf('sgi.queue.v1.')===0&&!JSON.parse(PropertiesService.getScriptProperties().getProperty(k)).blocked);
  if(pending) {
    if(previous[0]){sh.getRange('X3').setValue(previous[0]);sh.getRange('V3').setValue(previous[1]);}
    return {pending:true};
  }
  const map=[],formulas=[],sourceIndexes=[0,5,1,2,19,3,4];
  for(let i=0;i<1000;i++) {
    const entry=plan[i],v=entry?entry.values:Array(20).fill('');
    map.push([entry?entry.row:0,sgiSignature_(v)]);
    formulas.push(SGI_COLS.map((col,c)=>v[sourceIndexes[c]]===''||v[sourceIndexes[c]]===null?'':sgcMirrorFormula_(col,i+5,entry.row)));
  }
  // Set mappings before formulas; no financial cell is written by rendering.
  const area=sh.getRange('U5:AA1004'),rules=area.getDataValidations();
  const dateRule=SpreadsheetApp.newDataValidation().requireDateBetween(new Date(Date.UTC(month.year,month.month-1,1,8)),new Date(Date.UTC(month.year,month.month,0,8))).setAllowInvalid(false).setHelpText('Дата только за '+label+'.').build();
  rules.forEach((row,i)=>{
    row[0]=dateRule;
  });
  // Build on an unvalidated hidden buffer, then publish through native paste.
  // Paste is one native operation, avoiding Range.setFormulas' stale-list checks.
  const ss=sh.getParent();let stage=ss.getSheetByName('_Ввод_месяц_буфер');
  if(!stage){stage=ss.insertSheet('_Ввод_месяц_буфер');stage.hideSheet();}
  if(stage.getMaxRows()<1004)stage.insertRowsAfter(stage.getMaxRows(),1004-stage.getMaxRows());
  const buffer=stage.getRange(5,1,1000,7);
  buffer.clearDataValidations();buffer.setFormulas(formulas);SpreadsheetApp.flush();
  // Native paste skips rows hidden by an existing filter; remove it BEFORE pasting.
  const filter=sh.getFilter();if(filter)filter.remove();
  sh.showRows(5,1000);SpreadsheetApp.flush();
  sh.getRange(5,28,1000,2).setValues(map);SpreadsheetApp.flush();
  buffer.copyTo(area,SpreadsheetApp.CopyPasteType.PASTE_FORMULA,false);SpreadsheetApp.flush();
  area.setDataValidations(rules);
  sh.getRange('U5:U1004').clearNote();
  const latestToken=String(sh.getRange('AF1').getValue());
  const newerDirty=latestToken.indexOf('dirty')===0&&latestToken!==triggerToken;
  const changedSelection=label!==String(sh.getRange('X3').getValue())||mode!==String(sh.getRange('V3').getValue());
  const nextToken=newerDirty?latestToken:changedSelection?'dirty:'+Utilities.getUuid():digest;
  sh.getRange('AC1:AF1').setValues([[label,mode,Utilities.getUuid(),nextToken]]);
  SpreadsheetApp.flush();
  if(previous[0]!==label||previous[1]!==mode)sh.getRange('U5').activate();
  return {count:plan.length,firstRow:5};
}

/** Explicitly invoked only after the candidate passed QA. Never posts an existing draft. */
function showroomEnableCompactMonthView() {
  const ss=SpreadsheetApp.getActiveSpreadsheet();
  if(!ss||ss.getId()!==SGI_ID)throw new Error('Неверная таблица.');
  const sh=ss.getSheetByName('Ввод операций');
  const active=Object.keys(PropertiesService.getScriptProperties().getProperties()).some(k=>k.indexOf('sgi.queue.v1.')===0&&!JSON.parse(PropertiesService.getScriptProperties().getProperty(k)).blocked);
  if(active||sgcHasDraft_(sh)) throw new Error('Есть незавершённый ввод. Завершите его перед обновлением вида.');
  if(sh.getMaxColumns()<32)sh.insertColumnsAfter(sh.getMaxColumns(),32-sh.getMaxColumns());
  sh.getRange('AB1').setValue('sgi.compact.v1');
  SGC_MODE_CACHE.delete(sh);
  sh.hideColumns(28,5);
  sh.getRange('AF1').clearContent();
  const months=ss.getSheets().map(s=>s.getName()).filter(n=>sgiMonth_(n));
  sh.getRange('X3').setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(months,true).setAllowInvalid(false).build());
  sh.getRange('U2').setValue('Выберите месяц сверху. Все его операции начинаются с пятой строки. Дата должна относиться к выбранному месяцу.');
  sh.getRange('Y3').setFormula('=IF(OR($X$3<>$AC$1;$V$3<>$AD$1);"ОБНОВЛЕНИЕ СПИСКА…";"ВВОД: "&$X$3)');
  const result=sgcRefresh_(sh);
  console.log(JSON.stringify(result));
}
