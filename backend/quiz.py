# ── EduVision — quiz.py ─────────────────────────────────────────────────────
# Generates 5 MCQ questions from simplified content using Gemini.

import google.generativeai as genai
from dotenv import load_dotenv
import os, json, re

load_dotenv()

genai.configure(api_key=os.getenv('GEMINI_API_KEY'))
_model = genai.GenerativeModel(os.getenv('GEMINI_MODEL', 'gemini-2.0-flash'))


def generate_quiz(topic: str, content: str, difficulty: str = 'medium') -> list:
    """
    Generate 5 MCQ questions from simplified content.

    Returns list of 5 dicts:
        {
          "question": "What is ...?",
          "options":  { "A": "...", "B": "...", "C": "...", "D": "..." },
          "answer":   "A"   # correct option key
        }
    """

    difficulty_guide = {
        'easy':   'Simple recall questions. One clearly correct answer.',
        'medium': 'Mix of recall and basic understanding questions.',
        'hard':   'Application and analysis questions requiring deeper understanding.',
    }
    guide = difficulty_guide.get(difficulty, difficulty_guide['medium'])

    prompt = f"""You are EduVision quiz generator for visually impaired students.
Generate exactly 5 multiple-choice questions based on the content below.

Topic: {topic}
Difficulty: {difficulty} — {guide}

Rules:
- Each question must have exactly 4 options: A, B, C, D
- Only one option is correct
- Questions must be based strictly on the content provided
- Write questions in clear, simple language
- Do NOT use any markdown formatting

Content:
{content[:2800]}

Return ONLY a valid JSON array — no markdown fences, no extra text, nothing else.
Format exactly like this:
[
  {{
    "question": "Question text here?",
    "options": {{"A": "Option A text", "B": "Option B text", "C": "Option C text", "D": "Option D text"}},
    "answer": "A"
  }}
]
"""

    print(f"[Quiz] Generating 5 MCQs for topic: '{topic}' difficulty: {difficulty}")
    response = _model.generate_content(prompt)
    raw      = response.text.strip()

    # Strip markdown fences if Gemini adds them anyway
    raw = re.sub(r'```json|```', '', raw).strip()

    try:
        questions = json.loads(raw)
        # Validate structure
        validated = []
        for q in questions[:5]:
            if all(k in q for k in ('question', 'options', 'answer')):
                if all(k in q['options'] for k in ('A','B','C','D')):
                    validated.append(q)
        if not validated:
            raise ValueError("No valid questions parsed")
        print(f"[Quiz] ✅ Generated {len(validated)} questions")
        return validated
    except Exception as e:
        # Try to recover with regex
        match = re.search(r'\[.*\]', raw, re.DOTALL)
        if match:
            questions = json.loads(match.group())[:5]
            print(f"[Quiz] ✅ Recovered {len(questions)} questions via regex")
            return questions
        raise ValueError(f"[Quiz] Gemini returned unparseable JSON: {str(e)}\n{raw[:300]}")