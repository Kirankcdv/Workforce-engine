import { useState } from 'react'
import axios from 'axios'
import './App.css'

const API = 'http://127.0.0.1:8000'

function App() {
  const [file, setFile] = useState(null)
  const [skills, setSkills] = useState([])
  const [selectedSkill, setSelectedSkill] = useState(null)
  const [challenge, setChallenge] = useState(null)
  const [code, setCode] = useState('')
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [employees, setEmployees] = useState([])
  const [alerts, setAlerts] = useState([])
  const [showDashboard, setShowDashboard] = useState(false)

  const [scenarioAnswer, setScenarioAnswer] = useState('')
  const [scenarioResult, setScenarioResult] = useState(null)

  const handleFileChange = (e) => {
    setFile(e.target.files[0])
    setSkills([])
    setSelectedSkill(null)
    setChallenge(null)
    setResult(null)
    setError('')
  }

  const extractSkills = async () => {
    if (!file) return
    setLoading(true)
    setError('')
    const formData = new FormData()
    formData.append('file', file)
    try {
      const res = await axios.post(`${API}/extract-skills`, formData)
      setSkills(res.data.skills)
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to extract skills')
    }
    setLoading(false)
  }

  const pickSkill = async (skillObj) => {
    setSelectedSkill(skillObj)
    setChallenge(null)
    setResult(null)
    setScenarioAnswer('')
    setScenarioResult(null)
    setLoading(true)
    setError('')
    try {
      const res = await axios.post(`${API}/generate-challenge`, null, {
        params: { skill: skillObj.skill, category: skillObj.category }
      })
      setChallenge(res.data)
      if (res.data.type === 'code') {
        setCode(res.data.starter_code || '')
      }
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to generate challenge')
    }
    setLoading(false)
  }

  const runEvaluation = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await axios.post(`${API}/evaluate-code`, null, {
        params: {
          code: code,
          test_cases: JSON.stringify(challenge.test_cases)
        }
      })
      setResult(res.data)
    } catch (err) {
      setError(err.response?.data?.detail || 'Evaluation failed')
    }
    setLoading(false)
  }

  const submitScenarioAnswer = () => {
    const keywords = challenge.ideal_answer_keywords || []
    const answerLower = scenarioAnswer.toLowerCase()
    const matched = keywords.filter(k => answerLower.includes(k.toLowerCase()))
    setScenarioResult({
      matched,
      missed: keywords.filter(k => !matched.includes(k)),
      score: keywords.length ? Math.round((matched.length / keywords.length) * 100) : 0
    })
  }

  const loadDashboard = async () => {
    setLoading(true)
    setError('')
    try {
      const [empRes, alertRes] = await Promise.all([
        axios.get(`${API}/employees`),
        axios.get(`${API}/alerts`)
      ])
      setEmployees(empRes.data.employees)
      setAlerts(alertRes.data.alerts)
      setShowDashboard(true)
    } catch (err) {
      setError('Failed to load dashboard')
    }
    setLoading(false)
  }

  return (
    <div className="app-shell">
      <header className="nav">
        <div className="nav-inner">
          <div className="brand">
            <span className="brand-mark">◆</span>
            <span className="brand-text">Workforce<span className="accent">Engine</span></span>
          </div>
          <span className="badge">Hack Titans · Track 1 HR</span>
        </div>
      </header>

      <main className="app">
        <section className="hero">
          <h1>Active Workforce Pipeline Engine</h1>
          <p className="subtitle">Verify skills with real execution. Catch burnout before it costs you a top performer.</p>
        </section>

        {error && <div className="error">⚠ {error}</div>}

        <section className="card">
          <div className="card-head">
            <span className="step-num">1</span>
            <h2>Upload Resume</h2>
          </div>
          <div className="upload-row">
            <label className="file-input">
              <input type="file" accept=".pdf" onChange={handleFileChange} />
              {file ? file.name : 'Choose PDF file'}
            </label>
            <button className="btn-primary" onClick={extractSkills} disabled={!file || loading}>
              {loading ? 'Processing…' : 'Extract Skills'}
            </button>
          </div>
        </section>

        {skills.length > 0 && (
          <section className="card">
            <div className="card-head">
              <span className="step-num">2</span>
              <h2>Claimed Skills — Pick One to Verify</h2>
            </div>
            <div className="skill-list">
              {skills.map((s, i) => (
                <button
                  key={i}
                  className={`skill-chip ${selectedSkill?.skill === s.skill ? 'active' : ''}`}
                  onClick={() => pickSkill(s)}
                >
                  {s.skill} <span className="category">{s.category}</span>
                </button>
              ))}
            </div>
          </section>
        )}

        {challenge && challenge.type === 'code' && (
          <section className="card">
            <div className="card-head">
              <span className="step-num">3</span>
              <h2>Challenge · {challenge.skill}</h2>
            </div>
            <p className="problem-text">{challenge.problem_statement}</p>
            <textarea
              className="code-input"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              rows={10}
              spellCheck={false}
            />
            <button className="btn-primary" onClick={runEvaluation} disabled={loading}>
              {loading ? 'Running…' : 'Submit & Verify'}
            </button>
          </section>
        )}

        {challenge && challenge.type === 'scenario' && (
          <section className="card">
            <div className="card-head">
              <span className="step-num">3</span>
              <h2>Scenario · {challenge.skill}</h2>
            </div>
            <p className="problem-text"><strong>Scenario:</strong> {challenge.scenario}</p>
            <p className="problem-text"><strong>Question:</strong> {challenge.question}</p>
            <textarea
              className="code-input"
              value={scenarioAnswer}
              onChange={(e) => setScenarioAnswer(e.target.value)}
              rows={5}
              placeholder="Type your answer here..."
            />
            <button className="btn-primary" onClick={submitScenarioAnswer} disabled={!scenarioAnswer.trim()}>
              Submit Answer
            </button>
            {scenarioResult && (
              <div className="result-box">
                <p className="score">{scenarioResult.score}% concept coverage</p>
                <p className="detail-line pass-line">✅ Covered: {scenarioResult.matched.join(', ') || 'none'}</p>
                <p className="detail-line fail-line">❌ Missed: {scenarioResult.missed.join(', ') || 'none'}</p>
              </div>
            )}
          </section>
        )}

        {result && (
          <section className="card result-box">
            <div className="card-head">
              <h2>Verification Result</h2>
            </div>
            <p className="score">{result.score}% verified <span className="score-sub">({result.passed}/{result.total} tests passed)</span></p>
            {result.results.map((r, i) => (
              <div key={i} className={`test-result ${r.passed ? 'pass' : 'fail'}`}>
                <span className="test-icon">{r.passed ? '✅' : '❌'}</span>
                <span>Input: {JSON.stringify(r.input)} · Expected: {JSON.stringify(r.expected)} · Got: {JSON.stringify(r.actual)}</span>
                {r.error && <div className="err-detail">{r.error}</div>}
              </div>
            ))}
          </section>
        )}

        <section className="card">
          <div className="card-head">
            <h2>Workforce Risk Dashboard</h2>
          </div>
          <button className="btn-primary" onClick={loadDashboard} disabled={loading}>
            {loading ? 'Loading…' : 'Load Dashboard'}
          </button>
        </section>

        {showDashboard && (
          <>
            {alerts.length > 0 && (
              <section className="card alert-panel">
                <div className="card-head">
                  <h2>🚨 Active Alerts <span className="count-pill">{alerts.length}</span></h2>
                </div>
                {alerts.map((a) => (
                  <div key={a.id} className="alert-item">
                    <div className="alert-top">
                      <strong>{a.name}</strong>
                      <span className="alert-role">{a.role}</span>
                      <span className="alert-risk">risk {a.risk_score}</span>
                    </div>
                    <div className="action-text">{a.action}</div>
                  </div>
                ))}
              </section>
            )}

            <section className="card">
              <div className="card-head">
                <h2>All Employees</h2>
              </div>
              <table className="emp-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Role</th>
                    <th>Risk Score</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {employees.map((e) => (
                    <tr key={e.id} className={`risk-${e.risk_level}`}>
                      <td>{e.name}</td>
                      <td>{e.role}</td>
                      <td>{e.risk_score}</td>
                      <td><span className={`status-pill status-${e.risk_level}`}>{e.risk_level}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          </>
        )}
      </main>

      <footer className="foot">
        Built by Hack Titans 
      </footer>
    </div>
  )
}

export default App