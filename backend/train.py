"""
Seed script: trains all 10 ML classifiers on the fraud detection dataset.
Saves models, scaler, and metrics to backend/models/.

FEATURE ENGINEERING V2:
- Balance error features (key fraud signal: money doesn't add up)
- Ratio features (amount relative to balance)
- Boolean flags (full drain, high-risk type)
- Interaction features

Usage: python3 -m backend.train
"""

import os
import sys
import json
import time
import warnings
import numpy as np
import pandas as pd
import joblib
from pathlib import Path

from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import (
    accuracy_score, precision_score, recall_score, f1_score,
    roc_auc_score, confusion_matrix, roc_curve, precision_recall_curve,
)
from sklearn.ensemble import (
    RandomForestClassifier, GradientBoostingClassifier, AdaBoostClassifier,
)
from sklearn.linear_model import LogisticRegression
from sklearn.svm import SVC
from sklearn.neighbors import KNeighborsClassifier
from sklearn.tree import DecisionTreeClassifier
from sklearn.naive_bayes import GaussianNB
from xgboost import XGBClassifier
from lightgbm import LGBMClassifier
from imblearn.over_sampling import SMOTE

warnings.filterwarnings("ignore")

# -------------------------------------------------------------------
# Configuration
# -------------------------------------------------------------------
DATASET_PATH = os.path.join(os.path.dirname(__file__), "..", "PS_20174392719_1491204439457_log.csv")
MODELS_DIR = os.path.join(os.path.dirname(__file__), "models")
SAMPLE_SIZE = 1_000_000  # Larger sample for better fraud representation
RANDOM_STATE = 42
TEST_SIZE = 0.2

# Type encoding mapping (deterministic — NOT pd.factorize)
TYPE_ENCODING = {
    "PAYMENT": 0,
    "TRANSFER": 1,
    "CASH_OUT": 2,
    "DEBIT": 3,
    "CASH_IN": 4,
}


def engineer_features(df: pd.DataFrame) -> pd.DataFrame:
    """
    Create domain-specific features that capture fraud patterns.

    Key insight from data analysis:
    - Fraud ONLY occurs in TRANSFER and CASH_OUT types
    - Fraud transactions drain the sender account completely
    - Balance errors (money that doesn't add up) are the strongest signal
    """
    feat = pd.DataFrame()

    # --- Raw features (scaled later) ---
    feat["amount"] = df["amount"]
    feat["oldbalanceOrg"] = df["oldbalanceOrg"]
    feat["newbalanceOrig"] = df["newbalanceOrig"]
    feat["oldbalanceDest"] = df["oldbalanceDest"]
    feat["newbalanceDest"] = df["newbalanceDest"]
    feat["type_encoded"] = df["type"].map(TYPE_ENCODING) if "type" in df.columns else df["type_encoded"]

    # --- Balance Error Features (THE key fraud signals) ---
    # For legit transactions: newbalanceOrig = oldbalanceOrg - amount (error ≈ 0)
    # For fraud: the books don't balance
    feat["errorBalanceOrig"] = feat["newbalanceOrig"] + feat["amount"] - feat["oldbalanceOrg"]

    # For legit: newbalanceDest = oldbalanceDest + amount (error ≈ 0)
    # For fraud: destination balance doesn't reflect the transfer
    feat["errorBalanceDest"] = feat["oldbalanceDest"] + feat["amount"] - feat["newbalanceDest"]

    # --- Ratio Features ---
    # What fraction of sender balance is this transaction?
    feat["amountRatioOrig"] = feat["amount"] / (feat["oldbalanceOrg"] + 1.0)

    # What fraction of destination balance is this transaction?
    feat["amountRatioDest"] = feat["amount"] / (feat["oldbalanceDest"] + 1.0)

    # --- Boolean / Flag Features ---
    # Full account drain: sender completely emptied (strongest single fraud indicator)
    feat["isFullDrain"] = ((feat["oldbalanceOrg"] > 0) &
                           (feat["newbalanceOrig"] == 0) &
                           (feat["amount"] > 0)).astype(int)

    # High-risk transaction type (fraud only happens in TRANSFER and CASH_OUT)
    feat["isHighRiskType"] = feat["type_encoded"].isin([1, 2]).astype(int)

    # Sender zeroed out but dest didn't increase (money vanished — very suspicious)
    feat["moneyVanished"] = ((feat["newbalanceOrig"] == 0) &
                             (feat["newbalanceDest"] == 0) &
                             (feat["amount"] > 0)).astype(int)

    # Amount matches old balance exactly
    feat["amountEqualsBalance"] = (np.abs(feat["amount"] - feat["oldbalanceOrg"]) < 0.01).astype(int)

    # --- Change Features ---
    feat["origBalanceChange"] = feat["oldbalanceOrg"] - feat["newbalanceOrig"]
    feat["destBalanceChange"] = feat["newbalanceDest"] - feat["oldbalanceDest"]

    # Difference between what should have changed and what actually changed
    feat["origChangeDiff"] = feat["origBalanceChange"] - feat["amount"]
    feat["destChangeDiff"] = feat["destBalanceChange"] - feat["amount"]

    return feat


