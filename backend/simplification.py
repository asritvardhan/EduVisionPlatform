# ── EduVision — simplif.py ──────────────────────────────────────────────────
# Simplifies raw retrieved content using Gemini API.
# Always medium difficulty for now — Q-Learning will adjust later.

import google.generativeai as genai
from dotenv import load_dotenv
import os

load_dotenv()

genai.configure(api_key=os.getenv('GEMINI_API_KEY'))
_model = genai.GenerativeModel(os.getenv('GEMINI_MODEL', 'gemini-2.0-flash'))


def simplify_content(raw: str, topic: str, difficulty: str = 'medium') -> str:
    """
    Simplify raw content into a clear, spoken explanation using Gemini.

    The response is designed to be READ ALOUD — no markdown, no bullets,
    no special characters. Natural spoken English only.

    Args:
        raw:        Retrieved raw content text
        topic:      The user's original query / topic
        difficulty: 'easy' | 'medium' | 'hard'  (medium for now)

    Returns:
        Simplified plain-text explanation
    """

    difficulty_guide = {
        'easy':   'Use very simple words. Short sentences. Like explaining to a 10-year-old.',
        'medium': 'Use clear, everyday language. Assume the student has basic familiarity with the subject.',
        'hard':   'Use accurate technical language. Include details and nuances.',
    }

    guide = difficulty_guide.get(difficulty, difficulty_guide['medium'])

    prompt = f"""You are EduVision, an AI tutor for visually impaired students.
Your explanation will be READ ALOUD using text-to-speech, so follow these rules strictly:
- Write in natural spoken English only
- No bullet points, no numbered lists, no markdown, no asterisks, no headers
- No special characters or symbols
- Use short paragraphs separated by a blank line

Topic the student asked about: {topic}
Difficulty level: {difficulty}
Style instruction: {guide}

Using ONLY the content provided below, write your explanation in this exact structure:

First, give a clear explanation of the topic in 3 to 5 sentences.

Then, give one real-world example that makes the topic easy to understand. Start this with the words: "Here is a real-world example."

Finally, give a one-sentence summary of the key idea. Start it with the words: "In summary."

Raw content:
{raw[:2800]}

Remember: natural spoken language only. No formatting characters whatsoever.
"""

    print(f"[Simplif] Calling Gemini for topic: '{topic}' at difficulty: {difficulty}")
    response = _model.generate_content(prompt)
    result   = response.text.strip()
    print(f"[Simplif] ✅ Simplified ({len(result)} chars)")
    return result