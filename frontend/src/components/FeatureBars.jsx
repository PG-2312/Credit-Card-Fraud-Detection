const COLORS = [
  '#6366f1', '#8b5cf6', '#a855f7', '#7c3aed', '#4f46e5', '#6d28d9'
]

export default function FeatureBars({ features }) {
  if (!features || features.length === 0) {
    return <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>Feature importances not available for this model.</p>
  }

  const maxImp = Math.max(...features.map(f => Math.abs(f.importance)))

  return (
    <div className="feature-bar-container">
      {features.map((f, i) => {
        const pct = maxImp > 0 ? (Math.abs(f.importance) / maxImp) * 100 : 0
        return (
          <div className="feature-bar" key={f.feature}>
            <span className="feature-bar-name">{f.feature}</span>
            <div className="feature-bar-track">
              <div
                className="feature-bar-fill"
                style={{
                  width: `${pct}%`,
                  background: `linear-gradient(90deg, ${COLORS[i % COLORS.length]}cc, ${COLORS[i % COLORS.length]})`,
                  transitionDelay: `${i * 100}ms`,
                }}
              >
                {pct > 15 && (
                  <span className="feature-bar-value">
                    {f.importance.toFixed(4)}
                  </span>
                )}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
