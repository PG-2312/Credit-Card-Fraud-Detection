import { useState, useEffect } from 'react'
import { fetchTransactionStats, fetchModels } from '../api'
import {
  Activity, AlertTriangle, TrendingUp, ShieldCheck,
  ArrowUpRight, ArrowDownRight, Clock
} from 'lucide-react'

export default function Dashboard() {
  const [stats, setStats] = useState(null)
  const [models, setModels] = useState([])
  const [selectedModel, setSelectedModel] = useState('RandomForest')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadData()
    const interval = setInterval(loadData, 15000) // refresh every 15s
    return () => clearInterval(interval)
  }, [])

  const loadData = async () => {
    try {
      const [s, m] = await Promise.all([
        fetchTransactionStats(),
        fetchModels(),
      ])
      setStats(s)
      setModels(m.models || [])
    } catch (e) {
      console.error('Dashboard load error:', e)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div>
        <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 24 }}>Dashboard</h1>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 20 }}>
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="skeleton" style={{ height: 140 }} />
          ))}
        </div>
      </div>
    )
  }

  const summaryCards = [
    {
      label: 'Total Transactions',
      value: stats?.total_transactions || 0,
      icon: Activity,
      iconClass: 'purple',
      format: (v) => v.toLocaleString(),
    },
    {
      label: 'Fraud Rate',
      value: stats?.fraud_rate || 0,
      icon: AlertTriangle,
      iconClass: 'red',
      format: (v) => `${(v * 100).toFixed(1)}%`,
    },
    {
      label: 'Avg Confidence',
      value: stats?.avg_confidence || 0,
      icon: TrendingUp,
      iconClass: 'green',
      format: (v) => `${(v * 100).toFixed(1)}%`,
    },
    {
      label: 'Alerts Today',
      value: stats?.alerts_today || 0,
      icon: ShieldCheck,
      iconClass: 'amber',
      format: (v) => v.toLocaleString(),
    },
  ]

  const recent = stats?.recent_transactions || []

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <h1 style={{ fontSize: 24, fontWeight: 800 }}>Dashboard</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 500 }}>Active Model:</span>
          <select
            className="form-select"
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
            style={{ padding: '6px 12px', fontSize: 13 }}
          >
            {models.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
      </div>

      {/* Summary Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: 20,
        marginBottom: 28,
      }}>
        {summaryCards.map(({ label, value, icon: Icon, iconClass, format }, i) => (
          <div
            key={label}
            className="card stat-card animate-fade-in-up"
            style={{ animationDelay: `${i * 0.1}s`, opacity: 0 }}
          >
            <div className={`stat-icon ${iconClass}`}>
              <Icon size={22} />
            </div>
            <div className="stat-label">{label}</div>
            <div className="stat-value">{format(value)}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 20 }}>
        {/* Recent Transactions */}
        <div className="card animate-fade-in-up anim-delay-2" style={{ overflow: 'auto' }}>
          <div className="card-header">
            <h3 className="card-title">Recent Transactions</h3>
            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              <Clock size={12} style={{ display: 'inline', marginRight: 4 }} />
              Live
            </span>
          </div>

          {recent.length === 0 ? (
            <div style={{
              padding: 40, textAlign: 'center', color: 'var(--text-secondary)',
            }}>
              <Activity size={40} style={{ marginBottom: 12, opacity: 0.3 }} />
              <p style={{ fontSize: 14 }}>No transactions yet</p>
              <p style={{ fontSize: 12 }}>Run a prediction to see data here</p>
            </div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Amount</th>
                  <th>Type</th>
                  <th>Model</th>
                  <th>Verdict</th>
                  <th>Confidence</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((tx) => (
                  <tr key={tx.id}>
                    <td style={{ fontWeight: 600 }}>#{tx.id}</td>
                    <td>${tx.amount?.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                    <td>{tx.transaction_type}</td>
                    <td style={{ fontSize: 12 }}>{tx.model_used}</td>
                    <td>
                      <span className={`badge ${tx.is_fraud ? 'badge-fraud' : 'badge-legit'}`}>
                        {tx.is_fraud ? 'Fraud' : 'Legit'}
                      </span>
                    </td>
                    <td>
                      <span style={{
                        fontWeight: 700,
                        color: tx.confidence > 0.7 ? 'var(--color-danger-500)' : 'var(--color-success-500)',
                      }}>
                        {(tx.confidence * 100).toFixed(1)}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Activity Feed */}
        <div className="card animate-fade-in-up anim-delay-3">
          <div className="card-header">
            <h3 className="card-title">Activity Feed</h3>
          </div>

          {recent.length === 0 ? (
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', textAlign: 'center', padding: 20 }}>
              No activity yet
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {recent.slice(0, 8).map((tx, i) => (
                <div
                  key={tx.id}
                  style={{
                    display: 'flex', gap: 12, alignItems: 'flex-start',
                    paddingBottom: 12,
                    borderBottom: i < recent.length - 1 ? '1px solid var(--border)' : 'none',
                  }}
                >
                  <div style={{
                    width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: tx.is_fraud ? 'var(--color-danger-100)' : 'var(--color-success-100)',
                    color: tx.is_fraud ? 'var(--color-danger-500)' : 'var(--color-success-500)',
                  }}>
                    {tx.is_fraud ? <ArrowUpRight size={16} /> : <ArrowDownRight size={16} />}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>
                      {tx.is_fraud ? 'Fraud Detected' : 'Transaction Cleared'}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                      ${tx.amount?.toLocaleString()} • {tx.model_used}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>
                      {tx.timestamp ? new Date(tx.timestamp).toLocaleTimeString() : ''}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