# The final feature columns used by the model — MUST match at prediction time
FEATURE_COLUMNS = [
    "amount", "oldbalanceOrg", "newbalanceOrig", "oldbalanceDest", "newbalanceDest",
    "type_encoded",
    "errorBalanceOrig", "errorBalanceDest",
    "amountRatioOrig", "amountRatioDest",
    "isFullDrain", "isHighRiskType", "moneyVanished", "amountEqualsBalance",
    "origBalanceChange", "destBalanceChange",
    "origChangeDiff", "destChangeDiff",
]


def load_and_preprocess(sample_size: int = SAMPLE_SIZE) -> tuple:
    """Load dataset, engineer features, and return train/test splits."""
    print(f"📂 Loading dataset from {DATASET_PATH}...")
    df = pd.read_csv(DATASET_PATH)
    print(f"   Full dataset: {df.shape[0]:,} rows, {df.shape[1]} columns")
    print(f"   Fraud rate: {df['isFraud'].mean():.4%} ({df['isFraud'].sum():,} frauds)")

    # Stratified sample
    if sample_size and sample_size < len(df):
        print(f"📊 Sampling {sample_size:,} rows (stratified)...")
        # Keep ALL fraud rows + sample from legit
        fraud_df = df[df["isFraud"] == 1]
        legit_df = df[df["isFraud"] == 0].sample(
            n=min(sample_size - len(fraud_df), len(df[df["isFraud"] == 0])),
            random_state=RANDOM_STATE,
        )
        df = pd.concat([fraud_df, legit_df]).reset_index(drop=True)
        fraud_count = df["isFraud"].sum()
        print(f"   Sampled: {len(df):,} rows, {fraud_count:,} frauds ({fraud_count/len(df):.4%})")

    # Engineer features
    print("🔧 Engineering features...")
    X = engineer_features(df)

    # Ensure column order matches FEATURE_COLUMNS
    X = X[FEATURE_COLUMNS]
    y = df["isFraud"].copy()

    print(f"   Feature count: {len(FEATURE_COLUMNS)}")
    print(f"   Features: {', '.join(FEATURE_COLUMNS)}")

    # Train/test split
    X_train, X_test, y_train, y_test = train_test_split(
        X, y,
        test_size=TEST_SIZE,
        random_state=RANDOM_STATE,
        stratify=y,
    )

    # Scale features
    scaler = StandardScaler()
    X_train_scaled = pd.DataFrame(
        scaler.fit_transform(X_train),
        columns=FEATURE_COLUMNS,
        index=X_train.index,
    )
    X_test_scaled = pd.DataFrame(
        scaler.transform(X_test),
        columns=FEATURE_COLUMNS,
        index=X_test.index,
    )

    return X_train_scaled, X_test_scaled, y_train, y_test, scaler


