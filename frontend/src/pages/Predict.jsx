import { useState, useEffect, useRef } from 'react'
import { fetchModels, generateTransactions, batchAnalyze, streamExplanation } from '../api'
import ConfidenceGauge from '../components/ConfidenceGauge'
import FeatureBars from '../components/FeatureBars'
import TypewriterText from '../components/TypewriterText'
import {
  Radar, Loader2, AlertTriangle, ShieldCheck, ChevronDown, ChevronUp,
  Zap, RefreshCw, Activity, BarChart3, Clock, Hash, DollarSign, Brain
} from 'lucide-react'

// ─── Utilities ───────────────────────────────────────────────────
function fmt(n) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)
}

function pct(n) { return `${(n * 100).toFixed(1)}%` }

function typeBadgeColor(type) {
  switch (type) {
    case 'TRANSFER': return { bg: 'rgba(239,68,68,.12)', color: '#ef4444' }
    case 'CASH_OUT': return { bg: 'rgba(249,115,22,.12)', color: '#f97316' }
    case 'PAYMENT': return { bg: 'rgba(59,130,246,.12)', color: '#3b82f6' }
    case 'CASH_IN': return { bg: 'rgba(34,197,94,.12)', color: '#22c55e' }
    case 'DEBIT': return { bg: 'rgba(168,85,247,.12)', color: '#a855f7' }
    default: return { bg: 'rgba(107,114,128,.12)', color: '#6b7280' }
  }
}

// ─── Scan Phases ─────────────────────────────────────────────────
const PHASE = { IDLE: 0, GENERATING: 1, SCANNING: 2, DONE: 3 }

// ─── Log Entry Component ────────────────────────────────────────
function LogEntry({ entry, index }) {
  return (
    <div
      className="animate-fade-in-up"
      style={{
        display: 'flex', gap: 10, alignItems: 'flex-start',
        fontSize: 12, fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
        color: entry.type === 'error' ? '#ef4444' :
               entry.type === 'fraud' ? '#f59e0b' :
               entry.type === 'success' ? '#22c55e' :
               'var(--text-secondary)',
        padding: '3px 0',
        lineHeight: 1.6,
      }}
    >
      <span style={{ color: 'var(--text-tertiary)', minWidth: 48 }}>
        {entry.time}
      </span>
      <span>{entry.icon}</span>
      <span>{entry.message}</span>
    </div>
  )
}

