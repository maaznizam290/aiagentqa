import { useEffect, useState } from 'react';
import RunList from './components/RunList.jsx';

async function fetchRuns() {
  const response = await fetch('/api/runs');
  if (!response.ok) throw new Error('Failed to load runs');
  const data = await response.json();
  return data.runs ?? [];
}

export default function App() {
  const [runs, setRuns] = useState([]);
  const [error, setError] = useState(null);

  const loadRuns = () =>
    fetchRuns()
      .then((data) => {
        setRuns(data);
        setError(null);
      })
      .catch((err) => setError(err.message));

  useEffect(() => {
    loadRuns();
  }, []);

  return (
    <div className="app-shell">
      <h1>QA Bot Dashboard</h1>
      <p>Track automated QA runs across runners and environments.</p>

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <h2>Recent runs</h2>
          <button type="button" onClick={loadRuns}>
            Refresh
          </button>
        </div>
        {error && <p style={{ color: 'tomato' }}>{error}</p>}
        <RunList runs={runs} />
      </div>
    </div>
  );
}

