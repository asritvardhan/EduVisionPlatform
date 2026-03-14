# ── EduVision — retrieval.py ────────────────────────────────────────────────
# 1. Search MongoDB knowledge_base using BM25 on (topic + content)
# 2. If no good match found → fallback to Wikipedia API

from rank_bm25 import BM25Okapi
import wikipediaapi
from db import get_db
from dotenv import load_dotenv
import os, re

load_dotenv()

# Wikipedia client — init once
_wiki = wikipediaapi.Wikipedia(
    language='en',
    user_agent='EduVision/1.0 (inclusive-learning-platform)'
)

def _tokenize(text: str) -> list:
    """Lowercase, remove punctuation, split into tokens."""
    text = text.lower()
    text = re.sub(r'[^a-z0-9\s]', ' ', text)
    return text.split()


def retrieve_content(query: str) -> tuple:
    """
    Retrieve educational content for a query.

    Returns:
        (content_text: str, source: str)
        source = 'mongodb' | 'wikipedia' | 'none'
    """

    # ── Step 1: Try MongoDB ──────────────────────────────────────────────────
    try:
        col  = get_db()[os.getenv('MONGO_COLLECTION', 'knowledge_base')]
        docs = list(col.find({}, {'_id': 0, 'topic': 1, 'content': 1}))

        if docs:
            # Build corpus: combine topic + content for each doc
            corpus = [
                _tokenize(f"{d.get('topic', '')} {d.get('content', '')}")
                for d in docs
            ]

            bm25   = BM25Okapi(corpus)
            scores = bm25.get_scores(_tokenize(query))
            best_i = int(scores.argmax())
            best_s = float(scores[best_i])

            print(f"[Retrieval] MongoDB best score: {best_s:.3f} (doc: {docs[best_i].get('topic')})")

            if best_s > 0.3:   # relevance threshold
                content = docs[best_i].get('content', '').strip()
                topic   = docs[best_i].get('topic', query)
                print(f"[Retrieval] ✅ Found in MongoDB: '{topic}'")
                return content, 'mongodb'

    except Exception as e:
        print(f"[Retrieval] MongoDB error: {e}")

    # ── Step 2: Wikipedia fallback ───────────────────────────────────────────
    print(f"[Retrieval] Falling back to Wikipedia for: '{query}'")
    try:
        page = _wiki.page(query)
        if page.exists():
            # Use summary (concise) — up to 3000 chars
            text = (page.summary or page.text or '')[:3000].strip()
            if text:
                print(f"[Retrieval] ✅ Found on Wikipedia: '{page.title}'")
                return text, 'wikipedia'
    except Exception as e:
        print(f"[Retrieval] Wikipedia error: {e}")

    # ── Nothing found ────────────────────────────────────────────────────────
    print(f"[Retrieval] ❌ No content found for: '{query}'")
    return (
        f"No content was found for the topic '{query}'. "
        "Please try rephrasing your question or ask about a different topic.",
        'none'
    )