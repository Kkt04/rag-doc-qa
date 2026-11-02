"""
Embeddings configuration and optional model loader.
"""
from functools import lru_cache
from typing import Any, Optional

from app.config import settings


@lru_cache(maxsize=1)
def get_embedding_model() -> Optional[Any]:
    """Optionally loads HuggingFaceEmbeddings if sentence-transformers is installed."""
    try:
        from langchain_huggingface import HuggingFaceEmbeddings
        return HuggingFaceEmbeddings(
            model_name=settings.EMBEDDING_MODEL,
            model_kwargs={"device": "cpu"},
            encode_kwargs={"normalize_embeddings": True},
        )
    except ImportError:
        return None
