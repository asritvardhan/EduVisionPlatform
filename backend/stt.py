# ── EduVision — stt.py ──────────────────────────────────
# Speech-to-Text using Groq Whisper API.
# No local model — sends audio file to Groq and gets transcript back.

from groq import Groq
from dotenv import load_dotenv
import os

load_dotenv()

_client = None

def _get_client():
    global _client
    if _client is None:
        api_key = os.getenv("GROQ_API_KEY")
        if not api_key:
            raise ValueError("[STT] GROQ_API_KEY is not set in .env")
        _client = Groq(api_key=api_key)
        print("[STT] Groq client initialised.")
    return _client


def transcribe_audio(file_path: str) -> str:
    """
    Transcribe audio file using Groq Whisper API.
    Accepts mp3, mp4, mpeg, mpga, m4a, wav, webm (max 25MB).
    """
    client = _get_client()

    with open(file_path, "rb") as f:
        response = client.audio.transcriptions.create(
            model="whisper-large-v3-turbo",
            file=f,
            language="en",
            response_format="verbose_json",   # always returns an object
        )

    # verbose_json returns an object with .text attribute
    transcript = getattr(response, "text", "") or ""
    transcript = transcript.strip()
    print(f"[STT] Transcript: '{transcript}'")
    return transcript