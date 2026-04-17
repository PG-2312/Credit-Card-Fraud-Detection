export default function MetricsTable({ metrics }) {
  if (!metrics) return null

  const rows = [
    { label: 'Accuracy', value: metrics.accuracy },
    { label: 'Precision', value: metrics.precision },
    { label: 'Recall', value: metrics.recall },
    { label: 'F1 Score', value: metrics.f1 },
    { label: 'AUC-ROC', value: metrics.auc_roc },
    { label: 'Training Time', value: `${metrics.training_time}s`, raw: true },
  ]

  const getColor = (v) => {
    if (v >= 0.9) return 'var(--color-success-500)'
    if (v >= 0.7) return 'var(--color-warning-500)'
    return 'var(--color-danger-500)'
  }

  return (
    <table className="data-table">
      <thead>
        <tr>
          <th>Metric</th>
          <th>Value</th>
          <th>Visual</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(({ label, value, raw }) => (
          <tr key={label}>
            <td style={{ fontWeight: 600 }}>{label}</td>
            <td style={{ fontWeight: 700, color: raw ? 'var(--text)' : getColor(value) }}>
              {raw ? value : (value * 100).toFixed(2) + '%'}
            </td>
            <td style={{ width: '40%' }}>
              {!raw && (
                <div style={{
                  height: 8,
                  borderRadius: 4,
                  background: 'var(--color-surface-200)',
                  overflow: 'hidden',
                }}>
                  <div style={{
                    height: '100%',
                    width: `${value * 100}%`,
                    borderRadius: 4,
                    background: getColor(value),
                    transition: 'width 1s ease-out',
                  }} />
                </div>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
