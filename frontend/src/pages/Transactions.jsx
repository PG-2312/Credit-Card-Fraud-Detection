import { useState, useEffect } from 'react'
import { fetchTransactions, fetchTransaction } from '../api'
import TransactionDrawer from '../components/TransactionDrawer'
import { Search, ChevronLeft, ChevronRight, Filter, X } from 'lucide-react'

export default function Transactions() {
  const [data, setData] = useState({ transactions: [], total: 0, page: 1, total_pages: 0 })
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState({
    model: '',
    is_fraud: '',
    min_amount: '',
    max_amount: '',
  })
  const [showFilters, setShowFilters] = useState(false)
  const [selectedTx, setSelectedTx] = useState(null)
  const [drawerOpen, setDrawerOpen] = useState(false)

  useEffect(() => {
    loadTransactions()
  }, [page])

  const loadTransactions = async () => {
    setLoading(true)
    try {
      const params = { page, per_page: 20 }
      if (filters.model) params.model = filters.model
      if (filters.is_fraud !== '') params.is_fraud = filters.is_fraud
      if (filters.min_amount) params.min_amount = filters.min_amount
      if (filters.max_amount) params.max_amount = filters.max_amount

      const res = await fetchTransactions(params)
      setData(res)
    } catch (err) {
      console.error('Failed to load transactions:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleFilter = () => {
    setPage(1)
    loadTransactions()
  }

  const clearFilters = () => {
    setFilters({ model: '', is_fraud: '', min_amount: '', max_amount: '' })
    setPage(1)
    setTimeout(loadTransactions, 0)
  }

  const openDetail = async (tx) => {
    try {
      const detail = await fetchTransaction(tx.id)
      setSelectedTx(detail)
      setDrawerOpen(true)
    } catch (err) {
      setSelectedTx(tx)
      setDrawerOpen(true)
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800 }}>Transaction Logs</h1>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            {data.total} total transactions
          </p>
        </div>
        <button
          className={`btn ${showFilters ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setShowFilters(!showFilters)}
        >
          <Filter size={16} />
          Filters
        </button>
      </div>

      {/* Filters */}
      {showFilters && (
        <div className="card animate-fade-in" style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div className="form-group" style={{ minWidth: 150 }}>
              <label className="form-label">Model</label>
              <select
                className="form-select"
                value={filters.model}
                onChange={(e) => setFilters(f => ({ ...f, model: e.target.value }))}
              >
                <option value="">All Models</option>
                {['RandomForest', 'LogisticRegression', 'XGBoost', 'LightGBM', 'SVM', 'KNN', 'DecisionTree', 'GradientBoosting', 'AdaBoost', 'NaiveBayes'].map(m => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
            <div className="form-group" style={{ minWidth: 130 }}>
              <label className="form-label">Verdict</label>
              <select
                className="form-select"
                value={filters.is_fraud}
                onChange={(e) => setFilters(f => ({ ...f, is_fraud: e.target.value }))}
              >
                <option value="">All</option>
                <option value="true">Fraud</option>
                <option value="false">Legitimate</option>
              </select>
            </div>
            <div className="form-group" style={{ minWidth: 130 }}>
              <label className="form-label">Min Amount</label>
              <input
                className="form-input"
                type="number"
                placeholder="0"
                value={filters.min_amount}
                onChange={(e) => setFilters(f => ({ ...f, min_amount: e.target.value }))}
              />
            </div>
            <div className="form-group" style={{ minWidth: 130 }}>
              <label className="form-label">Max Amount</label>
              <input
                className="form-input"
                type="number"
                placeholder="Any"
                value={filters.max_amount}
                onChange={(e) => setFilters(f => ({ ...f, max_amount: e.target.value }))}
              />
            </div>
            <button className="btn btn-primary btn-sm" onClick={handleFilter}>
              <Search size={14} />
              Apply
            </button>
            <button className="btn btn-secondary btn-sm" onClick={clearFilters}>
              <X size={14} />
              Clear
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="card" style={{ overflow: 'auto' }}>
        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[...Array(10)].map((_, i) => (
              <div key={i} className="skeleton" style={{ height: 44 }} />
            ))}
          </div>
        ) : data.transactions.length === 0 ? (
          <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-secondary)' }}>
            <Search size={48} style={{ marginBottom: 16, opacity: 0.3 }} />
            <p style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>No transactions found</p>
            <p style={{ fontSize: 13 }}>Run some predictions to see data here</p>
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Timestamp</th>
                <th>Amount</th>
                <th>Type</th>
                <th>Model</th>
                <th>Verdict</th>
                <th>Confidence</th>
              </tr>
            </thead>
            <tbody>
              {data.transactions.map((tx) => (
                <tr key={tx.id} onClick={() => openDetail(tx)}>
                  <td style={{ fontWeight: 600 }}>#{tx.id}</td>
                  <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                    {tx.timestamp ? new Date(tx.timestamp).toLocaleString() : 'N/A'}
                  </td>
                  <td style={{ fontWeight: 600 }}>
                    ${tx.amount?.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </td>
                  <td>{tx.transaction_type}</td>
                  <td style={{ fontSize: 12 }}>{tx.model_used}</td>
                  <td>
                    <span className={`badge ${tx.is_fraud ? 'badge-fraud' : 'badge-legit'}`}>
                      {tx.is_fraud ? '⚠ Fraud' : '✓ Legit'}
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

        {/* Pagination */}
        {data.total_pages > 1 && (
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border)',
          }}>
            <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
              Page {data.page} of {data.total_pages}
            </span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                className="btn btn-secondary btn-sm"
                disabled={page <= 1}
                onClick={() => setPage(p => p - 1)}
              >
                <ChevronLeft size={14} />
                Prev
              </button>
              <button
                className="btn btn-secondary btn-sm"
                disabled={page >= data.total_pages}
                onClick={() => setPage(p => p + 1)}
              >
                Next
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Detail Drawer */}
      <TransactionDrawer
        transaction={selectedTx}
        open={drawerOpen}
        onClose={() => { setDrawerOpen(false); setSelectedTx(null) }}
      />
    </div>
  )
}
