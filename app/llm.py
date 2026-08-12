"""
Groq LLM wrapper. Groq's free tier serves open models (Llama 3.3, etc.)
at very high inference speed.
"""
from functools import lru_cache
from langchain_groq import ChatGroq

from app.config import settings


@lru_cache(maxsize=1)
def get_llm(temperature: float = 0.1) -> ChatGroq:
    return ChatGroq(
        api_key=settings.GROQ_API_KEY,
        model=settings.GROQ_MODEL,
        temperature=temperature,
    )