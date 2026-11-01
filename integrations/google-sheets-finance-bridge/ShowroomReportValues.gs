/** Shared by bound UI and the existing API. Financial formulas remain live on a hidden sheet. */
function sgvLiteralValues_(rows){return rows.map(row=>row.map(v=>typeof v==='string'&&v.charAt(0)==='='?"'"+v:v));}
function sgvReportRefresh_(ss) {
  const calc=ss.getSheetByName('_Месяц_расчёт');
  if(!calc)return {disabled:true};
  const view=ss.getSheetByName('Месяц');
  const key=JSON.stringify(view.getRange('B2').getValue());
  if(JSON.stringify(calc.getRange('B2').getValue())!==key)return {pending:true};
  const rows=calc.getMaxRows(),cols=calc.getMaxColumns();
  const data=calc.getRange(3,1,rows-2,cols).getValues();
  const digest=Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,JSON.stringify([key,data])).map(b=>('0'+((b+256)%256).toString(16)).slice(-2)).join('');
  const props=PropertiesService.getScriptProperties(),cursor='sgv.report.v1.'+ss.getId();
  if(props.getProperty(cursor)===digest&&JSON.stringify(view.getRange(3,1,rows-2,cols).getValues())===JSON.stringify(data))return {unchanged:true};
  if(JSON.stringify(view.getRange('B2').getValue())!==key)return {pending:true};
  // Paste values preserves report formats and protections; B2 is never overwritten.
  // Copy the captured snapshot, not live calculation cells that could switch periods mid-copy.
  let stage=ss.getSheetByName('_Месяц_значения');
  if(!stage){stage=ss.insertSheet('_Месяц_значения');stage.hideSheet();}
  if(stage.getMaxRows()<rows)stage.insertRowsAfter(stage.getMaxRows(),rows-stage.getMaxRows());
  if(stage.getMaxColumns()<cols)stage.insertColumnsAfter(stage.getMaxColumns(),cols-stage.getMaxColumns());
  const buffer=stage.getRange(3,1,rows-2,cols);buffer.setValues(sgvLiteralValues_(data));
  if(JSON.stringify(view.getRange('B2').getValue())!==key){buffer.clearContent();return {pending:true};}
  buffer.copyTo(view.getRange(3,1,rows-2,cols),SpreadsheetApp.CopyPasteType.PASTE_VALUES,false);
  buffer.clearContent();
  if(JSON.stringify(view.getRange('B2').getValue())!==key){view.getRange('H4').setValue('Обновление отчёта…');return {pending:true};}
  props.setProperty(cursor,digest);
  return {updated:true};
}
