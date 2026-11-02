"""
FastAPI app exposing:
  POST /ingest  -> upload documents, chunk + embed + store in FAISS
  POST /ask     -> ask a question; agent decides retrieve vs direct answer
  GET  /health  -> basic health check
"""
import os
import shutil
from typing import List
from fastapi import FastAPI, UploadFile, File, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

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


@app.post("/ingest", response_model=IngestResponse)
async def ingest(files: List[UploadFile] = File(...)):
    os.makedirs(settings.DATA_DIR, exist_ok=True)
    saved_paths = []

    for f in files:
        dest = os.path.join(settings.DATA_DIR, f.filename)
        with open(dest, "wb") as out:
            shutil.copyfileobj(f.file, out)
        saved_paths.append(dest)

    chunks = ingest_files(saved_paths)
    if not chunks:
        raise HTTPException(status_code=400, detail="No valid content extracted from files.")

    store = _get_store()
    if store is None:
        store = build_vectorstore(chunks)
    else:
        store = add_to_vectorstore(store, chunks)

    save_vectorstore(store)
    _store_cache["store"] = store

    return IngestResponse(
        files_ingested=[f.filename for f in files],
        total_chunks=len(chunks),
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