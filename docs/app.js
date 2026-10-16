(async function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const escape = (text) => String(text ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const paths = {
    grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
    download: '<path d="M12 3v12m-4-4 4 4 4-4M4 16v4h16v-4"/>',
    book: '<path d="M12 5v16M3 4c4-1 6 0 9 2 3-2 5-3 9-2v15c-4-1-6 0-9 2-3-2-5-3-9-2Z"/>',
    sparkles: '<path d="m12 3 2.7 6.3L21 12l-6.3 2.7L12 21l-2.7-6.3L3 12l6.3-2.7ZM20 2v4m-2-2h4"/>',
    layers: '<path d="m12 3 10 6-10 6L2 9ZM2 13l10 6 10-6M2 17l10 6 10-6"/>',
    pen: '<path d="m16 3 5 5-12 12-6 1 1-6Zm-1 2 5 5M3 21h18"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    cross: '<path d="m6 6 12 12M6 18 18 6"/>',
    retry: '<path d="M3 10a9 9 0 1 1 2 8M3 4v6h6"/>',
    reset: '<path d="M3 11a9 9 0 1 1 2.5 7M3 5v6h6M12 7v5l3 2"/>',
    eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
    shuffle: '<path d="M3 6h3l12 12h3M3 18h3l4-4m4-4 4-4h3M17 2l4 4-4 4m0 4 4 4-4 4"/>',
    bolt: '<path d="m13 2-9 12h7l-1 8 10-12h-7Z"/>'
  };
  const icon = (name) => `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.book}</svg>`;
  document.querySelectorAll('[data-icon]').forEach((el) => { el.innerHTML = icon(el.dataset.icon); });
  function showError(message) {
    $('loading-state').classList.add('hidden');
    $('catalogue-view').classList.add('hidden');
    $('quiz-view').classList.add('hidden');
    $('error-message').textContent = message;
    $('error-state').classList.remove('hidden');
    document.title = 'Reviewer unavailable · Kernel';
  }
  if (!window.ReviewerData || !window.QuizSession) { showError('The study tools could not load. Refresh the page to try again.'); return; }
  const hub = window.ReviewerData;
  let page;
  try { page = await hub.loadPage(window.location.search, window.fetch.bind(window)); }
  catch (error) { showError(error.message || 'The reviewer could not load. Please try again.'); return; }
  let storage = null;
  try { storage = window.localStorage; } catch (_) {}
  $('loading-state').classList.add('hidden');
  if (page.route.type === 'missing') { showError(`No reviewer named “${page.route.slug}” is available. Open the library to choose one of the available question banks.`); return; }
  if (page.route.type === 'catalogue') {
    $('catalogue-view').classList.remove('hidden');
    $('catalogue-bank-count').textContent = `${page.quizzes.length} reviewer${page.quizzes.length === 1 ? '' : 's'}`;
    $('catalogue-question-count').textContent = `${page.quizzes.reduce((sum, quiz) => sum + quiz.questionCount, 0)} questions to explore`;
    const search = $('catalogue-search');
    function renderCatalogue() {
      const query = search.value.trim().toLocaleLowerCase('en');
      const quizzes = page.quizzes.filter((quiz) => `${quiz.title} ${quiz.description || ''}`.toLocaleLowerCase('en').includes(query));
      $('catalogue-list').innerHTML = quizzes.map((quiz) => hub.catalogueCard(quiz, hub.savedProgress(storage, quiz))).join('');
      $('catalogue-empty').classList.toggle('hidden', quizzes.length > 0);
    }
    search.addEventListener('input', renderCatalogue);
    renderCatalogue();
    return;
  }
  const data = page.bank;
  const slug = page.route.quiz.slug;
  let session;
  try { session = new window.QuizSession(data.questions, {storage, storageKey: hub.storageKey(slug)}); }
  catch (_) { showError('This reviewer contains an invalid answer key. Please choose another reviewer or download the JSON to inspect it.'); return; }
  const meta = hub.bankMetadata(data);
  document.title = `${meta.title} · Kernel`;
  document.querySelector('meta[name="description"]')?.setAttribute('content', meta.description);
  $('page-title').textContent = meta.title;
  $('breadcrumb-title').textContent = meta.title;
  $('intro-description').textContent = meta.description;
  $('download-json').href = page.route.quiz.jsonPath;
  $('download-json').download = `${slug}.json`;
  $('reset-description').textContent = `This clears your answers for “${meta.title}” and restores its original question order. Progress in other reviewers is kept.`;
  if (meta.statement) {
    $('provenance-notice').textContent = meta.statement;
    $('provenance-notice').classList.remove('hidden');
  }
  const unscoredCount = data.questions.filter((question) => question.reviewOnly === true).length;
  if (unscoredCount) {
    $('unscored-notice').textContent = `${unscoredCount} item${unscoredCount === 1 ? ' is' : 's are'} for review only because the source or answer key is incomplete. These items stay visible and are excluded from your score and completion progress.`;
    $('unscored-notice').classList.remove('hidden');
  }
  $('quiz-view').classList.remove('hidden');
  const questionsById = new Map(data.questions.map((q) => [q.id, q]));
  const modulesById = new Map(data.modules.map((module) => [module.id, module]));
  const mocks = data.mocks || [];
  const mocksById = new Map(mocks.map((mock) => [mock.id, mock]));
  const sourceEntries = Array.isArray(data.sources) ? data.sources.map((source) => [source.id, source]) : Object.entries(data.sources || {});
  const sourcesById = new Map(sourceEntries);
  const drafts = new Map();
  const textDrafts = new Map();
  const typeLabels = {mcq:'Single answer',scenario_mcq:'Scenario · Single answer',multi_select:'Multiple answers',true_false:'True or false',fill_blank:'Fill in the blank'};
  let selectedModule = 'all';
  let selectedMock = 'all';
  let showAnswers = false;
  let toastTimer;

  function toast(message) {
    clearTimeout(toastTimer);
    $('toast').textContent = message;
    $('toast').classList.add('visible');
    toastTimer = setTimeout(() => $('toast').classList.remove('visible'), 3500);
  }
  function answerLabels(question) {
    if (question.reviewOnly === true) return question.answerText || '';
    if (question.type === 'fill_blank') return question.answerText || question.acceptedAnswers[0];
    return question.choices.filter((choice) => question.correctChoiceIds.includes(choice.id)).map((choice) => `${choice.id.toUpperCase()}. ${choice.text}`).join(' · ');
  }
  function sourceDetails(question) {
    if (!Array.isArray(question.sourceIds) || !question.sourceIds.length) return '';
    const entries = question.sourceIds.map((id) => {
      const source = sourcesById.get(id);
      if (!source) return `<li>${escape(id)}</li>`;
      const title = source.title || source.name || id;
      const label = `${title}${source.section ? ` · ${source.section}` : ''}`;
      return /^https?:\/\//i.test(source.url || '') ? `<li><a href="${escape(source.url)}" target="_blank" rel="noopener noreferrer">${escape(label)}</a></li>` : `<li>${escape(label)}</li>`;
    }).join('');
    return `<details class="source-list"><summary>Study sources (${question.sourceIds.length})</summary><ul>${entries}</ul></details>`;
  }
  function questionContent(question, listNumber) {
    const answer = session.answers[question.id];
    const draft = drafts.get(question.id) || [];
    const reviewOnly = question.reviewOnly === true;
    const revealed = showAnswers || !!answer || reviewOnly;
    const module = modulesById.get(question.moduleId);
    const mock = mocksById.get(question.mockId);
    const blank = question.type === 'fill_blank';
    const multi = question.type === 'multi_select';
    const id = escape(question.id);
    let controls;
    if (blank) {
      const value = answer ? answer.text : textDrafts.get(question.id) || '';
      const status = answer ? answer.correct ? ' correct' : ' incorrect' : '';
      const normalizationHelp = question.caseSensitive === true ? 'Capitalization is checked; extra spaces are ignored.' : 'Capitalization and extra spaces are ignored.';
      controls = `<form class="blank-form" data-blank="${id}"><label class="blank-label" for="${id}-answer">Your answer</label><div class="blank-row"><input class="blank-input${status}" id="${id}-answer" name="answer" type="text" value="${escape(value)}" autocomplete="off" autocapitalize="off" spellcheck="false" required aria-describedby="${id}-help" ${revealed ? 'disabled' : ''}><button class="action-button primary" type="submit" ${revealed ? 'disabled' : ''}>Check answer</button></div><span class="blank-help" id="${id}-help">${reviewOnly ? 'This item is unscored. See the source note below.' : `Press Enter to check. ${normalizationHelp} Accepted terms and aliases come from the answer key.`}</span></form>`;
    } else {
      const choices = (question.choices || []).map((choice) => {
        const selected = answer ? answer.selectedIds.includes(choice.id) : draft.includes(choice.id);
        const correct = !reviewOnly && question.correctChoiceIds.includes(choice.id);
        const css = revealed && correct ? ' correct' : answer && selected && !correct ? ' incorrect' : selected ? ' selected' : '';
        const mark = revealed && correct ? icon('check') : answer && selected && !correct ? icon('cross') : selected ? icon('check') : '';
        const status = revealed && correct ? 'Correct answer' : answer && selected && !correct ? 'Your choice, incorrect' : selected ? 'Selected' : '';
        return `<button class="choice${css}" type="button" data-question="${id}" data-choice="${escape(choice.id)}" aria-pressed="${selected}" ${revealed ? 'disabled' : ''}><span class="choice-letter">${escape(choice.id)}</span><span class="choice-text">${escape(choice.text)}</span><span class="choice-mark">${mark}</span>${status ? `<span class="sr-only">${status}</span>` : ''}</button>`;
      }).join('');
      controls = `<div class="choices" role="group" aria-labelledby="${id}-prompt">${choices}</div>`;
    }
    let feedback = '';
    if (revealed) {
      const heading = reviewOnly ? 'Review item · unscored' : answer ? answer.correct ? 'Correct. You’ve got it.' : 'Incorrect. Here’s the idea.' : 'The correct answer';
      const response = blank && answer && !answer.correct ? `<p class="response-text">Your answer: ${escape(answer.text)}</p>` : '';
      feedback = `<div class="feedback${answer && !answer.correct ? ' wrong' : ''}" role="status"><div class="feedback-heading">${icon(answer && !answer.correct ? 'retry' : 'check')}${heading}</div>${response}${answerLabels(question) ? `<div class="answer-key">${escape(answerLabels(question))}</div>` : ''}<p class="feedback-explanation">${escape(question.explanation)}</p>${sourceDetails(question)}</div>`;
    }
    const instruction = reviewOnly ? 'For review only · excluded from scoring and progress' : answer ? 'Answer recorded' : showAnswers ? 'Answer view' : blank ? 'Type your answer and check it.' : multi ? `Select all ${question.selectionCount} correct choices. One wrong choice ends this attempt.` : 'Click a choice to reveal the explanation.';
    const location = [mock ? mock.title : '', module ? module.title : question.moduleId || ''].filter(Boolean).join(' · ');
    const hint = !revealed && multi ? `${draft.length} / ${question.selectionCount} selected` : `Bank Q${question.number}`;
    return `<div class="question-meta"><div class="flex items-center gap-3"><span class="question-index">QUESTION ${String(listNumber).padStart(2,'0')}</span><span class="question-type">${escape(reviewOnly ? 'Review item · unscored' : typeLabels[question.type])}</span></div>${multi && !reviewOnly ? `<span class="selection-tag">Select ${question.selectionCount}</span>` : ''}</div><div class="question-module">${escape(location)}${question.topic ? ` · ${escape(question.topic)}` : ''}</div><h3 class="question-prompt" id="${id}-prompt">${escape(question.prompt)}</h3>${controls}${question.notes ? `<p class="question-notes">${escape(Array.isArray(question.notes) ? question.notes.join(' ') : question.notes)}</p>` : ''}<div class="question-bottom"><span>${instruction}</span><span class="draft-hint">${escape(hint)}</span></div>${feedback}`;
  }
  function updateStats() {
    const stats = session.stats();
    $('stat-total').textContent = stats.total;
    $('stat-answered').textContent = stats.answered;
    $('stat-correct').textContent = stats.correct;
    $('stat-incorrect').textContent = stats.incorrect;
    const percent = stats.scorableTotal ? Math.round(stats.answered / stats.scorableTotal * 100) : 0;
    $('progress-percent').textContent = percent;
    $('progress-fill').style.width = `${percent}%`;
    const bar = document.querySelector('[role="progressbar"]');
    bar.setAttribute('aria-valuenow', stats.answered);
    bar.setAttribute('aria-valuemax', stats.scorableTotal);
    $('progress-fraction').textContent = `${stats.answered} of ${stats.scorableTotal} answered`;
    $('progress-accuracy').textContent = stats.answered ? `${stats.accuracy}% accuracy` : '— accuracy';
    $('progress-caption').textContent = !stats.answered ? 'A fresh start. Let’s get into it.' : !stats.remaining ? 'Every question explored. Keep strengthening the tricky ones.' : `${stats.remaining} more opportunities to learn something.`;
    $('retry-button').disabled = !stats.incorrect;
    $('retry-label').textContent = `Retry incorrect (${stats.incorrect})`;
    $('retry-banner').classList.toggle('hidden', !session.retryIds);
    if (session.retryIds) {
      const retryStats = session.stats(session.retryIds);
      $('retry-caption').textContent = `${retryStats.answered} of ${retryStats.total} reattempted · ${retryStats.correct} correct this round`;
    }
    $('all-modules').classList.toggle('active', selectedModule === 'all' && selectedMock === 'all');
    document.querySelectorAll('.module-nav-item').forEach((el) => el.classList.toggle('active', el.dataset.module === selectedModule));
    $('reveal-banner').classList.toggle('hidden', !showAnswers);
    $('show-answers').setAttribute('aria-pressed', String(showAnswers));
    $('show-answers').innerHTML = `${icon('eye')}<span>${showAnswers ? 'Hide all answers' : 'Show all answers'}</span>`;
  }
  function renderQuestions() {
    const ids = session.getVisibleIds(selectedModule, selectedMock);
    $('questions').innerHTML = ids.map((id, index) => `<article class="question-card" id="${escape(id)}" data-list-number="${index + 1}" aria-labelledby="${escape(id)}-prompt">${questionContent(questionsById.get(id),index + 1)}</article>`).join('');
    $('list-count').textContent = `${ids.length} question${ids.length === 1 ? '' : 's'}`;
    $('empty-state').classList.toggle('hidden', ids.length !== 0);
    $('list-hint').textContent = showAnswers ? 'Review every answer at your own pace.' : 'Choose an answer, or type in the blank.';
    $('module-select').value = selectedModule;
    $('mock-select').value = selectedMock;
    updateStats();
  }
  function allQuestions() { session.exitRetry(); selectedModule = 'all'; selectedMock = 'all'; renderQuestions(); }
  function refreshCard(question, result, choiceId) {
    const card = $(question.id);
    card.innerHTML = questionContent(question, Number(card.dataset.listNumber));
    updateStats();
    if (result) {
      drafts.delete(question.id);
      textDrafts.delete(question.id);
      const feedback = card.querySelector('.feedback');
      feedback.setAttribute('tabindex','-1');
      feedback.focus({preventScroll:true});
    } else if (choiceId) [...card.querySelectorAll('[data-choice]')].find((button) => button.dataset.choice === choiceId)?.focus({preventScroll:true});
  }
  $('bank-count').textContent = data.questions.length;
  $('module-count').textContent = `${data.modules.length} MODULE${data.modules.length === 1 ? '' : 'S'}`;
  $('intro-count').textContent = `${data.questions.length} questions`;
  $('intro-mocks').textContent = mocks.length ? `${mocks.length} practice set${mocks.length === 1 ? '' : 's'}` : `${data.modules.length} module${data.modules.length === 1 ? '' : 's'}`;
  $('mock-filter').classList.toggle('hidden', mocks.length === 0);
  $('module-nav').innerHTML = data.modules.map((module) => `<button class="module-nav-item" data-module="${escape(module.id)}" type="button"><span class="module-num">${escape(String(module.number ?? data.modules.indexOf(module) + 1).padStart(2,'0'))}</span><span class="module-nav-title">${escape(module.title)}</span><span class="module-count">${data.questions.filter((question) => question.moduleId === module.id).length}</span></button>`).join('');
  $('module-select').innerHTML += data.modules.map((module) => `<option value="${escape(module.id)}">M${escape(String(module.number ?? data.modules.indexOf(module) + 1).padStart(2,'0'))} · ${escape(module.title)}</option>`).join('');
  $('mock-select').innerHTML += mocks.map((mock) => `<option value="${escape(mock.id)}">${escape(mock.title)} (${data.questions.filter((question) => question.mockId === mock.id).length})</option>`).join('');
  $('module-nav').addEventListener('click', (event) => { const button = event.target.closest('[data-module]'); if (button) { selectedModule = button.dataset.module; renderQuestions(); } });
  $('all-modules').addEventListener('click', allQuestions);
  $('module-select').addEventListener('change', (event) => { selectedModule = event.target.value; renderQuestions(); });
  $('mock-select').addEventListener('change', (event) => { selectedMock = event.target.value; renderQuestions(); });
  $('questions').addEventListener('click', (event) => {
    const button = event.target.closest('[data-choice]');
    if (!button || showAnswers) return;
    const question = questionsById.get(button.dataset.question);
    if (!question || question.reviewOnly === true || session.answers[question.id]) return;
    let selected = drafts.get(question.id) || [];
    selected = selected.includes(button.dataset.choice) ? selected.filter((id) => id !== button.dataset.choice) : selected.concat(button.dataset.choice);
    drafts.set(question.id, selected);
    const result = selected.length ? session.answer(question.id, selected) : null;
    refreshCard(question, result, button.dataset.choice);
  });
  $('questions').addEventListener('input', (event) => {
    const form = event.target.closest('form[data-blank]');
    if (form && !showAnswers && !session.answers[form.dataset.blank]) textDrafts.set(form.dataset.blank, event.target.value);
  });
  $('questions').addEventListener('submit', (event) => {
    const form = event.target.closest('form[data-blank]');
    if (!form) return;
    event.preventDefault();
    if (showAnswers || questionsById.get(form.dataset.blank)?.reviewOnly === true || session.answers[form.dataset.blank]) return;
    const input = form.querySelector('input[name="answer"]');
    if (!input.value.trim()) { input.value = ''; input.reportValidity(); return; }
    const question = questionsById.get(form.dataset.blank);
    refreshCard(question, session.answer(question.id, input.value));
  });
  $('show-answers').addEventListener('click', () => {
    showAnswers = !showAnswers;
    if (showAnswers) {
      session.exitRetry(); selectedModule = 'all'; selectedMock = 'all';
      toast('Answers and explanations are visible. Your score stays the same.');
    }
    renderQuestions();
  });
  $('shuffle-button').addEventListener('click', () => { session.shuffle(); renderQuestions(); toast('Questions shuffled. Your progress is saved.'); });
  $('retry-button').addEventListener('click', () => {
    const count = session.retryMissed();
    if (!count) return;
    showAnswers = false; selectedModule = 'all'; selectedMock = 'all'; drafts.clear(); textDrafts.clear();
    renderQuestions();
    toast(`A fresh attempt at ${count} missed question${count === 1 ? '' : 's'}.`);
    $('questions').scrollIntoView({behavior:'smooth', block:'start'});
  });
  $('exit-retry').addEventListener('click', allQuestions);
  $('empty-back').addEventListener('click', allQuestions);
  $('reset-button').addEventListener('click', () => { $('reset-dialog').returnValue = ''; $('reset-dialog').showModal(); });
  $('reset-dialog').addEventListener('close', () => {
    if ($('reset-dialog').returnValue !== 'reset') return;
    session.reset(); drafts.clear(); textDrafts.clear(); showAnswers = false; selectedModule = 'all'; selectedMock = 'all';
    renderQuestions(); toast('This reviewer’s progress is reset. Ready for a fresh start.');
  });
  renderQuestions();
})().catch(function () {
  document.getElementById('loading-state').classList.add('hidden');
  document.getElementById('catalogue-view').classList.add('hidden');
  document.getElementById('quiz-view').classList.add('hidden');
  document.getElementById('error-message').textContent = 'This reviewer could not be displayed. Refresh the page or return to the library to choose another bank.';
  document.getElementById('error-state').classList.remove('hidden');
  document.title = 'Reviewer unavailable · Kernel';
});
