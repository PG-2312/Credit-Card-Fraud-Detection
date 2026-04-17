export default function ConfusionMatrix({ matrix }) {
  if (!matrix) return null

  const { tn, fp, fn, tp } = matrix
  const total = tn + fp + fn + tp

  const cells = [
    { label: 'TN', value: tn, pct: tn / total, bg: '#22c55e' },
    { label: 'FP', value: fp, pct: fp / total, bg: '#f59e0b' },
    { label: 'FN', value: fn, pct: fn / total, bg: '#ef4444' },
    { label: 'TP', value: tp, pct: tp / total, bg: '#6366f1' },
  ]

  return (
    <div>
      <div className="cm-grid">
        {/* Header row */}
        <div className="cm-label"></div>
        <div className="cm-label">Predicted Legit</div>
        <div className="cm-label">Predicted Fraud</div>

        {/* Actual Legit row */}
        <div className="cm-label" style={{ writingMode: 'vertical-lr', transform: 'rotate(180deg)' }}>
          Actual Legit
        </div>
        {cells.slice(0, 2).map((c) => (
          <div
            key={c.label}
            className="cm-cell"
            style={{
              background: c.bg,
              opacity: Math.max(0.3, Math.min(1, c.pct * 10 + 0.3)),
            }}
            title={`${c.label}: ${c.value.toLocaleString()}`}
          >
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 11, opacity: 0.8 }}>{c.label}</div>
              <div>{c.value.toLocaleString()}</div>
            </div>
          </div>
        ))}

        {/* Actual Fraud row */}
        <div className="cm-label" style={{ writingMode: 'vertical-lr', transform: 'rotate(180deg)' }}>
          Actual Fraud
        </div>
        {cells.slice(2).map((c) => (
          <div
            key={c.label}
            className="cm-cell"
            style={{
              background: c.bg,
              opacity: Math.max(0.3, Math.min(1, c.pct * 10 + 0.3)),
            }}
            title={`${c.label}: ${c.value.toLocaleString()}`}
          >
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 11, opacity: 0.8 }}>{c.label}</div>
              <div>{c.value.toLocaleString()}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
