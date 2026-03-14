import { useState, useEffect, useRef} from 'react'
import axios from 'axios'
import React from 'react'
// Direct backend URL
const API = 'https://eduvisionplatform-production.up.railway.app/api'

// ─────────────────────────────────────────────────────────────────────────────
//  WELCOME TEXT
// ─────────────────────────────────────────────────────────────────────────────
const WELCOME_TEXT = `Welcome to EduVision — your personal AI-powered learning companion, designed especially for visually impaired learners.

Step one — Ask a question. Press the microphone button and speak your topic clearly. For example, say: Explain photosynthesis, or What is the water cycle?

Step two — Listen to the answer. The system will find relevant content and explain it to you in simple, clear language with a real-world example included.

Step three — Take a quiz. After the explanation, you can take a short voice quiz. All questions are read aloud and you answer using your voice.

Step four — Adaptive learning. The system tracks your engagement and quiz performance, and automatically adjusts the difficulty to match your pace.

Step five — Progress tracking. Teachers can view your engagement and performance trends on a dedicated dashboard.

You are now ready to begin. Press the microphone button and speak your first question. I am here to help you learn.`

// ─────────────────────────────────────────────────────────────────────────────
//  TTS
// ─────────────────────────────────────────────────────────────────────────────
let _utter = null

function ttsSpeak(text, { rate = 0.9, onEnd } = {}) {
  if (!window.speechSynthesis) return
  window.speechSynthesis.cancel()
  _utter = null
  const u = new SpeechSynthesisUtterance(text)
  u.rate = rate; u.pitch = 1; u.volume = 1; u.lang = 'en-US'
  u.onend   = () => { _utter = null; onEnd?.() }
  u.onerror = () => { _utter = null }
  _utter = u
  const go = () => {
    const voices = window.speechSynthesis.getVoices()
    const v = voices.find(v => v.lang==='en-US' && /samantha|karen|zira|aria/i.test(v.name))
           || voices.find(v => v.lang==='en-US') || voices[0]
    if (v) u.voice = v
    window.speechSynthesis.speak(u)
  }
  window.speechSynthesis.getVoices().length > 0
    ? go()
    : window.speechSynthesis.addEventListener('voiceschanged', go, { once:true })
}
function ttsStop() { window.speechSynthesis?.cancel(); _utter = null }

// ─────────────────────────────────────────────────────────────────────────────
//  MIME
// ─────────────────────────────────────────────────────────────────────────────
function getBestMime() {
  for (const t of ['audio/webm;codecs=opus','audio/webm','audio/ogg;codecs=opus','audio/ogg','audio/mp4'])
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(t)) return t
  return ''
}

// ─────────────────────────────────────────────────────────────────────────────
//  ICONS
// ─────────────────────────────────────────────────────────────────────────────
const IconMic = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 1a4 4 0 0 1 4 4v6a4 4 0 0 1-8 0V5a4 4 0 0 1 4-4z"/>
    <path d="M19 10a1 1 0 0 0-2 0 5 5 0 0 1-10 0 1 1 0 0 0-2 0 7 7 0 0 0 6 6.92V19H9a1 1 0 0 0 0 2h6a1 1 0 0 0 0-2h-2v-2.08A7 7 0 0 0 19 10z"/>
  </svg>
)
const IconStop = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
    <rect x="5" y="5" width="14" height="14" rx="2.5"/>
  </svg>
)
const IconReplay = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
    <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
  </svg>
)
const IconVolOff = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
    <line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/>
  </svg>
)

