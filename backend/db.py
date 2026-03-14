from pymongo import MongoClient
from dotenv import load_dotenv
import os

load_dotenv()

_client = None

def get_db():
    """Return MongoDB database instance (singleton)."""
    global _client
    if _client is None:
        uri = os.getenv('MONGO_URI', 'mongodb://localhost:27017')
        _client = MongoClient(uri)
        print(f"[DB] Connected to MongoDB: {uri}")
    return _client[os.getenv('MONGO_DB', 'eduvision')]