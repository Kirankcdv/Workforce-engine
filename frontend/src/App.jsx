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

  return (
    <div className="app">
      <h1>Active Workforce Pipeline Engine</h1>
      <p className="subtitle">Team Hack Titans — Skill Verification Sandbox</p>

      <div className="card">
        <h2>1. Upload Resume</h2>
        <input type="file" accept=".pdf" onChange={handleFileChange} />
        <button onClick={extractSkills} disabled={!file || loading}>
          {loading ? 'Processing...' : 'Extract Skills'}
        </button>
      </div>

      {error && <div className="error">{error}</div>}

      {skills.length > 0 && (
        <div className="card">
          <h2>2. Claimed Skills — Pick One to Verify</h2>
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
        </div>
      )}

      {challenge && challenge.type === 'code' && (
        <div className="card">
          <h2>3. Challenge: {challenge.skill}</h2>
          <p>{challenge.problem_statement}</p>
          <textarea
            value={code}
            onChange={(e) => setCode(e.target.value)}
            rows={10}
          />
          <button onClick={runEvaluation} disabled={loading}>
            {loading ? 'Running...' : 'Submit & Verify'}
          </button>
        </div>
      )}

      {challenge && challenge.type === 'scenario' && (
        <div className="card">
          <h2>3. Scenario: {challenge.skill}</h2>
          <p><strong>Scenario:</strong> {challenge.scenario}</p>
          <p><strong>Question:</strong> {challenge.question}</p>
          <p className="note">Scenario-based scoring not wired up yet.</p>
        </div>
      )}

      {result && (
        <div className="card result">
          <h2>Result</h2>
          <p className="score">{result.score}% verified ({result.passed}/{result.total} tests passed)</p>
          {result.results.map((r, i) => (
            <div key={i} className={`test-result ${r.passed ? 'pass' : 'fail'}`}>
              <span>{r.passed ? '✅' : '❌'}</span> Input: {JSON.stringify(r.input)} | Expected: {JSON.stringify(r.expected)} | Got: {JSON.stringify(r.actual)}
              {r.error && <div className="err-detail">{r.error}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default App