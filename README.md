# Kernel Reviewers

One quiz engine and a catalogue of JSON question banks, published with GitHub Pages.

- [All reviewers](https://aaronfilarca.github.io/reviewers/)
- [AI - OT](https://aaronfilarca.github.io/reviewers/?q=ai-ot)
- [Applied AI Finals Practice](https://aaronfilarca.github.io/reviewers/?q=applied-ai-finals)
- [OS Finals Reviewer](https://aaronfilarca.github.io/reviewers/?q=operating-systems)

Selecting a catalogue entry opens `?q=<slug>`. Every quiz uses the shared engine, with separate saved progress per slug. The catalogue provides direct JSON downloads. Existing reviewer sites remain available at their original URLs.

## Question sources

The Operating Systems bank and the 200-question Applied AI practice bank are migrated from the existing reviewer. **AI - OT** is based on the 50 numbered items from the supplied past-assessment PDF. Its answer key is independently reviewed because the PDF shows a student's selected responses, not an official key. Ambiguous wording is discussed in explanations. Question 36 remains unscored because it has multiple defensible answers. Question 50 is completed for practice with clearly labeled added choices C and D; these do not reconstruct the original missing choices or official key. The bank has 49 scored questions and one unscored review item.

The original PDF, personal assessment details, receipt, grade, and page images are not included in this repository. Source-page numbers and verification references are included in the question metadata where relevant.

## Add a reviewer

1. Add a schema-version-2 question bank to `docs/quizzes/<slug>.json`, using a lowercase hyphenated slug.
2. Run `node scripts/build-catalog.mjs` to validate the banks and rebuild `docs/quizzes.json`.
3. Commit and push the bank and updated catalogue. GitHub Pages serves `docs/` from `main`.

Banks provide `title`, `description`, `modules`, `questions`, and optional `mocks`, `sources`, `provenance.statement`, and `catalogueBadge`. Supported types are `mcq`, `scenario_mcq`, `multi_select`, `true_false`, and `fill_blank`. Questions may set `reviewOnly: true` to preserve a study item that cannot be graded reliably. Exact-code blanks can set `caseSensitive: true`.

Run `node tests/run-tests.cjs` for the shared-engine and routing checks. For a local preview, serve `docs/` with a static web server; the hub loads JSON using browser fetch.
