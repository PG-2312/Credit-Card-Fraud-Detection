import { useEffect, useRef } from 'react'

export default function ConfidenceGauge({ value = 0, size = 160, isFraud = null }) {
  const radius = (size - 20) / 2
  const circumference = 2 * Math.PI * radius
  
  const displayValue = isFraud === false ? (1 - value) : value
  const offset = circumference - (displayValue * circumference)
  const center = size / 2

  const getColor = (v, isFraudFlag) => {
    if (isFraudFlag === false) return '#22c55e'
    if (isFraudFlag === true) return '#ef4444'
    if (v >= 0.8) return '#ef4444'
    if (v >= 0.5) return '#f59e0b'
    return '#22c55e'
  }

  const color = getColor(value, isFraud)

  return (
    <div className="gauge-container" style={{ width: size, height: size }}>
      <svg className="gauge-svg" width={size} height={size}>
        <circle
          className="gauge-bg"
          cx={center}
          cy={center}
          r={radius}
        />
        <circle
          className="gauge-fill"
          cx={center}
          cy={center}
          r={radius}
          stroke={color}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="gauge-text">
        <span className="gauge-value" style={{ color }}>
          {(displayValue * 100).toFixed(1)}%
        </span>
        <span className="gauge-label">{isFraud === false ? 'Confidence' : 'Fraud Confidence'}</span>
      </div>
    </div>
  )
}
