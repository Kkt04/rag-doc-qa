"""
FastAPI app exposing:
  POST /ingest    -> upload documents, chunk + embed + store in in-memory BM25 store
  POST /ask       -> ask a question; agent decides retrieve vs direct answer
  POST /reset     -> wipe all stored knowledge base documents
  DELETE /documents -> wipe all stored knowledge base documents
  GET  /health    -> basic health check
"""
import os
import shutil
from typing import List, Optional
from fastapi import FastAPI, UploadFile, File, HTTPException, Request, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from langchain_core.documents import Document

from app.config import settings
from app.ingestion import ingest_files
from app.vectorstore import (
    build_vectorstore,
    save_vectorstore,
    load_vectorstore,
    add_to_vectorstore,
)
from app.agent import answer_question
from app.schemas import AskRequest, AskResponse, IngestResponse

app = FastAPI(title="RAG Document Q&A Assistant", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def fix_vercel_rewritten_path(request: Request, call_next):
    rewritten_path = request.query_params.get("__path")
    if rewritten_path:
        if not rewritten_path.startswith("/"):
            rewritten_path = "/" + rewritten_path
        request.scope["path"] = rewritten_path
    return await call_next(request)


BASE_DIR = os.path.dirname(os.path.abspath(__file__))
STATIC_DIR = os.path.join(BASE_DIR, "static")

app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

# in-memory handle to the loaded store (also persisted to disk)
_store_cache = {"store": None}


def _get_store():
    if _store_cache["store"] is None:
        _store_cache["store"] = load_vectorstore()
    return _store_cache["store"]


@app.get("/")
def root():
    index_file = os.path.join(STATIC_DIR, "index.html")
    if os.path.exists(index_file):
        return FileResponse(index_file)
    return {"status": "ok", "message": "RAG Document Q&A API is operational"}


@app.get("/health")
@app.get("/api/health")
def health():
    return {
        "status": "ok",
        "model": settings.GROQ_MODEL,
        "is_vercel": settings.DATA_DIR.startswith("/tmp"),
    }


@app.get("/api/groq-models")
def groq_models():
    if not settings.GROQ_API_KEY:
        return {"error": "GROQ_API_KEY not set"}
    try:
        import httpx
        r = httpx.get(
            "https://api.groq.com/openai/v1/models",
            headers={"Authorization": f"Bearer {settings.GROQ_API_KEY}"},
            timeout=10,
        )
        if r.status_code == 200:
            models = [
                m["id"]
                for m in r.json().get("data", [])
                if m.get("active", True)
            ]
            return {"active_models": models}
        return {"status": r.status_code, "error": r.text}
    except Exception as e:
        return {"error": str(e)}


@app.post("/reset")
@app.delete("/documents")
def reset_knowledge_base():
    """Clear all documents and reset vector store cache."""
    _store_cache["store"] = None
    if os.path.exists(settings.DATA_DIR):
        for f in os.listdir(settings.DATA_DIR):
            p = os.path.join(settings.DATA_DIR, f)
            try:
                if os.path.isfile(p):
                    os.remove(p)
                elif os.path.isdir(p):
                    shutil.rmtree(p)
            except Exception:
                pass

    if os.path.exists(settings.VECTORSTORE_DIR):
        try:
            shutil.rmtree(settings.VECTORSTORE_DIR)
        except Exception:
            pass

    return {"status": "ok", "message": "Knowledge base successfully cleared."}


@app.post("/ingest", response_model=IngestResponse)
async def ingest(
    files: List[UploadFile] = File(...),
    replace: bool = Query(True, description="Replace previous knowledge base files"),
):
    os.makedirs(settings.DATA_DIR, exist_ok=True)

    if replace:
        _store_cache["store"] = None
        for old_file in os.listdir(settings.DATA_DIR):
            p = os.path.join(settings.DATA_DIR, old_file)
            try:
                if os.path.isfile(p):
                    os.remove(p)
                elif os.path.isdir(p):
                    shutil.rmtree(p)
            except Exception:
                pass
        if os.path.exists(settings.VECTORSTORE_DIR):
            try:
                shutil.rmtree(settings.VECTORSTORE_DIR)
            except Exception:
                pass

    saved_paths = []
    for f in files:
        dest = os.path.join(settings.DATA_DIR, f.filename)
        with open(dest, "wb") as out:
            shutil.copyfileobj(f.file, out)
        saved_paths.append(dest)

    chunks = ingest_files(saved_paths)
    if not chunks:
        raise HTTPException(status_code=400, detail="No valid content extracted from files.")

    store = _get_store() if not replace else None
    if store is None:
        store = build_vectorstore(chunks)
    else:
        store = add_to_vectorstore(store, chunks)

    save_vectorstore(store)
    _store_cache["store"] = store

    docs_data = [
        {"page_content": c.page_content, "metadata": c.metadata}
        for c in store.docs
    ]

    return IngestResponse(
        files_ingested=[f.filename for f in files],
        total_chunks=len(store.docs),
        documents=docs_data,
    )


@app.post("/ask", response_model=AskResponse)
def ask(req: AskRequest):
    if not settings.GROQ_API_KEY:
        raise HTTPException(
            status_code=400,
            detail=(
                "GROQ_API_KEY is not set. Add GROQ_API_KEY to your Vercel Project Settings "
                "-> Environment Variables (or in local .env). Get a free key at https://console.groq.com/keys"
            ),
        )

    # If client passed documents directly (ensures 100% serverless multi-container consistency)
    if req.documents and len(req.documents) > 0:
        docs = [
            Document(page_content=d["page_content"], metadata=d.get("metadata", {}))
            for d in req.documents
        ]
        store = build_vectorstore(docs)
    else:
        store = _get_store()

    try:
        return answer_question(store, req.question, k=req.k)
    except Exception as e:
        error_msg = str(e)
        if "api_key" in error_msg.lower() or "authentication" in error_msg.lower():
            raise HTTPException(
                status_code=400,
                detail="Groq authentication failed. Please verify your GROQ_API_KEY.",
            )
        raise HTTPException(status_code=500, detail=f"Inference error: {error_msg}")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        reload_dirs=["app"],
    )
