/** QA only. Requires the QA-bound project and redirected constants; never install in production. */
function qaAutosaveRun() {
  const ss=SpreadsheetApp.getActiveSpreadsheet();
  if(ss.getId()!==SGI_ID || SGI_ID!=='104iWDidknXzuYrNe8bQtf4lRUFsdJVCgWRQ06jTRr3s' || SHOWROOM_SPREADSHEET_ID!==SGI_ID || RENTAL_SPREADSHEET_ID!==SGI_ID) throw Error('UNSAFE QA TARGET');
  const sh=ss.getSheetByName('Ввод операций'), model=sgiModel_(ss), date=new Date('2026-10-16T08:00:00Z');
  const props=PropertiesService.getScriptProperties(), stage=Number(props.getProperty('QA_AUTOSAVE_STAGE')||0); console.log('QA STAGE '+stage);
  const results=[];
  function ok(label,condition){ if(!condition)throw Error('FAIL '+label); results.push(label); console.log('PASS '+label); }
  function reset(r){sh.getRange(r,1,1,5).clearContent();sh.getRange(r,14,1,7).clearContent();sgiMirror_(sh,r);SpreadsheetApp.flush();}
  function edit(r,c,value){sh.getRange(r,c).setValue(value);SpreadsheetApp.flush();showroomGridOnEdit({source:ss,range:sh.getRange(r,c)});}
  function ledger(r){return sh.getRange(r,1,1,20).getValues()[0];}
  function count(){return sh.getRange(5,1,1000,5).getValues().filter(x=>x[0]&&x[1]&&x[2]&&x[3]).length;}
  function enter(r,op,amount){reset(r);edit(r,21,date);edit(r,22,op.type);edit(r,23,op.accounts[0]);edit(r,24,op.name);if(op.sub.length)edit(r,25,op.sub[0]);edit(r,26,amount);}
  const inc=model.find(x=>x.type==='Приход'&&!x.sub.length&&!/касс|счет|AJMAN/i.test(x.name));
  const exp=model.find(x=>x.type==='Расход'&&!x.sub.length&&!/перевод/i.test(x.name));
  ok('reference operations available',!!inc&&!!exp);

  if(stage===0){
  enter(901,inc,7101.11);ok('income saved',Number(ledger(901)[3])===7101.11);

  } else if(stage===1){
  enter(902,exp,7102.22);ok('expense saved',Number(ledger(902)[3])===7102.22);

  } else if(stage===2){
  const before=count();edit(902,26,7102.22);ok('same row retry no duplicate',count()===before);
  reset(903);const draft=[date,exp.type,exp.accounts[0],exp.name,'',7102.22,''];
  const area=sh.getRange(903,21,1,7),rules=area.getDataValidations();area.clearDataValidations();area.setValues([draft]);SpreadsheetApp.flush();area.setDataValidations(rules);
  showroomGridOnEdit({source:ss,range:area});ok('different row duplicate blocked',!ledger(903)[0]&&count()===before);

  } else if(stage===3 || stage===4){
  const dirs=[['Касса','перевод на счет в AJMAN'],['AJMAN','перевод в КАССУ']];
  dirs.forEach((d,i)=>{if(i!==stage-3)return;const op=model.find(x=>x.name===d[1]&&x.accounts.includes(d[0]));const r=904+i;enter(r,{...op,accounts:[d[0]]},7204+i);const v=ledger(r),peer=stFindPeer_(sh,v[16],r);ok('transfer '+d[0],v[17]==='source'&&peer>0&&Number(ledger(peer)[3])===7204+i);const n=count();edit(r,26,7204+i);ok('transfer retry '+d[0],count()===n&&stFindPeer_(sh,v[16],r)===peer);});

  } else if(stage===5){
  reset(906);const op=model.find(x=>x.name==='перевод в КАССУ');const a=sh.getRange(906,1,1,5),rule=sh.getRange(906,3).getDataValidation();sh.getRange(906,3).clearDataValidations();a.setValues([[date,'AJMAN',op.name,7306,'']]);SpreadsheetApp.flush();sh.getRange(906,3).setDataValidation(rule);sgiMirror_(sh,906);
  edit(906,26,7306);ok('retry repairs missing pair',ledger(906)[17]==='source'&&stFindPeer_(sh,ledger(906)[16],906)>0);
  reset(907);ok('empty mirrors restore strict validation',sh.getRange(907,21).getFormula()===''&&sh.getRange(907,21).getDataValidation().getAllowInvalid()===false);

  } else { console.log('ALL QA STAGES ALREADY COMPLETE'); return; }
 console.log('QA STAGE PASS '+stage+' '+JSON.stringify(results));props.setProperty('QA_AUTOSAVE_STAGE',String(stage+1));
}
