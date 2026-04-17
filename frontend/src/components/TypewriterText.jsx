import { useState, useEffect, useRef } from 'react'

export default function TypewriterText({ text, speed = 15 }) {
  const [displayed, setDisplayed] = useState('')
  const [done, setDone] = useState(false)
  const indexRef = useRef(0)

  useEffect(() => {
    if (!text) return
    setDisplayed('')
    indexRef.current = 0
    setDone(false)

    const timer = setInterval(() => {
      if (indexRef.current < text.length) {
        setDisplayed(text.slice(0, indexRef.current + 1))
        indexRef.current++
      } else {
        setDone(true)
        clearInterval(timer)
      }
    }, speed)

    return () => clearInterval(timer)
  }, [text, speed])

  // Simple markdown-ish rendering
  const renderText = (t) => {
    return t.split('\n').map((line, i) => {
      // Bold
      line = line.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      // Bullets
      if (line.startsWith('• ') || line.startsWith('- ')) {
        return <li key={i} style={{ marginLeft: 16, marginBottom: 4 }} dangerouslySetInnerHTML={{ __html: line.slice(2) }} />
      }
      if (line.trim() === '') return <br key={i} />
      return <p key={i} style={{ marginBottom: 6 }} dangerouslySetInnerHTML={{ __html: line }} />
    })
  }

  return (
    <div style={{ fontSize: 14, lineHeight: 1.7, color: 'var(--text)' }}>
      {renderText(displayed)}
      {!done && <span className="typewriter-cursor" />}
    </div>
  )
}
