"""
FAISS vector store: build from chunks, persist to disk, reload, and search.
"""
import os
from typing import List, Optional, Tuple
from langchain_core.documents import Document
from langchain_community.vectorstores import FAISS

from app.config import settings
from app.embeddings import get_embedding_model


def build_vectorstore(chunks: List[Document]) -> FAISS:
    embeddings = get_embedding_model()
    store = FAISS.from_documents(chunks, embeddings)
    return store


def save_vectorstore(store: FAISS, path: Optional[str] = None) -> None:
    path = path or settings.VECTORSTORE_DIR
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    store.save_local(path)


def load_vectorstore(path: Optional[str] = None) -> Optional[FAISS]:
    path = path or settings.VECTORSTORE_DIR
    if not os.path.exists(path):
        return None
    embeddings = get_embedding_model()
    return FAISS.load_local(
        path, embeddings, allow_dangerous_deserialization=True
    )


def add_to_vectorstore(store: FAISS, chunks: List[Document]) -> FAISS:
    store.add_documents(chunks)
    return store


def similarity_search(
    store: FAISS, query: str, k: int = 4
) -> List[Tuple[Document, float]]:
    """Returns (document, similarity_score) pairs, best first."""
    return store.similarity_search_with_relevance_scores(query, k=k)