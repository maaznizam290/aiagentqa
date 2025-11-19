import { useEffect, useState } from 'react';
import RunList from './components/RunList.jsx';
import MetricsPanel from './components/MetricsPanel.jsx';

async function fetchRuns() {
  const response = await fetch('/api/runs');
  if (!response.ok) throw new Error('Failed to load runs');
  const data = await response.json();
  return data.runs ?? [];
}

async function fetchMetrics() {
  const response = await fetch('/api/metrics');
  if (!response.ok) throw new Error('Failed to load metrics');
  return response.json();
}

export default function App() {
  const [runs, setRuns] = useState([]);
  const [runError, setRunError] = useState(null);
  const [metricsData, setMetricsData] = useState(null);
  const [metricsError, setMetricsError] = useState(null);

  const loadRuns = () =>
    fetchRuns()
      .then((data) => {
        setRuns(data);
        setRunError(null);
      })
      .catch((err) => setRunError(err.message));

  const loadMetrics = () =>
    fetchMetrics()
      .then((data) => {
        setMetricsData(data);
        setMetricsError(null);
      })
      .catch((err) => setMetricsError(err.message));

  useEffect(() => {
    loadRuns();
    loadMetrics();
  }, []);

  return (
    <div className="app-shell">
      <h1>QA Bot Dashboard</h1>
      <p>Track automated QA runs and the quality program’s health.</p>

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2>Recent runs</h2>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button type="button" onClick={loadRuns}>
              Refresh Runs
            </button>
            <button type="button" onClick={loadMetrics}>
              Refresh Metrics
            </button>
          </div>
        </div>
        {runError && <p style={{ color: 'tomato' }}>{runError}</p>}
        <RunList runs={runs} />
      </div>

      {metricsError && <p style={{ color: 'tomato', marginTop: '1rem' }}>{metricsError}</p>}
      <MetricsPanel metrics={metricsData?.metrics} snapshots={metricsData?.snapshots} />
    </div>
  );
}

