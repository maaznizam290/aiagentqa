import fs from 'fs/promises';
import path from 'path';

const DEFAULT_ATTACHMENT_LIMIT =
  Number(process.env.PLAYWRIGHT_ATTACHMENT_LIMIT_BYTES ?? 5 * 1024 * 1024);

export async function parsePlaywrightFailures({
  reportFile,
  repoDir,
  attachmentLimitBytes = DEFAULT_ATTACHMENT_LIMIT,
} = {}) {
  if (!reportFile || !repoDir) {
    return null;
  }

  const resolvedReport = path.isAbsolute(reportFile)
    ? reportFile
    : path.join(repoDir, reportFile);

  try {
    await fs.access(resolvedReport);
  } catch (error) {
    return {
      reportFile: resolvedReport,
      failures: [],
      warning: `Report not found: ${error.message}`,
    };
  }

  let raw;
  try {
    raw = JSON.parse(await fs.readFile(resolvedReport, 'utf-8'));
  } catch (error) {
    return {
      reportFile: resolvedReport,
      failures: [],
      warning: `Failed to parse JSON report: ${error.message}`,
    };
  }

  const suites = raw?.suites ?? [];
  const failureRecords = [];

  for (const suite of suites) {
    const suiteFailures = await collectSuiteFailures({
      suite,
      ancestors: [],
      repoDir,
      attachmentLimitBytes,
    });
    failureRecords.push(...suiteFailures);
  }

  return {
    reportFile: resolvedReport,
    failures: failureRecords,
  };
}

async function collectSuiteFailures({
  suite,
  ancestors,
  repoDir,
  attachmentLimitBytes,
}) {
  const failures = [];
  const titles = [...ancestors, suite?.title].filter(Boolean);

  if (Array.isArray(suite?.tests)) {
    for (const test of suite.tests) {
      const testNameParts = [...titles, test.title].filter(Boolean);
      if (!Array.isArray(test.results)) continue;

      for (const result of test.results) {
        if (result.status !== 'failed') continue;
        const record = await buildFailureRecord({
          testNameParts,
          result,
          repoDir,
          attachmentLimitBytes,
        });
        failures.push(record);
      }
    }
  }

  if (Array.isArray(suite?.suites)) {
    for (const child of suite.suites) {
      const nested = await collectSuiteFailures({
        suite: child,
        ancestors: titles,
        repoDir,
        attachmentLimitBytes,
      });
      failures.push(...nested);
    }
  }

  return failures;
}

async function buildFailureRecord({
  testNameParts,
  result,
  repoDir,
  attachmentLimitBytes,
}) {
  const failingStep = findFailingStep(result.steps ?? []);
  const errorMessage =
    failingStep?.error?.message ??
    result.error?.message ??
    'Unknown Playwright failure';
  const selector =
    extractSelector(failingStep?.error?.message) ??
    extractSelector(result.error?.message);

  const attachments = await loadRelevantAttachments({
    repoDir,
    attachments: result.attachments ?? [],
    limit: attachmentLimitBytes,
  });

  return {
    testName: testNameParts.join(' › '),
    failingStep: failingStep?.title ?? result.error?.message ?? 'n/a',
    failingSelector: selector,
    errorMessage,
    location: failingStep?.location ?? result.error?.location ?? null,
    stack: result.error?.stack ?? failingStep?.error?.stack ?? null,
    attachments,
    htmlSnapshot:
      attachments.find((att) => att.contentType?.includes('text/html'))?.data ??
      null,
  };
}

function findFailingStep(steps = []) {
  for (const step of steps) {
    if (step?.error) return step;
    const nested = findFailingStep(step?.steps ?? []);
    if (nested) return nested;
  }
  return null;
}

function extractSelector(message) {
  if (!message) return null;
  const locatorMatch = message.match(/locator\((['"`])(.*?)\1/);
  if (locatorMatch) return locatorMatch[2];
  const getByMatch = message.match(/getBy\w+\((['"`])(.*?)\1/);
  if (getByMatch) return getByMatch[2];
  return null;
}

async function loadRelevantAttachments({ attachments, repoDir, limit }) {
  const records = [];

  for (const attachment of attachments) {
    if (!attachment?.path) continue;
    if (!isRelevantAttachment(attachment)) continue;

    const absolutePath = path.isAbsolute(attachment.path)
      ? attachment.path
      : path.join(repoDir, attachment.path);

    try {
      const stat = await fs.stat(absolutePath);
      if (stat.size > limit) {
        records.push({
          name: attachment.name,
          path: absolutePath,
          contentType: attachment.contentType,
          size: stat.size,
          truncated: true,
          note: `Attachment exceeds limit (${stat.size} bytes > ${limit})`,
        });
        continue;
      }

      const encoding = isTextAttachment(attachment)
        ? 'utf-8'
        : 'base64';
      const buffer = await fs.readFile(absolutePath);
      records.push({
        name: attachment.name,
        path: absolutePath,
        contentType: attachment.contentType,
        size: stat.size,
        encoding,
        data:
          encoding === 'utf-8' ? buffer.toString('utf-8') : buffer.toString('base64'),
      });
    } catch (error) {
      records.push({
        name: attachment.name,
        path: absolutePath,
        contentType: attachment.contentType,
        error: error.message,
      });
    }
  }

  return records;
}

function isRelevantAttachment(attachment) {
  if (!attachment?.name && !attachment?.contentType) return false;
  const name = attachment.name?.toLowerCase() ?? '';
  const type = attachment.contentType?.toLowerCase() ?? '';

  if (name.includes('screenshot') || name.endsWith('.png')) return true;
  if (name.includes('trace') || name.endsWith('.zip')) return true;
  if (name.endsWith('.html') || type.includes('text/html')) return true;
  if (type.includes('image/')) return true;
  return false;
}

function isTextAttachment(attachment) {
  const type = attachment.contentType?.toLowerCase() ?? '';
  const name = attachment.name?.toLowerCase() ?? '';
  return type.includes('text') || type.includes('json') || name.endsWith('.html');
}

