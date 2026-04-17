import { useState, useEffect } from 'react'
import { fetchModelComparison } from '../api'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, BarChart, Bar, Cell
} from 'recharts'
import MetricsTable from '../components/MetricsTable'
import ConfusionMatrix from '../components/ConfusionMatrix'
import FeatureBars from '../components/FeatureBars'
import { Layers } from 'lucide-react'

const MODEL_COLORS = {
  RandomForest: '#6366f1',
  LogisticRegression: '#ec4899',
  XGBoost: '#f59e0b',
  LightGBM: '#22c55e',
  SVM: '#ef4444',
  KNN: '#06b6d4',
  DecisionTree: '#8b5cf6',
  GradientBoosting: '#f97316',
  AdaBoost: '#14b8a6',
  NaiveBayes: '#64748b',
}

export default function ModelComparison() {
  const [metrics, setMetrics] = useState(null)
  const [selected, setSelected] = useState('RandomForest')
  const [overlay, setOverlay] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchModelComparison()
      .then(data => {
        setMetrics(data)
        setLoading(false)
      })
      .catch(err => {
        console.error(err)
        setLoading(false)
      })
  }, [])

  if (loading) {
    return (
      <div>
        <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 24 }}>Model Comparison</h1>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          {[1, 2, 3, 4].map(i => <div key={i} className="skeleton" style={{ height: 300 }} />)}
        </div>
      </div>
    )
  }

  if (!metrics) return <p>No model metrics available.</p>

  const modelNames = Object.keys(metrics)
  const selectedMetrics = metrics[selected]

  // Prepare training time chart data
  const trainingData = modelNames.map(name => ({
    name,
    time: metrics[name].training_time,
    fill: MODEL_COLORS[name] || '#6366f1',
  })).sort((a, b) => b.time - a.time)

  // Comparison summary data
  const comparisonData = modelNames.map(name => ({
    name,
    accuracy: (metrics[name].accuracy * 100).toFixed(2),
    precision: (metrics[name].precision * 100).toFixed(2),
    recall: (metrics[name].recall * 100).toFixed(2),
    f1: (metrics[name].f1 * 100).toFixed(2),
    auc_roc: (metrics[name].auc_roc * 100).toFixed(2),
  }))

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <h1 style={{ fontSize: 24, fontWeight: 800 }}>Model Comparison</h1>
        <button
          className={`btn ${overlay ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setOverlay(!overlay)}
        >
          <Layers size={16} />
          {overlay ? 'All Models Overlay ON' : 'All Models Overlay'}
        </button>
      </div>

      {/* Model Pills */}
      <div className="pill-group" style={{ marginBottom: 28 }}>
        {modelNames.map(name => (
          <button
            key={name}
            className={`pill ${selected === name ? 'active' : ''}`}
            onClick={() => setSelected(name)}
          >
            <span style={{
              display: 'inline-block',
              width: 8, height: 8, borderRadius: '50%',
              background: MODEL_COLORS[name],
              marginRight: 6,
            }} />
            {name}
          </button>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
        {/* ROC Curve */}
        <div className="card">
          <h3 className="card-title" style={{ marginBottom: 16 }}>
            {overlay ? 'ROC Curves — All Models' : `ROC Curve — ${selected}`}
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis
                dataKey="fpr"
                type="number"
                domain={[0, 1]}
                label={{ value: 'False Positive Rate', position: 'insideBottom', offset: -5, style: { fill: 'var(--text-secondary)', fontSize: 12 } }}
                tick={{ fill: 'var(--text-secondary)', fontSize: 11 }}
              />
              <YAxis
                dataKey="tpr"
                type="number"
                domain={[0, 1]}
                label={{ value: 'True Positive Rate', angle: -90, position: 'insideLeft', style: { fill: 'var(--text-secondary)', fontSize: 12 } }}
                tick={{ fill: 'var(--text-secondary)', fontSize: 11 }}
              />
              <Tooltip
                contentStyle={{
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  fontSize: 12,
                }}
              />
              {/* Diagonal reference line */}
              <Line
                data={[{ fpr: 0, tpr: 0 }, { fpr: 1, tpr: 1 }]}
                dataKey="tpr"
                stroke="var(--text-secondary)"
                strokeDasharray="5 5"
                dot={false}
                strokeWidth={1}
                opacity={0.5}
              />
              {overlay ? (
                modelNames.map(name => (
                  <Line
                    key={name}
                    data={metrics[name].roc_curve}
                    dataKey="tpr"
                    stroke={MODEL_COLORS[name]}
                    dot={false}
                    strokeWidth={name === selected ? 3 : 1.5}
                    opacity={name === selected ? 1 : 0.5}
                    name={name}
                  />
                ))
              ) : (
                <Line
                  data={selectedMetrics.roc_curve}
                  dataKey="tpr"
                  stroke={MODEL_COLORS[selected]}
                  dot={false}
                  strokeWidth={2.5}
                  name={selected}
                />
              )}
              {overlay && <Legend />}
            </LineChart>
          </ResponsiveContainer>
          <div style={{ textAlign: 'center', fontSize: 13, color: 'var(--text-secondary)', marginTop: 8 }}>
            AUC = {selectedMetrics.auc_roc.toFixed(4)}
          </div>
        </div>

        {/* Precision-Recall Curve */}
        <div className="card">
          <h3 className="card-title" style={{ marginBottom: 16 }}>
            {overlay ? 'PR Curves — All Models' : `Precision-Recall — ${selected}`}
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis
                dataKey="recall"
                type="number"
                domain={[0, 1]}
                label={{ value: 'Recall', position: 'insideBottom', offset: -5, style: { fill: 'var(--text-secondary)', fontSize: 12 } }}
                tick={{ fill: 'var(--text-secondary)', fontSize: 11 }}
              />
              <YAxis
                dataKey="precision"
                type="number"
                domain={[0, 1]}
                label={{ value: 'Precision', angle: -90, position: 'insideLeft', style: { fill: 'var(--text-secondary)', fontSize: 12 } }}
                tick={{ fill: 'var(--text-secondary)', fontSize: 11 }}
              />
              <Tooltip
                contentStyle={{
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  fontSize: 12,
                }}
              />
              {overlay ? (
                modelNames.map(name => (
                  <Line
                    key={name}
                    data={metrics[name].pr_curve}
                    dataKey="precision"
                    stroke={MODEL_COLORS[name]}
                    dot={false}
                    strokeWidth={name === selected ? 3 : 1.5}
                    opacity={name === selected ? 1 : 0.5}
                    name={name}
                  />
                ))
              ) : (
                <Line
                  data={selectedMetrics.pr_curve}
                  dataKey="precision"
                  stroke={MODEL_COLORS[selected]}
                  dot={false}
                  strokeWidth={2.5}
                  name={selected}
                />
              )}
              {overlay && <Legend />}
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Confusion Matrix */}
        <div className="card">
          <h3 className="card-title" style={{ marginBottom: 16 }}>Confusion Matrix — {selected}</h3>
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <ConfusionMatrix matrix={selectedMetrics.confusion_matrix} />
          </div>
          <div style={{ marginTop: 12, fontSize: 12, color: 'var(--text-secondary)', textAlign: 'center' }}>
            Strategy: {selectedMetrics.imbalance_strategy}
          </div>
        </div>

        {/* Metrics Table */}
        <div className="card">
          <h3 className="card-title" style={{ marginBottom: 16 }}>Metrics — {selected}</h3>
          <MetricsTable metrics={selectedMetrics} />
        </div>
      </div>

      {/* Feature Importances */}
      {selectedMetrics.feature_importances && (
        <div className="card" style={{ marginBottom: 20 }}>
          <h3 className="card-title" style={{ marginBottom: 16 }}>Feature Importances — {selected}</h3>
          <FeatureBars features={selectedMetrics.feature_importances} />
        </div>
      )}

      {/* Training Time Bar Chart */}
      <div className="card" style={{ marginBottom: 20 }}>
        <h3 className="card-title" style={{ marginBottom: 16 }}>Training Time Comparison</h3>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={trainingData} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis
              type="number"
              tick={{ fill: 'var(--text-secondary)', fontSize: 11 }}
              label={{ value: 'Time (seconds)', position: 'insideBottom', offset: -5, style: { fill: 'var(--text-secondary)', fontSize: 12 } }}
            />
            <YAxis
              type="category"
              dataKey="name"
              width={130}
              tick={{ fill: 'var(--text-secondary)', fontSize: 12 }}
            />
            <Tooltip
              contentStyle={{
                background: 'var(--bg-card)',
                border: '1px solid var(--border)',
                borderRadius: 8,
                fontSize: 12,
              }}
              formatter={(v) => [`${v.toFixed(2)}s`, 'Training Time']}
            />
            <Bar dataKey="time" radius={[0, 6, 6, 0]}>
              {trainingData.map((entry, i) => (
                <Cell key={i} fill={entry.fill} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* All Models Comparison Table */}
      <div className="card">
        <h3 className="card-title" style={{ marginBottom: 16 }}>All Models — Summary</h3>
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Model</th>
                <th>Accuracy</th>
                <th>Precision</th>
                <th>Recall</th>
                <th>F1</th>
                <th>AUC-ROC</th>
                <th>Strategy</th>
              </tr>
            </thead>
            <tbody>
              {comparisonData.map(row => (
                <tr
                  key={row.name}
                  onClick={() => setSelected(row.name)}
                  style={{
                    background: row.name === selected ? 'var(--color-primary-50)' : undefined,
                    cursor: 'pointer',
                  }}
                >
                  <td style={{ fontWeight: 600 }}>
                    <span style={{
                      display: 'inline-block',
                      width: 8, height: 8, borderRadius: '50%',
                      background: MODEL_COLORS[row.name],
                      marginRight: 8,
                    }} />
                    {row.name}
                  </td>
                  <td>{row.accuracy}%</td>
                  <td>{row.precision}%</td>
                  <td>{row.recall}%</td>
                  <td>{row.f1}%</td>
                  <td>{row.auc_roc}%</td>
                  <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                    {metrics[row.name].imbalance_strategy}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
