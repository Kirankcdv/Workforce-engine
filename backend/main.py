from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pypdf import PdfReader
import io
import os
from dotenv import load_dotenv
import google.generativeai as genai

load_dotenv()
genai.configure(api_key=os.getenv("GEMINI_API_KEY"))

app = FastAPI(title="Active Workforce Pipeline Engine")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

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
import json

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

    model = genai.GenerativeModel("gemini-3.6-flash")
    prompt = f"""Extract technical skills claimed in this resume. Return ONLY a JSON array of objects, no markdown, no explanation. Each object must have:
- "skill": the skill name (e.g. "Python", "Docker", "React")
- "category": one of "language", "framework", "tool", "cloud", "database", "other"

Resume text:
{text[:4000]}
"""

    response = model.generate_content(prompt)
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