import { useEffect, useState } from 'react';
import MetricsPanel from './components/MetricsPanel.jsx';
import RunResponsePanel from './components/RunResponsePanel.jsx';

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
      <div className="hero">
        <div>
          <p className="eyebrow">QA Command Center</p>
          <h1>QA Bot Dashboard</h1>
          <p>Visualize runs, AI insights, and quality signals in one place.</p>
        </div>
        <div className="hero-actions">
          <button type="button" onClick={loadRuns}>
            Refresh Runs
          </button>
          <button type="button" onClick={loadMetrics}>
            Refresh Metrics
          </button>
        </div>
      </div>

      {runError && <p style={{ color: 'tomato' }}>{runError}</p>}
      <RunResponsePanel runs={runs} />

      {metricsError && <p style={{ color: 'tomato', marginTop: '1rem' }}>{metricsError}</p>}
      <MetricsPanel metrics={metricsData?.metrics} snapshots={metricsData?.snapshots} />
    </div>
  );
}

