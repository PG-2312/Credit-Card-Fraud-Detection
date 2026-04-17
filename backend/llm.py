"""
Groq LLM integration for generating fraud explanations.
Uses llama-3.3-70b-versatile to explain why a transaction was flagged.
"""

import os
import json
from typing import Optional, AsyncGenerator
from groq import Groq

GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
MODEL_NAME = "llama-3.3-70b-versatile"

FEATURE_NAMES = ["amount", "oldbalanceOrg", "newbalanceOrig", "oldbalanceDest", "newbalanceDest", "type_encoded"]

TYPE_MAP = {
    0: "PAYMENT",
    1: "TRANSFER",
    2: "CASH_OUT",
    3: "DEBIT",
    4: "CASH_IN",
}


def build_prompt(
    features: dict,
    model_name: str,
    confidence: float,
    top_features: list[dict],
    is_fraud: bool = True
) -> str:
    """Build a structured prompt for the LLM to explain a fraud prediction."""

    type_name = TYPE_MAP.get(features.get("type_encoded", -1), "UNKNOWN")

    feature_lines = "\n".join([
        f"  - Amount: ${features.get('amount', 0):,.2f}",
        f"  - Transaction Type: {type_name} (encoded: {features.get('type_encoded', 'N/A')})",
        f"  - Sender Old Balance: ${features.get('oldbalanceOrg', 0):,.2f}",
        f"  - Sender New Balance: ${features.get('newbalanceOrig', 0):,.2f}",
        f"  - Receiver Old Balance: ${features.get('oldbalanceDest', 0):,.2f}",
        f"  - Receiver New Balance: ${features.get('newbalanceDest', 0):,.2f}",
    ])

    importance_lines = "\n".join([
        f"  {i+1}. {f['feature']}: contribution = {f['importance']:.4f}"
        for i, f in enumerate(top_features[:5])
    ]) if top_features else "  (Feature importances not available for this model)"

    if is_fraud:
        action_text = "flagged a transaction as potentially fraudulent"
        middle_structure = """**RED FLAGS**:
• List 3-5 specific red flags or suspicious patterns in this transaction
• Each bullet should reference specific feature values from the transaction
• Explain why each pattern is suspicious in the context of financial fraud

**RECOMMENDED NEXT STEP**: Provide exactly 1 actionable recommendation for a fraud analyst investigating this transaction."""
    else:
        action_text = "classified a transaction as legitimate (not fraud)"
        middle_structure = """**REASSURING FACTORS**:
• List 2-3 specific reasons why this transaction appears legitimate based on the features
• Contrast this with what a fraudulent transaction would typically look like (e.g., balance discrepancies)

**RECOMMENDED NEXT STEP**: State that no immediate action is required but advise general monitoring."""

    # Note: confidence passed in is the probability of fraud.
    # We display the model's confidence in its prediction.
    display_confidence = confidence if is_fraud else (1 - confidence)

    prompt = f"""You are a financial fraud analyst AI assistant. A machine learning model has {action_text}. Analyze the following transaction and provide a clear, structured explanation.

**Dataset Context**: This is from a financial transaction dataset (PaySim synthetic data) containing mobile money transfer transactions. Fraud is extremely rare (~0.13% of transactions) and primarily occurs in TRANSFER and CASH_OUT transaction types.

**Model Used**: {model_name}
**Verdict Confidence**: {display_confidence:.1%}

**Transaction Features**:
{feature_lines}

**Top-5 Model Feature Importances (contributing to this prediction)**:
{importance_lines}

**Your response MUST follow this EXACT structure:**

**SUMMARY**: Provide exactly 2 sentences summarizing why this transaction was classified as such.

{middle_structure}

Be specific, reference actual values from the transaction, and avoid generic statements."""

    return prompt


def get_explanation_sync(
    features: dict,
    model_name: str,
    confidence: float,
    top_features: list[dict],
    is_fraud: bool = True
) -> str:
    """Get a synchronous LLM explanation for a flagged transaction."""
    if not GROQ_API_KEY:
        return _generate_fallback_explanation(features, model_name, confidence, top_features, is_fraud)

    try:
        client = Groq(api_key=GROQ_API_KEY)
        prompt = build_prompt(features, model_name, confidence, top_features, is_fraud)

        response = client.chat.completions.create(
            model=MODEL_NAME,
            messages=[
                {"role": "system", "content": "You are an expert financial fraud analyst. Provide clear, structured explanations."},
                {"role": "user", "content": prompt},
            ],
            temperature=0.3,
            max_tokens=800,
        )

        return response.choices[0].message.content
    except Exception as e:
        print(f"Groq API error: {e}")
        return _generate_fallback_explanation(features, model_name, confidence, top_features, is_fraud)


