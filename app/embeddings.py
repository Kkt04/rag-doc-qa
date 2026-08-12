"""
Embedding generation.

Groq does NOT provide an embeddings endpoint (it's a fast LLM-inference API only),
so we use a local, free HuggingFace sentence-transformers model. It runs on CPU,
costs nothing, and needs no API key.
"""
from functools import lru_cache
from langchain_huggingface import HuggingFaceEmbeddings

from app.config import settings


@lru_cache(maxsize=1)
def get_embedding_model() -> HuggingFaceEmbeddings:
    return HuggingFaceEmbeddings(
        model_name=settings.EMBEDDING_MODEL,
        model_kwargs={"device": "cpu"},
        encode_kwargs={"normalize_embeddings": True},
    )