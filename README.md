# 🛡️ FraudGuard — Financial Fraud Detection System

A full-stack machine learning system for detecting financial fraud, featuring 10 ML classifiers, real-time predictions, interactive model comparison dashboards, and AI-powered explanations.

## 🏗️ Architecture

```
financial-fraud-detection/
├── backend/                 # FastAPI + ML models
│   ├── main.py             # REST API endpoints
│   ├── train.py            # Model training script
│   ├── database.py         # SQLAlchemy + SQLite
│   ├── llm.py              # Groq LLM integration
│   └── models/             # Trained .joblib files
├── frontend/               # React + Vite + Tailwind
│   └── src/
│       ├── pages/          # 5 main pages
│       └── components/     # Reusable UI components
└── PS_20174392719_*.csv    # PaySim dataset (6.3M rows)
```

## 🤖 Models

| Model | Imbalance Strategy | Key Strength |
|-------|-------------------|--------------|
| RandomForest | class_weight='balanced' | Best precision |
| LogisticRegression | class_weight='balanced' | Fast, interpretable |
| XGBoost | scale_pos_weight | Best AUC-ROC |
| LightGBM | scale_pos_weight | Fast training |
| SVM | class_weight='balanced' | High recall |
| KNN | SMOTE | Non-parametric |
| DecisionTree | class_weight='balanced' | Interpretable |
| GradientBoosting | SMOTE | Best overall recall |
| AdaBoost | SMOTE | Ensemble strength |
| NaiveBayes | SMOTE | Probabilistic baseline |

## 🚀 Setup

### Prerequisites
- Python 3.9+
- Node.js 18+
- Groq API key (optional, for LLM explanations)

### 1. Install dependencies

```bash
# Backend
pip3 install -r backend/requirements.txt

# Frontend
cd frontend && npm install
```

### 2. Train models (first run)

```bash
python3 -m backend.train
```

This samples 500K rows from the 6.3M dataset and trains all 10 classifiers (~5-10 min).

### 3. Configure environment

```bash
cp .env.example .env
# Edit .env and add your GROQ_API_KEY
```

### 4. Start the app

```bash
# Terminal 1: Backend
python3 -m uvicorn backend.main:app --host 0.0.0.0 --port 8000

# Terminal 2: Frontend
cd frontend && npm run dev
```

Visit **http://localhost:5173**

## 📊 Features

- **Landing Page** — Animated hero with fraud stat counters
- **Dashboard** — Live summary cards, recent transactions, activity feed
- **Prediction** — Submit transactions, get fraud probability + AI explanation
- **Model Comparison** — ROC/PR curves, confusion matrices, metrics tables, overlay mode
- **Transaction Logs** — Searchable/filterable table with detail drawer

## 🔌 API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/predict` | POST | Single transaction prediction |
| `/batch-predict` | POST | Batch predictions |
| `/models/compare` | GET | All model metrics |
| `/models/list` | GET | Available models |
| `/transactions` | GET | Paginated transaction log |
| `/transactions/{id}` | GET | Transaction detail |
| `/transactions/stats` | GET | Dashboard statistics |
| `/explain/{id}` | GET (SSE) | Stream LLM explanation |
| `/health` | GET | Health check |

## 📝 Dataset

- **Source**: PaySim synthetic financial dataset
- **Size**: 6,362,620 transactions
- **Fraud rate**: 0.13% (8,213 fraudulent)
- **Features**: amount, oldbalanceOrg, newbalanceOrig, oldbalanceDest, newbalanceDest, type

## 🧠 LLM Integration

Uses Groq's `llama-3.3-70b-versatile` model to generate structured fraud explanations:
- 2-sentence summary
- Bullet list of red flags
- Recommended next step for fraud analysts

Falls back to rule-based explanations when API key is unavailable.
