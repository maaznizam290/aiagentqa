# QA Bot

Monorepo scaffolding for a quality-assurance bot that schedules automated runs, captures logs in SQLite, summarizes results with an AI helper, and exposes a minimal React dashboard.

## Structure

- `backend/` — Express server and lightweight worker for scheduling, storage, and orchestration.
- `runner/` — Playwright-powered smoke test runner (`npm run runner:playwright`).
- `runner/logs/` — JSON outputs from every repository-based Playwright run.
- `ai/` — Prompt templates and a thin LLM client for summaries.
- `db/` — SQLite helpers and schema bootstrap (`npm run db:migrate`).
- `web/` — Vite + React dashboard for visualizing run history.
- `.github/workflows/` — CI definition to lint/build both backend and web.

## Getting Started

```bash
cd qa-bot
npm install
npm run dev        # start the API on :4000
npm run worker     # optional: start background processor
cd web && npm install && npm run dev  # dashboard on :5173
```

Trigger new runs via the API:

```bash
curl -X POST http://localhost:4000/api/runs \
  -H "content-type: application/json" \
  -d '{"targetUrl": "https://github.com/your-org/your-app.git", "runner": "playwright"}'
```

## Environment

Set the following variables as needed:

- `DEFAULT_TARGET_URL` — fallback repo URL used when `/runs` body omits `targetUrl`.
- `OPENAI_API_KEY` / `LLM_URL` / `LLM_MODEL` — configure AI summaries.
- `LLM_DOM_SNIPPET_LIMIT` — max characters from the DOM snapshot passed to the LLM (default 4000).
- `WORKER_POLL_INTERVAL_MS` — worker cadence in milliseconds.
- `TEST_REPO_URL` — fallback git repo for the worker when job payloads omit `targetUrl`.
- `TEST_REPO_BRANCH` — branch to checkout before installing dependencies (default `main`).
- `PLAYWRIGHT_INSTALL_COMMAND` — command run inside the repo to install deps (default `npm install`).
- `PLAYWRIGHT_TEST_COMMAND` — command that executes the chosen Playwright suite (default `npx playwright test --reporter=list --reporter=json=playwright-report.json`).
- `PLAYWRIGHT_REPORT_FILE` — path (relative to the cloned repo) where the JSON reporter writes results (default `playwright-report.json`).
- `PLAYWRIGHT_PARSE_ALWAYS` — set to `1` to parse reports even for passing runs.
- `PLAYWRIGHT_ATTACHMENT_LIMIT_BYTES` — cap (in bytes) for inlined attachment data (default 5 MB).
- `ENABLE_LLM_FIX_SUGGESTIONS` — set to `1` to have the worker call the LLM for fix suggestions on each failure.

## Tooling

- `npm run lint` / `npm run format` use ESLint + Prettier (repo root).
- `web/` contains its own `package.json` for dashboard dependencies.
- CI builds lint, backend scripts, and the dashboard bundle.

## Playwright Runner Workflow

`runner/playwright-runner.js` automates four phases for every job:

1. Clone (or pull) the target repository/branch.
2. Install dependencies via `PLAYWRIGHT_INSTALL_COMMAND`.
3. Execute the requested Playwright suite (`PLAYWRIGHT_TEST_COMMAND`), which can target multiple browsers/projects.
4. Persist a normalized JSON log (`runner/logs/run-*.json`) containing stdout/stderr, exit codes, timing, and parsed failure signals.

Use it from the CLI:

```bash
node runner/playwright-runner.js https://github.com/your-org/app main "npx playwright test --project=chromium --project=firefox"
```

## Failure Signal Parser

`runner/parsers/playwrightParser.js` reads the Playwright JSON reporter output and extracts:

- Test name (including suite ancestry).
- First failing step title and selector (when visible in the error message).
- Error message + stack trace.
- Attachments (screenshots, HTML snapshots, traces) inlined as base64/text up to `PLAYWRIGHT_ATTACHMENT_LIMIT_BYTES`.

Ensure your Playwright command writes a JSON file to `PLAYWRIGHT_REPORT_FILE`:

```bash
npx playwright test \
  --reporter=list \
  --reporter=json=playwright-report.json \
  --output=test-results
```

When a run fails (or when `PLAYWRIGHT_PARSE_ALWAYS=1`), the runner appends `failureAnalysis` to the stored run payload, giving downstream systems immediate access to failing steps, selectors, and HTML content.

### LLM Diagnosis Prompt

The AI layer exposes `diagnoseFailure` (see `ai/llmClient.js`) which feeds an individual failure record plus a trimmed DOM snapshot into the `failureDiagnosis` prompt template. The template instructs the LLM to:

- Identify the root cause and confidence level.
- Suggest a stable selector (e.g., `getByRole`, `locator('[data-testid=...]')`).
- Propose code/test fixes in structured JSON (`rootCause`, `proposedFix`, `selectorSuggestion`, `testEdit`, `confidence`, `notes`).

Set `OPENAI_API_KEY` and optionally adjust `LLM_DOM_SNIPPET_LIMIT` to control the DOM context size.

## Fix Suggestions (Manual Approval Flow)

When `ENABLE_LLM_FIX_SUGGESTIONS=1`, the worker will:

1. Run Playwright tests and collect `failureAnalysis`.
2. Call `diagnoseFailure` for each failing test.
3. Store the result inside the SQLite `suggestions` table with status `suggested`.

Each suggestion row contains the original failure context plus the LLM’s JSON response. You can review these via a custom admin view or a simple script that queries `db/listSuggestions()`. Once a human approves the change, update the row’s status (e.g., `approved`, `applied`) using `updateSuggestionStatus`.

Applying fixes is intentionally manual for now—automation hooks (e.g., editing tests, re-running suites, or opening GitHub PRs) can build on top of the stored suggestion payload when you are ready to trust them.

