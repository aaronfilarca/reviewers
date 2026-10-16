(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ReviewerData = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
  const escape = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  function validateRegistry(data) {
    if (!data || data.schemaVersion !== 1 || !Array.isArray(data.quizzes)) throw new Error('The reviewer list is not valid.');
    const slugs = new Set();
    for (const quiz of data.quizzes) {
      if (!quiz || !slugPattern.test(quiz.slug) || slugs.has(quiz.slug) || typeof quiz.title !== 'string' || !quiz.title.trim() ||
          quiz.jsonPath !== `quizzes/${quiz.slug}.json` || !Number.isInteger(quiz.questionCount) || quiz.questionCount < 1) {
        throw new Error('The reviewer list contains an invalid entry.');
      }
      slugs.add(quiz.slug);
    }
    return data.quizzes;
  }
  function resolveRoute(search, quizzes) {
    const params = new URLSearchParams(search);
    if (!params.has('q') || !params.get('q').trim()) return {type:'catalogue'};
    const slug = params.get('q');
    const quiz = quizzes.find((entry) => entry.slug === slug);
    return quiz ? {type:'quiz', quiz} : {type:'missing', slug};
  }
  function storageKey(slug) {
    if (!slugPattern.test(slug)) throw new Error('Invalid reviewer name.');
    return `kernel-reviewers:${slug}:v2`;
  }
  function bankMetadata(bank) {
    return {
      title: bank.title,
      description: bank.description || 'Practice the concepts. Check the explanations. Build understanding, one question at a time.',
      questionCount: bank.questions.length,
      moduleCount: bank.modules.length,
      mockCount: (bank.mocks || []).length,
      statement: bank.provenance && typeof bank.provenance.statement === 'string' ? bank.provenance.statement : ''
    };
  }
  function catalogueCard(quiz, progress) {
    const count = `${quiz.questionCount} questions`;
    const modules = Number.isInteger(quiz.moduleCount) && quiz.moduleCount > 0 ? ` · ${quiz.moduleCount} module${quiz.moduleCount === 1 ? '' : 's'}` : '';
    const sets = Number.isInteger(quiz.mockCount) && quiz.mockCount > 0 ? ` · ${quiz.mockCount} practice sets` : '';
    const registeredTotal = Number.isInteger(quiz.reviewOnlyCount) && quiz.reviewOnlyCount >= 0 && quiz.reviewOnlyCount <= quiz.questionCount ? quiz.questionCount - quiz.reviewOnlyCount : null;
    const scorableTotal = registeredTotal ?? (progress && Number.isInteger(progress.scorableTotal) && progress.scorableTotal >= 0 && progress.scorableTotal <= quiz.questionCount ? progress.scorableTotal : quiz.questionCount);
    const answered = progress ? Math.min(progress.answered, scorableTotal) : 0;
    const progressText = answered ? `${answered} of ${scorableTotal} ${scorableTotal < quiz.questionCount ? 'scored items answered' : 'answered'}` : 'Ready when you are';
    const percent = scorableTotal ? Math.round(answered / scorableTotal * 100) : 0;
    return `<article class="reviewer-card"><div class="reviewer-card-top"><span class="reviewer-emblem" aria-hidden="true">${escape(quiz.title.slice(0,2).toUpperCase())}</span>${quiz.badge ? `<span class="reviewer-badge">${escape(quiz.badge)}</span>` : ''}</div><a class="reviewer-title-link" href="?q=${encodeURIComponent(quiz.slug)}"><h2>${escape(quiz.title)}</h2><span class="sr-only">Open reviewer</span></a><p class="reviewer-description">${escape(quiz.description || '')}</p><p class="reviewer-meta">${escape(count + modules + sets)}</p><div class="reviewer-card-progress"><span>${escape(progressText)}</span><span>${percent}%</span></div><div class="reviewer-progress-track"><div style="width:${percent}%"></div></div><div class="reviewer-actions"><a class="action-button primary" href="?q=${encodeURIComponent(quiz.slug)}">Open reviewer <span aria-hidden="true">↗</span></a><a class="reviewer-download" href="${escape(quiz.jsonPath)}" download="${escape(quiz.slug)}.json">Download JSON ↓</a></div></article>`;
  }
  function savedProgress(storage, quiz) {
    if (!storage) return null;
    try {
      const saved = JSON.parse(storage.getItem(storageKey(quiz.slug)));
      if (!saved || saved.version !== 2 || !saved.answers || typeof saved.answers !== 'object' || Array.isArray(saved.answers)) return null;
      return {answered:Object.keys(saved.answers).length,scorableTotal:saved.scorableTotal};
    } catch (_) { return null; }
  }
  async function loadPage(search, fetcher) {
    async function getJSON(path, label) {
      let response;
      try { response = await fetcher(path, {cache:'no-cache'}); }
      catch (_) { throw new Error(`${label} could not load. Check your connection and try again.`); }
      if (!response.ok) throw new Error(`${label} could not load (HTTP ${response.status}). Try again in a moment.`);
      try { return await response.json(); }
      catch (_) { throw new Error(`${label} is not valid JSON.`); }
    }
    const quizzes = validateRegistry(await getJSON('quizzes.json', 'The reviewer list'));
    const route = resolveRoute(search, quizzes);
    if (route.type !== 'quiz') return {quizzes, route};
    const bank = await getJSON(route.quiz.jsonPath, 'This reviewer');
    if (!bank || bank.schemaVersion !== 2 || typeof bank.title !== 'string' || !bank.title.trim() || !Array.isArray(bank.modules) || !Array.isArray(bank.questions) || !bank.questions.length ||
        bank.modules.some((module) => !module || typeof module.id !== 'string' || typeof module.title !== 'string') ||
        (bank.mocks !== undefined && !Array.isArray(bank.mocks))) throw new Error('This reviewer has an unsupported question format.');
    return {quizzes, route, bank};
  }
  return {escape, validateRegistry, resolveRoute, storageKey, bankMetadata, catalogueCard, savedProgress, loadPage};
});
