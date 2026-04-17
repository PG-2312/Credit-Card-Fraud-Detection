import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { Shield, Search, BarChart3, Zap, BrainCircuit, AlertTriangle } from 'lucide-react'

function AnimatedCounter({ end, duration = 2000, prefix = '', suffix = '' }) {
  const [count, setCount] = useState(0)
  const ref = useRef(null)
  const started = useRef(false)

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !started.current) {
          started.current = true
          const startTime = Date.now()
          const tick = () => {
            const elapsed = Date.now() - startTime
            const progress = Math.min(elapsed / duration, 1)
            const eased = 1 - Math.pow(1 - progress, 3) // ease-out cubic
            setCount(Math.floor(eased * end))
            if (progress < 1) requestAnimationFrame(tick)
          }
          requestAnimationFrame(tick)
        }
      },
      { threshold: 0.3 }
    )
    if (ref.current) observer.observe(ref.current)
    return () => observer.disconnect()
  }, [end, duration])

  return (
    <span ref={ref} style={{ fontVariantNumeric: 'tabular-nums' }}>
      {prefix}{count.toLocaleString()}{suffix}
    </span>
  )
}

const stats = [
  { label: 'Transactions Analyzed', value: 6362620, icon: Zap, color: '#6366f1' },
  { label: 'Fraud Cases Detected', value: 8213, icon: AlertTriangle, color: '#ef4444' },
  { label: 'ML Models Trained', value: 10, icon: BrainCircuit, color: '#8b5cf6' },
  { label: 'Accuracy Rate', value: 99, suffix: '%', icon: Shield, color: '#22c55e' },
]

const features = [
  {
    icon: BrainCircuit,
    title: '10 ML Models',
    desc: 'From RandomForest to XGBoost — compare performance across classifiers trained on real financial data.',
  },
  {
    icon: Search,
    title: 'Real-Time Prediction',
    desc: 'Submit any transaction and get instant fraud probability with detailed feature contribution analysis.',
  },
  {
    icon: BarChart3,
    title: 'Visual Analytics',
    desc: 'Interactive ROC curves, confusion matrices, and precision-recall charts for deep model understanding.',
  },
]

export default function Landing() {
  return (
    <div style={{ marginLeft: -32, marginRight: -32, marginTop: -32 }}>
      {/* Hero Section */}
      <section className="hero-gradient" style={{
        padding: '80px 48px',
        borderRadius: '0 0 24px 24px',
        color: 'white',
        position: 'relative',
      }}>
        <div className="hero-grid-pattern" />
        <div style={{ position: 'relative', zIndex: 1, maxWidth: 700 }}>
          <div className="animate-fade-in-up" style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            padding: '6px 16px', borderRadius: 20,
            background: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(10px)',
            fontSize: 13, fontWeight: 600, marginBottom: 24,
          }}>
            <Shield size={14} />
            Financial Fraud Detection System
          </div>

          <h1 className="animate-fade-in-up anim-delay-1" style={{
            fontSize: 48, fontWeight: 900, lineHeight: 1.1, marginBottom: 16,
            letterSpacing: '-0.02em',
          }}>
            Detect Financial Fraud with{' '}
            <span style={{
              background: 'linear-gradient(90deg, #fbbf24, #f59e0b)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            }}>
              Machine Learning
            </span>
          </h1>

          <p className="animate-fade-in-up anim-delay-2" style={{
            fontSize: 18, lineHeight: 1.6, opacity: 0.9, marginBottom: 32,
          }}>
            A full-stack ML system powered by 10 classifiers, real-time predictions,
            and AI-generated explanations. Analyze millions of transactions with
            state-of-the-art fraud detection.
          </p>

          <div className="animate-fade-in-up anim-delay-3" style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <Link to="/predict" className="btn" style={{
              background: 'white', color: '#4f46e5',
              fontWeight: 700, padding: '14px 28px', fontSize: 15,
            }}>
              <Search size={18} />
              Run a Prediction
            </Link>
            <Link to="/dashboard" className="btn" style={{
              background: 'rgba(255,255,255,0.15)', color: 'white',
              backdropFilter: 'blur(10px)', border: '1px solid rgba(255,255,255,0.25)',
              padding: '14px 28px', fontSize: 15,
            }}>
              <BarChart3 size={18} />
              View Dashboard
            </Link>
          </div>
        </div>
      </section>

      {/* Animated Stats */}
      <section style={{ padding: '48px 48px 32px' }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 20,
        }}>
          {stats.map(({ label, value, icon: Icon, color, suffix }, i) => (
            <div
              key={label}
              className="card stat-card animate-fade-in-up"
              style={{ animationDelay: `${i * 0.1 + 0.2}s`, opacity: 0 }}
            >
              <div className="stat-icon" style={{
                background: `${color}18`, color,
              }}>
                <Icon size={22} />
              </div>
              <div className="stat-label">{label}</div>
              <div className="stat-value" style={{ color }}>
                <AnimatedCounter end={value} suffix={suffix || ''} />
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section style={{ padding: '16px 48px 64px' }}>
        <h2 style={{
          fontSize: 28, fontWeight: 800, marginBottom: 8,
          textAlign: 'center', color: 'var(--text)',
        }}>
          Powerful Features
        </h2>
        <p style={{
          textAlign: 'center', color: 'var(--text-secondary)',
          marginBottom: 40, fontSize: 16,
        }}>
          Everything you need for comprehensive fraud analysis
        </p>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: 24,
        }}>
          {features.map(({ icon: Icon, title, desc }, i) => (
            <div
              key={title}
              className="card animate-fade-in-up"
              style={{
                animationDelay: `${i * 0.15 + 0.3}s`,
                opacity: 0,
                textAlign: 'center',
                padding: 32,
              }}
            >
              <div style={{
                width: 56, height: 56, borderRadius: 14,
                background: 'linear-gradient(135deg, var(--color-primary-500), var(--color-primary-600))',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                margin: '0 auto 16px', color: 'white',
              }}>
                <Icon size={26} />
              </div>
              <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>{title}</h3>
              <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6 }}>{desc}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
