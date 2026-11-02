"""
Context-aware retrieval: fetch top-k chunks and format them into a prompt-ready
context block, plus structured source metadata for citations.
"""
from typing import Any, List, Tuple

from app.config import settings
from app.vectorstore import similarity_search
from app.schemas import SourceChunk


def retrieve(store: Any, query: str, k: int = None) -> Tuple[str, List[SourceChunk]]:
    k = k or settings.RETRIEVAL_K
    results = similarity_search(store, query, k=k)

    sources: List[SourceChunk] = []
    context_parts = []
    for doc, score in results:
        sources.append(
            SourceChunk(
                content=doc.page_content,
                source=doc.metadata.get("source", "unknown"),
                chunk_id=doc.metadata.get("chunk_id", -1),
                score=round(float(score), 4),
            )
        )
        context_parts.append(
            f"[Source: {doc.metadata.get('source')} | Chunk {doc.metadata.get('chunk_id')}]\n"
            f"{doc.page_content}"
        )

    context = "\n\n---\n\n".join(context_parts)
    return context, sources