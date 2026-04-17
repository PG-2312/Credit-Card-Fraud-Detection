"""
SQLAlchemy database setup and models for the fraud detection system.
Stores all predictions and LLM explanations in SQLite.
"""

from sqlalchemy import create_engine, Column, Integer, String, Float, Boolean, DateTime, Text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from datetime import datetime
import json
import os

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./backend/fraud_detection.db")

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


class Transaction(Base):
    """Model for storing transaction predictions and LLM explanations."""
    __tablename__ = "transactions"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    timestamp = Column(DateTime, default=datetime.utcnow, index=True)

    # Transaction features
    amount = Column(Float, nullable=False)
    oldbalance_org = Column(Float, nullable=False)
    newbalance_orig = Column(Float, nullable=False)
    oldbalance_dest = Column(Float, nullable=False)
    newbalance_dest = Column(Float, nullable=False)
    transaction_type = Column(String(20), nullable=False)
    type_encoded = Column(Integer, nullable=False)

    # Prediction results
    model_used = Column(String(50), nullable=False, index=True)
    prediction = Column(Integer, nullable=False)  # 0 or 1
    confidence = Column(Float, nullable=False)
    is_fraud = Column(Boolean, nullable=False, index=True)

    # Feature importances (JSON string)
    feature_contributions = Column(Text, nullable=True)

    # LLM explanation
    llm_explanation = Column(Text, nullable=True)

    def to_dict(self):
        return {
            "id": self.id,
            "timestamp": self.timestamp.isoformat() if self.timestamp else None,
            "amount": self.amount,
            "oldbalance_org": self.oldbalance_org,
            "newbalance_orig": self.newbalance_orig,
            "oldbalance_dest": self.oldbalance_dest,
            "newbalance_dest": self.newbalance_dest,
            "transaction_type": self.transaction_type,
            "type_encoded": self.type_encoded,
            "model_used": self.model_used,
            "prediction": self.prediction,
            "confidence": self.confidence,
            "is_fraud": self.is_fraud,
            "feature_contributions": json.loads(self.feature_contributions) if self.feature_contributions else None,
            "llm_explanation": self.llm_explanation,
        }


def init_db():
    """Create all database tables."""
    Base.metadata.create_all(bind=engine)


def get_db():
    """Dependency for FastAPI to get a database session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
