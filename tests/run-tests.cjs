'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../docs');
const QuizSession = require('../docs/quiz-engine.js');
const hub = require('../docs/reviewer-data.js');
const fixtureBank = {
  title: 'Test reviewer', description: 'A custom study bank.',
  schemaVersion: 2,
  modules: [{id:'module-1',number:1,title:'Foundations',questionCount:2},{id:'module-2',number:2,title:'Learning',questionCount:2},{id:'module-3',number:3,title:'Applications',questionCount:1}],
  mocks: [{id:'mock-1',title:'Practice Set 1',questionCount:3},{id:'mock-2',title:'Practice Set 2',questionCount:2}],
  sources: [{id:'course',title:'Course material',url:'https://example.edu/course'}],
  questions: [
    {id:'aai-q001',moduleId:'module-1',mockId:'mock-1',number:1,type:'mcq',prompt:'Which task uses labels?',topic:'Learning',choices:[{id:'a',text:'Supervised learning'},{id:'b',text:'Clustering'}],correctChoiceIds:['a'],selectionCount:1,explanation:'Known targets guide supervised learning.',sourceIds:['course']},
    {id:'aai-q002',moduleId:'module-2',mockId:'mock-1',number:2,type:'scenario_mcq',prompt:'A model predicts a number. Which task is this?',topic:'Regression',choices:[{id:'a',text:'Regression'},{id:'b',text:'Classification'}],correctChoiceIds:['a'],selectionCount:1,explanation:'Regression predicts numerical values.',sourceIds:['course']},
    {id:'aai-q003',moduleId:'module-2',mockId:'mock-2',number:3,type:'multi_select',prompt:'Select the supervised tasks.',topic:'Learning',choices:[{id:'a',text:'Regression'},{id:'b',text:'Clustering'},{id:'c',text:'Classification'}],correctChoiceIds:['a','c'],selectionCount:2,explanation:'Regression and classification learn from targets.',sourceIds:['course']},
    {id:'aai-q004',moduleId:'module-1',mockId:'mock-2',number:4,type:'true_false',prompt:'AI always learns from data.',topic:'AI',choices:[{id:'a',text:'True'},{id:'b',text:'False'}],correctChoiceIds:['b'],selectionCount:1,explanation:'Rule-based systems can use authored rules.',sourceIds:['course']},
    {id:'aai-q005',moduleId:'module-3',mockId:'mock-1',number:5,type:'fill_blank',prompt:'Learning from labeled data is ____ learning.',topic:'Learning',choices:[],correctChoiceIds:[],selectionCount:0,acceptedAnswers:['supervised','supervised learning'],answerText:'supervised',explanation:'Supervised learning uses known output labels.',sourceIds:['course']}
  ]
};
const memoryStorage = () => {
  const values = new Map();
  return {getItem:(key)=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),values};
};
let count = 0;
async function check(name, action) { await action(); count++; process.stdout.write(`PASS ${name}\n`); }
(async function main() {

await check('mixed question schema validates choices, aliases, IDs, and question types', () => {
  assert.equal(new QuizSession(fixtureBank.questions).stats().total, 5);
  const invalid = (change) => {
    const questions = structuredClone(fixtureBank.questions);
    change(questions);
    assert.throws(() => new QuizSession(questions), TypeError);
  };
  invalid((q)=>{q[1].id=q[0].id;});
  invalid((q)=>{q[4].acceptedAnswers=['   '];});
  invalid((q)=>{q[0].correctChoiceIds=['z'];});
  invalid((q)=>{q[0].selectionCount=2;});
  invalid((q)=>{q[0].type='unsupported';});
});
await check('single, scenario, true/false and multi-select grade and lock correctly', () => {
  const session = new QuizSession(fixtureBank.questions);
  assert.equal(session.answer('aai-q001',['a']).correct,true);
  assert.equal(session.answer('aai-q002',['b']).correct,false);
  assert.equal(session.answer('aai-q004',['b']).correct,true);
  assert.equal(session.answer('aai-q003',['c']),null);
  assert.equal(session.stats().answered,3);
  assert.equal(session.answer('aai-q003',['c','a']).correct,true);
  assert.equal(session.answer('aai-q002',['a']).correct,false);
  const other = new QuizSession(fixtureBank.questions);
  assert.equal(other.answer('aai-q003',['a','b']).correct,false);
  assert.throws(()=>new QuizSession(fixtureBank.questions).answer('aai-q003',['a','a']),RangeError);
});
await check('blanks accept explicit aliases and case/space variations without fuzzy matching', () => {
  for (const text of ['supervised','  SUPERVISED   LEARNING  ','Ｓｕｐｅｒｖｉｓｅｄ']) {
    assert.equal(new QuizSession(fixtureBank.questions).answer('aai-q005',text).correct,true);
  }
  for (const text of ['unsupervised','supervise','supervised?']) {
    assert.equal(new QuizSession(fixtureBank.questions).answer('aai-q005',text).correct,false);
  }
  assert.throws(()=>new QuizSession(fixtureBank.questions).answer('aai-q005',' \n '),RangeError);
  assert.throws(()=>new QuizSession(fixtureBank.questions).answer('aai-q005',['supervised']),RangeError);
});
await check('case-sensitive code blanks reject the wrong capitalization and restore correctly', () => {
  const questions=structuredClone(fixtureBank.questions);
  Object.assign(questions[4],{acceptedAnswers:['StandardScaler'],answerText:'StandardScaler',caseSensitive:true});
  assert.equal(new QuizSession(questions).answer('aai-q005','  StandardScaler  ').correct,true);
  assert.equal(new QuizSession(questions).answer('aai-q005','standardscaler').correct,false);
  const storage=memoryStorage();
  new QuizSession(questions,{storage}).answer('aai-q005','standardscaler');
  assert.equal(new QuizSession(questions,{storage}).answers['aai-q005'].correct,false);
});
await check('combined filters, shuffle, retry and reset preserve unrelated correct answers', () => {
  const session = new QuizSession(fixtureBank.questions,{random:()=>0});
  assert.deepEqual(session.getVisibleIds('module-1','mock-1'),['aai-q001']);
  assert.deepEqual(session.getVisibleIds('all','mock-1'),['aai-q001','aai-q002','aai-q005']);
  session.answer('aai-q001',['a']);
  session.answer('aai-q005','wrong');
  session.answer('aai-q003',['b']);
  session.shuffle();
  assert.equal(new Set(session.order).size,5);
  assert.equal(session.retryMissed(),2);
  assert.deepEqual(session.getVisibleIds().sort(),['aai-q003','aai-q005']);
  assert.equal(session.answers['aai-q001'].correct,true);
  session.answer('aai-q005','supervised learning');
  assert.equal(session.stats().correct,2);
  session.exitRetry();
  assert.equal(session.getVisibleIds().length,5);
  session.reset();
  assert.equal(session.stats().answered,0);
  assert.deepEqual(session.order,fixtureBank.questions.map((question)=>question.id));
});
await check('choice and blank responses restore, recompute scores, and isolate OS storage', () => {
  const storage = memoryStorage();
  storage.setItem('kernel-os-reviewer-v1','OS progress');
  const session = new QuizSession(fixtureBank.questions,{storage});
  session.answer('aai-q001',['a']);
  session.answer('aai-q005',' SUPERVISED ');
  session.answer('aai-q003',['b']);
  session.shuffle();
  const saved = JSON.parse(storage.getItem('kernel-reviewers:session:v2'));
  saved.answers['aai-q005'].correct=false;
  saved.answers['aai-q003'].correct=true;
  saved.answers['aai-q004']={selectedIds:['unknown'],correct:true};
  storage.setItem('kernel-reviewers:session:v2',JSON.stringify(saved));
  const restored = new QuizSession(fixtureBank.questions,{storage});
  assert.deepEqual(restored.stats(),{total:5,scorableTotal:5,answered:3,correct:2,incorrect:1,remaining:2,accuracy:67});
  assert.deepEqual(restored.order,session.order);
  restored.retryMissed();
  const retry = new QuizSession(fixtureBank.questions,{storage});
  assert.deepEqual(retry.getVisibleIds(),['aai-q003']);
  retry.reset();
  assert.equal(storage.getItem('kernel-os-reviewer-v1'),'OS progress');
});
await check('corrupt, stale, or denied storage does not prevent practice', () => {
  for (const raw of ['{broken','null','[]','{"version":1}','{"version":2,"answers":{"aai-q005":{"text":" "}}}']) {
    const storage = memoryStorage();storage.setItem('kernel-reviewers:session:v2',raw);
    assert.equal(new QuizSession(fixtureBank.questions,{storage}).stats().answered,0);
  }
  const storage={getItem(){throw Error('Denied');},setItem(){throw Error('Full');}};
  assert.equal(new QuizSession(fixtureBank.questions,{storage}).answer('aai-q005','supervised').correct,true);
});

const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const app=fs.readFileSync(path.join(root,'app.js'),'utf8');
const engine=fs.readFileSync(path.join(root,'quiz-engine.js'),'utf8');
async function fixture(bank=fixtureBank, storage=memoryStorage(), options={}) {
  const slug=options.slug || 'fixture';
  const registry=options.registry || {schemaVersion:1, quizzes:[{slug,title:bank.title,description:bank.description,questionCount:bank.questions.length,moduleCount:bank.modules.length,mockCount:(bank.mocks||[]).length,jsonPath:`quizzes/${slug}.json`}]};
  const fetched=[];

  const nodes=new Map(),cards=new Map();
  let moduleNodes=[];
  class Element {
    constructor(id='') {
      this.id=id;this.dataset={};this.style={};this.attributes=new Map();this.listeners=new Map();
      this.classes=new Set();this.textContent='';this.value='';this.returnValue='';this._html='';
      this.classList={add:(name)=>this.classes.add(name),remove:(name)=>this.classes.delete(name),
        toggle:(name,force)=>{const next=force===undefined?!this.classes.has(name):force;if(next)this.classes.add(name);else this.classes.delete(name);return next;},contains:(name)=>this.classes.has(name)};
    }
    get innerHTML(){return this._html;}
    set innerHTML(value){
      this._html=value;
      if(this.id==='questions'){
        cards.clear();
        for(const match of value.matchAll(/<article class="question-card" id="([^"]+)" data-list-number="([^"]+)"[^>]*>([\s\S]*?)<\/article>/g)){
          const card=new Element(match[1]);card.dataset.listNumber=match[2];card.innerHTML=match[3];cards.set(card.id,card);
        }
      }
      if(this.id==='module-nav')moduleNodes=[...value.matchAll(/data-module="([^"]+)"/g)].map((match)=>{const node=new Element();node.dataset.module=match[1];return node;});
    }
    setAttribute(name,value){this.attributes.set(name,value);}
    addEventListener(name,handler){this.listeners.set(name,handler);}
    dispatch(name,target=this){let prevented=false;this.listeners.get(name)?.({target,preventDefault(){prevented=true;}});return prevented;}
    closest(selector){
      if(selector==='[data-choice]')return this.dataset.choice?this:null;
      if(selector==='[data-module]')return this.dataset.module?this:null;
      if(selector==='form[data-blank]')return this.dataset.blank?this:this.form||null;
      return null;
    }
    querySelector(selector){if(selector==='input[name="answer"]')return this.input;if(selector==='.feedback'&&!this.innerHTML.includes('class="feedback'))return null;return new Element();}
    querySelectorAll(){return [];}
    focus(){}scrollIntoView(){}showModal(){this.open=true;}reportValidity(){this.validityReported=true;}
  }
  for(const match of html.matchAll(/<[^>]+\bid="([^"]+)"[^>]*>/g)){
    const node=new Element(match[1]);
    const classes=match[0].match(/class="([^"]*)"/);
    if(classes)for(const name of classes[1].split(/\s+/))node.classes.add(name);
    nodes.set(match[1],node);
  }
  const bar=new Element();
  const document={getElementById:(id)=>cards.get(id)||nodes.get(id),querySelector:(selector)=>selector==='[role="progressbar"]'?bar:null,
    querySelectorAll:(selector)=>selector==='.module-nav-item'?moduleNodes:[]};
  const window={ReviewerData:hub,location:{search:options.search ?? `?q=${slug}`},localStorage:storage,
    fetch:async (url)=>{
      fetched.push(url);
      if(options.fail)throw Error('Network unavailable');
      return {ok:true,json:async()=>url==='quizzes.json'?registry:bank};
    }};
  const context={window,globalThis:window,document,setTimeout:()=>0,clearTimeout(){}};
  vm.runInNewContext(engine,context);await vm.runInNewContext(app,context);
  return {nodes,cards,storage,document,bar,fetched,
    click:(id)=>nodes.get(id).dispatch('click'),
    select:(kind,id)=>nodes.get(`${kind}-select`).dispatch('change',{value:id}),
    answer:(id,choice)=>{const node=new Element();node.dataset={question:id,choice};nodes.get('questions').dispatch('click',node);},
    blank:(id,value,submit=true)=>{const form=new Element();form.dataset.blank=id;form.input=new Element();form.input.value=value;form.input.form=form;nodes.get('questions').dispatch('input',form.input);return submit?nodes.get('questions').dispatch('submit',form):form;},
    stats:()=>['total','answered','correct','incorrect'].map((name)=>Number(nodes.get(`stat-${name}`).textContent)),
    state:()=>JSON.parse(storage.getItem(hub.storageKey(slug))),
    visible:()=>[...cards.keys()],
    explanations:()=>[...cards.values()].filter((card)=>card.innerHTML.includes('feedback-explanation')).length
  };
}
await check('real app renders each native type, course sources, and combined filters', async () => {
  const view=await fixture();
  assert.equal(view.cards.size,5);assert.deepEqual(view.stats(),[5,0,0,0]);
  assert.match(view.cards.get('aai-q005').innerHTML,/type="text"/);
  assert.match(view.cards.get('aai-q005').innerHTML,/type="submit"/);
  assert.doesNotMatch(view.cards.get('aai-q001').innerHTML,/Check answer/);
  view.select('mock','mock-1');assert.equal(view.cards.size,3);
  view.select('module','module-3');assert.deepEqual(view.visible(),['aai-q005']);
  view.select('mock','mock-2');assert.equal(view.cards.size,0);
  view.click('all-modules');assert.equal(view.cards.size,5);
  view.answer('aai-q001','a');assert.deepEqual(view.stats(),[5,1,1,0]);
  assert.match(view.cards.get('aai-q001').innerHTML,/https:\/\/example.edu\/course/);
});
await check('native blank submit, draft retention, empty validation, and score lock work through app handlers', async () => {
  const view=await fixture();
  view.blank('aai-q005','supervised',false);
  view.select('mock','mock-1');assert.match(view.cards.get('aai-q005').innerHTML,/value="supervised"/);
  assert.equal(view.blank('aai-q005','   '),true);assert.deepEqual(view.stats(),[5,0,0,0]);
  assert.equal(view.blank('aai-q005','  SUPERVISED  '),true);assert.deepEqual(view.stats(),[5,1,1,0]);
  assert.match(view.cards.get('aai-q005').innerHTML,/class="blank-input correct"/);
  view.blank('aai-q005','wrong');assert.deepEqual(view.stats(),[5,1,1,0]);
});
await check('app multi-select waits for every correct choice and retries missed blanks', async () => {
  const view=await fixture();
  view.answer('aai-q003','c');assert.deepEqual(view.stats(),[5,0,0,0]);
  view.answer('aai-q003','a');assert.deepEqual(view.stats(),[5,1,1,0]);
  view.blank('aai-q005','wrong');assert.deepEqual(view.stats(),[5,2,1,1]);
  view.click('retry-button');assert.deepEqual(view.visible(),['aai-q005']);assert.deepEqual(view.stats(),[5,1,1,0]);
  view.blank('aai-q005','supervised learning');assert.deepEqual(view.stats(),[5,2,2,0]);
});
await check('show-all, shuffle, reload, and reset work across mixed formats without changing OS progress', async () => {
  const storage=memoryStorage();storage.setItem('kernel-os-reviewer-v1','existing OS score');
  let view=await fixture(fixtureBank,storage);
  view.answer('aai-q001','a');view.blank('aai-q005','wrong');
  view.click('show-answers');assert.equal(view.explanations(),5);assert.deepEqual(view.stats(),[5,2,1,1]);
  assert.match(view.cards.get('aai-q005').innerHTML,/required[^>]*disabled/);
  view.click('show-answers');assert.equal(view.explanations(),2);
  view.click('shuffle-button');const order=view.state().order;
  view=await fixture(fixtureBank,storage);assert.deepEqual(view.visible(),order);assert.deepEqual(view.stats(),[5,2,1,1]);
  view.click('reset-button');assert.equal(view.nodes.get('reset-dialog').open,true);
  view.nodes.get('reset-dialog').returnValue='cancel';view.nodes.get('reset-dialog').dispatch('close');assert.deepEqual(view.stats(),[5,2,1,1]);
  view.nodes.get('reset-dialog').returnValue='reset';view.nodes.get('reset-dialog').dispatch('close');assert.deepEqual(view.stats(),[5,0,0,0]);
  assert.equal(storage.getItem('kernel-os-reviewer-v1'),'existing OS score');
});
await check('question, response, and source markup is escaped in rendered content', async () => {
  const bank=structuredClone(fixtureBank);
  bank.questions[4].prompt='<script>alert(1)</script>';
  bank.sources[0].title='<img onerror="alert(1)">';
  bank.sources[0].url='javascript:alert(1)';
  const view=await fixture(bank);
  assert.doesNotMatch(view.cards.get('aai-q005').innerHTML,/<script>/);
  view.blank('aai-q005','<b>wrong</b>');
  const content=view.cards.get('aai-q005').innerHTML;
  assert.match(content,/&lt;b&gt;wrong&lt;\/b&gt;/);
  assert.doesNotMatch(content,/href="javascript:/);
  assert.doesNotMatch(content,/<img onerror=/);
});
await check('catalogue lists safe reviewer routes and JSON downloads, supports search, and only fetches the registry', async () => {
  const registry={schemaVersion:1,quizzes:[
    {slug:'ai-ot',title:'AI - OT',description:'PDF questions',questionCount:50,moduleCount:3,mockCount:0,jsonPath:'quizzes/ai-ot.json',badge:'From your PDF'},
    {slug:'other',title:'<img src=x onerror=alert(1)>',description:'<script>bad()</script>',questionCount:12,moduleCount:1,mockCount:0,jsonPath:'quizzes/other.json'}
  ]};
  const view=await fixture(fixtureBank,memoryStorage(),{registry,search:''});
  assert.deepEqual(view.fetched,['quizzes.json']);
  assert.equal(view.nodes.get('catalogue-view').classList.contains('hidden'),false);
  assert.equal(view.nodes.get('quiz-view').classList.contains('hidden'),true);
  assert.equal(view.nodes.get('catalogue-bank-count').textContent,'2 reviewers');
  assert.equal(view.nodes.get('catalogue-question-count').textContent,'62 questions to explore');
  const content=view.nodes.get('catalogue-list').innerHTML;
  assert.match(content,/href="\?q=ai-ot"/);
  assert.match(content,/href="quizzes\/ai-ot.json" download="ai-ot.json"/);
  assert.match(content,/&lt;img/);assert.doesNotMatch(content,/<script>|<img /);
  view.nodes.get('catalogue-search').value='PDF';view.nodes.get('catalogue-search').dispatch('input');
  assert.match(view.nodes.get('catalogue-list').innerHTML,/AI - OT/);
  assert.doesNotMatch(view.nodes.get('catalogue-list').innerHTML,/\?q=other/);
  view.nodes.get('catalogue-search').value='missing';view.nodes.get('catalogue-search').dispatch('input');
  assert.equal(view.nodes.get('catalogue-empty').classList.contains('hidden'),false);
});
await check('routing whitelists registered bank paths and never fetches a query URL', async () => {
  const entry={slug:'ai-ot',title:'AI - OT',questionCount:50,jsonPath:'quizzes/ai-ot.json'};
  const quizzes=hub.validateRegistry({schemaVersion:1,quizzes:[entry]});
  assert.equal(hub.resolveRoute('?q=ai-ot',quizzes).quiz,entry);
  assert.equal(hub.resolveRoute('?q=https://example.com/bank.json',quizzes).type,'missing');
  assert.equal(hub.resolveRoute('?q=../secrets',quizzes).type,'missing');
  for(const jsonPath of ['https://example.com/bank.json','../bank.json','quizzes/other.json','/quizzes/ai-ot.json']) {
    assert.throws(()=>hub.validateRegistry({schemaVersion:1,quizzes:[{...entry,jsonPath}]}));
  }
  assert.throws(()=>hub.validateRegistry({schemaVersion:1,quizzes:[entry,entry]}));
  const view=await fixture(fixtureBank,memoryStorage(),{search:'?q=https%3A%2F%2Fexample.com%2Fevil.json'});
  assert.deepEqual(view.fetched,['quizzes.json']);
  assert.equal(view.nodes.get('error-state').classList.contains('hidden'),false);
  assert.match(view.nodes.get('error-message').textContent,/No reviewer named/);
});
await check('failed requests and malformed data produce useful recoverable errors', async () => {
  await assert.rejects(hub.loadPage('',async()=>({ok:false,status:503})),/HTTP 503/);
  await assert.rejects(hub.loadPage('',async()=>({ok:true,json:async()=>{throw Error('parse');}})),/not valid JSON/);
  const view=await fixture(fixtureBank,memoryStorage(),{fail:true});
  assert.equal(view.nodes.get('loading-state').classList.contains('hidden'),true);
  assert.equal(view.nodes.get('error-state').classList.contains('hidden'),false);
  assert.match(view.nodes.get('error-message').textContent,/connection/);
});
await check('all quiz metadata is bank specific and banks without mocks hide the set filter', async () => {
  const bank=structuredClone(fixtureBank);
  bank.title='<b>A custom title</b>';bank.description='<img onerror=alert(1)> Study this bank.';
  delete bank.mocks;delete bank.provenance;
  let view=await fixture(bank);
  assert.equal(view.nodes.get('page-title').textContent,bank.title);
  assert.equal(view.document.title,`${bank.title} · Kernel`);
  assert.equal(view.nodes.get('breadcrumb-title').textContent,bank.title);
  assert.equal(view.nodes.get('intro-description').textContent,bank.description);
  assert.match(view.nodes.get('reset-description').textContent,/custom title/);
  assert.equal(view.nodes.get('mock-filter').classList.contains('hidden'),true);
  assert.equal(view.nodes.get('provenance-notice').classList.contains('hidden'),true);
  bank.provenance={statement:'The key is independently inferred. <script>unsafe()</script>'};
  view=await fixture(bank);
  assert.equal(view.nodes.get('provenance-notice').textContent,bank.provenance.statement);
  assert.equal(view.nodes.get('provenance-notice').classList.contains('hidden'),false);
});
await check('shared question IDs remain isolated by reviewer and resetting one bank keeps the others', async () => {
  const storage=memoryStorage();
  storage.setItem('kernel-os-reviewer-v1','old OS progress');storage.setItem('applied-ai-finals-v2','old AI progress');
  let first=await fixture(fixtureBank,storage,{slug:'first'});
  first.answer('aai-q001','a');
  let second=await fixture(fixtureBank,storage,{slug:'second'});
  assert.deepEqual(second.stats(),[5,0,0,0]);second.blank('aai-q005','wrong');
  first=await fixture(fixtureBank,storage,{slug:'first'});assert.deepEqual(first.stats(),[5,1,1,0]);
  first.nodes.get('reset-dialog').returnValue='reset';first.nodes.get('reset-dialog').dispatch('close');
  second=await fixture(fixtureBank,storage,{slug:'second'});assert.deepEqual(second.stats(),[5,1,0,1]);
  assert.equal(storage.getItem('kernel-os-reviewer-v1'),'old OS progress');
  assert.equal(storage.getItem('applied-ai-finals-v2'),'old AI progress');
  const card=hub.catalogueCard({slug:'second',title:'Second',questionCount:5,jsonPath:'quizzes/second.json'},hub.savedProgress(storage,{slug:'second'}));
  assert.match(card,/1 of 5 answered/);
});
await check('incomplete source items remain visible and unscored without changing accuracy, completion, retry or saved answers', async () => {
  const bank=structuredClone(fixtureBank);
  Object.assign(bank.questions[1],{reviewOnly:true,correctChoiceIds:[],selectionCount:0,explanation:'The source is cut off.',notes:'<b>Missing source options</b>'});
  const storage=memoryStorage();
  const session=new QuizSession(bank.questions,{storage,storageKey:hub.storageKey('fixture')});
  assert.equal(session.stats().total,5);assert.equal(session.stats().scorableTotal,4);
  assert.equal(session.stats().remaining,4);
  assert.throws(()=>session.answer('aai-q002',['a']),/review only/);
  session.answer('aai-q001',['b']);
  assert.deepEqual(session.getMissedIds(),['aai-q001']);
  assert.equal(session.stats().accuracy,0);
  session.retryMissed();assert.deepEqual(session.getVisibleIds(),['aai-q001']);session.exitRetry();
  let view=await fixture(bank,storage);
  const item=view.cards.get('aai-q002').innerHTML;
  assert.match(item,/Review item · unscored/);assert.match(item,/The source is cut off/);
  assert.match(item,/&lt;b&gt;Missing source options&lt;\/b&gt;/);
  assert.doesNotMatch(item,/The correct answer|class="answer-key"/);
  assert.match(item,/data-choice="a"[^>]+disabled/);
  assert.equal(view.bar.attributes.get('aria-valuemax'),4);
  assert.match(view.nodes.get('unscored-notice').textContent,/1 item is for review only/);
  view.answer('aai-q002','a');assert.deepEqual(view.stats(),[5,0,0,0]);
  for(const question of bank.questions){if(question.reviewOnly)continue;if(question.type==='fill_blank')view.blank(question.id,question.acceptedAnswers[0]);else for(const choice of question.correctChoiceIds)view.answer(question.id,choice);}
  assert.deepEqual(view.stats(),[5,4,4,0]);assert.equal(view.nodes.get('progress-percent').textContent,100);
  view=await fixture(bank,storage);assert.deepEqual(view.stats(),[5,4,4,0]);
  assert.equal(view.state().answers['aai-q002'],undefined);
  const card=hub.catalogueCard({slug:'fixture',title:'Mixed',questionCount:5,jsonPath:'quizzes/fixture.json'},hub.savedProgress(storage,{slug:'fixture'}));
  assert.match(card,/4 of 4 scored items answered/);assert.match(card,/100%/);
});
const registryPath=path.join(root,'quizzes.json');
if(fs.existsSync(registryPath)){
  await check('every registered published bank renders and its scorable answer keys grade correctly',async()=>{
    const quizzes=hub.validateRegistry(JSON.parse(fs.readFileSync(registryPath,'utf8')));
    for(const quiz of quizzes){
      const bank=JSON.parse(fs.readFileSync(path.join(root,quiz.jsonPath),'utf8'));
      const session=new QuizSession(bank.questions);
      assert.equal(bank.questions.length,quiz.questionCount);
      for(const question of bank.questions){
        if(question.reviewOnly===true)continue;
        assert.equal(session.answer(question.id,question.type==='fill_blank'?question.acceptedAnswers[0]:question.correctChoiceIds).correct,true);
      }
      assert.equal(session.stats().correct,session.stats().scorableTotal);
      const view=await fixture(bank,memoryStorage(),{slug:quiz.slug});
      assert.equal(view.cards.size,quiz.questionCount);
      view.click('show-answers');assert.equal(view.explanations(),quiz.questionCount);
    }
  });
}
process.stdout.write(`\n${count} checks passed. Runtime tests use the real app with a minimal DOM fixture; browser verification is separate.\n`);
})().catch((error)=>{process.stderr.write(error.stack+'\n');process.exitCode=1;});
