import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

function formatPercent(value) {
  if (value === null || value === undefined) return '—';
  return `${Math.round(value * 100)}%`;
}

function formatDuration(ms) {
  if (!ms) return '—';
  if (ms < 1000) return `${ms} ms`;
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.round((ms % 60000) / 1000);
  if (minutes === 0) return `${seconds}s`;
  return `${minutes}m ${seconds}s`;
}

export default function MetricsPanel({ metrics, snapshots }) {
  if (!metrics) {
    return (
      <div className="card" style={{ marginTop: '1.5rem' }}>
        <p>Loading metrics…</p>
      </div>
    );
  }

  const chartData = (snapshots ?? [])
    .map((snapshot) => ({
      recordedAt: new Date(snapshot.recordedAt).toLocaleString(),
      passRateAfter: snapshot.passRateAfter,
      passRateBefore: snapshot.passRateBefore,
    }))
    .reverse();

  return (
    <div className="card" style={{ marginTop: '1.5rem' }}>
      <header
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
      >
        <div>
          <h2 style={{ margin: 0 }}>Observability</h2>
          <p style={{ margin: 0, color: '#6b7280' }}>
            Last updated {new Date(metrics.generatedAt).toLocaleString()}
          </p>
        </div>
      </header>

      <div className="metric-grid">
        <MetricTile label="Failures Seen" value={metrics.failuresSeen} accent="#ef4444" />
        <MetricTile label="Fixes Suggested" value={metrics.fixesSuggested} accent="#f97316" />
        <MetricTile label="Fixes Applied" value={metrics.fixesApplied} accent="#10b981" />
        <MetricTile
          label="Avg Time to Fix"
          value={formatDuration(metrics.avgTimeToFixMs)}
          accent="#6366f1"
        />
        <MetricTile
          label="Pass Rate (Before)"
          value={formatPercent(metrics.passRateBefore)}
          accent="#0ea5e9"
        />
        <MetricTile
          label="Pass Rate (After)"
          value={formatPercent(metrics.passRateAfter)}
          accent="#14b8a6"
        />
      </div>

      {chartData.length > 1 ? (
        <div style={{ height: 280, marginTop: '1.5rem' }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="colorAfter" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#14b8a6" stopOpacity={0.8} />
                  <stop offset="95%" stopColor="#14b8a6" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="colorBefore" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.8} />
                  <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="recordedAt" tick={{ fontSize: 12 }} />
              <YAxis domain={[0, 1]} tickFormatter={(v) => `${Math.round(v * 100)}%`} />
              <Tooltip
                formatter={(value) => formatPercent(value)}
                labelStyle={{ color: '#111827' }}
              />
              <Area
                type="monotone"
                dataKey="passRateAfter"
                stroke="#14b8a6"
                fillOpacity={1}
                fill="url(#colorAfter)"
                name="Pass Rate (After)"
              />
              <Area
                type="monotone"
                dataKey="passRateBefore"
                stroke="#0ea5e9"
                fillOpacity={1}
                fill="url(#colorBefore)"
                name="Pass Rate (Before)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <p style={{ marginTop: '1.5rem', color: '#6b7280' }}>
          Not enough data points to plot pass-rate trends yet.
        </p>
      )}
    </div>
  );
}

function MetricTile({ label, value, accent }) {
  return (
    <div className="metric-tile" style={{ borderColor: accent }}>
      <small>{label}</small>
      <strong>{value}</strong>
    </div>
  );
}

