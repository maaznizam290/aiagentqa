import { config } from './config.js';
import {
  initDatabase,
  getPendingRuns,
  markRunInProgress,
  logRunFinish,
  saveFixSuggestion,
} from '../db/index.js';
import { runRepositoryTests } from '../runner/playwright-runner.js';
import { diagnoseFailure } from '../ai/llmClient.js';

let ticking = false;

async function processPendingRuns() {
  if (ticking) return;
  ticking = true;
  try {
    await initDatabase();
    const pending = await getPendingRuns(3);
    for (const run of pending) {
      const repoUrl = run.targetUrl ?? process.env.TEST_REPO_URL;
      if (!repoUrl) {
        console.warn(
          `[worker] Skipping run ${run.id} because repoUrl is missing. Set targetUrl or TEST_REPO_URL.`,
        );
        continue;
      }

      await markRunInProgress(run.id);
      const result = await runRepositoryTests({
        repoUrl,
        branch: process.env.TEST_REPO_BRANCH,
        testCommand: process.env.PLAYWRIGHT_TEST_COMMAND,
        installCommand: process.env.PLAYWRIGHT_INSTALL_COMMAND,
      });
      await logRunFinish(run.id, result);

      if (shouldDiagnoseFailures()) {
        await suggestFixesForRun({ runId: run.id, result });
      }
    }
  } catch (error) {
    console.error('[worker] Failed to process runs', error);
  } finally {
    ticking = false;
  }
}

function shouldDiagnoseFailures() {
  return (
    process.env.ENABLE_LLM_FIX_SUGGESTIONS === '1' ||
    process.env.ENABLE_LLM_FIX_SUGGESTIONS === 'true'
  );
}

async function suggestFixesForRun({ runId, result }) {
  const failures = result.failureAnalysis?.failures;
  if (!failures?.length) return;

  for (const failure of failures) {
    try {
      const suggestion = await diagnoseFailure({ failure });
      if (!suggestion) continue;
      await saveFixSuggestion({
        runId,
        testName: failure.testName,
        payload: {
          failure,
          suggestion,
        },
        status: 'suggested',
      });
    } catch (error) {
      console.error(
        `[worker] Failed to generate fix suggestion for ${failure.testName}:`,
        error,
      );
    }
  }
}

export function startWorker() {
  console.log(
    `[worker] Starting with poll interval ${config.workerPollIntervalMs}ms`,
  );
  processPendingRuns();
  return setInterval(processPendingRuns, config.workerPollIntervalMs);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  startWorker();
}

