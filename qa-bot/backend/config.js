export const config = {
  port: Number(process.env.PORT ?? 4000),
  workerPollIntervalMs: Number(process.env.WORKER_POLL_INTERVAL_MS ?? 15000),
  defaultTargetUrl:
    process.env.DEFAULT_TARGET_URL ??
    process.env.TEST_REPO_URL ??
    'https://github.com/example/app-under-test.git',
};