// ─────────────────────────────────────────────────────────────────────────────
//  WAVEFORM
// ─────────────────────────────────────────────────────────────────────────────
function Waveform() {
  return (
    <span style={{ display:'inline-flex', alignItems:'flex-end', gap:3, height:20 }}>
      {[6,14,10,18,8,16,6].map((h,i) => (
        <span key={i} style={{ width:3, borderRadius:2, background:'#ef4444',
          display:'inline-block', animation:`wv .9s ease-in-out ${i*.11}s infinite` }}/>
      ))}
      <style>{`@keyframes wv{0%,100%{height:3px;opacity:.4}50%{height:18px;opacity:1}}`}</style>
    </span>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
//  TYPING DOTS
// ─────────────────────────────────────────────────────────────────────────────
function TypingDots() {
  return (
    <span style={{ display:'inline-flex', gap:5, alignItems:'center', padding:'6px 0' }}>
      {[0,1,2].map(i => (
        <span key={i} style={{ width:9, height:9, borderRadius:'50%', background:'#1e5c3e',
          display:'inline-block', animation:`td 1.2s ease-in-out ${i*.2}s infinite` }}/>
      ))}
      <style>{`@keyframes td{0%,60%,100%{transform:translateY(0);opacity:.25}30%{transform:translateY(-8px);opacity:1}}`}</style>
    </span>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
//  MESSAGE ROW
// ─────────────────────────────────────────────────────────────────────────────
function Msg({ m, onStartQuiz }) {
  if (m.role === 'system') return (
    <div style={{ display:'flex', justifyContent:'center', padding:'10px 0' }}>
      <span style={{ fontSize:12, color:'#4a6080', background:'#0c1520',
        border:'1px solid #1a2a3c', padding:'5px 18px', borderRadius:20 }}>
        {m.text}
      </span>
    </div>
  )

  const isUser = m.role === 'user'
  return (
    <div style={{ display:'flex', gap:14, padding:'18px 0',
      flexDirection: isUser ? 'row-reverse' : 'row', alignItems:'flex-start' }}>

      {/* avatar */}
      <div style={{
        width:38, height:38, borderRadius:10, flexShrink:0,
        display:'flex', alignItems:'center', justifyContent:'center',
        fontWeight:800, fontSize:11, letterSpacing:'.5px',
        background: isUser ? 'linear-gradient(135deg,#3730a3,#6366f1)' : '#071a10',
        border: isUser ? 'none' : '1.5px solid #174d2e',
        color: isUser ? 'white' : '#19c37d',
      }}>
        {isUser ? 'YOU' : 'EV'}
      </div>

      {/* bubble */}
      <div style={{ maxWidth:'78%' }}>
        <div style={{ fontSize:11, fontWeight:700, letterSpacing:'.07em', textTransform:'uppercase',
          marginBottom:7, color: isUser ? '#818cf8' : '#19c37d', textAlign: isUser ? 'right' : 'left' }}>
          {isUser ? 'You' : 'EduVision'}
        </div>

        <div style={{
          background: isUser ? '#151c30' : 'transparent',
          border: isUser ? '1px solid #252f52' : 'none',
          borderRadius: isUser ? '14px 4px 14px 14px' : '4px 14px 14px 14px',
          padding: isUser ? '12px 16px' : '0',
          color:'#c8d8ee', fontSize:15, lineHeight:1.75,
          whiteSpace:'pre-wrap', wordBreak:'break-word',
        }}>
          {m.typing ? <TypingDots /> : m.text}
        </div>

        {/* action buttons — assistant only */}
        {!isUser && !m.typing && m.text && (
          <div style={{ display:'flex', gap:8, marginTop:10, flexWrap:'wrap', alignItems:'center' }}>

            {m.source && (
              <span style={{ fontSize:11, color:'#2e6e52', background:'#071a10',
                border:'1px solid #174d2e', borderRadius:20, padding:'3px 10px', marginRight:4 }}>
                {m.source}
              </span>
            )}

            {[
              { label:'Replay', icon:<IconReplay/>, fn: () => ttsSpeak(m.text) },
              { label:'Stop',   icon:<IconVolOff/>, fn: ttsStop },
            ].map(b => (
              <button key={b.label} onClick={b.fn} style={{
                display:'inline-flex', alignItems:'center', gap:5,
                background:'none', border:'1px solid #1a2a3c', color:'#3a5470',
                borderRadius:8, padding:'4px 12px', fontSize:12,
                cursor:'pointer', fontFamily:'inherit', transition:'all .15s',
              }}
                onMouseEnter={e => { e.currentTarget.style.color='#c8d8ee'; e.currentTarget.style.borderColor='#2a3f5c' }}
                onMouseLeave={e => { e.currentTarget.style.color='#3a5470'; e.currentTarget.style.borderColor='#1a2a3c' }}
              >{b.icon} {b.label}</button>
            ))}

            {/* Take Quiz */}
            {m.showQuizBtn && (
              <button onClick={onStartQuiz} style={{
                display:'inline-flex', alignItems:'center', gap:7,
                background:'linear-gradient(135deg,#19c37d,#0d9e62)',
                border:'none', borderRadius:10, padding:'8px 20px',
                fontSize:13, fontWeight:700, color:'white',
                cursor:'pointer', fontFamily:'inherit',
                boxShadow:'0 4px 16px rgba(25,195,125,.35)',
                transition:'transform .15s, box-shadow .15s', marginLeft:4,
              }}
                onMouseEnter={e => { e.currentTarget.style.transform='translateY(-1px)'; e.currentTarget.style.boxShadow='0 6px 20px rgba(25,195,125,.5)' }}
                onMouseLeave={e => { e.currentTarget.style.transform='translateY(0)'; e.currentTarget.style.boxShadow='0 4px 16px rgba(25,195,125,.35)' }}
              >
                📝 Take Quiz
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
//  LIVE PREVIEW COMPONENT
// ─────────────────────────────────────────────────────────────────────────────
function LivePreview({ stream, engState, engScore, difficulty, quizScore }) {
  const videoRef = useRef(null)

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream
    }
  }, [stream])

  const getEngagementColor = () => {
    switch(engState) {
      case 'Highly Engaged': return '#19c37d'
      case 'Engaged': return '#3b82f6'
      case 'Partially Engaged': return '#f59e0b'
      case 'Disengaged': return '#ef4444'
      default: return '#2e4460'
    }
  }

  const getEngagementIcon = () => {
    switch(engState) {
      case 'Highly Engaged': return '🔥'
      case 'Engaged': return '👍'
      case 'Partially Engaged': return '🤔'
      case 'Disengaged': return '😴'
      default: return '📊'
    }
  }

  return (
    <div style={{
      background: '#0f1826',
      border: '1px solid #1a2a3c',
      borderRadius: 12,
      overflow: 'hidden',
      height: '100%',
      display: 'flex',
      flexDirection: 'column'
    }}>
      <div style={{
        padding: '10px 16px',
        background: '#080d16',
        borderBottom: '1px solid #1a2a3c',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <span style={{ color: '#c8d8ee', fontSize: 13, fontWeight: 600 }}>
          🎥 Live Learner Preview
        </span>
        {stream ? (
          <span style={{ color: '#19c37d', fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 6, height: 6, background: '#19c37d', borderRadius: '50%' }}></span>
            Live
          </span>
        ) : (
          <span style={{ color: '#f59e0b', fontSize: 11 }}>Waiting for camera...</span>
        )}
      </div>

      <div style={{
        flex: 1,
        background: '#080d16',
        minHeight: 180,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative'
      }}>
        {stream ? (
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : (
          <div style={{ textAlign: 'center', color: '#2e4460', fontSize: 12 }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>📹</div>
            <div>Camera not active</div>
            <div style={{ marginTop: 4 }}>Will start when session begins</div>
          </div>
        )}
      </div>

      <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <span style={{ color: '#7a8aa0', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Engagement State
            </span>
            <span style={{ color: getEngagementColor(), fontSize: 13, fontWeight: 600,
              display: 'flex', alignItems: 'center', gap: 4 }}>
              {getEngagementIcon()} {engState ? engState : 'Not Available'}
            </span>
          </div>
          <div style={{ height: 6, background: '#1a2a3c', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{
              width: engScore ? `${engScore * 100}%` : '0%',
              height: '100%',
              background: `linear-gradient(90deg, ${getEngagementColor()}80, ${getEngagementColor()})`,
              borderRadius: 3,
              transition: 'width 0.3s ease'
            }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
            <span style={{ color: '#4a6080', fontSize: 10 }}>Disengaged</span>
            <span style={{ color: '#4a6080', fontSize: 10, fontWeight: engScore ? 600 : 400 }}>
              {engScore ? `${Math.round(engScore * 100)}%` : '--%'}
            </span>
            <span style={{ color: '#4a6080', fontSize: 10 }}>Engaged</span>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div style={{ background: '#080d16', borderRadius: 8, padding: '10px' }}>
            <div style={{ color: '#7a8aa0', fontSize: 10, marginBottom: 2 }}>Current Level</div>
            <div style={{
              fontSize: 14, fontWeight: 600, textTransform: 'capitalize',
              color:
                difficulty === 'beginner' ? '#6ee7b7' :
                difficulty === 'easy'     ? '#93c5fd' :
                difficulty === 'medium'   ? '#fde68a' :
                difficulty === 'hard'     ? '#fca5a5' : '#f87171',
            }}>{difficulty}</div>
          </div>
          <div style={{ background: '#080d16', borderRadius: 8, padding: '10px' }}>
            <div style={{ color: '#7a8aa0', fontSize: 10, marginBottom: 2 }}>Quiz Score</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: quizScore ? '#19c37d' : '#7a8aa0' }}>
              {quizScore ? `${Math.round(quizScore * 100)}%` : '--'}
            </div>
          </div>
        </div>

        <div style={{ fontSize: 9, color: '#2e4460', textAlign: 'center', marginTop: 4 }}>
          Live engagement tracking updates every 10 seconds
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
//  Q-LEARNING DASHBOARD COMPONENT
// ─────────────────────────────────────────────────────────────────────────────
function QLearningDashboard({ history }) {
  if (!history || history.length === 0) {
    return (
      <div style={{
        background: '#0f1826', border: '1px solid #1a2a3c',
        borderRadius: 12, padding: '24px', textAlign: 'center'
      }}>
        <div style={{ fontSize: 24, marginBottom: 12 }}>🧠</div>
        <div style={{ color: '#7a8aa0', fontSize: 13 }}>
          No learning history yet. Complete some quizzes to see your adaptive learning progress.
        </div>
      </div>
    )
  }

  const latest = history[history.length - 1]
  const previous = history.length > 1 ? history[history.length - 2] : null
  const difficultyOrder = ['beginner', 'easy', 'medium', 'hard', 'expert']
  const difficultyChange = previous ?
    difficultyOrder.indexOf(latest.difficulty) - difficultyOrder.indexOf(previous.difficulty) : 0

  return (
    <div style={{ background: '#0f1826', border: '1px solid #1a2a3c', borderRadius: 12, overflow: 'hidden' }}>
      <div style={{
        padding: '12px 16px', background: '#080d16', borderBottom: '1px solid #1a2a3c',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center'
      }}>
        <span style={{ color: '#c8d8ee', fontSize: 13, fontWeight: 600 }}>🤖 Q‑Learning Adaptation</span>
        <span style={{ background: '#0d2a1a', color: '#19c37d', fontSize: 11,
          padding: '4px 8px', borderRadius: 20, border: '1px solid #174d2e' }}>
          Active Learning
        </span>
      </div>

      <div style={{ padding: '16px' }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 16,
          background: 'linear-gradient(135deg, #0d2a1a 0%, #071a10 100%)',
          border: '1px solid #174d2e', borderRadius: 10, padding: '16px', marginBottom: 16
        }}>
          <div style={{
            width: 48, height: 48, borderRadius: 24, background: '#19c37d20',
            border: '2px solid #19c37d', display: 'flex', alignItems: 'center',
            justifyContent: 'center', fontSize: 24
          }}>
            {difficultyChange > 0 ? '📈' : difficultyChange < 0 ? '📉' : '➡️'}
          </div>
          <div>
            <div style={{ color: '#7a8aa0', fontSize: 11, marginBottom: 2 }}>Current Learning Level</div>
            <div style={{
              fontSize: 20, fontWeight: 700, textTransform: 'capitalize', marginBottom: 2,
              color:
                latest.difficulty === 'beginner' ? '#6ee7b7' :
                latest.difficulty === 'easy'     ? '#93c5fd' :
                latest.difficulty === 'medium'   ? '#fde68a' :
                latest.difficulty === 'hard'     ? '#fca5a5' : '#f87171',
            }}>{latest.difficulty}</div>
            {difficultyChange !== 0 && (
              <div style={{ fontSize: 11, color: difficultyChange > 0 ? '#19c37d' : '#ef4444',
                display: 'flex', alignItems: 'center', gap: 4 }}>
                {difficultyChange > 0 ? '↑' : '↓'} {Math.abs(difficultyChange)} level{Math.abs(difficultyChange) > 1 ? 's' : ''}
                <span style={{ color: '#7a8aa0', marginLeft: 4 }}>from {previous?.difficulty}</span>
              </div>
            )}
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ color: '#7a8aa0', fontSize: 11 }}>Learning Path</span>
            <span style={{ color: '#7a8aa0', fontSize: 11 }}>Difficulty Progression</span>
          </div>
          <div style={{ position: 'relative', height: 60, marginBottom: 10 }}>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '100%',
              display: 'flex', alignItems: 'flex-end', gap: 4 }}>
              {history.map((entry, idx) => {
                const levelIndex = difficultyOrder.indexOf(entry.difficulty)
                const height = ((levelIndex + 1) / difficultyOrder.length) * 100
                return (
                  <div key={idx} style={{
                    flex: 1, height: `${height}%`,
                    background: `linear-gradient(to top, ${
                      entry.difficulty === 'beginner' ? '#6ee7b7' :
                      entry.difficulty === 'easy'     ? '#93c5fd' :
                      entry.difficulty === 'medium'   ? '#fde68a' :
                      entry.difficulty === 'hard'     ? '#fca5a5' : '#f87171'
                    }, ${
                      entry.difficulty === 'beginner' ? '#4ade80' :
                      entry.difficulty === 'easy'     ? '#60a5fa' :
                      entry.difficulty === 'medium'   ? '#fbbf24' :
                      entry.difficulty === 'hard'     ? '#f87171' : '#ef4444'
                    })`,
                    borderRadius: '4px 4px 0 0',
                    opacity: idx === history.length - 1 ? 1 : 0.5,
                    transition: 'height 0.3s ease'
                  }} />
                )
              })}
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#4a6080', fontSize: 10 }}>
            {history.map((_, idx) => <span key={idx}>Q{idx + 1}</span>)}
          </div>
        </div>

        <div>
          <div style={{ color: '#7a8aa0', fontSize: 11, marginBottom: 8 }}>Adaptation History</div>
          <div style={{ maxHeight: 150, overflowY: 'auto' }}>
            {history.map((entry, idx) => (
              <div key={idx} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '8px 0', borderBottom: idx < history.length - 1 ? '1px solid #1a2a3c' : 'none'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ width: 20, height: 20, borderRadius: 10, background: '#080d16',
                    border: '1px solid #1a2a3c', display: 'flex', alignItems: 'center',
                    justifyContent: 'center', fontSize: 10, color: '#7a8aa0' }}>{idx + 1}</span>
                  <span style={{ fontSize: 12, color: '#c8d8ee' }}>Quiz {idx + 1}</span>
                </div>
                <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                  <span style={{
                    fontSize: 11, textTransform: 'capitalize',
                    color:
                      entry.difficulty === 'beginner' ? '#6ee7b7' :
                      entry.difficulty === 'easy'     ? '#93c5fd' :
                      entry.difficulty === 'medium'   ? '#fde68a' :
                      entry.difficulty === 'hard'     ? '#fca5a5' : '#f87171',
                  }}>{entry.difficulty}</span>
                  <span style={{ fontSize: 11, color: entry.quizScore > 0.7 ? '#19c37d' : '#ef4444' }}>
                    {Math.round(entry.quizScore * 100)}%
                  </span>
                  <span style={{ fontSize: 11, color: '#7a8aa0' }}>
                    {entry.delta > 0 ? '+' : ''}{entry.delta}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ marginTop: 16, background: '#080d16', borderRadius: 8, padding: '12px',
          display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          <span style={{ fontSize: 20 }}>🎯</span>
          <div>
            <div style={{ color: '#c8d8ee', fontSize: 12, marginBottom: 4 }}>
              Reinforcement Learning Active
            </div>
            <div style={{ color: '#7a8aa0', fontSize: 11, lineHeight: 1.5 }}>
              The system adapts difficulty based on your quiz performance and engagement level.
              Higher scores and engagement lead to more challenging content.
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
//  TEACHER DASHBOARD
// ─────────────────────────────────────────────────────────────────────────────
function TeacherDashboard({ data, loading, onRefresh }) {
  const [selected, setSelected] = React.useState(null)

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center',
      height:'60vh', flexDirection:'column', gap:16 }}>
      <div style={{ width:36, height:36, border:'3px solid #174d2e',
        borderTop:'3px solid #19c37d', borderRadius:'50%', animation:'spin .8s linear infinite' }}/>
      <span style={{ color:'#2e4460', fontSize:13 }}>Loading dashboard…</span>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )

  if (!data) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center',
      height:'60vh', flexDirection:'column', gap:12 }}>
      <span style={{ fontSize:32 }}>📊</span>
      <span style={{ color:'#c8d8ee', fontSize:15, fontWeight:600 }}>No data yet</span>
      <span style={{ color:'#2e4460', fontSize:13, textAlign:'center', maxWidth:300 }}>
        Dashboard will populate once students complete quizzes.
      </span>
      <button onClick={onRefresh} style={{ marginTop:8, background:'#071a10',
        border:'1px solid #174d2e', borderRadius:8, padding:'8px 20px',
        color:'#19c37d', fontSize:13, cursor:'pointer', fontFamily:'inherit' }}>
        Refresh
      </button>
    </div>
  )

  const { students=[], class_stats={}, topic_stats=[] } = data

  // ── Colour helpers ────────────────────────────────────────────────────────
  const scoreColor  = s => s >= 0.75 ? '#19c37d' : s >= 0.50 ? '#f59e0b' : '#ef4444'
  const engColor    = e => {
    if (!e || e === 'null' || e === 'unknown') return '#2e4460'
    const l = e.toLowerCase()
    if (l.includes('highly')) return '#19c37d'
    if (l.includes('partially')) return '#f59e0b'
    if (l.includes('disengaged')) return '#ef4444'
    return '#3b82f6'
  }
  const diffColor   = d => ({beginner:'#6ee7b7',easy:'#93c5fd',medium:'#fde68a',hard:'#fca5a5',advanced:'#f87171'})[d] || '#c8d8ee'
  const trendIcon   = t => t==='improving' ? '↑' : t==='declining' ? '↓' : '→'
  const trendColor  = t => t==='improving' ? '#19c37d' : t==='declining' ? '#ef4444' : '#3a5470'

  const diffOrder   = ['beginner','easy','medium','hard','advanced']

  // ── STUDENT DETAIL VIEW ───────────────────────────────────────────────────
  if (selected) {
    const s = selected
    const sessionsSorted = [...(s.sessions || [])].sort((a,b) => a.timestamp.localeCompare(b.timestamp))

    return (
      <div style={{ padding:'0 24px 32px', maxWidth:900, margin:'0 auto' }}>
        {/* Back */}
        <button onClick={() => setSelected(null)} style={{ display:'flex', alignItems:'center', gap:6,
          background:'none', border:'none', color:'#3a5470', fontSize:13, cursor:'pointer',
          fontFamily:'inherit', padding:'16px 0', marginBottom:4 }}>
          ← Back to class
        </button>

        {/* Student header */}
        <div style={{ display:'flex', alignItems:'center', gap:14, marginBottom:20 }}>
          <div style={{ width:44, height:44, borderRadius:12, background:'#071a10',
            border:'1.5px solid #174d2e', display:'flex', alignItems:'center',
            justifyContent:'center', fontWeight:800, fontSize:13, color:'#19c37d' }}>
            {s.student_id.slice(-4)}
          </div>
          <div>
            <div style={{ fontSize:16, fontWeight:700, color:'#ddeaf8' }}>{s.student_id}</div>
            <div style={{ fontSize:12, color:'#2e4460', marginTop:2 }}>
              {s.quiz_count} quiz{s.quiz_count!==1?'es':''} completed · Current level:&nbsp;
              <span style={{ color:diffColor(s.latest_difficulty) }}>{s.latest_difficulty}</span>
            </div>
          </div>
          <div style={{ marginLeft:'auto', display:'flex', gap:8, alignItems:'center' }}>
            {s.at_risk && (
              <span style={{ background:'#2a0d0d', border:'1px solid #4a1010',
                borderRadius:20, padding:'4px 12px', fontSize:11, color:'#ef4444', fontWeight:600 }}>
                ⚠️ At risk
              </span>
            )}
            <span style={{ background:'#0a1018', border:'1px solid #14202e',
              borderRadius:20, padding:'4px 12px', fontSize:11,
              color:trendColor(s.trend), fontWeight:600 }}>
              {trendIcon(s.trend)} {s.trend}
            </span>
          </div>
        </div>

        {/* Metric row */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:10, marginBottom:20 }}>
          {[
            { label:'Avg score',      val:`${Math.round((s.avg_score||0)*100)}%`, color:scoreColor(s.avg_score||0) },
            { label:'Latest score',   val:`${Math.round((s.latest_score||0)*100)}%`, color:scoreColor(s.latest_score||0) },
            { label:'Engagement',     val:`${s.avg_engagement!=null?Math.round(s.avg_engagement*100)+'%':'--'}` },
            { label:'Quizzes taken',  val:s.quiz_count },
          ].map(c => (
            <div key={c.label} style={{ background:'#0a1018', border:'1px solid #14202e',
              borderRadius:10, padding:'12px 14px' }}>
              <div style={{ fontSize:10, color:'#2e4460', textTransform:'uppercase',
                letterSpacing:'.06em', marginBottom:6 }}>{c.label}</div>
              <div style={{ fontSize:20, fontWeight:700, color:c.color||'#ddeaf8' }}>{c.val}</div>
            </div>
          ))}
        </div>

        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginBottom:16 }}>

          {/* Quiz history */}
          <div style={{ background:'#0a1018', border:'1px solid #14202e', borderRadius:12, padding:'16px' }}>
            <div style={{ fontSize:11, fontWeight:600, color:'#2e4460',
              textTransform:'uppercase', letterSpacing:'.06em', marginBottom:12 }}>
              Quiz history by topic
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:6, maxHeight:220, overflowY:'auto' }}>
              {sessionsSorted.map((sess, i) => (
                <div key={i} style={{ display:'flex', alignItems:'center', justifyContent:'space-between',
                  padding:'8px 10px', background:'#080d16', borderRadius:8,
                  border:'1px solid #14202e' }}>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:12, color:'#c8d8ee', fontWeight:500,
                      overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                      {sess.topic}
                    </div>
                    <div style={{ fontSize:10, color:'#2e4460', marginTop:2 }}>
                      {new Date(sess.timestamp).toLocaleDateString()}
                    </div>
                  </div>
                  <div style={{ display:'flex', gap:8, alignItems:'center', flexShrink:0, marginLeft:8 }}>
                    <span style={{ fontSize:12, fontWeight:700, color:scoreColor(sess.quiz_score) }}>
                      {Math.round(sess.quiz_score*100)}%
                    </span>
                    <span style={{ fontSize:10, padding:'2px 7px', borderRadius:20,
                      background:'#0d1421', color:diffColor(sess.difficulty),
                      border:'1px solid #14202e' }}>
                      {sess.difficulty}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Q-Learning difficulty progression */}
          <div style={{ background:'#0a1018', border:'1px solid #14202e', borderRadius:12, padding:'16px' }}>
            <div style={{ fontSize:11, fontWeight:600, color:'#2e4460',
              textTransform:'uppercase', letterSpacing:'.06em', marginBottom:12 }}>
              Difficulty progression
            </div>
            {sessionsSorted.length === 0 ? (
              <div style={{ color:'#2e4460', fontSize:12, textAlign:'center', paddingTop:40 }}>No data</div>
            ) : (
              <>
                <div style={{ display:'flex', alignItems:'flex-end', gap:4, height:80, marginBottom:6 }}>
                  {sessionsSorted.map((sess, i) => {
                    const lvl = diffOrder.indexOf(sess.difficulty)
                    const h   = ((lvl+1)/5)*100
                    return (
                      <div key={i} title={`Q${i+1}: ${sess.difficulty} — ${Math.round(sess.quiz_score*100)}%`}
                        style={{ flex:1, height:`${h}%`, borderRadius:'3px 3px 0 0',
                          background:diffColor(sess.difficulty),
                          opacity: i===sessionsSorted.length-1 ? 1 : 0.55,
                          transition:'height .3s' }}/>
                    )
                  })}
                </div>
                <div style={{ display:'flex', justifyContent:'space-between',
                  color:'#2e4460', fontSize:9 }}>
                  {sessionsSorted.map((_, i) => <span key={i}>Q{i+1}</span>)}
                </div>
                <div style={{ marginTop:12, display:'flex', flexWrap:'wrap', gap:6 }}>
                  {['beginner','easy','medium','hard','advanced'].map(d => (
                    <span key={d} style={{ fontSize:10, padding:'2px 8px', borderRadius:20,
                      background:'#080d16', border:'1px solid #14202e',
                      color:diffColor(d) }}>{d}</span>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Engagement trend */}
        <div style={{ background:'#0a1018', border:'1px solid #14202e', borderRadius:12, padding:'16px' }}>
          <div style={{ fontSize:11, fontWeight:600, color:'#2e4460',
            textTransform:'uppercase', letterSpacing:'.06em', marginBottom:12 }}>
            Engagement over time
          </div>
          <div style={{ display:'flex', alignItems:'flex-end', gap:6, height:60, marginBottom:6 }}>
            {sessionsSorted.map((sess, i) => {
              const score = sess.engagement_score ?? 0
              return (
                <div key={i} style={{ flex:1, display:'flex', flexDirection:'column',
                  alignItems:'center', gap:3 }}>
                  {score > 0 ? (
                    <div style={{ width:'100%', height:`${Math.round(score*100)}%`,
                      minHeight:3, background:engColor(sess.engagement_state),
                      borderRadius:'3px 3px 0 0', transition:'height .3s', opacity:.85 }}/>
                  ) : (
                    <div style={{ width:'100%', flex:1, display:'flex', alignItems:'center',
                      justifyContent:'center' }}>
                      <div style={{ width:'100%', height:3, background:'#14202e',
                        borderRadius:2, opacity:.5 }}/>
                    </div>
                  )}
                  <div style={{ fontSize:9, color:'#2e4460' }}>Q{i+1}</div>
                </div>
              )
            })}
          </div>
          <div style={{ display:'flex', gap:12, marginTop:6, flexWrap:'wrap' }}>
            {[['#19c37d','Highly engaged'],['#3b82f6','Engaged'],
              ['#f59e0b','Partially engaged'],['#ef4444','Disengaged']].map(([c,l]) => (
              <span key={l} style={{ display:'flex', alignItems:'center', gap:4,
                fontSize:10, color:'#3a5470' }}>
                <span style={{ width:7, height:7, borderRadius:'50%', background:c,
                  display:'inline-block', flexShrink:0 }}/>
                {l}
              </span>
            ))}
          </div>
        </div>
      </div>
    )
  }

  // ── CLASS OVERVIEW ────────────────────────────────────────────────────────
  return (
    <div style={{ padding:'0 24px 32px', maxWidth:900, margin:'0 auto' }}>

      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between',
        padding:'16px 0 20px' }}>
        <div>
          <div style={{ fontSize:16, fontWeight:700, color:'#ddeaf8' }}>Class overview</div>
          <div style={{ fontSize:12, color:'#2e4460', marginTop:2 }}>
            {class_stats.total_students || 0} student{class_stats.total_students!==1?'s':''} ·&nbsp;
            {class_stats.total_sessions || 0} sessions recorded
          </div>
        </div>
        <button onClick={onRefresh} style={{ background:'#071a10', border:'1px solid #174d2e',
          borderRadius:8, padding:'7px 16px', color:'#19c37d', fontSize:12,
          cursor:'pointer', fontFamily:'inherit' }}>
          ↻ Refresh
        </button>
      </div>

      {/* Class metrics */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:10, marginBottom:20 }}>
        {[
          { label:'Students',       val: class_stats.total_students ?? 0 },
          { label:'Avg score',      val: `${Math.round((class_stats.avg_score||0)*100)}%`,
            color: scoreColor(class_stats.avg_score||0) },
          { label:'At risk',        val: class_stats.at_risk_count ?? 0,
            color: (class_stats.at_risk_count||0) > 0 ? '#ef4444' : '#19c37d' },
          { label:'Avg engagement', val: class_stats.avg_engagement != null
            ? `${Math.round(class_stats.avg_engagement*100)}%` : '--' },
        ].map(c => (
          <div key={c.label} style={{ background:'#0a1018', border:'1px solid #14202e',
            borderRadius:10, padding:'12px 14px' }}>
            <div style={{ fontSize:10, color:'#2e4460', textTransform:'uppercase',
              letterSpacing:'.06em', marginBottom:6 }}>{c.label}</div>
            <div style={{ fontSize:22, fontWeight:700, color:c.color||'#ddeaf8' }}>{c.val}</div>
          </div>
        ))}
      </div>

      {/* At-risk alert */}
      {(class_stats.at_risk_count||0) > 0 && (
        <div style={{ background:'#2a0d0d', border:'1px solid #4a1010', borderRadius:10,
          padding:'10px 14px', marginBottom:16, display:'flex', alignItems:'center',
          gap:8, fontSize:12, color:'#ef4444' }}>
          ⚠️ {class_stats.at_risk_count} student{class_stats.at_risk_count!==1?'s':''} scored below 40% on their last quiz — consider intervention
        </div>
      )}

      {/* Student grid */}
      <div style={{ fontSize:11, fontWeight:600, color:'#2e4460',
        textTransform:'uppercase', letterSpacing:'.06em', marginBottom:10 }}>
        Students
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(260px,1fr))',
        gap:10, marginBottom:24 }}>
        {students.map(s => (
          <div key={s.student_id} onClick={() => setSelected(s)}
            style={{ background:'#0a1018', border:`1px solid ${s.at_risk ? '#4a1010' : '#14202e'}`,
              borderLeft:`3px solid ${s.at_risk ? '#ef4444' : s.trend==='improving' ? '#19c37d' : '#14202e'}`,
              borderRadius:'0 10px 10px 0', padding:'14px', cursor:'pointer',
              transition:'border-color .15s' }}>
            <div style={{ display:'flex', justifyContent:'space-between',
              alignItems:'center', marginBottom:8 }}>
              <div style={{ fontSize:13, fontWeight:700, color:'#ddeaf8' }}>{s.student_id}</div>
              <span style={{ fontSize:10, padding:'2px 8px', borderRadius:20, fontWeight:600,
                background: s.at_risk ? '#2a0d0d' : s.trend==='improving' ? '#0d2a1a' : '#0a1018',
                color: s.at_risk ? '#ef4444' : s.trend==='improving' ? '#19c37d' : '#3a5470',
                border: `1px solid ${s.at_risk ? '#4a1010' : s.trend==='improving' ? '#174d2e' : '#14202e'}` }}>
                {s.at_risk ? '⚠ At risk' : s.trend==='improving' ? '↑ Improving' : '→ On track'}
              </span>
            </div>
            <div style={{ display:'flex', justifyContent:'space-between', marginBottom:5 }}>
              <span style={{ fontSize:11, color:'#2e4460' }}>Last quiz</span>
              <span style={{ fontSize:12, fontWeight:700, color:scoreColor(s.latest_score) }}>
                {Math.round(s.latest_score*100)}%
              </span>
            </div>
            <div style={{ display:'flex', justifyContent:'space-between', marginBottom:5 }}>
              <span style={{ fontSize:11, color:'#2e4460' }}>Engagement</span>
              <span style={{ fontSize:11, display:'flex', alignItems:'center', gap:4 }}>
                <span style={{ width:6, height:6, borderRadius:'50%',
                  background:engColor(s.latest_eng_state), display:'inline-block' }}/>
                <span style={{ color:'#c8d8ee' }}>{(s.latest_eng_state && s.latest_eng_state !== 'null' && s.latest_eng_state !== 'unknown') ? s.latest_eng_state : '--'}</span>
              </span>
            </div>
            <div style={{ display:'flex', justifyContent:'space-between', marginBottom:8 }}>
              <span style={{ fontSize:11, color:'#2e4460' }}>Level</span>
              <span style={{ fontSize:11, color:diffColor(s.latest_difficulty) }}>
                {s.latest_difficulty}
              </span>
            </div>
            {/* Score bar */}
            <div style={{ height:3, background:'#14202e', borderRadius:2, overflow:'hidden' }}>
              <div style={{ height:'100%', width:`${Math.round(s.latest_score*100)}%`,
                background:scoreColor(s.latest_score), borderRadius:2, transition:'width .3s' }}/>
            </div>
          </div>
        ))}
      </div>

      {/* Struggling topics */}
      <div style={{ fontSize:11, fontWeight:600, color:'#2e4460',
        textTransform:'uppercase', letterSpacing:'.06em', marginBottom:10 }}>
        Struggling topics
      </div>
      <div style={{ background:'#0a1018', border:'1px solid #14202e',
        borderRadius:12, overflow:'hidden' }}>
        {topic_stats.length === 0 ? (
          <div style={{ padding:'20px', color:'#2e4460', fontSize:12, textAlign:'center' }}>
            No topic data yet
          </div>
        ) : topic_stats.map((t, i) => (
          <div key={t.topic} style={{ display:'flex', alignItems:'center', gap:12,
            padding:'11px 16px', borderBottom: i<topic_stats.length-1 ? '1px solid #14202e' : 'none' }}>
            <div style={{ flex:1, fontSize:13, color:'#c8d8ee',
              overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
              {t.topic}
            </div>
            <span style={{ fontSize:11, color:'#2e4460', flexShrink:0 }}>
              {t.attempts} attempt{t.attempts!==1?'s':''}
            </span>
            {/* Mini bar */}
            <div style={{ width:80, height:4, background:'#14202e', borderRadius:2, flexShrink:0 }}>
              <div style={{ height:'100%', width:`${Math.round(t.avg_score*100)}%`,
                background:scoreColor(t.avg_score), borderRadius:2 }}/>
            </div>
            <span style={{ fontSize:12, fontWeight:700, color:scoreColor(t.avg_score),
              minWidth:36, textAlign:'right' }}>
              {Math.round(t.avg_score*100)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
//  SHORTCUTS MODAL (Ctrl+H)
// ─────────────────────────────────────────────────────────────────────────────
function ShortcutsModal({ shortcuts, onClose }) {
  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Keyboard shortcuts"
      onClick={onClose}
      style={{
        position:'fixed', inset:0, zIndex:9999,
        background:'rgba(5,10,18,0.82)', backdropFilter:'blur(6px)',
        display:'flex', alignItems:'center', justifyContent:'center',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background:'#0d1421', border:'1px solid #1a2a3c', borderRadius:18,
          padding:'32px 36px', minWidth:460, maxWidth:520,
          boxShadow:'0 24px 80px rgba(0,0,0,.7)',
          animation:'scaleIn .18s cubic-bezier(.34,1.56,.64,1)',
        }}
      >
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:24 }}>
          <div style={{ display:'flex', alignItems:'center', gap:12 }}>
            <div style={{ width:36, height:36, borderRadius:10, background:'#071a10',
              border:'1.5px solid #174d2e', display:'flex', alignItems:'center',
              justifyContent:'center', fontSize:16 }}>⌨️</div>
            <div>
              <div style={{ color:'#ddeaf8', fontWeight:700, fontSize:15 }}>Keyboard Shortcuts</div>
              <div style={{ color:'#2e4460', fontSize:11, marginTop:2 }}>VI accessibility — EduVision</div>
            </div>
          </div>
          <button
            onClick={onClose}
            autoFocus
            aria-label="Close shortcuts panel"
            style={{ background:'none', border:'1px solid #1a2a3c', borderRadius:8,
              color:'#3a5470', fontSize:18, cursor:'pointer', width:32, height:32,
              display:'flex', alignItems:'center', justifyContent:'center',
              transition:'all .15s', fontFamily:'inherit' }}
            onMouseEnter={e => { e.currentTarget.style.color='#c8d8ee'; e.currentTarget.style.borderColor='#2a3f5c' }}
            onMouseLeave={e => { e.currentTarget.style.color='#3a5470'; e.currentTarget.style.borderColor='#1a2a3c' }}
          >✕</button>
        </div>

        <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
          {shortcuts.map((s, i) => (
            <div key={i} style={{
              display:'flex', alignItems:'center', justifyContent:'space-between',
              padding:'10px 14px', borderRadius:10,
              background: i % 2 === 0 ? '#080d16' : 'transparent',
              border: i % 2 === 0 ? '1px solid #14202e' : '1px solid transparent',
            }}>
              <span style={{ color:'#7a8aa0', fontSize:13 }}>{s.action}</span>
              <kbd style={{
                background:'#0a1220', border:'1px solid #1a2a3c', borderBottom:'3px solid #1a2a3c',
                borderRadius:7, padding:'4px 12px', fontSize:12, fontWeight:700,
                color:'#19c37d', fontFamily:'inherit', letterSpacing:'0.03em', flexShrink:0,
              }}>{s.keys}</kbd>
            </div>
          ))}
        </div>

        <div style={{ marginTop:20, padding:'12px 14px', background:'#071a10',
          border:'1px solid #174d2e', borderRadius:10,
          display:'flex', alignItems:'flex-start', gap:10 }}>
          <span style={{ fontSize:16, flexShrink:0 }}>💡</span>
          <span style={{ fontSize:12, color:'#2e6e52', lineHeight:1.6 }}>
            Shortcuts work anywhere on the page except when typing in the text input box.
            Press <strong style={{ color:'#19c37d' }}>Ctrl+H</strong> or <strong style={{ color:'#19c37d' }}>Esc</strong> to close this panel.
          </span>
        </div>
      </div>
      <style>{`@keyframes scaleIn{from{opacity:0;transform:scale(.93)}to{opacity:1;transform:scale(1)}}`}</style>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
//  SPLASH
// ─────────────────────────────────────────────────────────────────────────────
function Splash({ onStart }) {
  return (
    <div style={{ height:'100vh', width:'100%', background:'#080d16',
      display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:32 }}>
      <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:16 }}>
        <div style={{ width:80, height:80, borderRadius:20, background:'#071a10',
          border:'2px solid #174d2e', display:'flex', alignItems:'center', justifyContent:'center',
          fontSize:28, fontWeight:900, color:'#19c37d', letterSpacing:'-1px' }}>EV</div>
        <div style={{ textAlign:'center' }}>
          <div style={{ fontSize:28, fontWeight:800, color:'#ddeaf8', letterSpacing:'-0.5px' }}>EduVision</div>
          <div style={{ fontSize:14, color:'#3a5470', marginTop:6 }}>AI-Powered Inclusive Learning Platform</div>
        </div>
      </div>
      <button onClick={onStart} style={{
        background:'linear-gradient(135deg,#19c37d,#0d9e62)', border:'none', borderRadius:14,
        padding:'16px 48px', fontSize:16, fontWeight:700, color:'white', cursor:'pointer',
        boxShadow:'0 8px 32px rgba(25,195,125,.4)', transition:'transform .15s, box-shadow .15s',
      }}
        onMouseEnter={e => { e.currentTarget.style.transform='translateY(-2px)'; e.currentTarget.style.boxShadow='0 12px 40px rgba(25,195,125,.5)' }}
        onMouseLeave={e => { e.currentTarget.style.transform='translateY(0)'; e.currentTarget.style.boxShadow='0 8px 32px rgba(25,195,125,.4)' }}
      >▶ &nbsp; Start EduVision</button>
      <div style={{ fontSize:12, color:'#1e2d40', maxWidth:320, textAlign:'center', lineHeight:1.6 }}>
        Click to start. The system will greet you with a voice welcome message and instructions.
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
//  MAIN APP
// ─────────────────────────────────────────────────────────────────────────────
export default function App() {
  // Student ID — generated once per session
  const [studentId, setStudentId] = useState(() => {
    const stored = sessionStorage.getItem('ev_student_id')
    if (stored) return stored
    const id = 'EV-' + Math.random().toString(36).slice(2,6).toUpperCase()
    sessionStorage.setItem('ev_student_id', id)
    return id
  })

  // Teacher dashboard toggle
  const [teacherView,    setTeacherView]    = useState(false)
  const [dashboardData,  setDashboardData]  = useState(null)
  const [dashLoading,    setDashLoading]    = useState(false)

  const [started,       setStarted]       = useState(false)
  const [messages,      setMessages]      = useState([])
  const [isRecording,   setIsRecording]   = useState(false)
  const [isProcessing,  setIsProcessing]  = useState(false)
  const [micReady,      setMicReady]      = useState(false)

  // quiz state
  const [quizActive,    setQuizActive]    = useState(false)
  const [quizQuestions, setQuizQuestions] = useState([])
  const [quizIndex,     setQuizIndex]     = useState(0)
  const [quizAnswers,   setQuizAnswers]   = useState([])
  const [quizDone,      setQuizDone]      = useState(false)

  // difficulty + toast + q-learning history
  const [difficulty,       setDifficulty]       = useState('medium')
  const [diffToast,        setDiffToast]        = useState(null)
  const [qLearningHistory, setQLearningHistory] = useState([])

  // engagement state
  const [engState,  setEngState]  = useState(null)
  const [engScore,  setEngScore]  = useState(null)
  const [engActive,      setEngActive]      = useState(false)
  const [showShortcuts,  setShowShortcuts]  = useState(false)

  const quizTopicRef    = useRef('')
  const quizContentRef  = useRef('')
  const quizActiveRef   = useRef(false)
  const quizQuestionsRef = useRef([])
  const quizAnswersRef   = useRef([])
  const quizIndexRef     = useRef(0)
  const recorderRef     = useRef(null)
  const chunksRef       = useRef([])
  const bottomRef       = useRef(null)
  const mimeRef         = useRef('')
  const engIntervalRef  = useRef(null)
  const engStreamRef    = useRef(null)

  // Stable refs for keyboard handler
  const isRecordingRef   = useRef(false)
  const micLockedRef     = useRef(false)
  const quizAvailableRef = useRef(false)
  const lastMsgRef       = useRef('')
  const engStateRef      = useRef(null)
  const engScoreRef      = useRef(null)
  const difficultyRef    = useRef('medium')

  useEffect(() => { quizActiveRef.current  = quizActive  }, [quizActive])
  useEffect(() => { isRecordingRef.current = isRecording }, [isRecording])
  useEffect(() => { engStateRef.current    = engState    }, [engState])
  useEffect(() => { engScoreRef.current    = engScore    }, [engScore])
  useEffect(() => { difficultyRef.current  = difficulty  }, [difficulty])
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior:'smooth' }) }, [messages])

  // Track last assistant message + quiz availability for shortcuts
  useEffect(() => {
    const last = [...messages].reverse().find(m => m.role==='assistant' && m.text && !m.typing)
    if (last) lastMsgRef.current = last.text
    quizAvailableRef.current = messages.some(m => m.showQuizBtn)
  }, [messages])

  // ── ENGAGEMENT POLLING (SYNCHRONOUS) ──────────────────────────────────────
  const startEngagementPolling = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      engStreamRef.current = stream
      setEngActive(true)
      console.log('[Engagement] Polling started')

      const poll = async () => {
        if (!engStreamRef.current) return
        try {
          const chunks = []
          const recorder = new MediaRecorder(engStreamRef.current)
          recorder.ondataavailable = e => { if (e.data?.size > 0) chunks.push(e.data) }
          recorder.start()
          await new Promise(res => setTimeout(res, 3000))
          recorder.stop()
          await new Promise(res => { recorder.onstop = res })

          const blob = new Blob(chunks, { type: 'video/webm' })
          const form = new FormData()
          form.append('video', blob, 'engagement.webm')
          form.append('audio', blob, 'engagement.webm')

          // Synchronous API call — gets result immediately
          const res = await axios.post('http://localhost:5000/api/engagement', form)
          
          if (res.data.result) {
            const d = res.data.result
            setEngState(d.engagement_state)
            setEngScore(d.fused_score)
            console.log(`[Engagement] ${d.engagement_state} (${d.fused_score?.toFixed(2)})`)
          }
        } catch (e) {
          console.warn('[Engagement] Poll error:', e.message)
        }
      }

      setTimeout(poll, 5000)
      engIntervalRef.current = setInterval(poll, 60000)

    } catch (e) {
      console.warn('[Engagement] Camera/mic access denied:', e.message)
    }
  }

  const stopEngagementPolling = () => {
    if (engIntervalRef.current) { clearInterval(engIntervalRef.current); engIntervalRef.current = null }
    if (engStreamRef.current)   { engStreamRef.current.getTracks().forEach(t => t.stop()); engStreamRef.current = null }
    setEngActive(false)
  }

  useEffect(() => {
    if (started) startEngagementPolling()
    return () => stopEngagementPolling()
  }, [started])

  // ── KEYBOARD SHORTCUTS ───────────────────────────────────────────────────
  const SHORTCUT_LIST = [
    { keys: 'Ctrl + R', action: 'Start or stop voice recording'   },
    { keys: 'Ctrl + Q', action: 'Take the quiz'                    },
    { keys: 'Ctrl + P', action: 'Replay the last answer'           },
    { keys: 'Ctrl + S', action: 'Stop audio'                       },
    { keys: 'Ctrl + N', action: 'Start a new question'             },
    { keys: 'Ctrl + D', action: 'Hear your current difficulty level'},
    { keys: 'Ctrl + E', action: 'Hear your engagement status'      },
    { keys: 'Ctrl + H', action: 'Show or hide this shortcuts panel' },
  ]

  // Ctrl+N — reset for a new question
  const handleNewQuestion = () => {
    ttsStop()
    setQuizActive(false)
    quizActiveRef.current = false
    setQuizDone(false)
    setQuizAnswers([])
    setQuizQuestions([])
    setQuizIndex(0)
    quizAnswersRef.current   = []
    quizQuestionsRef.current = []
    quizIndexRef.current     = 0
    quizTopicRef.current   = ''
    quizContentRef.current = ''
    setMicReady(true)
    const msg = 'Ready for a new question. Press the microphone and speak your topic.'
    setMessages(p => [...p, { id:crypto.randomUUID(), role:'system', text:'🔄 New question — speak your topic.' }])
    ttsSpeak(msg)
  }

  useEffect(() => {
    const handler = (e) => {
      if (!e.ctrlKey) return
      const tag = document.activeElement?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return

      switch (e.key.toLowerCase()) {
        case 'r': {
          e.preventDefault()
          if (micLockedRef.current) {
            ttsSpeak('Microphone is not ready yet. Please wait.')
            return
          }
          if (isRecordingRef.current) {
            ttsSpeak('Stopping recording.')
            stopRecording()
          } else {
            ttsSpeak('Starting recording. Speak now.')
            startRecording()
          }
          break
        }

        case 'q': {
          e.preventDefault()
          if (quizAvailableRef.current) {
            ttsSpeak('Starting quiz.')
            startQuiz()
          } else {
            ttsSpeak('Quiz is not available yet. Ask a question first, then use Control Q to take the quiz.')
          }
          break
        }

        case 'p': {
          e.preventDefault()
          if (lastMsgRef.current) {
            ttsSpeak(lastMsgRef.current)
          } else {
            ttsSpeak('Nothing to replay yet.')
          }
          break
        }

        case 's': {
          e.preventDefault()
          ttsStop()
          break
        }

        case 'n': {
          e.preventDefault()
          handleNewQuestion()
          break
        }

        case 'd': {
          e.preventDefault()
          const d = difficultyRef.current
          ttsSpeak(`Your current difficulty level is ${d}.`)
          break
        }

        case 'e': {
          e.preventDefault()
          const es = engStateRef.current
          const score = engScoreRef.current
          if (es) {
            const label = es
            const pct   = score != null ? ` at ${Math.round(score * 100)} percent` : ''
            ttsSpeak(`Your engagement status is ${label}${pct}.`)
          } else {
            ttsSpeak('Engagement data is not available yet. The system will start tracking shortly.')
          }
          break
        }

        case 'h': {
          e.preventDefault()
          setShowShortcuts(prev => {
            const next = !prev
            if (next) {
              const spoken = 'Keyboard shortcuts panel opened. ' +
                'Control R: record. Control Q: quiz. Control P: replay. ' +
                'Control S: stop audio. Control N: new question. ' +
                'Control D: difficulty. Control E: engagement. Control H: close this panel.'
              ttsSpeak(spoken)
            } else {
              ttsSpeak('Shortcuts panel closed.')
            }
            return next
          })
          break
        }

        default: break
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  // ── FETCH DASHBOARD ─────────────────────────────────────────────────────
  const fetchDashboard = async () => {
    setDashLoading(true)
    try {
      const res = await axios.get(`${API}/dashboard`)
      setDashboardData(res.data)
    } catch (e) {
      console.warn('[Dashboard] fetch failed:', e.message)
      setDashboardData(null)
    } finally {
      setDashLoading(false)
    }
  }

  const toggleTeacherView = () => {
    setTeacherView(v => {
      if (!v) fetchDashboard()
      return !v
    })
  }

  // ── WELCOME ───────────────────────────────────────────────────────────────
  const handleStart = () => {
    setStarted(true)
    const tid = crypto.randomUUID()
    setMessages([{ id:tid, role:'assistant', text:'', typing:true }])
    setTimeout(() => {
      setMessages([{ id:tid, role:'assistant', text:WELCOME_TEXT, typing:false }])
      ttsSpeak(WELCOME_TEXT, { rate:0.88, onEnd:() => {
        setMicReady(true)
        setMessages(p => [...p, { id:crypto.randomUUID(), role:'system',
          text:`✅ Microphone is now active — press the button below to ask your question. Your student ID is ${studentId}` }])
        ttsSpeak(`Your student ID is ${studentId}. Your teacher can use this to track your progress.`)
      }})
    }, 600)
  }

  // ── RECORDING ─────────────────────────────────────────────────────────────
  const startRecording = async () => {
    ttsStop()
    chunksRef.current = []
    let stream
    try { stream = await navigator.mediaDevices.getUserMedia({ audio:true }) }
    catch {
      setMessages(p => [...p, { id:crypto.randomUUID(), role:'system',
        text:'⚠️ Microphone access denied — allow microphone in browser settings.' }])
      return
    }
    const mime = getBestMime()
    mimeRef.current = mime || 'audio/webm'
    const recorder = new MediaRecorder(stream, mime ? { mimeType:mime } : {})
    recorder.ondataavailable = e => { if (e.data?.size > 0) chunksRef.current.push(e.data) }
    recorder.onstop = () => {
      stream.getTracks().forEach(t => t.stop())
      if (quizActiveRef.current) handleQuizAnswer(mimeRef.current)
      else sendAudio(mimeRef.current)
    }
    recorderRef.current = recorder
    recorder.start(200)
    setIsRecording(true)
  }

  const stopRecording = () => {
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop()
    setIsRecording(false)
    setIsProcessing(true)
  }

  const toggleMic = () => {
    if (isProcessing) return
    if (!micReady && !isRecording) return
    isRecording ? stopRecording() : startRecording()
  }

  // ── SEND AUDIO → STT → CONTENT ────────────────────────────────────────────
  const sendAudio = async (mime) => {
    if (!chunksRef.current.length) {
      setMessages(p => [...p, { id:crypto.randomUUID(), role:'system', text:'⚠️ No audio captured. Please try again.' }])
      setIsProcessing(false)
      return
    }
    const blob = new Blob(chunksRef.current, { type:mime })
    const form = new FormData()
    form.append('audio', blob, 'recording.webm')
    const uid = crypto.randomUUID()
    setMessages(p => [...p, { id:uid, role:'user', text:'🎙️ Transcribing your voice…' }])

    try {
      const sttRes     = await axios.post(`${API}/stt`, form)
      const transcript = sttRes.data.transcript?.trim()
      if (!transcript) {
        setMessages(p => p.map(m => m.id===uid ? {...m, text:'(No speech detected — please try again.)'} : m))
        setIsProcessing(false)
        ttsSpeak("Sorry, I couldn't hear anything clearly. Please try again.")
        return
      }
      setMessages(p => p.map(m => m.id===uid ? {...m, text:transcript} : m))

      const searchId = crypto.randomUUID()
      setMessages(p => [...p, { id:searchId, role:'assistant', text:'', typing:true }])
      ttsSpeak(`You asked about ${transcript}. Let me find the content for you.`)

      let contentData
      try {
        const cr = await axios.post(`${API}/content`, { query:transcript })
        contentData = cr.data
      } catch {
        setMessages(p => p.map(m => m.id===searchId
          ? {...m, typing:false, text:'⚠️ Could not retrieve content. Please check the backend.'} : m))
        setIsProcessing(false)
        ttsSpeak("Sorry, I could not retrieve content for that topic.")
        return
      }

      const { simplified, source } = contentData
      quizTopicRef.current   = transcript
      quizContentRef.current = simplified

      const sourceNote = source==='mongodb'   ? '📚 Source: Your Knowledge Base'
                       : source==='wikipedia' ? '🌐 Source: Wikipedia' : '⚠️ No source found'

      setMessages(p => p.map(m => m.id===searchId
        ? {...m, typing:false, text:simplified, source:sourceNote, showQuizBtn:false} : m))

      ttsSpeak(simplified, { rate:0.88, onEnd:() => {
        setMessages(p => p.map(m => m.id===searchId ? {...m, showQuizBtn:true} : m))
        setMicReady(true)
        setMessages(p => [...p, { id:crypto.randomUUID(), role:'system',
          text:'Content read aloud — you can replay, or press Take Quiz to test yourself' }])
      }})
      setIsProcessing(false)

    } catch (err) {
      console.error('[sendAudio]', err)
      setMessages(p => p.map(m => m.id===uid
        ? {...m, text:'⚠️ Transcription failed. Make sure Flask is running on port 5000.'} : m))
      setIsProcessing(false)
      ttsSpeak("There was an error. Please make sure the backend server is running.")
    }
  }

  // ── QUIZ ──────────────────────────────────────────────────────────────────
  const startQuiz = async () => {
    ttsStop()
    setQuizActive(true)
    quizActiveRef.current = true
    setQuizIndex(0)
    setQuizAnswers([])
    setQuizDone(false)
    quizQuestionsRef.current = []
    quizAnswersRef.current   = []
    quizIndexRef.current     = 0

    const lid = crypto.randomUUID()
    setMessages(p => [...p, { id:lid, role:'assistant', text:'', typing:true }])
    ttsSpeak("Great! Generating your quiz now. Please wait.")

    try {
      const res       = await axios.post(`${API}/quiz`, {
        topic: quizTopicRef.current, content: quizContentRef.current, difficulty
      })
      const questions = res.data.questions
      setQuizQuestions(questions)
      quizQuestionsRef.current = questions
      setMessages(p => p.map(m => m.id===lid ? { ...m, typing:false,
        text:`Quiz ready! I will read each question aloud. After each question, press the microphone and say your answer — for example say "option A" or "option B".` } : m))
      quizIndexRef.current = 0
      setTimeout(() => readQuestion(questions, 0), 1000)
    } catch {
      setMessages(p => p.map(m => m.id===lid
        ? {...m, typing:false, text:'⚠️ Could not generate quiz. Please try again.'} : m))
      setQuizActive(false)
      quizActiveRef.current = false
      ttsSpeak("Sorry, I could not generate the quiz. Please try again.")
    }
  }

  const readQuestion = (questions, idx) => {
    const q   = questions[idx]
    const num = idx + 1
    const txt = `Question ${num} of 5. ${q.question} Option A: ${q.options.A}. Option B: ${q.options.B}. Option C: ${q.options.C}. Option D: ${q.options.D}. Please say your answer now.`
    setMessages(p => [...p, { id:crypto.randomUUID(), role:'assistant',
      text:`Q${num}. ${q.question}\n\nA) ${q.options.A}\nB) ${q.options.B}\nC) ${q.options.C}\nD) ${q.options.D}`,
      isQuestion:true }])
    ttsSpeak(txt, { rate:0.88, onEnd:() => {
      setMicReady(true)
      setMessages(p => [...p, { id:crypto.randomUUID(), role:'system',
        text:`🎙️ Say your answer — "option A", "option B", "option C", or "option D"` }])
    }})
  }

  const parseAnswer = (t) => {
    t = t.toLowerCase()
    if (/option\s*a|answer\s*a|\ba\b/.test(t)) return 'A'
    if (/option\s*b|answer\s*b|\bb\b/.test(t)) return 'B'
    if (/option\s*c|answer\s*c|\bc\b/.test(t)) return 'C'
    if (/option\s*d|answer\s*d|\bd\b/.test(t)) return 'D'
    return null
  }

  const handleQuizAnswer = async (mime) => {
    if (!chunksRef.current.length) {
      ttsSpeak("I did not hear your answer. Please try again.")
      setIsProcessing(false)
      return
    }
    const blob = new Blob(chunksRef.current, { type:mime })
    const form = new FormData()
    form.append('audio', blob, 'recording.webm')
    setMessages(p => [...p, { id:crypto.randomUUID(), role:'user', text:'🎙️ Listening for your answer…' }])

    try {
      const res        = await axios.post(`${API}/stt`, form)
      const transcript = res.data.transcript?.trim() || ''
      const given      = parseAnswer(transcript)

      const curIdx  = quizIndexRef.current
      const qs      = quizQuestionsRef.current
      const correct = qs[curIdx]?.answer

      setMessages(p => { const c=[...p]; c[c.length-1]={...c[c.length-1], text:transcript||'(unclear)'}; return c })

      if (!given) {
        setIsProcessing(false)
        ttsSpeak("Sorry, I could not understand. Please say option A, B, C, or D clearly.")
        setMicReady(true)
        return
      }

      const isRight    = given === correct
      const newAnswers = [...quizAnswersRef.current, { given, correct, isRight, transcript }]
      quizAnswersRef.current = newAnswers
      setQuizAnswers(newAnswers)

      const nextIdx = curIdx + 1
      quizIndexRef.current = nextIdx
      setQuizIndex(nextIdx)

      const resultText = isRight
        ? `✅ Correct! The answer is option ${correct}.`
        : `❌ Incorrect. You said option ${given}, but the correct answer is option ${correct}.`
      setMessages(p => [...p, { id:crypto.randomUUID(), role:'assistant', text:resultText }])

      ttsSpeak(resultText, { rate:0.9, onEnd:() => {
        if (nextIdx < qs.length) {
          setIsProcessing(false)
          setTimeout(() => readQuestion(qs, nextIdx), 600)
          return
        }
        setIsProcessing(false)
        finishQuiz(newAnswers)
      }})
    } catch (err) {
      console.error('[QuizAnswer]', err)
      setIsProcessing(false)
      ttsSpeak("There was an error. Please try again.")
    }
  }

  const finishQuiz = async (answers) => {
    setQuizDone(true)
    setQuizActive(false)
    quizActiveRef.current = false
    const score     = answers.filter(a => a.isRight).length
    const pct       = Math.round((score / answers.length) * 100)
    const quizScore = score / answers.length

    const msg = `Quiz complete! You scored ${score} out of ${answers.length}, which is ${pct} percent. ${
      pct>=80 ? 'Excellent work!' : pct>=60 ? 'Good effort! Keep practising.' : 'Keep going — you will improve with practice.'}`

    setMessages(p => [...p, { id:crypto.randomUUID(), role:'assistant',
      text:`🎯 Quiz Complete!\n\nScore: ${score} / ${answers.length}  (${pct}%)\n\n${
        answers.map((a,i) => `Q${i+1}: You said ${a.given} — ${a.isRight ? '✅ Correct' : `❌ Wrong (correct: ${a.correct})`}`).join('\n')}`,
      isScore:true }])

    ttsSpeak(msg)
    setMicReady(true)

    setTimeout(() => setMessages(p => [...p, {
      id:crypto.randomUUID(), role:'system', text:'Press the microphone to ask about another topic'
    }]), 500)

    // ── Q-Learning: update difficulty after quiz ──────────────────────────
    try {
      const engagementScore = engScore ?? 0.5
      const res = await axios.post(`${API}/personalize`, {
        quiz_score:         quizScore,
        engagement_score:   engagementScore,
        current_difficulty: difficulty,
      })
      const d = res.data
      if (d.success && d.changed) {
        setDifficulty(d.new_difficulty)
        const arrow  = d.delta > 0 ? '↑' : '↓'
        const label  = d.delta > 1 || d.delta < -1 ? 'Significantly' : 'Slightly'
        const upDown = d.delta > 0 ? 'increased' : 'decreased'
        setDiffToast({ text: `${arrow} Difficulty ${label} ${upDown} → ${d.new_difficulty}`, delta: d.delta })
        setTimeout(() => setDiffToast(null), 4000)
        setQLearningHistory(prev => [...prev, {
          quizIndex:      prev.length + 1,
          difficulty:     d.new_difficulty,
          prevDifficulty: difficulty,
          quizScore,
          engagementScore,
          delta:          d.delta,
          timestamp:      new Date().toISOString()
        }])
      } else {
        setQLearningHistory(prev => [...prev, {
          quizIndex:      prev.length + 1,
          difficulty,
          prevDifficulty: difficulty,
          quizScore,
          engagementScore,
          delta:          0,
          timestamp:      new Date().toISOString()
        }])
      }
    } catch (e) {
      console.warn('[QLearning] personalize failed:', e.message)
    }

    // ── Save session to MongoDB for teacher dashboard ─────────────────────
    try {
      await axios.post(`${API}/session/save`, {
        student_id:       studentId,
        topic:            quizTopicRef.current,
        quiz_score:       quizScore,
        engagement_score: engScore ?? null,
        engagement_state: engState,
        has_engagement:   engState != null,
        difficulty:       difficulty,
        answers:          answers.map(a => ({
          given:   a.given,
          correct: a.correct,
          isRight: a.isRight,
        })),
      })
      console.log('[Session] Saved to dashboard')
    } catch (e) {
      console.warn('[Session] Save failed (non-critical):', e.message)
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  RENDER
  // ─────────────────────────────────────────────────────────────────────────
  if (!started) return <Splash onStart={handleStart} />

  const micLocked = isProcessing || (!micReady && !isRecording)
  micLockedRef.current = micLocked
  const latestQuizScore = quizAnswers.length > 0
    ? quizAnswers.filter(a => a.isRight).length / quizAnswers.length
    : null

  return (
    <div style={{ display: 'flex', height: '100vh', width: '100%', background: '#0d1421', overflow: 'hidden' }}>

      {/* Keyboard shortcuts modal — Ctrl+H */}
      {showShortcuts && (
        <ShortcutsModal
          shortcuts={SHORTCUT_LIST}
          onClose={() => { setShowShortcuts(false); ttsSpeak('Shortcuts panel closed.') }}
        />
      )}

      {/* Screen-reader live region */}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        style={{ position:'absolute', width:1, height:1, overflow:'hidden', opacity:0, pointerEvents:'none' }}
      />

      {/* ── FULL-WIDTH COLUMN: header always on top ───────────────────── */}
      <div style={{ display:'flex', flexDirection:'column', flex:1, overflow:'hidden', minWidth:0 }}>

        {/* HEADER — always visible */}
        <header style={{ display:'flex', alignItems:'center', gap:12, padding:'13px 32px',
          background:'#080d16', borderBottom:'1px solid #14202e', flexShrink:0,
          zIndex:10, position:'relative' }}>
          <div style={{ width:40, height:40, borderRadius:10, background:'#071a10',
            border:'1.5px solid #174d2e', display:'flex', alignItems:'center', justifyContent:'center',
            fontWeight:900, fontSize:14, color:'#19c37d', letterSpacing:'-0.5px', flexShrink:0 }}>EV</div>
          <div>
            <div style={{ fontWeight:700, fontSize:15, color:'#ddeaf8', letterSpacing:'-.3px' }}>EduVision</div>
            <div style={{ fontSize:11, color:'#2e4460' }}>AI-Powered Inclusive Learning</div>
          </div>
          <div style={{ marginLeft:'auto', display:'flex', alignItems:'center', gap:7,
            background:'#080d16', border:'1px solid #14202e', borderRadius:20, padding:'5px 14px' }}>
            <span style={{ width:7, height:7, borderRadius:'50%', flexShrink:0,
              background: micReady ? '#19c37d' : '#f59e0b',
              animation: micReady ? 'none' : 'blink 1.5s ease-in-out infinite' }}/>
            <span style={{ fontSize:12, color:'#2e4460' }}>
              {quizActive ? `Quiz: Q${quizIndex+1} of ${quizQuestions.length}`
               : quizDone ? `Score: ${quizAnswers.filter(a=>a.isRight).length}/${quizAnswers.length}`
               : micReady ? 'Ready' : 'Welcome playing…'}
            </span>
          </div>

          {engState && (
            <div style={{ display:'flex', alignItems:'center', gap:7, background:'#080d16',
              border:`1px solid ${
                engState==='Highly Engaged'    ? '#174d2e' :
                engState==='Engaged'           ? '#1a3a5c' :
                engState==='Partially Engaged' ? '#4a3a10' : '#4a1010'
              }`, borderRadius:20, padding:'5px 14px' }}>
              <span style={{ width:7, height:7, borderRadius:'50%', flexShrink:0, background:
                engState==='Highly Engaged'    ? '#19c37d' :
                engState==='Engaged'           ? '#3b82f6' :
                engState==='Partially Engaged' ? '#f59e0b' : '#ef4444' }}/>
              <span style={{ fontSize:12, color:'#2e4460' }}>
                {engState}
                {engScore != null && ` (${(engScore*100).toFixed(0)}%)`}
              </span>
            </div>
          )}

          <div style={{ display:'flex', alignItems:'center', gap:6, background:'#080d16',
            border:'1px solid #1a2a3a', borderRadius:20, padding:'5px 14px' }}>
            <span style={{ fontSize:11, color:'#2e4460' }}>Level:</span>
            <span style={{ fontSize:12, fontWeight:700, color:
              difficulty==='beginner' ? '#6ee7b7' : difficulty==='easy' ? '#93c5fd' :
              difficulty==='medium'   ? '#fde68a' : difficulty==='hard' ? '#fca5a5' : '#f87171'
            }}>{difficulty}</span>
          </div>
          <button onClick={ttsStop} style={{ display:'flex', alignItems:'center', gap:6,
            background:'none', border:'1px solid #14202e', borderRadius:8, padding:'6px 14px',
            color:'#2e4460', fontSize:12, cursor:'pointer', fontFamily:'inherit', transition:'all .15s' }}
            onMouseEnter={e => { e.currentTarget.style.color='#c8d8ee'; e.currentTarget.style.borderColor='#2a3f5c' }}
            onMouseLeave={e => { e.currentTarget.style.color='#2e4460'; e.currentTarget.style.borderColor='#14202e' }}
          ><IconVolOff/> Stop Audio</button>

          <button
            onClick={() => setShowShortcuts(v => !v)}
            title="Keyboard shortcuts (Ctrl+H)"
            aria-label="Show keyboard shortcuts panel"
            style={{ display:'flex', alignItems:'center', gap:6,
              background: showShortcuts ? '#071a10' : 'none',
              border: `1px solid ${showShortcuts ? '#174d2e' : '#14202e'}`,
              borderRadius:8, padding:'6px 14px',
              color: showShortcuts ? '#19c37d' : '#2e4460',
              fontSize:12, cursor:'pointer', fontFamily:'inherit', transition:'all .15s' }}
            onMouseEnter={e => { e.currentTarget.style.color='#19c37d'; e.currentTarget.style.borderColor='#174d2e' }}
            onMouseLeave={e => {
              if (!showShortcuts) {
                e.currentTarget.style.color='#2e4460'
                e.currentTarget.style.borderColor='#14202e'
              }
            }}
          >⌨️ Shortcuts</button>

          <button
            onClick={toggleTeacherView}
            title="Teacher Dashboard"
            aria-label={teacherView ? 'Back to student view' : 'Open teacher dashboard'}
            style={{ display:'flex', alignItems:'center', gap:6,
              background: teacherView ? '#071a10' : 'none',
              border: `1px solid ${teacherView ? '#174d2e' : '#14202e'}`,
              borderRadius:8, padding:'6px 14px',
              color: teacherView ? '#19c37d' : '#2e4460',
              fontSize:12, cursor:'pointer', fontFamily:'inherit', transition:'all .15s' }}
            onMouseEnter={e => { e.currentTarget.style.color='#19c37d'; e.currentTarget.style.borderColor='#174d2e' }}
            onMouseLeave={e => {
              if (!teacherView) {
                e.currentTarget.style.color='#2e4460'
                e.currentTarget.style.borderColor='#14202e'
              }
            }}
          >{teacherView ? '🎓 Student View' : '📊 Teacher'}</button>
          <style>{`@keyframes blink{0%,100%{opacity:1}50%{opacity:.15}} @keyframes fadeInUp{from{opacity:0;transform:translateX(-50%) translateY(12px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}`}</style>
        </header>

        {/* Body — switches between student chat and teacher dashboard */}
        <div style={{ display:'flex', flex:1, overflow:'hidden' }}>

        {/* TEACHER DASHBOARD — full width */}
        {teacherView && (
          <div style={{ flex:1, overflowY:'auto', background:'#080d16' }}>
            <TeacherDashboard
              data={dashboardData}
              loading={dashLoading}
              onRefresh={fetchDashboard}
            />
          </div>
        )}

        {/* STUDENT CHAT — hidden when teacher view active */}
        <div style={{ flex:2, display: teacherView ? 'none' : 'flex',
          flexDirection:'column', minWidth:0, borderRight:'1px solid #1a2a3c' }}>

        {/* MESSAGES */}
        <main style={{ flex:1, overflowY:'auto' }}>
          <div style={{ maxWidth:860, margin:'0 auto', padding:'0 32px' }}>
            {messages.map(m => <Msg key={m.id} m={m} onStartQuiz={startQuiz}/>)}
            <div ref={bottomRef} style={{ height:28 }}/>
          </div>
        </main>

        {/* FOOTER */}
        <footer style={{ padding:'12px 0 22px', background:'#080d16',
          borderTop:'1px solid #14202e', flexShrink:0 }}>
          <div style={{ maxWidth:860, margin:'0 auto', padding:'0 32px' }}>
            <div style={{ minHeight:36, marginBottom:10 }}>
              {isRecording && (
                <div style={{ display:'inline-flex', alignItems:'center', gap:10, background:'#160a0a',
                  border:'1px solid #3d1010', borderRadius:10, padding:'6px 16px', color:'#f87171', fontSize:13 }}>
                  <Waveform/> {quizActive ? 'Say your answer — option A, B, C, or D' : 'Listening — speak now, press stop when done'}
                </div>
              )}
              {isProcessing && !isRecording && (
                <div style={{ display:'inline-flex', alignItems:'center', gap:10, background:'#07120d',
                  border:'1px solid #174d2e', borderRadius:10, padding:'6px 16px', color:'#19c37d', fontSize:13 }}>
                  <TypingDots/><span style={{ marginLeft:6 }}>Processing…</span>
                </div>
              )}
            </div>

            <div style={{ display:'flex', alignItems:'center', gap:12, background:'#0f1826',
              border:`1.5px solid ${isRecording ? '#3d1010' : '#14202e'}`, borderRadius:16, padding:'11px 14px',
              boxShadow: isRecording ? '0 0 0 3px rgba(239,68,68,.07)' : 'none',
              transition:'border-color .2s, box-shadow .2s' }}>
              <span style={{ flex:1, fontSize:14, fontStyle:'italic', userSelect:'none',
                color: isRecording ? '#f87171' : isProcessing ? '#19c37d' : micLocked ? '#1e3040' : '#2e4460' }}>
                {isRecording   ? (quizActive ? 'Say your answer — option A, B, C, or D' : 'Recording — press stop when done')
                 : isProcessing ? 'Processing…'
                 : micLocked   ? 'Please wait…'
                 : quizActive  ? `Q${quizIndex+1} of ${quizQuestions.length} — press mic and say your answer`
                 :                'Press the microphone and speak your question'}
              </span>
              <button onClick={toggleMic} disabled={micLocked}
                title={isRecording ? 'Stop recording (Ctrl+R)' : 'Start recording (Ctrl+R)'}
                aria-label={isRecording ? 'Stop recording' : micLocked ? 'Microphone unavailable' : 'Start recording'}
                aria-pressed={isRecording}
                style={{ width:52, height:52, borderRadius:'50%', border:'none', flexShrink:0,
                  cursor: micLocked ? 'not-allowed' : 'pointer',
                  display:'flex', alignItems:'center', justifyContent:'center', color:'white',
                  background: isRecording ? '#dc2626' : micLocked ? '#111e2c' : 'linear-gradient(145deg,#19c37d,#0d9e62)',
                  boxShadow: isRecording ? '0 0 0 7px rgba(220,38,38,.2),0 4px 20px rgba(220,38,38,.4)'
                           : micLocked ? 'none' : '0 4px 20px rgba(25,195,125,.45)',
                  transition:'all .2s', animation: isRecording ? 'rp 1.7s ease-in-out infinite' : 'none' }}>
                {isRecording ? <IconStop/> : <IconMic/>}
              </button>
            </div>

            <div style={{ textAlign:'center', fontSize:11, color:'#141e2c', marginTop:9 }}>
              EduVision · Adaptive Learning Platform
            </div>
            <style>{`@keyframes rp{0%,100%{box-shadow:0 0 0 5px rgba(220,38,38,.22),0 4px 20px rgba(220,38,38,.4)}50%{box-shadow:0 0 0 14px rgba(220,38,38,.04),0 4px 20px rgba(220,38,38,.15)}}`}</style>
          </div>
        </footer>
        </div>{/* end student chat */}

      {/* Right Panel — hidden when teacher view active */}
      <div style={{ flex: 1, display: teacherView ? 'none' : 'flex', flexDirection: 'column', background: '#0a101a',
        minWidth: 320, overflowY: 'auto', padding: '16px', gap: '16px' }}>

        {diffToast && (
          <div style={{
            background: diffToast.delta > 0 ? '#0d2a1a' : '#2a0d0d',
            border: `1px solid ${diffToast.delta > 0 ? '#19c37d' : '#ef4444'}`,
            borderRadius: 12, padding: '12px 16px',
            display: 'flex', alignItems: 'center', gap: 10, animation: 'slideIn 0.3s ease',
          }}>
            <span style={{ fontSize: 20 }}>{diffToast.delta > 0 ? '📈' : '📉'}</span>
            <span style={{ fontSize: 13, fontWeight: 600, color: diffToast.delta > 0 ? '#19c37d' : '#ef4444' }}>
              {diffToast.text}
            </span>
          </div>
        )}

        <LivePreview
          stream={engStreamRef.current}
          engState={engState}
          engScore={engScore}
          difficulty={difficulty}
          quizScore={latestQuizScore}
        />

        <QLearningDashboard history={qLearningHistory} />
      </div>

      </div>{/* end body flex row */}
      </div>{/* end outer column */}

      <style>{`
        @keyframes slideIn {
          from { opacity: 0; transform: translateX(20px); }
          to   { opacity: 1; transform: translateX(0); }
        }
      `}</style>
    </div>
  )
}