(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.QuizSession = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const owns = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
  const types = new Set(['mcq', 'scenario_mcq', 'multi_select', 'true_false', 'fill_blank']);
  const normalize = (value, caseSensitive = false) => {
    const cleaned = value.normalize('NFKC').trim().replace(/\s+/gu, ' ');
    return caseSensitive ? cleaned : cleaned.toLocaleLowerCase('en');
  };

  class QuizSession {
    constructor(questions, options = {}) {
      if (!Array.isArray(questions)) throw new TypeError('Questions must be an array.');
      this.questions = questions.slice();
      this._byId = new Map();
      this._choiceIds = new Map();
      this._correctIds = new Map();
      this._acceptedAnswers = new Map();
      for (const question of this.questions) {
        if (!question || typeof question.id !== 'string' || !question.id || this._byId.has(question.id)) {
          throw new TypeError('Each question must have a unique string ID.');
        }
        if (!types.has(question.type)) throw new TypeError('Each question must have a supported type.');
        if (question.reviewOnly === true) { this._byId.set(question.id, question); continue; }
        if (question.type === 'fill_blank') {
          if (!Array.isArray(question.acceptedAnswers) || !question.acceptedAnswers.length ||
              question.acceptedAnswers.some((answer) => typeof answer !== 'string' || !normalize(answer))) {
            throw new TypeError('A fill-in question must have at least one nonempty accepted answer.');
          }
          this._acceptedAnswers.set(question.id, new Set(question.acceptedAnswers.map((answer) => normalize(answer, question.caseSensitive === true))));
        } else {
          if (!Array.isArray(question.choices) || question.choices.length < 2) {
            throw new TypeError('Each choice question must have at least two choices.');
          }
          const choiceIds = question.choices.map((choice) => choice && choice.id);
          if (choiceIds.some((id) => typeof id !== 'string' || !id) || new Set(choiceIds).size !== choiceIds.length) {
            throw new TypeError('Choice IDs must be unique strings within a question.');
          }
          const correctIds = question.correctChoiceIds;
          if (!Array.isArray(correctIds) || !correctIds.length || new Set(correctIds).size !== correctIds.length ||
              correctIds.some((id) => !choiceIds.includes(id)) || !Number.isInteger(question.selectionCount) ||
              question.selectionCount !== correctIds.length ||
              (question.type !== 'multi_select' && question.selectionCount !== 1)) {
            throw new TypeError('Correct choices must match the selection count and question type.');
          }
          this._choiceIds.set(question.id, new Set(choiceIds));
          this._correctIds.set(question.id, new Set(correctIds));
        }
        this._byId.set(question.id, question);
      }
      this._originalOrder = this.questions.map((question) => question.id);
      this.order = this._originalOrder.slice();
      this.answers = Object.create(null);
      this.retryIds = null;
      this._storage = options.storage || null;
      this._storageKey = options.storageKey || 'kernel-reviewers:session:v2';
      this._random = typeof options.random === 'function' ? options.random : Math.random;
      this._restore();
    }

    _validSelection(id, ids) {
      return Array.isArray(ids) && ids.length > 0 && ids.length <= this._choiceIds.get(id).size &&
        new Set(ids).size === ids.length && ids.every((choiceId) => this._choiceIds.get(id).has(choiceId));
    }

    _finalSelection(id, ids) {
      const correct = this._correctIds.get(id);
      return ids.some((choiceId) => !correct.has(choiceId)) || ids.length === correct.size;
    }

    _recordChoices(id, ids) {
      const correct = this._correctIds.get(id);
      return Object.freeze({
        selectedIds: Object.freeze(ids.slice()),
        correct: ids.length === correct.size && ids.every((choiceId) => correct.has(choiceId))
      });
    }

    _recordText(id, text) {
      return Object.freeze({text, correct: this._acceptedAnswers.get(id).has(normalize(text, this._byId.get(id).caseSensitive === true))});
    }

    answer(id, response) {
      if (!this._byId.has(id)) throw new RangeError('Unknown question.');
      if (this._byId.get(id).reviewOnly === true) throw new RangeError('This item is for review only and cannot be scored.');
      if (owns(this.answers, id)) return this.answers[id];
      let record;
      if (this._byId.get(id).type === 'fill_blank') {
        if (typeof response !== 'string' || !normalize(response)) throw new RangeError('Type an answer first.');
        record = this._recordText(id, response);
      } else {
        if (!this._validSelection(id, response)) throw new RangeError('Select known, distinct choices.');
        if (!this._finalSelection(id, response)) return null;
        record = this._recordChoices(id, response);
      }
      this.answers[id] = record;
      this.save();
      return record;
    }

    getMissedIds() { return this.order.filter((id) => owns(this.answers, id) && !this.answers[id].correct); }

    getVisibleIds(moduleId = 'all', mockId = 'all') {
      const retrySet = this.retryIds === null ? null : new Set(this.retryIds);
      return this.order.filter((id) => {
        const question = this._byId.get(id);
        return (!retrySet || retrySet.has(id)) && (moduleId === 'all' || question.moduleId === moduleId) &&
          (mockId === 'all' || question.mockId === mockId);
      });
    }

    retryMissed() {
      const missed = this.getMissedIds();
      if (!missed.length) return 0;
      for (const id of missed) delete this.answers[id];
      this.retryIds = missed;
      this.save();
      return missed.length;
    }

    exitRetry() { this.retryIds = null; this.save(); }

    shuffle() {
      for (let index = this.order.length - 1; index > 0; index--) {
        const draw = this._random();
        const unit = Number.isFinite(draw) ? Math.min(Math.max(draw, 0), 1 - Number.EPSILON) : 0;
        const other = Math.floor(unit * (index + 1));
        [this.order[index], this.order[other]] = [this.order[other], this.order[index]];
      }
      this.save();
      return this.order.slice();
    }

    reset() {
      this.answers = Object.create(null);
      this.retryIds = null;
      this.order = this._originalOrder.slice();
      this.save();
    }

    stats(ids = this._originalOrder) {
      const knownIds = [...new Set(ids)].filter((id) => this._byId.has(id));
      const scorableIds = knownIds.filter((id) => this._byId.get(id).reviewOnly !== true);
      let correct = 0;
      let incorrect = 0;
      for (const id of scorableIds) {
        if (!owns(this.answers, id)) continue;
        if (this.answers[id].correct) correct++;
        else incorrect++;
      }
      const answered = correct + incorrect;
      return {total: knownIds.length, scorableTotal: scorableIds.length, answered, correct, incorrect, remaining: scorableIds.length - answered,
        accuracy: answered ? Math.round((correct / answered) * 100) : 0};
    }

    save() {
      if (!this._storage) return;
      try {
        this._storage.setItem(this._storageKey, JSON.stringify({version: 2, scorableTotal: this.stats().scorableTotal, order: this.order,
          answers: this.answers, retryIds: this.retryIds}));
      } catch (_) { /* Practice remains usable when browser storage is unavailable. */ }
    }

    _restore() {
      if (!this._storage) return;
      try {
        const saved = JSON.parse(this._storage.getItem(this._storageKey));
        if (!saved || typeof saved !== 'object' || saved.version !== 2) return;
        if (Array.isArray(saved.order) && saved.order.length === this._originalOrder.length &&
            new Set(saved.order).size === saved.order.length && saved.order.every((id) => this._byId.has(id))) {
          this.order = saved.order.slice();
        }
        if (saved.answers && typeof saved.answers === 'object' && !Array.isArray(saved.answers)) {
          for (const id of this._originalOrder) {
            if (this._byId.get(id).reviewOnly === true || !owns(saved.answers, id)) continue;
            const response = saved.answers[id];
            if (!response || typeof response !== 'object') continue;
            if (this._byId.get(id).type === 'fill_blank') {
              if (typeof response.text === 'string' && normalize(response.text)) this.answers[id] = this._recordText(id, response.text);
            } else if (this._validSelection(id, response.selectedIds) && this._finalSelection(id, response.selectedIds)) {
              this.answers[id] = this._recordChoices(id, response.selectedIds);
            }
          }
        }
        if (Array.isArray(saved.retryIds) && saved.retryIds.length && new Set(saved.retryIds).size === saved.retryIds.length &&
            saved.retryIds.every((id) => this._byId.has(id) && this._byId.get(id).reviewOnly !== true)) this.retryIds = saved.retryIds.slice();
      } catch (_) { /* Ignore inaccessible storage and malformed saved state. */ }
    }
  }
  return QuizSession;
});
