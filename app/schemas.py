from typing import List, Optional
from pydantic import BaseModel


class AskRequest(BaseModel):
    question: str
    k: Optional[int] = None  # override retrieval-k per request


class SourceChunk(BaseModel):
    content: str
    source: str
    chunk_id: int
    score: Optional[float] = None


class AskResponse(BaseModel):
    answer: str
    used_retrieval: bool          # did the agent decide to call the retrieval tool?
    sources: List[SourceChunk] = []
    reasoning: Optional[str] = None  # short note on why it retrieved or not


class IngestResponse(BaseModel):
    files_ingested: List[str]
    total_chunks: int