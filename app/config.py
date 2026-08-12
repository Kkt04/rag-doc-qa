"""
Central configuration. Reads everything from .env so nothing is hardcoded.
"""
import os
from dotenv import load_dotenv

load_dotenv()


class Settings:
    GROQ_API_KEY: str = os.getenv("GROQ_API_KEY", "")
    GROQ_MODEL: str = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")

    EMBEDDING_MODEL: str = os.getenv(
        "EMBEDDING_MODEL", "sentence-transformers/all-MiniLM-L6-v2"
    )

    CHUNK_SIZE: int = int(os.getenv("CHUNK_SIZE", 800))
    CHUNK_OVERLAP: int = int(os.getenv("CHUNK_OVERLAP", 120))

    RETRIEVAL_K: int = int(os.getenv("RETRIEVAL_K", 4))

    DATA_DIR: str = os.getenv("DATA_DIR", "data")
    VECTORSTORE_DIR: str = os.getenv("VECTORSTORE_DIR", "vectorstore/faiss_index")


settings = Settings()

if not settings.GROQ_API_KEY:
    print(
        "[WARN] GROQ_API_KEY not set. Add it to your .env file. "
        "Get a free key at https://console.groq.com/keys"
    )