def get_models() -> list[dict]:
    """Return list of model configs with imbalance handling strategy."""
    n_fraud = 8213
    n_legit = SAMPLE_SIZE
    scale_pos = max(1, int(n_legit / n_fraud))

    return [
        {
            "name": "RandomForest",
            "model": RandomForestClassifier(
                n_estimators=200, class_weight="balanced",
                max_depth=20, min_samples_split=5,
                random_state=RANDOM_STATE, n_jobs=-1,
            ),
            "imbalance_strategy": "class_weight='balanced'",
            "needs_smote": False,
        },
        {
            "name": "LogisticRegression",
            "model": LogisticRegression(
                class_weight="balanced", max_iter=2000,
                C=1.0, solver="lbfgs",
                random_state=RANDOM_STATE, n_jobs=-1,
            ),
            "imbalance_strategy": "class_weight='balanced'",
            "needs_smote": False,
        },
        {
            "name": "XGBoost",
            "model": XGBClassifier(
                n_estimators=200, scale_pos_weight=scale_pos,
                max_depth=8, learning_rate=0.1,
                random_state=RANDOM_STATE, eval_metric="logloss",
                use_label_encoder=False, n_jobs=-1,
            ),
            "imbalance_strategy": f"scale_pos_weight={scale_pos}",
            "needs_smote": False,
        },
        {
            "name": "LightGBM",
            "model": LGBMClassifier(
                n_estimators=200, is_unbalance=True,
                max_depth=8, learning_rate=0.1,
                random_state=RANDOM_STATE, verbose=-1, n_jobs=-1,
            ),
            "imbalance_strategy": "is_unbalance=True",
            "needs_smote": False,
        },
        {
            "name": "SVM",
            "model": SVC(
                class_weight="balanced", probability=True,
                random_state=RANDOM_STATE, kernel="rbf",
                C=10.0, gamma="scale",
                max_iter=10000,
            ),
            "imbalance_strategy": "class_weight='balanced'",
            "needs_smote": False,
            "use_subset": 50000,  # SVM is O(n^2), limit data
        },
        {
            "name": "KNN",
            "model": KNeighborsClassifier(
                n_neighbors=5, n_jobs=-1, weights="distance",
            ),
            "imbalance_strategy": "SMOTE oversampling",
            "needs_smote": True,
            "use_subset": 100000,  # KNN is slow on large data
        },
        {
            "name": "DecisionTree",
            "model": DecisionTreeClassifier(
                class_weight="balanced",
                max_depth=20, min_samples_split=5,
                random_state=RANDOM_STATE,
            ),
            "imbalance_strategy": "class_weight='balanced'",
            "needs_smote": False,
        },
        {
            "name": "GradientBoosting",
            "model": GradientBoostingClassifier(
                n_estimators=200, max_depth=6,
                learning_rate=0.1, subsample=0.8,
                random_state=RANDOM_STATE,
            ),
            "imbalance_strategy": "SMOTE oversampling",
            "needs_smote": True,
        },
        {
            "name": "AdaBoost",
            "model": AdaBoostClassifier(
                n_estimators=100,
                learning_rate=0.5,
                random_state=RANDOM_STATE,
                algorithm="SAMME",
            ),
            "imbalance_strategy": "SMOTE oversampling",
            "needs_smote": True,
        },
        {
            "name": "NaiveBayes",
            "model": GaussianNB(),
            "imbalance_strategy": "SMOTE oversampling",
            "needs_smote": True,
        },
    ]


def compute_metrics(model, X_test, y_test, training_time: float) -> dict:
    """Compute all evaluation metrics for a trained model."""
    y_pred = model.predict(X_test)

    # Get probability scores
    if hasattr(model, "predict_proba"):
        y_proba = model.predict_proba(X_test)[:, 1]
    elif hasattr(model, "decision_function"):
        raw = model.decision_function(X_test)
        y_proba = 1. / (1. + np.exp(-raw))
    else:
        y_proba = y_pred.astype(float)

    # Confusion matrix
    cm = confusion_matrix(y_test, y_pred)
    tn, fp, fn, tp = cm.ravel()

    # ROC curve data
    fpr, tpr, _ = roc_curve(y_test, y_proba)
    indices = np.linspace(0, len(fpr) - 1, min(200, len(fpr)), dtype=int)
    roc_data = [{"fpr": float(fpr[i]), "tpr": float(tpr[i])} for i in indices]

    # Precision-Recall curve data
    precisions, recalls, _ = precision_recall_curve(y_test, y_proba)
    indices = np.linspace(0, len(precisions) - 1, min(200, len(precisions)), dtype=int)
    pr_data = [{"precision": float(precisions[i]), "recall": float(recalls[i])} for i in indices]

    # Feature importances
    feature_importances = None
    if hasattr(model, "feature_importances_"):
        importances = model.feature_importances_
        feature_importances = [
            {"feature": name, "importance": float(imp)}
            for name, imp in sorted(
                zip(FEATURE_COLUMNS, importances),
                key=lambda x: abs(x[1]),
                reverse=True,
            )
        ]
    elif hasattr(model, "coef_"):
        coefs = model.coef_[0] if model.coef_.ndim > 1 else model.coef_
        feature_importances = [
            {"feature": name, "importance": float(abs(c))}
            for name, c in sorted(
                zip(FEATURE_COLUMNS, coefs),
                key=lambda x: abs(x[1]),
                reverse=True,
            )
        ]

    return {
        "accuracy": float(accuracy_score(y_test, y_pred)),
        "precision": float(precision_score(y_test, y_pred, zero_division=0)),
        "recall": float(recall_score(y_test, y_pred, zero_division=0)),
        "f1": float(f1_score(y_test, y_pred, zero_division=0)),
        "auc_roc": float(roc_auc_score(y_test, y_proba)),
        "confusion_matrix": {"tn": int(tn), "fp": int(fp), "fn": int(fn), "tp": int(tp)},
        "roc_curve": roc_data,
        "pr_curve": pr_data,
        "feature_importances": feature_importances,
        "training_time": round(training_time, 2),
    }


