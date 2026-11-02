"""
Groq LLM client wrapper with multi-model fallback support.
"""
from typing import Optional
from langchain_groq import ChatGroq

from app.config import settings


def get_llm(model_name: Optional[str] = None, temperature: float = 0.1) -> ChatGroq:
    model = model_name or settings.GROQ_MODEL
    return ChatGroq(
        api_key=settings.GROQ_API_KEY,
        model=model,
        temperature=temperature,
    )
