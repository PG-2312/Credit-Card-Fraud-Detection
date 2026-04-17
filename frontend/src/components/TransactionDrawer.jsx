import { X } from 'lucide-react'
import TypewriterText from './TypewriterText'

export default function TransactionDrawer({ transaction, open, onClose }) {
  if (!transaction) return null

  const fields = [
    { label: 'Amount', value: `$${transaction.amount?.toLocaleString(undefined, { minimumFractionDigits: 2 })}` },
    { label: 'Type', value: transaction.transaction_type },
    { label: 'Sender Old Balance', value: `$${transaction.oldbalance_org?.toLocaleString(undefined, { minimumFractionDigits: 2 })}` },
    { label: 'Sender New Balance', value: `$${transaction.newbalance_orig?.toLocaleString(undefined, { minimumFractionDigits: 2 })}` },
    { label: 'Receiver Old Balance', value: `$${transaction.oldbalance_dest?.toLocaleString(undefined, { minimumFractionDigits: 2 })}` },
    { label: 'Receiver New Balance', value: `$${transaction.newbalance_dest?.toLocaleString(undefined, { minimumFractionDigits: 2 })}` },
    { label: 'Model', value: transaction.model_used },
    { label: 'Confidence', value: `${(transaction.confidence * 100).toFixed(1)}%` },
    { label: 'Timestamp', value: transaction.timestamp ? new Date(transaction.timestamp).toLocaleString() : 'N/A' },
  ]

  return (
    <>
      <div className={`drawer-overlay ${open ? 'open' : ''}`} onClick={onClose} />
      <div className={`drawer ${open ? 'open' : ''}`}>
        <button className="drawer-close" onClick={onClose}>
          <X size={16} />
        </button>

        <div style={{ marginBottom: 24 }}>
          <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>
            Transaction #{transaction.id}
          </h2>
          <span className={`badge ${transaction.is_fraud ? 'badge-fraud' : 'badge-legit'}`}>
            {transaction.is_fraud ? '⚠ Fraud' : '✓ Legitimate'}
          </span>
        </div>

        <div className="card" style={{ marginBottom: 20 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: 'var(--text-secondary)' }}>
            TRANSACTION DETAILS
          </h3>
          <div style={{ display: 'grid', gap: 10 }}>
            {fields.map(({ label, value }) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{label}</span>
                <span style={{ fontSize: 14, fontWeight: 600 }}>{value}</span>
              </div>
            ))}
          </div>
        </div>

        {transaction.llm_explanation && (
          <div className="card">
            <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: 'var(--text-secondary)' }}>
              🤖 AI EXPLANATION
            </h3>
            <TypewriterText text={transaction.llm_explanation} speed={8} />
          </div>
        )}
      </div>
    </>
  )
}