def train_all():
    """Train all 10 models and save to disk."""
    os.makedirs(MODELS_DIR, exist_ok=True)

    # Load and preprocess data
    X_train, X_test, y_train, y_test, scaler = load_and_preprocess()

    # Prepare SMOTE-resampled training data
    print("\n🔄 Preparing SMOTE-resampled data...")
    smote = SMOTE(random_state=RANDOM_STATE, n_jobs=-1)
    X_train_smote, y_train_smote = smote.fit_resample(X_train, y_train)
    print(f"   SMOTE: {len(X_train):,} → {len(X_train_smote):,} samples")

    # Save scaler, type encoding, and feature columns
    joblib.dump(scaler, os.path.join(MODELS_DIR, "scaler.joblib"))
    with open(os.path.join(MODELS_DIR, "type_encoding.json"), "w") as f:
        json.dump(TYPE_ENCODING, f)
    with open(os.path.join(MODELS_DIR, "feature_columns.json"), "w") as f:
        json.dump(FEATURE_COLUMNS, f)
    print("💾 Saved scaler, type encoding, and feature columns\n")

    # Train each model
    models_config = get_models()
    all_metrics = {}

    for i, config in enumerate(models_config, 1):
        name = config["name"]
        model = config["model"]
        needs_smote = config["needs_smote"]
        strategy = config["imbalance_strategy"]
        use_subset = config.get("use_subset")

        print(f"{'='*60}")
        print(f"[{i}/10] Training {name}...")
        print(f"   Imbalance strategy: {strategy}")

        # Select appropriate training data
        if needs_smote:
            X_tr, y_tr = X_train_smote, y_train_smote
        else:
            X_tr, y_tr = X_train, y_train

        # Subset for slow models (SVM, KNN)
        if use_subset and len(X_tr) > use_subset:
            print(f"   ⚠ Using {use_subset:,} row subset (model is slow on full data)")
            idx = np.random.RandomState(RANDOM_STATE).choice(
                len(X_tr), size=use_subset, replace=False
            )
            X_tr = X_tr.iloc[idx] if hasattr(X_tr, 'iloc') else X_tr[idx]
            y_tr = y_tr.iloc[idx] if hasattr(y_tr, 'iloc') else y_tr[idx]

        # Train with timing
        start_time = time.time()
        model.fit(X_tr, y_tr)
        training_time = time.time() - start_time

        print(f"   ⏱  Training time: {training_time:.2f}s")

        # Compute metrics
        metrics = compute_metrics(model, X_test, y_test, training_time)
        metrics["imbalance_strategy"] = strategy
        metrics["sample_size"] = SAMPLE_SIZE
        metrics["feature_count"] = len(FEATURE_COLUMNS)

        print(f"   📊 Accuracy:  {metrics['accuracy']:.4f}")
        print(f"   📊 Precision: {metrics['precision']:.4f}")
        print(f"   📊 Recall:    {metrics['recall']:.4f}")
        print(f"   📊 F1:        {metrics['f1']:.4f}")
        print(f"   📊 AUC-ROC:   {metrics['auc_roc']:.4f}")

        # Save model and metrics
        model_path = os.path.join(MODELS_DIR, f"{name}.joblib")
        joblib.dump(model, model_path)

        metrics_path = os.path.join(MODELS_DIR, f"{name}_metrics.json")
        with open(metrics_path, "w") as f:
            json.dump(metrics, f, indent=2)

        all_metrics[name] = metrics
        print(f"   💾 Saved to {model_path}")

    # Save combined metrics
    summary_path = os.path.join(MODELS_DIR, "all_metrics.json")
    with open(summary_path, "w") as f:
        json.dump(all_metrics, f, indent=2)

    print(f"\n{'='*60}")
    print("✅ All 10 models trained and saved successfully!")
    print(f"📁 Models directory: {MODELS_DIR}")
    print(f"📈 Features used ({len(FEATURE_COLUMNS)}): {', '.join(FEATURE_COLUMNS)}")

    # Print comparison table
    print(f"\n{'Model':<20} {'Accuracy':>10} {'Precision':>10} {'Recall':>10} {'F1':>10} {'AUC-ROC':>10} {'Time(s)':>10}")
    print("-" * 90)
    for name, m in all_metrics.items():
        print(f"{name:<20} {m['accuracy']:>10.4f} {m['precision']:>10.4f} {m['recall']:>10.4f} {m['f1']:>10.4f} {m['auc_roc']:>10.4f} {m['training_time']:>10.2f}")


if __name__ == "__main__":
    train_all()
