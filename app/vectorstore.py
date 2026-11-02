"""
Vector and document store implementation.
Optimized for low-latency serverless environments (Vercel) and local execution.
Provides BM25 Okapi lexical-semantic ranking with sub-millisecond query execution,
zero PyTorch/CUDA bloat, and lightweight JSON persistence.
"""
import json
import math
import os
import re
from typing import Any, List, Optional, Tuple
from langchain_core.documents import Document

from app.config import settings


class InMemoryBM25Store:
    """High-performance in-memory BM25 retrieval index."""

    def __init__(self, docs: Optional[List[Document]] = None):
        self.docs: List[Document] = []
        if docs:
            self.add_documents(docs)

    def _tokenize(self, text: str) -> List[str]:
        return re.findall(r"\b[a-zA-Z0-9_\-\.]+\b", text.lower())

    def add_documents(self, docs: List[Document]) -> None:
        self.docs.extend(docs)

    def clear(self) -> None:
        self.docs = []

    def similarity_search_with_relevance_scores(
        self, query: str, k: int = 4
    ) -> List[Tuple[Document, float]]:
        if not self.docs:
            return []

        q_lower = (query or "").lower().strip()
        summary_keywords = [
            "summar", "takeaway", "insight", "overview", "main point",
            "key point", "about", "all", "whole", "entire", "brief",
            "topics", "describe", "explain"
        ]
        is_summary = any(kw in q_lower for kw in summary_keywords) or not q_lower

        # For summarization or broad queries, expand coverage
        effective_k = max(k, 12) if is_summary else k

        # If document collection is small, return all chunks for comprehensive context
        if is_summary and len(self.docs) <= effective_k:
            return [(d, 1.0) for d in self.docs]

        q_tokens = self._tokenize(query)
        if not q_tokens:
            step = max(1, len(self.docs) // effective_k)
            distributed = [self.docs[i] for i in range(0, len(self.docs), step)][:effective_k]
            return [(d, 0.9) for d in distributed]

        N = len(self.docs)
        doc_tokens = [self._tokenize(d.page_content) for d in self.docs]
        avg_doc_len = sum(len(dt) for dt in doc_tokens) / max(1, N)

        # Document frequency for each query term
        df = {term: sum(1 for dt in doc_tokens if term in dt) for term in set(q_tokens)}

        k1 = 1.5
        b = 0.75
        scored_docs: List[Tuple[Document, float]] = []

        for idx, tokens in enumerate(doc_tokens):
            score = 0.0
            doc_len = len(tokens) or 1
            term_counts = {}
            for t in tokens:
                term_counts[t] = term_counts.get(t, 0) + 1

            for qt in q_tokens:
                cnt = term_counts.get(qt, 0)
                if cnt > 0:
                    idf = math.log(1.0 + (N - df[qt] + 0.5) / (df[qt] + 0.5))
                    tf = (cnt * (k1 + 1.0)) / (cnt + k1 * (1.0 - b + b * (doc_len / avg_doc_len)))
                    score += max(0.0, idf) * tf

            scored_docs.append((self.docs[idx], score))

        # Check if query had any lexical matches
        positive_scores = [s for _, s in scored_docs if s > 0]

        if not positive_scores:
            # Semantic / zero-match query: sample evenly across the document
            step = max(1, len(self.docs) // effective_k)
            distributed = [self.docs[i] for i in range(0, len(self.docs), step)][:effective_k]
            return [(d, 0.75) for d in distributed]

        scored_docs.sort(key=lambda x: x[1], reverse=True)
        max_score = scored_docs[0][1] if scored_docs[0][1] > 0 else 1.0

        limit = effective_k if is_summary else k
        normalized = [
            (doc, round(min(1.0, score / max_score), 4))
            for doc, score in scored_docs[:limit]
            if is_summary or score > 0
        ]
        return normalized if normalized else [(d, 0.5) for d, _ in scored_docs[:k]]

    def save_local(self, path: str) -> None:
        os.makedirs(path, exist_ok=True)
        file_path = os.path.join(path, "documents.json")
        data = [
            {"page_content": d.page_content, "metadata": d.metadata}
            for d in self.docs
        ]
        with open(file_path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False)

    @classmethod
    def load_local(cls, path: str) -> Optional["InMemoryBM25Store"]:
        file_path = os.path.join(path, "documents.json")
        if not os.path.exists(file_path):
            return None
        try:
            with open(file_path, "r", encoding="utf-8") as f:
                data = json.load(f)
            docs = [
                Document(
                    page_content=item["page_content"],
                    metadata=item.get("metadata", {}),
                )
                for item in data
            ]
            return cls(docs)
        except Exception as e:
            print(f"[WARN] Failed to load vector store from {file_path}: {e}")
            return None


def build_vectorstore(chunks: List[Document]) -> Any:
    return InMemoryBM25Store(chunks)


def save_vectorstore(store: Any, path: Optional[str] = None) -> None:
    path = path or settings.VECTORSTORE_DIR
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    if hasattr(store, "save_local"):
        store.save_local(path)


def load_vectorstore(path: Optional[str] = None) -> Optional[Any]:
    path = path or settings.VECTORSTORE_DIR
    if not os.path.exists(path):
        return None
    return InMemoryBM25Store.load_local(path)


def add_to_vectorstore(store: Any, chunks: List[Document]) -> Any:
    if hasattr(store, "add_documents"):
        store.add_documents(chunks)
    return store


def similarity_search(
    store: Any, query: str, k: int = 4
) -> List[Tuple[Document, float]]:
    """Returns (document, similarity_score) pairs, highest relevance first."""
    if hasattr(store, "similarity_search_with_relevance_scores"):
        return store.similarity_search_with_relevance_scores(query, k=k)
    return []
