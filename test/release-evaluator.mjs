import {run} from 'node:test';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const prefix=process.argv[2]??'C-001';
if(!/^C-\d{3,}$/.test(prefix)||process.argv.length>3)throw Error('Usage: node test/release-evaluator.mjs C-001');
const {cases}=JSON.parse(await fs.readFile(path.join(root,'test/release-cases.json')));
const expected=new Map(cases.map(c=>[c.name,c]));
const files=[...new Set(cases.map(c=>path.join(root,c.file)))];
const observed=new Map(),problems=[],summaries=[];
const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),90000);
try{
 for await(const event of run({files,concurrency:1,isolation:'process',execArgv:[],timeout:15000,signal:controller.signal})){
  const d=event.data??{};
  if(event.type==='test:pass'||event.type==='test:fail'){
   const want=expected.get(d.name),rows=observed.get(d.name)??[];
   rows.push({type:event.type,skip:d.skip??false,todo:d.todo??false,error:d.details?.error?.message??null});observed.set(d.name,rows);
   if(!want||d.file!==path.join(root,want.file)||d.entryFile!==d.file||d.nesting!==0||d.details?.type!=='test')problems.push('Unexpected case/origin: '+d.name);
  }else if(event.type==='test:summary')summaries.push(d);
  else if(event.type==='test:interrupted')problems.push('Interrupted execution');
 }
}catch(e){problems.push('Harness failure: '+e.message);}finally{clearTimeout(timer);}
const final=summaries.filter(s=>s.file===undefined&&s.entryFile===undefined);
if(summaries.length!==files.length+1||final.length!==1)problems.push('Missing structured file/run summaries');
for(const file of files)if(summaries.filter(s=>s.file===file&&s.entryFile===file).length!==1)problems.push('Missing file summary: '+file);
if(final.length===1){const c=final[0].counts??{};if(c.tests!==cases.length||c.topLevel!==cases.length||c.cancelled||c.skipped||c.todo||c.suites)problems.push('Incomplete/cancelled/skipped run');}
for(const c of cases)if((observed.get(c.name)??[]).length!==1)problems.push('Missing/duplicate case: '+c.name);
const operations=[...new Set(cases.map(c=>c.operation))].map(operation=>{
 const rows=cases.filter(c=>c.operation===operation).map(c=>({name:c.name,results:observed.get(c.name)??[]}));
 const pass=!problems.length&&rows.every(c=>c.results.length===1&&c.results[0].type==='test:pass'&&!c.results[0].skip&&!c.results[0].todo);
 return {id:prefix+':'+operation,status:pass?'pass':'fail',evidence:JSON.stringify({problems,cases:rows})};
});
console.log(JSON.stringify({version:1,operations,summary:'Required named compatibility, ownership, publication and explicit ISC obligations. Real local test execution; no crash/distributed assurance or human acceptance.'}));
if(operations.some(o=>o.status!=='pass'))process.exitCode=1;
