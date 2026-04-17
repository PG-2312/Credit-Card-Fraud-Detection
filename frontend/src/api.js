const API_BASE = import.meta.env.VITE_API_URL || '/api';

export async function fetchHealth() {
  const res = await fetch(`${API_BASE}/health`);
  return res.json();
}

export async function fetchModels() {
  const res = await fetch(`${API_BASE}/models/list`);
  return res.json();
}

export async function fetchModelComparison() {
  const res = await fetch(`${API_BASE}/models/compare`);
  return res.json();
}

export async function predict(data) {
  const res = await fetch(`${API_BASE}/predict`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function batchPredict(data) {
  const res = await fetch(`${API_BASE}/batch-predict`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function fetchTransactions(params = {}) {
  const query = new URLSearchParams(params).toString();
  const res = await fetch(`${API_BASE}/transactions?${query}`);
  return res.json();
}

export async function fetchTransactionStats() {
  const res = await fetch(`${API_BASE}/transactions/stats`);
  return res.json();
}

export async function fetchTransaction(id) {
  const res = await fetch(`${API_BASE}/transactions/${id}`);
  return res.json();
}

export function streamExplanation(id, onChunk, onDone) {
  const eventSource = new EventSource(`${API_BASE}/explain/${id}`);

  eventSource.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.done) {
      eventSource.close();
      onDone?.();
    } else if (data.chunk) {
      onChunk(data.chunk);
    }
  };

  eventSource.onerror = () => {
    eventSource.close();
    onDone?.();
  };

  return () => eventSource.close();
}

export async function generateTransactions(count = 15) {
  const res = await fetch(`${API_BASE}/generate-transactions?count=${count}`);
  return res.json();
}

export async function batchAnalyze(transactions, modelName = 'RandomForest') {
  const res = await fetch(`${API_BASE}/batch-analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ transactions, model_name: modelName }),
  });
  return res.json();
}
