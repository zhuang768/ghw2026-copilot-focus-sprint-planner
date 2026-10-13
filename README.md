# Focus Sprint Planner

Plan one focused block of work without an account, network connection, or dependencies. Add tasks with estimates, choose a sprint length, and select tasks to see the total, remaining time, and any over-budget amount.

Open `index.html` with `styles.css`, `core.js`, and `app.js` alongside it. Use Edit / Cancel / Remove to change tasks, and Clear selection to deselect them. Task titles are limited to 100 characters, task estimates and sprint length to 1–480 whole minutes, and the list to 100 tasks. Native inputs and buttons work with the keyboard; focus is retained when selecting or removing tasks.

The application saves sanitized state to this browser's `localStorage`. It sends no data anywhere. Private browsing, browser policies, or opening local files may prevent persistence; the persistent storage message then says that changes are for this session only. Clearing browser data removes the plan. Different browser profiles and open tabs do not synchronize.

Run the dependency-free tests with Node.js 18 or newer:

```sh
node --test app.test.js
node --test verification/independent.test.js
```

The original suite has 13 tests covering calculations, malformed state, minute limits, storage errors, and the real UI script's state transitions in a small DOM harness. The independent suite has 12 tests covering the complete planning workflow, capacity and input limits, hostile stored values, 500 deterministic malformed-state samples, source manifests, local resources, sprint accessibility-marker recovery, and preserving task controls during sprint changes. Actual results and limitations are in `verification/REPORT.md`; both suites pass on this prepared copy. The harness does not validate browser layout or native-control behavior; those require separate browser inspection.

The generation record identifies GitHub Copilot CLI 1.0.82 as the source of the initial six files on 2026-10-13 UTC, using the prompt in `evidence/json-stream-prompt.txt`. Copilot emitted source text; Codex saved, reviewed, and revised it. Codex fixed malformed task handling, storage getter/errors, keyboard focus, edit deletion recovery, custom sprint values, contrast, a stale sprint accessibility marker, and task-control replacement during sprint changes, and added regression tests. `evidence/generated-source.json` and its SHA-256 manifest preserve the unmodified initial response. `evidence/reviewed-source-sha256.json` identifies the six current files. The provenance record and usage metadata are included; private runtime logs and raw event streams are excluded.

This repository does not claim an awarded challenge point or accepted GHW submission. Submission is a separate step.
