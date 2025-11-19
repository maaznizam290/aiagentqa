import RunList from './RunList.jsx';

function StatusBadge({ status = 'unknown' }) {
  return <span className={`status-pill ${status}`}>{status.replace('_', ' ')}</span>;
}

export default function RunResponsePanel({ runs }) {
  if (!runs?.length) return null;
  const [latest, ...rest] = runs;
  const failures = latest.result?.failureAnalysis?.failures ?? [];

  return (
    <div className="card" style={{ marginTop: '1.5rem' }}>
      <header className="panel-header">
        <div>
          <p className="eyebrow">Latest Response</p>
          <h2>{latest.targetUrl}</h2>
          <p className="muted">
            #{latest.id} • {latest.runner} • {new Date(latest.createdAt).toLocaleString()}
          </p>
        </div>
        <StatusBadge status={latest.status} />
      </header>

      <section className="response-grid">
        <article>
          <h3>Result Summary</h3>
          <p>
            {latest.result?.status
              ? `Runner reported "${latest.result.status}" in ${
                  latest.result?.steps?.find((s) => s.name === 'test')?.durationMs ?? '—'
                } ms.`
              : 'Awaiting worker output.'}
          </p>
          {latest.result?.logFile && (
            <p className="muted">Log: {latest.result.logFile}</p>
          )}
        </article>
        <article>
          <h3>Failure Signals</h3>
          {failures.length ? (
            <ul className="failure-list">
              {failures.map((failure, idx) => (
                <li key={`${failure.testName}-${idx}`}>
                  <strong>{failure.testName}</strong>
                  <p>{failure.errorMessage}</p>
                  {failure.failingSelector && (
                    <code className="selector-chip">{failure.failingSelector}</code>
                  )}
                  {failure.suggestion?.selectorSuggestion && (
                    <div className="suggestion-pill">
                      Suggest: {failure.suggestion.selectorSuggestion}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p>No AI-parsed failures captured for this run.</p>
          )}
        </article>
      </section>

      {rest.length > 0 && (
        <div style={{ marginTop: '1.5rem' }}>
          <p className="eyebrow">Recent History</p>
          <RunList runs={runs.slice(0, 4)} />
        </div>
      )}
    </div>
  );
}

