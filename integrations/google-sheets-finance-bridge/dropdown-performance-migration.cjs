/** Pure migration builder. Apply only to _ДДС anchors AJ5:AJ1004 and BO5:BO1004.
 * Native QA must compare the entire spilled outputs AJ:CH before publishing.
 * No ledger, category or amount is changed. Existing nonempty controls retain the original formula.
 */
function guardDropdownFormula(formula, row, column) {
  if (!Number.isInteger(row) || row<5 || row>1004 || ![36,67].includes(column)) throw Error('Unexpected dropdown anchor');
  if (formula.startsWith('=IF(')) return formula;
  if (!formula.startsWith('=IFERROR(TRANSPOSE(FILTER(')) throw Error('Unexpected live dropdown formula');
  const blank=column===36?`OR('Ввод операций'!$V${row}="";'Ввод операций'!$W${row}="")`:`'Ввод операций'!$X${row}=""`;
  return `=IF(${blank};"";${formula.slice(1)})`;
}
function buildDropdownRequests(anchors,sheetId) {
  return [36,67].map(column=>{
    const items=anchors.filter(x=>x.c===column).sort((a,b)=>a.r-b.r);
    if(items.length!==1000 || items.some((x,i)=>x.r!==i+5))throw Error('Incomplete live anchor read');
    return {updateCells:{range:{sheetId,startRowIndex:4,endRowIndex:1004,startColumnIndex:column-1,endColumnIndex:column},rows:items.map(x=>({values:[{userEnteredValue:{formulaValue:guardDropdownFormula(x.f,x.r,column)}}]})),fields:'userEnteredValue'}};
  });
}
module.exports={guardDropdownFormula,buildDropdownRequests};
