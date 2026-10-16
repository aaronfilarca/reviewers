import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const directory=path.join(root,'docs','quizzes');
const preferred=['ai-ot','applied-ai-finals','operating-systems'];
const entries=fs.readdirSync(directory).filter(name=>name.endsWith('.json')).map(name=>{
  const slug=name.slice(0,-5);
  assert(/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug),'Unsafe quiz filename: '+name);
  const bank=JSON.parse(fs.readFileSync(path.join(directory,name),'utf8'));
  assert.equal(bank.schemaVersion,2,slug+' schema');
  assert(typeof bank.title==='string'&&bank.title.trim(),slug+' title');
  assert(Array.isArray(bank.questions)&&bank.questions.length,slug+' questions');
  assert.equal(new Set(bank.questions.map(q=>q.id)).size,bank.questions.length,slug+' duplicate question IDs');
  const modules=new Set((bank.modules||[]).map(m=>m.id));
  for(const q of bank.questions){
    assert(q.prompt&&q.id&&modules.has(q.moduleId),slug+' missing prompt or module');
    assert(['mcq','scenario_mcq','multi_select','true_false','fill_blank'].includes(q.type),slug+' unsupported question type');
    if(q.reviewOnly===true)continue;
    if(q.type==='fill_blank')assert(q.acceptedAnswers?.length,slug+' missing accepted blank answers');
    else{
      assert(q.choices?.length>=2,slug+' missing choices');
      assert(q.correctChoiceIds?.length>=1,slug+' missing answer key');
      assert.equal(q.selectionCount,q.correctChoiceIds.length,slug+' selection count');
      assert(q.correctChoiceIds.every(id=>q.choices.some(c=>c.id===id)),slug+' unknown answer choice');
    }
  }
  return {slug,title:bank.title,description:bank.description||bank.provenance?.statement||'',questionCount:bank.questions.length,moduleCount:bank.modules.length,mockCount:bank.mocks?.length||0,reviewOnlyCount:bank.questions.filter(q=>q.reviewOnly===true).length,jsonPath:`quizzes/${name}`,badge:bank.catalogueBadge||'Reviewer'};
}).sort((a,b)=>{
  const ai=preferred.indexOf(a.slug),bi=preferred.indexOf(b.slug);
  return (ai<0?100:ai)-(bi<0?100:bi)||a.title.localeCompare(b.title);
});
assert.equal(new Set(entries.map(q=>q.slug)).size,entries.length);
const catalogue={schemaVersion:1,quizzes:entries};
fs.writeFileSync(path.join(root,'docs','quizzes.json'),JSON.stringify(catalogue,null,2)+'\n');
console.log(JSON.stringify(entries.map(q=>({slug:q.slug,questions:q.questionCount,reviewOnly:q.reviewOnlyCount})),null,2));
