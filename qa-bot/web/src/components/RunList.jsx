export default function RunList({ runs }) {
  if (!runs?.length) {
    return <p>No runs yet. Trigger one via the backend.</p>;
  }

  return (
    <div className="run-list">
      {runs.map((run) => (
        <article key={run.id} className="run-list-item">
          <div className="run-meta">
            <strong>{run.targetUrl}</strong>
            <span>
              #{run.id} • {run.runner}
            </span>
            <small>{new Date(run.createdAt).toLocaleString()}</small>
          </div>
          <span className={`status-pill ${run.status}`}>
            {run.status.replace('_', ' ')}
          </span>
        </article>
      ))}
    </div>
  );
}

