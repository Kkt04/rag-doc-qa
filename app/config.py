"""
Central configuration. Reads everything from .env so nothing is hardcoded.
Configured for local development as well as serverless environments (Vercel).
"""
import os
from dotenv import load_dotenv

load_dotenv()

IS_VERCEL = bool(os.getenv("VERCEL") or os.getenv("AWS_LAMBDA_FUNCTION_NAME"))

# HuggingFace & Torch cache redirection for serverless (read-only filesystem safe)
if IS_VERCEL:
    os.environ.setdefault("HF_HOME", "/tmp/huggingface")
    os.environ.setdefault("TORCH_HOME", "/tmp/torch")


class Settings:
    GROQ_API_KEY: str = os.getenv("GROQ_API_KEY", "")
    GROQ_MODEL: str = os.getenv("GROQ_MODEL", "llama-3.1-8b-instant")

    EMBEDDING_MODEL: str = os.getenv(
        "EMBEDDING_MODEL", "sentence-transformers/all-MiniLM-L6-v2"
    )

    CHUNK_SIZE: int = int(os.getenv("CHUNK_SIZE", 800))
    CHUNK_OVERLAP: int = int(os.getenv("CHUNK_OVERLAP", 120))

    RETRIEVAL_K: int = int(os.getenv("RETRIEVAL_K", 4))

    # In serverless environments (e.g. Vercel), only /tmp is writable
    DATA_DIR: str = os.getenv("DATA_DIR", "/tmp/data" if IS_VERCEL else "data")
    VECTORSTORE_DIR: str = os.getenv(
        "VECTORSTORE_DIR",
        "/tmp/vectorstore/faiss_index" if IS_VERCEL else "vectorstore/faiss_index",
    )


settings = Settings()

if not settings.GROQ_API_KEY:
    print(
        "[WARN] GROQ_API_KEY not set. Add it to your .env file or Vercel Environment Variables. "
        "Get a free key at https://console.groq.com/keys"
    )
