/** Shared by bound UI and the existing API. Financial formulas remain live on a hidden sheet. */
function sgvLiteralValues_(rows){return rows.map(row=>row.map(v=>typeof v==='string'&&v.charAt(0)==='='?"'"+v:v));}
/** Smallest rectangle covering differences; cells outside it are left untouched. */
function sgvChangedBox_(expected,actual){
  let firstRow=expected.length,lastRow=-1,firstCol=Infinity,lastCol=-1;
  expected.forEach((row,r)=>row.forEach((v,c)=>{if(JSON.stringify(v)!==JSON.stringify(actual[r]&&actual[r][c])){
    firstRow=Math.min(firstRow,r);lastRow=Math.max(lastRow,r);firstCol=Math.min(firstCol,c);lastCol=Math.max(lastCol,c);
  }}));
  return lastRow<0?null:{row:firstRow,col:firstCol,rows:lastRow-firstRow+1,cols:lastCol-firstCol+1};
}
function sgvReportRefresh_(ss) {
  const calc=ss.getSheetByName('_Месяц_расчёт');
  if(!calc)return {disabled:true};
  const view=ss.getSheetByName('Месяц');
  const key=JSON.stringify(view.getRange('B2').getValue());
  if(JSON.stringify(calc.getRange('B2').getValue())!==key)return {pending:true};
  const rows=calc.getMaxRows(),cols=calc.getMaxColumns();
  const data=calc.getRange(3,1,rows-2,cols).getValues();
  const box=sgvChangedBox_(data,view.getRange(3,1,rows-2,cols).getValues());
  if(!box)return {unchanged:true};
  if(JSON.stringify(view.getRange('B2').getValue())!==key)return {pending:true};
  const values=data.slice(box.row,box.row+box.rows).map(row=>row.slice(box.col,box.col+box.cols));
  view.getRange(box.row+3,box.col+1,box.rows,box.cols).setValues(sgvLiteralValues_(values));
  if(JSON.stringify(view.getRange('B2').getValue())!==key){view.getRange('H4').setValue('Обновление отчёта…');return {pending:true};}
  return {updated:true,writtenCells:box.rows*box.cols};
}
