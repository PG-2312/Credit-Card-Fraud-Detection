"""
FastAPI backend for the Financial Fraud Detection system.
Provides REST endpoints for predictions, model comparison, and transaction logs.
"""

import os
import sys
import json
import asyncio
from datetime import datetime
from typing import Optional
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
import warnings
warnings.filterwarnings("ignore", message="X does not have valid feature names")
from dotenv import load_dotenv

load_dotenv()

from fastapi import FastAPI, Depends, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from sqlalchemy import desc, func

from backend.database import init_db, get_db, Transaction
from backend.llm import get_explanation_sync, stream_explanation, TYPE_MAP

# -------------------------------------------------------------------
# App setup
# -------------------------------------------------------------------
app = FastAPI(
    title="Financial Fraud Detection API",
    description="ML-powered fraud detection with 10 classifiers and LLM explanations",
    version="2.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# -------------------------------------------------------------------
# Load models and artifacts at startup
# -------------------------------------------------------------------
MODELS_DIR = os.path.join(os.path.dirname(__file__), "models")

# Type encoding — deterministic mapping (must match training)
TYPE_ENCODING = {
    "PAYMENT": 0,
    "TRANSFER": 1,
    "CASH_OUT": 2,
    "DEBIT": 3,
    "CASH_IN": 4,
}

# V2 feature columns — loaded dynamically from training artifacts, with fallback
FEATURE_COLUMNS = [
    "amount", "oldbalanceOrg", "newbalanceOrig", "oldbalanceDest", "newbalanceDest",
    "type_encoded",
    "errorBalanceOrig", "errorBalanceDest",
    "amountRatioOrig", "amountRatioDest",
    "isFullDrain", "isHighRiskType", "moneyVanished", "amountEqualsBalance",
    "origBalanceChange", "destBalanceChange",
    "origChangeDiff", "destChangeDiff",
]

loaded_models = {}
loaded_metrics = {}
scaler = None


@app.on_event("startup")
def startup():
    """Load all trained models and metrics."""
    global scaler, loaded_models, loaded_metrics, FEATURE_COLUMNS

    init_db()

    # Load feature columns from training artifact (if available)
    fc_path = os.path.join(MODELS_DIR, "feature_columns.json")
    if os.path.exists(fc_path):
        with open(fc_path) as f:
            FEATURE_COLUMNS = json.load(f)
        print(f"✅ Feature columns loaded ({len(FEATURE_COLUMNS)} features)")

    # Load scaler
    scaler_path = os.path.join(MODELS_DIR, "scaler.joblib")
    if os.path.exists(scaler_path):
        scaler = joblib.load(scaler_path)
        print("✅ Scaler loaded")

    # Load all metrics
    metrics_path = os.path.join(MODELS_DIR, "all_metrics.json")
    if os.path.exists(metrics_path):
        with open(metrics_path) as f:
            loaded_metrics = json.load(f)
        print(f"✅ Loaded metrics for {len(loaded_metrics)} models")

    # Load model files
    model_names = [
        "RandomForest", "LogisticRegression", "XGBoost", "LightGBM",
        "SVM", "KNN", "DecisionTree", "GradientBoosting", "AdaBoost", "NaiveBayes",
    ]
    for name in model_names:
        model_path = os.path.join(MODELS_DIR, f"{name}.joblib")
        if os.path.exists(model_path):
            loaded_models[name] = joblib.load(model_path)
            print(f"  ✅ Loaded {name}")

    print(f"\n🚀 {len(loaded_models)} models ready for prediction")
    print(f"📊 Features ({len(FEATURE_COLUMNS)}): {', '.join(FEATURE_COLUMNS)}")


# -------------------------------------------------------------------
# Pydantic schemas
# -------------------------------------------------------------------
class TransactionInput(BaseModel):
    """Input schema for a single transaction prediction."""
    amount: float = Field(..., description="Transaction amount")
    oldbalanceOrg: float = Field(..., description="Sender's balance before transaction")
    newbalanceOrig: float = Field(..., description="Sender's balance after transaction")
    oldbalanceDest: float = Field(..., description="Receiver's balance before transaction")
    newbalanceDest: float = Field(..., description="Receiver's balance after transaction")
    transaction_type: str = Field("TRANSFER", description="Transaction type: PAYMENT, TRANSFER, CASH_OUT, DEBIT, CASH_IN")
    model_name: str = Field("RandomForest", description="Model to use for prediction")


class BatchInput(BaseModel):
    """Input schema for batch predictions."""
    transactions: list[TransactionInput]
    model_name: str = Field("RandomForest", description="Model to use for all predictions")


class PredictionResponse(BaseModel):
    """Output schema for a prediction result."""
    transaction_id: int
    prediction: int
    confidence: float
    is_fraud: bool
    model_used: str
    feature_contributions: Optional[list[dict]] = None
    llm_explanation: Optional[str] = None


# -------------------------------------------------------------------
# Feature Engineering (must match backend.train.engineer_features)
# -------------------------------------------------------------------
def engineer_features(tx: TransactionInput) -> pd.DataFrame:
    """
    Apply the same feature engineering as training (train.py V2).
    Produces all 18 features from 5 raw inputs + type.
    """
    type_encoded = TYPE_ENCODING.get(tx.transaction_type.upper(), 1)

    amount = tx.amount
    oldbalanceOrg = tx.oldbalanceOrg
    newbalanceOrig = tx.newbalanceOrig
    oldbalanceDest = tx.oldbalanceDest
    newbalanceDest = tx.newbalanceDest

    # Balance error features
    errorBalanceOrig = newbalanceOrig + amount - oldbalanceOrg
    errorBalanceDest = oldbalanceDest + amount - newbalanceDest

    # Ratio features
    amountRatioOrig = amount / (oldbalanceOrg + 1.0)
    amountRatioDest = amount / (oldbalanceDest + 1.0)

    # Boolean / flag features
    isFullDrain = int(oldbalanceOrg > 0 and newbalanceOrig == 0 and amount > 0)
    isHighRiskType = int(type_encoded in [1, 2])  # TRANSFER or CASH_OUT
    moneyVanished = int(newbalanceOrig == 0 and newbalanceDest == 0 and amount > 0)
    amountEqualsBalance = int(abs(amount - oldbalanceOrg) < 0.01)

    # Change features
    origBalanceChange = oldbalanceOrg - newbalanceOrig
    destBalanceChange = newbalanceDest - oldbalanceDest
    origChangeDiff = origBalanceChange - amount
    destChangeDiff = destBalanceChange - amount

    row = {
        "amount": amount,
        "oldbalanceOrg": oldbalanceOrg,
        "newbalanceOrig": newbalanceOrig,
        "oldbalanceDest": oldbalanceDest,
        "newbalanceDest": newbalanceDest,
        "type_encoded": type_encoded,
        "errorBalanceOrig": errorBalanceOrig,
        "errorBalanceDest": errorBalanceDest,
        "amountRatioOrig": amountRatioOrig,
        "amountRatioDest": amountRatioDest,
        "isFullDrain": isFullDrain,
        "isHighRiskType": isHighRiskType,
        "moneyVanished": moneyVanished,
        "amountEqualsBalance": amountEqualsBalance,
        "origBalanceChange": origBalanceChange,
        "destBalanceChange": destBalanceChange,
        "origChangeDiff": origChangeDiff,
        "destChangeDiff": destChangeDiff,
    }

    features = pd.DataFrame([row])
    # Ensure column order matches training
    features = features[FEATURE_COLUMNS]
    return features, type_encoded


# -------------------------------------------------------------------
# Helper functions
# -------------------------------------------------------------------
def get_feature_contributions(model, features_scaled: np.ndarray) -> Optional[list[dict]]:
    """Extract feature contributions for a prediction."""
    if hasattr(model, "feature_importances_"):
        importances = model.feature_importances_
        return [
            {"feature": name, "importance": float(imp)}
            for name, imp in sorted(
                zip(FEATURE_COLUMNS, importances),
                key=lambda x: abs(x[1]),
                reverse=True,
            )
        ]
    elif hasattr(model, "coef_"):
        coefs = model.coef_[0] if model.coef_.ndim > 1 else model.coef_
        return [
            {"feature": name, "importance": float(abs(c))}
            for name, c in sorted(
                zip(FEATURE_COLUMNS, coefs),
                key=lambda x: abs(x[1]),
                reverse=True,
            )
        ]
    return None


def make_prediction(model, model_name: str, features: pd.DataFrame, type_encoded: int, tx: TransactionInput, db: Session) -> dict:
    """Core prediction logic shared between single and batch endpoints."""
    if scaler is None:
        raise HTTPException(status_code=500, detail="Scaler not loaded. Run training first.")

    features_scaled = scaler.transform(features)
    prediction = int(model.predict(features_scaled)[0])

    if hasattr(model, "predict_proba"):
        confidence = float(model.predict_proba(features_scaled)[0][1])
    elif hasattr(model, "decision_function"):
        raw = model.decision_function(features_scaled)[0]
        confidence = float(1 / (1 + np.exp(-raw)))  # sigmoid
    else:
        confidence = float(prediction)

    is_fraud = prediction == 1
    feature_contributions = get_feature_contributions(model, features_scaled)

    # Generate LLM explanation
    feature_dict = {
        "amount": tx.amount,
        "oldbalanceOrg": tx.oldbalanceOrg,
        "newbalanceOrig": tx.newbalanceOrig,
        "oldbalanceDest": tx.oldbalanceDest,
        "newbalanceDest": tx.newbalanceDest,
        "type_encoded": type_encoded,
    }
    llm_explanation = get_explanation_sync(
        features=feature_dict,
        model_name=model_name,
        confidence=confidence,
        top_features=feature_contributions or [],
        is_fraud=is_fraud
    )

    # Store in database
    db_transaction = Transaction(
        amount=tx.amount,
        oldbalance_org=tx.oldbalanceOrg,
        newbalance_orig=tx.newbalanceOrig,
        oldbalance_dest=tx.oldbalanceDest,
        newbalance_dest=tx.newbalanceDest,
        transaction_type=tx.transaction_type,
        type_encoded=type_encoded,
        model_used=model_name,
        prediction=prediction,
        confidence=confidence,
        is_fraud=is_fraud,
        feature_contributions=json.dumps(feature_contributions) if feature_contributions else None,
        llm_explanation=llm_explanation,
    )
    db.add(db_transaction)
    db.commit()
    db.refresh(db_transaction)

    return {
        "transaction_id": db_transaction.id,
        "prediction": prediction,
        "confidence": confidence,
        "is_fraud": is_fraud,
        "model_used": model_name,
        "feature_contributions": feature_contributions,
        "llm_explanation": llm_explanation,
    }


# -------------------------------------------------------------------
# Endpoints
# -------------------------------------------------------------------
@app.post("/predict", response_model=PredictionResponse)
def predict(tx: TransactionInput, db: Session = Depends(get_db)):
    """Predict fraud for a single transaction."""
    model_name = tx.model_name
    if model_name not in loaded_models:
        raise HTTPException(status_code=404, detail=f"Model '{model_name}' not found. Available: {list(loaded_models.keys())}")

    model = loaded_models[model_name]
    features, type_encoded = engineer_features(tx)

    result = make_prediction(model, model_name, features, type_encoded, tx, db)
    return result


@app.post("/batch-predict")
def batch_predict(batch: BatchInput, db: Session = Depends(get_db)):
    """Predict fraud for multiple transactions."""
    model_name = batch.model_name
    if model_name not in loaded_models:
        raise HTTPException(status_code=404, detail=f"Model '{model_name}' not found.")

    model = loaded_models[model_name]
    results = []

    for tx in batch.transactions:
        tx.model_name = model_name
        features, type_encoded = engineer_features(tx)
        result = make_prediction(model, model_name, features, type_encoded, tx, db)
        results.append(result)

    return {
        "total": len(results),
        "fraud_count": sum(1 for r in results if r["is_fraud"]),
        "results": results,
    }


@app.get("/models/compare")
def compare_models():
    """Get comparison metrics for all trained models."""
    if not loaded_metrics:
        raise HTTPException(status_code=404, detail="No model metrics found. Run training first.")

    return loaded_metrics


@app.get("/models/list")
def list_models():
    """List all available models."""
    return {
        "models": list(loaded_models.keys()),
        "count": len(loaded_models),
    }


@app.get("/transactions")
def get_transactions(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    model: Optional[str] = None,
    is_fraud: Optional[bool] = None,
    min_amount: Optional[float] = None,
    max_amount: Optional[float] = None,
    search: Optional[str] = None,
    db: Session = Depends(get_db),
):
    """Get paginated transaction log with filters."""
    query = db.query(Transaction).order_by(desc(Transaction.timestamp))

    if model:
        query = query.filter(Transaction.model_used == model)
    if is_fraud is not None:
        query = query.filter(Transaction.is_fraud == is_fraud)
    if min_amount is not None:
        query = query.filter(Transaction.amount >= min_amount)
    if max_amount is not None:
        query = query.filter(Transaction.amount <= max_amount)

    total = query.count()
    transactions = query.offset((page - 1) * per_page).limit(per_page).all()

    return {
        "total": total,
        "page": page,
        "per_page": per_page,
        "total_pages": (total + per_page - 1) // per_page,
        "transactions": [t.to_dict() for t in transactions],
    }


@app.get("/transactions/stats")
def get_transaction_stats(db: Session = Depends(get_db)):
    """Get summary statistics for the dashboard."""
    total = db.query(func.count(Transaction.id)).scalar() or 0
    fraud_count = db.query(func.count(Transaction.id)).filter(Transaction.is_fraud == True).scalar() or 0
    avg_confidence = db.query(func.avg(Transaction.confidence)).scalar() or 0

    # Today's alerts
    today = datetime.utcnow().date()
    today_alerts = db.query(func.count(Transaction.id)).filter(
        Transaction.is_fraud == True,
        func.date(Transaction.timestamp) == today,
    ).scalar() or 0

    # Recent transactions for activity feed
    recent = db.query(Transaction).order_by(desc(Transaction.timestamp)).limit(10).all()

    return {
        "total_transactions": total,
        "fraud_count": fraud_count,
        "fraud_rate": fraud_count / total if total > 0 else 0,
        "avg_confidence": float(avg_confidence),
        "alerts_today": today_alerts,
        "recent_transactions": [t.to_dict() for t in recent],
    }


@app.get("/transactions/{transaction_id}")
def get_transaction(transaction_id: int, db: Session = Depends(get_db)):
    """Get a single transaction with full details and LLM explanation."""
    transaction = db.query(Transaction).filter(Transaction.id == transaction_id).first()
    if not transaction:
        raise HTTPException(status_code=404, detail="Transaction not found")

    return transaction.to_dict()


@app.get("/explain/{transaction_id}")
async def explain_transaction(transaction_id: int, db: Session = Depends(get_db)):
    """Stream LLM explanation for a transaction via Server-Sent Events."""
    transaction = db.query(Transaction).filter(Transaction.id == transaction_id).first()
    if not transaction:
        raise HTTPException(status_code=404, detail="Transaction not found")

    feature_dict = {
        "amount": transaction.amount,
        "oldbalanceOrg": transaction.oldbalance_org,
        "newbalanceOrig": transaction.newbalance_orig,
        "oldbalanceDest": transaction.oldbalance_dest,
        "newbalanceDest": transaction.newbalance_dest,
        "type_encoded": transaction.type_encoded,
    }

    # Get feature contributions
    contributions = json.loads(transaction.feature_contributions) if transaction.feature_contributions else []

    async def event_generator():
        full_text = ""
        async for chunk in stream_explanation(
            features=feature_dict,
            model_name=transaction.model_used,
            confidence=transaction.confidence,
            top_features=contributions,
            is_fraud=transaction.is_fraud
        ):
            full_text += chunk
            yield f"data: {json.dumps({'chunk': chunk})}\n\n"

        # Update stored explanation
        transaction.llm_explanation = full_text
        db.commit()

        yield f"data: {json.dumps({'done': True})}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        },
    )


