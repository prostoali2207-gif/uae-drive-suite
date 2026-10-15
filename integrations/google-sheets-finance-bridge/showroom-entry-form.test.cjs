const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync(__dirname+'/ShowroomEntryForm.html','utf8');
const elements={};
for(const id of ['date','account','operation','subcategory','subcategoryHint','message','submit','entryForm','amount','note']) elements[id]={value:'',textContent:'',className:'',disabled:false,addEventListener(event,fn){this[event]=fn},appendChild(){},innerHTML:''};
let success,failure,calls=[];
const run={withSuccessHandler(fn){success=fn;return this},withFailureHandler(fn){failure=fn;return this},showroomEntryGetData(){success({request_id:'sge-original-request-12345',accounts:['Касса'],operations:[{operation:'покупка',subcategories:['Lexus']}]})},showroomEntrySubmit(data){calls.push({data,success,failure})}};
vm.runInNewContext(html.match(/<script>([\s\S]*?)<\/script>/)[1],{document:{getElementById:id=>elements[id],createElement:()=>({})},google:{script:{run}},Intl,Date,crypto:{randomUUID:()=> 'next-request-123456789'}});
function fill(){elements.account.value='Касса';elements.operation.value='покупка';elements.subcategory.value='Lexus';elements.subcategory.disabled=false;elements.amount.value='17';elements.note.value='Отдельный платёж';}
const submit=()=>elements.entryForm.submit({preventDefault(){}});
fill();submit();submit();assert.equal(calls.length,1);assert.equal(elements.submit.disabled,true);
calls[0].failure({message:'Network timeout'});submit();assert.equal(calls.length,2);assert.equal(calls[1].data.request_id,calls[0].data.request_id);
calls[1].success({row:70,warning:'Возможный дубль'});assert.match(elements.message.textContent,/Возможный дубль/);assert.match(elements.message.textContent,/70/);assert.equal(elements.amount.value,'');
fill();submit();assert.notEqual(calls[2].data.request_id,calls[1].data.request_id);
console.log('PASS: double submit blocked; retry retains ID; confirmed success rotates ID; duplicate warning remains visible.');
