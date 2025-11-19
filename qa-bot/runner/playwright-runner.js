import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import { promisify } from 'util';
import { exec as execCallback } from 'child_process';
import { parsePlaywrightFailures } from './parsers/playwrightParser.js';

const exec = promisify(execCallback);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const logsDir = path.resolve(__dirname, 'logs');

const DEFAULT_REPO = process.env.TEST_REPO_URL ?? 'https://github.com/example/app-under-test.git';
const DEFAULT_BRANCH = process.env.TEST_REPO_BRANCH ?? 'main';
const DEFAULT_INSTALL = process.env.PLAYWRIGHT_INSTALL_COMMAND ?? 'npm install';
const DEFAULT_REPORT_FILE =
  process.env.PLAYWRIGHT_REPORT_FILE ?? 'playwright-report.json';
const DEFAULT_TEST_CMD =
  process.env.PLAYWRIGHT_TEST_COMMAND ??
  `npx playwright test --reporter=list --reporter=json=${DEFAULT_REPORT_FILE}`;

function duration(start) {
  return Date.now() - start;
}

async function ensureLogDir() {
  await fs.mkdir(logsDir, { recursive: true });
}

async function writeLog(payload) {
  await ensureLogDir();
  const file = path.join(logsDir, `run-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  await fs.writeFile(file, JSON.stringify(payload, null, 2));
  return file;
}

async function runCommand(command, options = {}) {
  const startedAt = Date.now();
  try {
    const { stdout, stderr } = await exec(command, {
      maxBuffer: 1024 * 1024 * 10,
      ...options,
    });
    return {
      status: 'passed',
      stdout,
      stderr,
      exitCode: 0,
      durationMs: duration(startedAt),
    };
  } catch (error) {
    return {
      status: 'failed',
      stdout: error.stdout ?? '',
      stderr: error.stderr ?? error.message,
      exitCode: typeof error.code === 'number' ? error.code : 1,
      durationMs: duration(startedAt),
      error: error.message,
    };
  }
}

export async function runRepositoryTests({
  repoUrl = DEFAULT_REPO,
  branch = DEFAULT_BRANCH,
  installCommand = DEFAULT_INSTALL,
  testCommand = DEFAULT_TEST_CMD,
  reportFile = DEFAULT_REPORT_FILE,
  keepWorkspace = false,
  workspaceRoot,
  env = {},
} = {}) {
  if (!repoUrl) {
    throw new Error('repoUrl is required to run repository tests');
  }

  const createdWorkspace = workspaceRoot
    ? null
    : await fs.mkdtemp(path.join(os.tmpdir(), 'qa-run-'));
  const workDir = workspaceRoot ?? createdWorkspace;
  await fs.mkdir(workDir, { recursive: true });
  const repoDir = path.join(workDir, 'repo');

  const steps = [];
  const startedAt = new Date();

  const cloneResult = await runCommand(
    `git clone ${repoUrl} "${repoDir.replace(/\\/g, '/')}" --branch ${branch}`,
  );
  steps.push({ name: 'clone', command: `git clone ... --branch ${branch}`, ...cloneResult });
  if (cloneResult.status === 'failed') {
    const payload = finalizePayload({
      status: 'failed',
      repoUrl,
      branch,
      installCommand,
      testCommand,
      steps,
      startedAt,
    });
    payload.logFile = await writeLog(payload);
    await cleanupWorkspace({ createdWorkspace, keepWorkspace });
    return payload;
  }

  const installResult = await runCommand(installCommand, { cwd: repoDir });
  steps.push({ name: 'install', command: installCommand, ...installResult });
  if (installResult.status === 'failed') {
    const payload = finalizePayload({
      status: 'failed',
      repoUrl,
      branch,
      installCommand,
      testCommand,
      steps,
      startedAt,
    });
    payload.logFile = await writeLog(payload);
    await cleanupWorkspace({ createdWorkspace, keepWorkspace });
    return payload;
  }

  const testResult = await runCommand(testCommand, {
    cwd: repoDir,
    env: { ...process.env, ...env },
  });
  steps.push({ name: 'test', command: testCommand, ...testResult });

  let failureAnalysis = null;
  const shouldParse =
    testResult.status === 'failed' ||
    process.env.PLAYWRIGHT_PARSE_ALWAYS === '1' ||
    process.env.PLAYWRIGHT_PARSE_ALWAYS === 'true';
  if (shouldParse && reportFile) {
    failureAnalysis = await parsePlaywrightFailures({
      reportFile,
      repoDir,
    });
  }

  const status = testResult.status === 'passed' ? 'passed' : 'failed';
  const payload = finalizePayload({
    status,
    repoUrl,
    branch,
    installCommand,
    testCommand,
    reportFile,
    failureAnalysis,
    steps,
    startedAt,
  });
  payload.logFile = await writeLog(payload);

  await cleanupWorkspace({ createdWorkspace, keepWorkspace });
  return payload;
}

async function cleanupWorkspace({ createdWorkspace, keepWorkspace }) {
  if (!createdWorkspace || keepWorkspace) return;
  await fs.rm(createdWorkspace, { recursive: true, force: true });
}

function finalizePayload({
  status,
  repoUrl,
  branch,
  installCommand,
  testCommand,
  reportFile,
  failureAnalysis,
  steps,
  startedAt,
}) {
  const finishedAt = new Date();
  return {
    runner: 'playwright',
    status,
    repoUrl,
    branch,
    installCommand,
    testCommand,
    reportFile,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationMs: finishedAt.getTime() - startedAt.getTime(),
    steps,
    failureAnalysis,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [repoUrlArg, branchArg, testCommandArg] = process.argv.slice(2);
  runRepositoryTests({
    repoUrl: repoUrlArg ?? DEFAULT_REPO,
    branch: branchArg ?? DEFAULT_BRANCH,
    testCommand: testCommandArg ?? DEFAULT_TEST_CMD,
  })
    .then((result) => {
      console.log(JSON.stringify(result, null, 2));
      process.exit(result.status === 'passed' ? 0 : 1);
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