@app.get("/generate-transactions")
def generate_transactions(count: int = Query(15, ge=5, le=30)):
    """Generate realistic random transactions for scanning demo."""
    import random

    txs = []
    # ~20-30% will be fraud patterns
    n_fraud = random.randint(max(1, count // 5), max(2, count // 3))
    fraud_indices = set(random.sample(range(count), n_fraud))

    tx_types_legit = ["PAYMENT", "CASH_IN", "DEBIT", "TRANSFER", "CASH_OUT"]
    tx_types_fraud = ["TRANSFER", "CASH_OUT"]

    for i in range(count):
        is_fraud_pattern = i in fraud_indices

        if is_fraud_pattern:
            # Fraudulent transaction patterns
            tx_type = random.choice(tx_types_fraud)
            amount = round(random.uniform(5000, 900000), 2)
            old_bal_org = amount  # exact match = drain
            new_bal_orig = 0.0
            old_bal_dest = round(random.uniform(0, 50000), 2)
            # Money vanishes or goes to mule
            if random.random() < 0.5:
                new_bal_dest = old_bal_dest  # money vanished
            else:
                new_bal_dest = round(old_bal_dest + amount, 2)
        else:
            # Normal transaction patterns
            tx_type = random.choice(tx_types_legit)
            amount = round(random.uniform(10, 50000), 2)
            old_bal_org = round(random.uniform(amount, amount * 10), 2)

            if tx_type in ["PAYMENT", "TRANSFER", "CASH_OUT", "DEBIT"]:
                new_bal_orig = round(old_bal_org - amount, 2)
            else:
                new_bal_orig = round(old_bal_org + amount, 2)

            old_bal_dest = round(random.uniform(0, 500000), 2)
            new_bal_dest = round(old_bal_dest + amount, 2)

        txs.append({
            "id": f"TXN-{random.randint(100000, 999999)}",
            "amount": amount,
            "oldbalanceOrg": old_bal_org,
            "newbalanceOrig": new_bal_orig,
            "oldbalanceDest": old_bal_dest,
            "newbalanceDest": new_bal_dest,
            "transaction_type": tx_type,
        })

    random.shuffle(txs)
    return {"transactions": txs, "count": len(txs)}


class QuickAnalyzeInput(BaseModel):
    """Input for fast batch analysis without LLM."""
    transactions: list[dict]
    model_name: str = "RandomForest"


@app.post("/batch-analyze")
def batch_analyze(payload: QuickAnalyzeInput, db: Session = Depends(get_db)):
    """Fast batch analysis — runs ML prediction without LLM for speed."""
    model_name = payload.model_name
    if model_name not in loaded_models:
        raise HTTPException(status_code=404, detail=f"Model '{model_name}' not found.")

    model = loaded_models[model_name]
    results = []

    for tx_data in payload.transactions:
        tx = TransactionInput(
            amount=tx_data["amount"],
            oldbalanceOrg=tx_data["oldbalanceOrg"],
            newbalanceOrig=tx_data["newbalanceOrig"],
            oldbalanceDest=tx_data["oldbalanceDest"],
            newbalanceDest=tx_data["newbalanceDest"],
            transaction_type=tx_data["transaction_type"],
            model_name=model_name,
        )

        features, type_encoded = engineer_features(tx)
        features_scaled = scaler.transform(features)
        prediction = int(model.predict(features_scaled)[0])

        if hasattr(model, "predict_proba"):
            confidence = float(model.predict_proba(features_scaled)[0][1])
        elif hasattr(model, "decision_function"):
            raw = model.decision_function(features_scaled)[0]
            confidence = float(1 / (1 + np.exp(-raw)))
        else:
            confidence = float(prediction)

        is_fraud = prediction == 1
        feature_contributions = get_feature_contributions(model, features_scaled)

        # Store in database (without LLM explanation — that's fetched on demand)
        db_transaction = Transaction(
            amount=tx.amount,
            oldbalance_org=tx.oldbalanceOrg,
            newbalance_orig=tx.newbalanceOrig,
            oldbalance_dest=tx.oldbalanceDest,
            newbalance_dest=tx.newbalanceDest,
            transaction_type=tx.transaction_type,
            type_encoded=type_encoded,
            model_used=model_name,
            prediction=prediction,
            confidence=confidence,
            is_fraud=is_fraud,
            feature_contributions=json.dumps(feature_contributions) if feature_contributions else None,
            llm_explanation=None,
        )
        db.add(db_transaction)
        db.commit()
        db.refresh(db_transaction)

        results.append({
            "tx_id": tx_data.get("id", ""),
            "transaction_id": db_transaction.id,
            "amount": tx.amount,
            "transaction_type": tx.transaction_type,
            "oldbalanceOrg": tx.oldbalanceOrg,
            "newbalanceOrig": tx.newbalanceOrig,
            "oldbalanceDest": tx.oldbalanceDest,
            "newbalanceDest": tx.newbalanceDest,
            "prediction": prediction,
            "confidence": confidence,
            "is_fraud": is_fraud,
            "feature_contributions": feature_contributions,
        })

    fraud_results = [r for r in results if r["is_fraud"]]
    legit_results = [r for r in results if not r["is_fraud"]]

    return {
        "total": len(results),
        "fraud_count": len(fraud_results),
        "legit_count": len(legit_results),
        "fraud_rate": len(fraud_results) / len(results) if results else 0,
        "avg_fraud_confidence": sum(r["confidence"] for r in fraud_results) / len(fraud_results) if fraud_results else 0,
        "model_used": model_name,
        "results": results,
    }


@app.get("/health")
def health_check():
    """Health check endpoint."""
    return {
        "status": "healthy",
        "models_loaded": len(loaded_models),
        "model_names": list(loaded_models.keys()),
    }
