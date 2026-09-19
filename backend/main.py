import os
import io
import json
import time
from dotenv import load_dotenv
import google.generativeai as genai

from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pypdf import PdfReader

load_dotenv()
genai.configure(api_key=os.getenv("GEMINI_API_KEY"))

app = FastAPI(title="Active Workforce Pipeline Engine")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

challenge_cache = {}


def call_gemini_with_retry(model, prompt, max_retries=3):
    for attempt in range(max_retries):
        try:
            return model.generate_content(prompt)
        except Exception as e:
            if "429" in str(e) or "quota" in str(e).lower():
                if attempt < max_retries - 1:
                    time.sleep(10)
                    continue
            raise
    raise HTTPException(status_code=503, detail="AI service temporarily unavailable — please retry in a moment")


@app.get("/")
def health():
    return {"status": "alive", "team": "Hack Titans"}


@app.post("/upload-resume")
async def upload_resume(file: UploadFile = File(...)):
    if not file.filename.endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are accepted")

    contents = await file.read()
    reader = PdfReader(io.BytesIO(contents))

    text = ""
    for page in reader.pages:
        text += page.extract_text() or ""

    if not text.strip():
        raise HTTPException(status_code=400, detail="Could not extract text from PDF — is it scanned/image-based?")

    return {
        "filename": file.filename,
        "pages": len(reader.pages),
        "char_count": len(text),
        "preview": text[:500]
    }


@app.post("/extract-skills")
async def extract_skills(file: UploadFile = File(...)):
    if not file.filename.endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are accepted")

    contents = await file.read()
    reader = PdfReader(io.BytesIO(contents))
    text = ""
    for page in reader.pages:
        text += page.extract_text() or ""

    if not text.strip():
        raise HTTPException(status_code=400, detail="Could not extract text from PDF")

    model = genai.GenerativeModel("gemini-3.5-flash-lite")
    prompt = f"""Extract technical skills claimed in this resume. Return ONLY a JSON array of objects, no markdown, no explanation. Each object must have:
- "skill": the skill name (e.g. "Python", "Docker", "React")
- "category": one of "language", "framework", "tool", "cloud", "database", "other"

Resume text:
{text[:4000]}
"""

    response = call_gemini_with_retry(model, prompt)
    raw = response.text.strip()

    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
        raw = raw.strip()

    try:
        skills = json.loads(raw)
    except json.JSONDecodeError:
        raise HTTPException(status_code=500, detail=f"Could not parse LLM response: {raw[:200]}")

    return {"filename": file.filename, "skills": skills}


@app.post("/generate-challenge")
async def generate_challenge(skill: str, category: str):
    cache_key = f"{skill.lower()}:{category.lower()}"
    if cache_key in challenge_cache:
        return challenge_cache[cache_key]

    model = genai.GenerativeModel("gemini-3.5-flash-lite")

    if category in ["language", "framework"]:
               prompt = f"""Create a small, self-contained coding challenge to test practical proficiency in {skill}.
The candidate must implement a Python function named exactly `solve` that takes exactly one argument and returns a value.
Return ONLY valid JSON, no markdown, with this exact structure:
{{
  "type": "code",
  "skill": "{skill}",
  "problem_statement": "clear description of what solve(x) should do, solvable in under 3 minutes",
  "starter_code": "def solve(x):\\n    # your code here\\n    pass",
  "test_cases": [
    {{"input": "example input", "expected_output": "example output"}}
  ],
  "language": "python"
}}
The function must always be named solve and take one parameter. Keep test case inputs and outputs as simple strings or numbers, not complex objects."""
    else:
        prompt = f"""Create a short practical scenario question to test real-world understanding of {skill}.
Return ONLY valid JSON, no markdown, with this exact structure:
{{
  "type": "scenario",
  "skill": "{skill}",
  "scenario": "a short realistic situation involving {skill}",
  "question": "what should the candidate do or explain",
  "ideal_answer_keywords": ["key", "concepts", "expected", "in", "a", "good", "answer"]
}}"""

    response = call_gemini_with_retry(model, prompt)
    raw = response.text.strip()

    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
        raw = raw.strip()

    try:
        challenge = json.loads(raw)
    except json.JSONDecodeError:
        raise HTTPException(status_code=500, detail=f"Could not parse LLM response: {raw[:200]}")

    challenge_cache[cache_key] = challenge
    return challenge
import subprocess
import tempfile


import subprocess
import tempfile