async def stream_explanation(
    features: dict,
    model_name: str,
    confidence: float,
    top_features: list[dict],
    is_fraud: bool = True
) -> AsyncGenerator[str, None]:
    """Stream LLM explanation using Groq's streaming API."""
    if not GROQ_API_KEY:
        fallback = _generate_fallback_explanation(features, model_name, confidence, top_features, is_fraud)
        for char in fallback:
            yield char
        return

    try:
        client = Groq(api_key=GROQ_API_KEY)
        prompt = build_prompt(features, model_name, confidence, top_features, is_fraud)

        stream = client.chat.completions.create(
            model=MODEL_NAME,
            messages=[
                {"role": "system", "content": "You are an expert financial fraud analyst. Provide clear, structured explanations."},
                {"role": "user", "content": prompt},
            ],
            temperature=0.3,
            max_tokens=800,
            stream=True,
        )

        for chunk in stream:
            if chunk.choices[0].delta.content:
                yield chunk.choices[0].delta.content

    except Exception as e:
        print(f"Groq streaming error: {e}")
        fallback = _generate_fallback_explanation(features, model_name, confidence, top_features, is_fraud)
        yield fallback


def _generate_fallback_explanation(
    features: dict,
    model_name: str,
    confidence: float,
    top_features: list[dict],
    is_fraud: bool = True
) -> str:
    """Generate a rule-based explanation when Groq API is unavailable."""
    type_name = TYPE_MAP.get(features.get("type_encoded", -1), "UNKNOWN")
    amount = features.get("amount", 0)
    old_bal_org = features.get("oldbalanceOrg", 0)
    new_bal_orig = features.get("newbalanceOrig", 0)
    old_bal_dest = features.get("oldbalanceDest", 0)
    new_bal_dest = features.get("newbalanceDest", 0)

    display_confidence = confidence if is_fraud else (1 - confidence)

    top_feat_str = ""
    if top_features:
        top_feat_str = " Top contributing features: " + ", ".join([f"{f['feature']} ({f['importance']:.3f})" for f in top_features[:3]]) + "."
        
    if not is_fraud:
        return f"""**SUMMARY**: The {model_name} model classified this {type_name} transaction of ${amount:,.2f} with {display_confidence:.1%} confidence as legitimate.{top_feat_str}

**REASSURING FACTORS**:
• Transaction aligns with normal expected balance behavior.
• The destination account did not show typical money mule routing anomalies.
• No signs of an immediate full account drain were strongly detected.

**RECOMMENDED NEXT STEP**: No immediate action required, transaction can proceed as normal."""

    red_flags = []
    if type_name in ("TRANSFER", "CASH_OUT"):
        red_flags.append(f"Transaction type is {type_name}, which is the primary vector for fraud in this dataset.")
    if old_bal_org > 0 and new_bal_orig == 0:
        red_flags.append(f"Sender's account was completely drained (${old_bal_org:,.2f} → $0.00), a common fraud indicator.")
    if amount > 200000:
        red_flags.append(f"Transaction amount (${amount:,.2f}) is unusually high.")
    if old_bal_dest == 0:
        red_flags.append("Receiver's account had a zero starting balance, potentially a mule account.")
    if abs(amount - old_bal_org) < 0.01:
        red_flags.append(f"Transaction amount exactly matches the sender's balance (${amount:,.2f}), suggesting full account drainage.")

    if not red_flags:
        red_flags.append("Multiple feature values deviate from typical legitimate transaction patterns.")

    flags_str = "\n".join([f"• {f}" for f in red_flags])

    return f"""**SUMMARY**: The {model_name} model flagged this {type_name} transaction of ${amount:,.2f} with {display_confidence:.1%} confidence as potentially fraudulent.{top_feat_str}

**RED FLAGS**:
{flags_str}

**RECOMMENDED NEXT STEP**: Investigate the receiver account for patterns of receiving funds from multiple sources followed by immediate withdrawals, which would indicate a money mule operation."""
