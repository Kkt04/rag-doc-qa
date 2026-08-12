"""
Document ingestion: loads PDFs/TXT/MD files and splits them into chunks.
"""
import os
from typing import List
from langchain_core.documents import Document
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_community.document_loaders import (
    PyPDFLoader,
    TextLoader,
)

from app.config import settings

SUPPORTED_EXTENSIONS = {".pdf", ".txt", ".md"}


def _load_single_file(path: str) -> List[Document]:
    ext = os.path.splitext(path)[1].lower()
    if ext == ".pdf":
        loader = PyPDFLoader(path)
    elif ext in (".txt", ".md"):
        loader = TextLoader(path, encoding="utf-8")
    else:
        raise ValueError(f"Unsupported file type: {ext}")
    return loader.load()


def load_documents(file_paths: List[str]) -> List[Document]:
    """Load raw documents (one Document per page/file) from disk."""
    docs: List[Document] = []
    for path in file_paths:
        ext = os.path.splitext(path)[1].lower()
        if ext not in SUPPORTED_EXTENSIONS:
            print(f"[SKIP] Unsupported file type: {path}")
            continue
        loaded = _load_single_file(path)
        for d in loaded:
            d.metadata["source"] = os.path.basename(path)
        docs.extend(loaded)
    return docs


def chunk_documents(docs: List[Document]) -> List[Document]:
    """Split documents into overlapping chunks for embedding."""
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=settings.CHUNK_SIZE,
        chunk_overlap=settings.CHUNK_OVERLAP,
        separators=["\n\n", "\n", ". ", " ", ""],
    )
    chunks = splitter.split_documents(docs)

    # tag each chunk with a stable id (per source) — useful for eval + citations
    counters = {}
    for c in chunks:
        src = c.metadata.get("source", "unknown")
        counters[src] = counters.get(src, 0) + 1
        c.metadata["chunk_id"] = counters[src]
    return chunks


def ingest_files(file_paths: List[str]) -> List[Document]:
    """Full pipeline: load -> chunk."""
    raw_docs = load_documents(file_paths)
    if not raw_docs:
        return []
    return chunk_documents(raw_docs)