@app.post("/evaluate-code")
async def evaluate_code(code: str, test_cases: str):
    try:
        cases = json.loads(test_cases)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="test_cases must be valid JSON")

    results = []

    for case in cases:
        test_script = f"""
{code}

import json
_input = json.loads({json.dumps(json.dumps(case['input']))})
try:
    _result = solve(_input)
    print(json.dumps({{"output": _result, "error": None}}))
except Exception as e:
    print(json.dumps({{"output": None, "error": str(e)}}))
"""
        with tempfile.NamedTemporaryFile(mode="w", suffix=".py", delete=False) as f:
            f.write(test_script)
            temp_path = f.name

        try:
            proc = subprocess.run(
                ["python", temp_path],
                capture_output=True,
                text=True,
                timeout=5
            )
            if proc.returncode != 0:
                results.append({
                    "input": case["input"],
                    "expected": case["expected_output"],
                    "passed": False,
                    "error": proc.stderr[-300:]
                })
                continue

            try:
                parsed = json.loads(proc.stdout.strip().splitlines()[-1])
            except Exception:
                parsed = {"output": None, "error": "Could not parse output"}

            actual = parsed.get("output")
            passed = str(actual) == str(case["expected_output"])
            results.append({
                "input": case["input"],
                "expected": case["expected_output"],
                "actual": actual,
                "passed": passed,
                "error": parsed.get("error")
            })
        except subprocess.TimeoutExpired:
            results.append({
                "input": case["input"],
                "expected": case["expected_output"],
                "passed": False,
                "error": "Timed out (5s limit)"
            })
        finally:
            os.unlink(temp_path)

    total = len(results)
    passed_count = sum(1 for r in results if r["passed"])

    return {
        "total": total,
        "passed": passed_count,
        "score": round(passed_count / total * 100, 1) if total else 0,
        "results": results
    }
from datetime import datetime

employees = [
    {
        "id": 1,
        "name": "Aditi Rao",
        "role": "Backend Engineer",
        "hours_logged_weekly": 58,
        "pto_days_taken_last_quarter": 1,
        "overdue_tasks": 6,
        "after_hours_messages": 24,
    },
    {
        "id": 2,
        "name": "Rohan Mehta",
        "role": "Product Designer",
        "hours_logged_weekly": 42,
        "pto_days_taken_last_quarter": 4,
        "overdue_tasks": 1,
        "after_hours_messages": 3,
    },
    {
        "id": 3,
        "name": "Priya Nair",
        "role": "DevOps Engineer",
        "hours_logged_weekly": 61,
        "pto_days_taken_last_quarter": 0,
        "overdue_tasks": 9,
        "after_hours_messages": 31,
    },
    {
        "id": 4,
        "name": "Karthik Iyer",
        "role": "QA Engineer",
        "hours_logged_weekly": 45,
        "pto_days_taken_last_quarter": 3,
        "overdue_tasks": 2,
        "after_hours_messages": 5,
    },
]


def compute_risk_score(emp):
    score = 0
    score += max(0, (emp["hours_logged_weekly"] - 40)) * 1.5
    score += max(0, (3 - emp["pto_days_taken_last_quarter"])) * 5
    score += emp["overdue_tasks"] * 3
    score += emp["after_hours_messages"] * 1.2
    return round(min(score, 100), 1)


def risk_level(score):
    if score >= 70:
        return "urgent"
    elif score >= 40:
        return "watch"
    return "stable"


def generate_action(emp, score):
    if score >= 70:
        return f"Schedule urgent 1:1 with {emp['name']}'s manager this week; flag for HR review."
    elif score >= 40:
        return f"Check in with {emp['name']} informally; monitor workload over next 2 weeks."
    return "No action needed."


@app.get("/employees")
def get_employees():
    result = []
    for emp in employees:
        score = compute_risk_score(emp)
        result.append({
            **emp,
            "risk_score": score,
            "risk_level": risk_level(score),
            "recommended_action": generate_action(emp, score),
        })
    return {"employees": result, "generated_at": datetime.utcnow().isoformat()}


@app.get("/alerts")
def get_alerts():
    alerts = []
    for emp in employees:
        score = compute_risk_score(emp)
        if score >= 70:
            alerts.append({
                "id": emp["id"],
                "name": emp["name"],
                "role": emp["role"],
                "risk_score": score,
                "action": generate_action(emp, score),
                "triggered_at": datetime.utcnow().isoformat(),
            })
    return {"alerts": alerts, "count": len(alerts)}