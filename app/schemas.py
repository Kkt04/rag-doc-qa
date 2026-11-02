from typing import Any, Dict, List, Optional
from pydantic import BaseModel


class AskRequest(BaseModel):
    question: str
    k: Optional[int] = None  # override retrieval-k per request
    documents: Optional[List[Dict[str, Any]]] = None  # client-session documents for serverless consistency


class SourceChunk(BaseModel):
    content: str
    source: str
    chunk_id: int
    score: Optional[float] = None


class AskResponse(BaseModel):
    answer: str
    used_retrieval: bool  # did the agent decide to call the retrieval tool?
    sources: List[SourceChunk] = []
    reasoning: Optional[str] = None  # short note on why it retrieved or not


class IngestResponse(BaseModel):
    files_ingested: List[str]
    total_chunks: int
    documents: Optional[List[Dict[str, Any]]] = None