// ─── Transaction Row ─────────────────────────────────────────────
function TransactionRow({ result, onExpand, expanded }) {
  const [explanation, setExplanation] = useState('')
  const [streaming, setStreaming] = useState(false)
  const didStream = useRef(false)

  const handleExpand = () => {
    onExpand()
    if (expanded || didStream.current) return

    // Stream LLM explanation on first expand
    didStream.current = true
    setStreaming(true)
    let full = ''
    streamExplanation(
      result.transaction_id,
      (chunk) => { full += chunk; setExplanation(full) },
      () => setStreaming(false),
    )
  }

  const tc = typeBadgeColor(result.transaction_type)
  const displayConf = result.is_fraud ? result.confidence : (1 - result.confidence)

  return (
    <div
      className="card"
      style={{
        borderLeft: `4px solid ${result.is_fraud ? 'var(--color-danger-500)' : 'var(--color-success-500)'}`,
        padding: 0, overflow: 'hidden',
        transition: 'all .25s ease',
      }}
    >
      {/* Collapsed Header */}
      <div
        onClick={handleExpand}
        style={{
          display: 'flex', alignItems: 'center', gap: 16,
          padding: '16px 20px', cursor: 'pointer',
          transition: 'background .15s ease',
        }}
        onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-tertiary)'}
        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
      >
        {/* Status Icon */}
        <div style={{
          width: 36, height: 36, borderRadius: '50%',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: result.is_fraud ? 'rgba(239,68,68,.12)' : 'rgba(34,197,94,.12)',
          flexShrink: 0,
        }}>
          {result.is_fraud
            ? <AlertTriangle size={18} color="#ef4444" />
            : <ShieldCheck size={18} color="#22c55e" />}
        </div>

        {/* TX Info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
            <span style={{ fontWeight: 700, fontSize: 13 }}>{result.tx_id}</span>
            <span style={{
              fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 6,
              background: tc.bg, color: tc.color, letterSpacing: '.5px',
            }}>
              {result.transaction_type}
            </span>
          </div>
          <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            {fmt(result.amount)}
          </span>
        </div>

        {/* Confidence */}
        <div style={{ textAlign: 'right', minWidth: 90 }}>
          <div style={{
            fontSize: 18, fontWeight: 800,
            color: result.is_fraud ? '#ef4444' : '#22c55e',
          }}>
            {pct(displayConf)}
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-tertiary)', fontWeight: 600 }}>
            {result.is_fraud ? 'FRAUD' : 'CLEAR'}
          </div>
        </div>

        {/* Expand Arrow */}
        <div style={{ color: 'var(--text-tertiary)' }}>
          {expanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
        </div>
      </div>

      {/* Expanded Detail */}
      {expanded && (
        <div
          className="animate-fade-in-up"
          style={{
            padding: '0 20px 20px',
            borderTop: '1px solid var(--border-primary)',
          }}
        >
          {/* Balance Detail Grid */}
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: 12, marginTop: 16, marginBottom: 20,
          }}>
            {[
              { label: 'Sender Before', value: fmt(result.oldbalanceOrg) },
              { label: 'Sender After', value: fmt(result.newbalanceOrig) },
              { label: 'Receiver Before', value: fmt(result.oldbalanceDest) },
              { label: 'Receiver After', value: fmt(result.newbalanceDest) },
            ].map(({ label, value }) => (
              <div key={label} style={{
                padding: '10px 14px', borderRadius: 10,
                background: 'var(--bg-tertiary)',
              }}>
                <div style={{ fontSize: 10, color: 'var(--text-tertiary)', fontWeight: 600, marginBottom: 4 }}>
                  {label}
                </div>
                <div style={{ fontSize: 14, fontWeight: 700 }}>{value}</div>
              </div>
            ))}
          </div>

          {/* Feature Contributions */}
          {result.feature_contributions && (
            <div style={{ marginBottom: 20 }}>
              <h4 style={{ fontSize: 13, fontWeight: 700, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                <BarChart3 size={14} /> Feature Contributions
              </h4>
              <FeatureBars features={result.feature_contributions} />
            </div>
          )}

          {/* AI Explanation */}
          <div style={{
            background: 'var(--bg-tertiary)', borderRadius: 12,
            padding: 16, border: '1px solid var(--border-primary)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <Brain size={16} color="var(--color-primary-500)" />
              <h4 style={{ fontSize: 13, fontWeight: 700 }}>AI Analysis</h4>
              {streaming && (
                <span style={{
                  fontSize: 10, padding: '2px 8px', borderRadius: 10,
                  background: 'var(--color-primary-100)', color: 'var(--color-primary-600)',
                  fontWeight: 600, animation: 'pulse 1.5s ease infinite',
                }}>
                  Analyzing…
                </span>
              )}
            </div>
            {explanation ? (
              <TypewriterText text={explanation} speed={streaming ? 0 : 8} />
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-tertiary)', fontSize: 12 }}>
                <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
                Generating AI explanation…
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Main Component ──────────────────────────────────────────────
export default function Predict() {
  const [models, setModels] = useState([])
  const [selectedModel, setSelectedModel] = useState('RandomForest')
  const [txCount, setTxCount] = useState(15)
  const [phase, setPhase] = useState(PHASE.IDLE)
  const [transactions, setTransactions] = useState([])
  const [results, setResults] = useState(null)
  const [processedCount, setProcessedCount] = useState(0)
  const [expandedId, setExpandedId] = useState(null)
  const [scanLog, setScanLog] = useState([])
  const [scanTime, setScanTime] = useState(0)
  const logEndRef = useRef(null)

  useEffect(() => {
    fetchModels().then(data => setModels(data.models || []))
  }, [])

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [scanLog])

  const addLog = (icon, message, type = 'info') => {
    const now = new Date()
    const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`
    setScanLog(prev => [...prev, { time, icon, message, type }])
  }

  const handleScan = async () => {
    setPhase(PHASE.GENERATING)
    setResults(null)
    setTransactions([])
    setScanLog([])
    setProcessedCount(0)
    setExpandedId(null)

    addLog('🔄', `Initializing scan engine with ${selectedModel}...`)

    // Step 1 — Generate
    addLog('📡', `Requesting ${txCount} random transactions from generator...`)
    let txData
    try {
      txData = await generateTransactions(txCount)
    } catch (e) {
      addLog('❌', `Generation failed: ${e.message}`, 'error')
      setPhase(PHASE.IDLE)
      return
    }

    setTransactions(txData.transactions)
    addLog('✅', `Received ${txData.count} transactions`, 'success')

    const types = txData.transactions.reduce((acc, t) => {
      acc[t.transaction_type] = (acc[t.transaction_type] || 0) + 1
      return acc
    }, {})
    addLog('📊', `Distribution: ${Object.entries(types).map(([k, v]) => `${k}(${v})`).join(', ')}`)

    // Step 2 — Analyze
    setPhase(PHASE.SCANNING)
    addLog('🔍', `Feeding ${txData.count} transactions to ${selectedModel}...`)
    addLog('⚙️', `Engineering 18 features per transaction...`)

    const startTime = performance.now()

    // Animate processing count
    const interval = setInterval(() => {
      setProcessedCount(prev => {
        if (prev >= txData.count) { clearInterval(interval); return prev }
        return prev + 1
      })
    }, 80)

    let analysisResult
    try {
      analysisResult = await batchAnalyze(txData.transactions, selectedModel)
    } catch (e) {
      clearInterval(interval)
      addLog('❌', `Analysis failed: ${e.message}`, 'error')
      setPhase(PHASE.IDLE)
      return
    }

    clearInterval(interval)
    setProcessedCount(txData.count)

    const elapsed = ((performance.now() - startTime) / 1000).toFixed(2)
    setScanTime(elapsed)

    addLog('🧠', `Model inference complete in ${elapsed}s`)
    addLog('📋', `Results: ${analysisResult.fraud_count} fraudulent, ${analysisResult.legit_count} legitimate`)

    if (analysisResult.fraud_count > 0) {
      addLog('🚨', `⚠ ${analysisResult.fraud_count} FRAUD ALERT(S) — Average confidence: ${pct(analysisResult.avg_fraud_confidence)}`, 'fraud')
      analysisResult.results.filter(r => r.is_fraud).forEach(r => {
        addLog('🔴', `Flagged ${r.tx_id}: ${fmt(r.amount)} ${r.transaction_type} — Confidence: ${pct(r.confidence)}`, 'fraud')
      })
    } else {
      addLog('✅', 'All transactions cleared — no fraud detected', 'success')
    }

    addLog('✅', 'Scan complete. Click any transaction for detailed AI analysis.', 'success')

    setResults(analysisResult)
    setPhase(PHASE.DONE)
  }

  const fraudResults = results?.results?.filter(r => r.is_fraud) || []
  const legitResults = results?.results?.filter(r => !r.is_fraud) || []

  return (
    <div>
      <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 4 }}>Transaction Scanner</h1>
      <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginBottom: 28 }}>
        Generate random transactions and scan them for fraud using any of the 10 trained ML models.
      </p>

      {/* ─── Controls ─────────────────────────────────────────── */}
      <div className="card animate-fade-in-up" style={{ marginBottom: 24 }}>
        <div style={{
          display: 'flex', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap',
        }}>
          {/* Model */}
          <div className="form-group" style={{ marginBottom: 0, flex: 1, minWidth: 180 }}>
            <label className="form-label" style={{ marginBottom: 6 }}>Model</label>
            <select
              className="form-select"
              value={selectedModel}
              onChange={e => setSelectedModel(e.target.value)}
              disabled={phase === PHASE.SCANNING}
            >
              {models.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>

          {/* Count */}
          <div className="form-group" style={{ marginBottom: 0, width: 120 }}>
            <label className="form-label" style={{ marginBottom: 6 }}>Transactions</label>
            <select
              className="form-select"
              value={txCount}
              onChange={e => setTxCount(Number(e.target.value))}
              disabled={phase === PHASE.SCANNING}
            >
              {[5, 10, 15, 20, 25, 30].map(n => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>

          {/* Scan Button */}
          <button
            className="btn btn-primary"
            onClick={handleScan}
            disabled={phase === PHASE.SCANNING || phase === PHASE.GENERATING}
            style={{
              height: 42, paddingInline: 28,
              display: 'flex', alignItems: 'center', gap: 8,
            }}
          >
            {phase === PHASE.SCANNING || phase === PHASE.GENERATING ? (
              <><Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> Scanning...</>
            ) : phase === PHASE.DONE ? (
              <><RefreshCw size={16} /> New Scan</>
            ) : (
              <><Radar size={16} /> Generate & Scan</>
            )}
          </button>
        </div>

        {/* Progress Bar */}
        {(phase === PHASE.SCANNING || phase === PHASE.GENERATING) && (
          <div style={{ marginTop: 16 }}>
            <div style={{
              display: 'flex', justifyContent: 'space-between',
              fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6,
            }}>
              <span>{phase === PHASE.GENERATING ? 'Generating transactions...' : `Analyzing transaction ${processedCount}/${txCount}...`}</span>
              <span>{phase === PHASE.SCANNING ? `${Math.min(Math.round((processedCount / txCount) * 100), 100)}%` : ''}</span>
            </div>
            <div style={{
              height: 6, borderRadius: 3, background: 'var(--bg-tertiary)', overflow: 'hidden',
            }}>
              <div style={{
                height: '100%', borderRadius: 3,
                background: 'linear-gradient(90deg, var(--color-primary-500), var(--color-primary-400))',
                width: phase === PHASE.GENERATING ? '30%' : `${Math.min((processedCount / txCount) * 100, 100)}%`,
                transition: 'width .2s ease',
                animation: phase === PHASE.GENERATING ? 'pulse 1.2s ease infinite' : undefined,
              }} />
            </div>
          </div>
        )}
      </div>

      {/* ─── Main content grid ───────────────────────────────── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: results ? '1fr 340px' : '1fr',
        gap: 24,
      }}>
        {/* Left: Results */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Summary Stats */}
          {results && (
            <div className="animate-fade-in-up" style={{
              display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
              gap: 12,
            }}>
              {[
                { icon: <Hash size={16} />, label: 'Total Scanned', value: results.total, color: 'var(--color-primary-500)' },
                { icon: <AlertTriangle size={16} />, label: 'Fraud Detected', value: results.fraud_count, color: '#ef4444' },
                { icon: <ShieldCheck size={16} />, label: 'Cleared', value: results.legit_count, color: '#22c55e' },
                { icon: <Activity size={16} />, label: 'Fraud Rate', value: pct(results.fraud_rate), color: '#f59e0b' },
                { icon: <Clock size={16} />, label: 'Scan Time', value: `${scanTime}s`, color: 'var(--color-primary-500)' },
              ].map(({ icon, label, value, color }) => (
                <div key={label} className="card" style={{ padding: '14px 16px', textAlign: 'center' }}>
                  <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 6, color }}>{icon}</div>
                  <div style={{ fontSize: 22, fontWeight: 800, color }}>{value}</div>
                  <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '.5px' }}>
                    {label}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Fraud Alerts */}
          {fraudResults.length > 0 && (
            <div className="animate-fade-in-up">
              <h3 style={{
                fontSize: 14, fontWeight: 700, marginBottom: 12,
                display: 'flex', alignItems: 'center', gap: 8,
                color: '#ef4444',
              }}>
                <AlertTriangle size={16} /> Fraud Alerts ({fraudResults.length})
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {fraudResults.map(r => (
                  <TransactionRow
                    key={r.transaction_id}
                    result={r}
                    expanded={expandedId === r.transaction_id}
                    onExpand={() => setExpandedId(expandedId === r.transaction_id ? null : r.transaction_id)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Cleared Transactions */}
          {legitResults.length > 0 && (
            <div className="animate-fade-in-up">
              <h3 style={{
                fontSize: 14, fontWeight: 700, marginBottom: 12,
                display: 'flex', alignItems: 'center', gap: 8,
                color: '#22c55e',
              }}>
                <ShieldCheck size={16} /> Cleared Transactions ({legitResults.length})
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {legitResults.map(r => (
                  <TransactionRow
                    key={r.transaction_id}
                    result={r}
                    expanded={expandedId === r.transaction_id}
                    onExpand={() => setExpandedId(expandedId === r.transaction_id ? null : r.transaction_id)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Idle state */}
          {phase === PHASE.IDLE && !results && (
            <div className="card" style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              justifyContent: 'center', padding: '60px 20px',
              textAlign: 'center', color: 'var(--text-tertiary)',
            }}>
              <Radar size={48} style={{ marginBottom: 16, opacity: 0.4 }} />
              <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8, color: 'var(--text-secondary)' }}>
                No Scan Results Yet
              </h3>
              <p style={{ fontSize: 13, maxWidth: 380, lineHeight: 1.6 }}>
                Select a model and click <strong>"Generate & Scan"</strong> to create random transactions
                and analyze them for fraud in real time.
              </p>
            </div>
          )}
        </div>

        {/* Right: Scan Log */}
        {(scanLog.length > 0) && (
          <div className="card animate-fade-in-up" style={{
            padding: '16px 18px',
            height: 'fit-content',
            maxHeight: 600,
            position: 'sticky',
            top: 24,
          }}>
            <h3 style={{
              fontSize: 13, fontWeight: 700, marginBottom: 14,
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <Activity size={14} /> Scan Log
              {phase === PHASE.SCANNING && (
                <span style={{
                  width: 8, height: 8, borderRadius: '50%',
                  background: '#22c55e', animation: 'pulse 1s ease infinite',
                }} />
              )}
            </h3>
            <div style={{
              maxHeight: 520, overflowY: 'auto', paddingRight: 4,
            }}>
              {scanLog.map((entry, i) => (
                <LogEntry key={i} entry={entry} index={i} />
              ))}
              <div ref={logEndRef} />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
