import fetch from 'node-fetch';
import { prompts } from './promptTemplates.js';

const DEFAULT_MODEL = process.env.LLM_MODEL ?? 'gpt-4o-mini';
const LLM_URL = process.env.LLM_URL ?? 'https://api.openai.com/v1/chat/completions';
const DEFAULT_DOM_SNIPPET_LIMIT = Number(process.env.LLM_DOM_SNIPPET_LIMIT ?? 4000);

export async function generateSummary({ run, apiKey = process.env.OPENAI_API_KEY }) {
  if (!apiKey) {
    return {
      fallback: true,
      message: 'No API key configured. Skipping AI summary.',
    };
  }

  const body = {
    model: DEFAULT_MODEL,
    messages: [
      { role: 'system', content: prompts.regressionSummary.trim() },
      {
        role: 'user',
        content: `Runner payload:\n${JSON.stringify(run, null, 2)}`,
      },
    ],
  };

  const response = await fetch(LLM_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`LLM call failed: ${response.statusText}`);
  }

  const json = await response.json();
  return json.choices?.[0]?.message?.content?.trim();
}

export async function diagnoseFailure({
  failure,
  apiKey = process.env.OPENAI_API_KEY,
  domSnippetLimit = DEFAULT_DOM_SNIPPET_LIMIT,
} = {}) {
  if (!apiKey) {
    return {
      fallback: true,
      message: 'No API key configured. Skipping failure diagnosis.',
    };
  }

  if (!failure) {
    throw new Error('diagnoseFailure requires a failure payload');
  }

  const snapshot = failure.htmlSnapshot ?? failure.attachments?.find((att) => att.contentType?.includes('text/html'))?.data;
  const domExcerpt =
    typeof snapshot === 'string'
      ? snapshot.slice(0, domSnippetLimit)
      : null;

  const userPayload = {
    failure: {
      testName: failure.testName,
      failingStep: failure.failingStep,
      failingSelector: failure.failingSelector,
      errorMessage: failure.errorMessage,
      stack: failure.stack,
      location: failure.location,
    },
    domSnapshot: domExcerpt
      ? `${domExcerpt}${
          snapshot && snapshot.length > domSnippetLimit ? '\n...[truncated]' : ''
        }`
      : null,
  };

  const body = {
    model: DEFAULT_MODEL,
    messages: [
      { role: 'system', content: prompts.failureDiagnosis.trim() },
      {
        role: 'user',
        content: `Failure record:\n${JSON.stringify(userPayload, null, 2)}`,
      },
    ],
  };

  const response = await fetch(LLM_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`LLM call failed: ${response.statusText}`);
  }

  const json = await response.json();
  const content = json.choices?.[0]?.message?.content?.trim();
  if (!content) return null;

  try {
    return JSON.parse(content);
  } catch {
    return { raw: content };
  }
}

