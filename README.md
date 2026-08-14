# RAG Document Q&A Assistant
---

A FastAPI-based Retrieval-Augmented Generation (RAG) system that answers questions about your own documents. Upload PDFs, TXT, or Markdown files, and the assistant retrieves the most relevant chunks and produces grounded answers with source citations.

## Features

- **Document ingestion** — upload PDF / TXT / MD files via the web UI or the API; content is chunked with overlap and embedded locally.
- **Semantic retrieval** — embeddings generated on-device with `sentence-transformers/all-MiniLM-L6-v2` and indexed in a persisted FAISS store.
- **Smart agent** — a Groq LLM (default `llama-3.3-70b-versatile`) decides via a tool call whether a question actually needs document context, so greetings and general questions skip retrieval entirely (saving cost/latency).
- **Grounded answers** — when retrieval is used, the answer is generated only from the retrieved context. Sources are shown grouped by file (each document listed once), with the supporting text expandable.
- **Clean web UI** — drag-and-drop upload plus a chat interface, served directly by FastAPI (no frontend build step).
- **Evaluation harness** — measures answer relevance, retrieval precision, and retrieval efficiency.

## How it works

```
Upload (PDF/TXT/MD)
   -> chunk + overlap
   -> embed (sentence-transformers, local CPU)
   -> store in FAISS (persisted to disk)

Question
   -> Groq LLM decides: needs document context?
       no  -> direct answer (no retrieval cost)
       yes -> retrieve top-k chunks from FAISS
              -> answer grounded in context + citations
```

## Tech stack

- **FastAPI** + **Uvicorn** — API server
- **LangChain** / **langchain-community** / **langchain-groq** / **langchain-huggingface** — orchestration, loaders, splitters, tool calling
- **Groq** — fast free-tier LLM inference
- **sentence-transformers** + **FAISS** — local embeddings and vector search (CPU-only, no API key needed)
- **pypdf** — PDF text extraction

## Project structure

```
.
├── app/
│   ├── main.py          # FastAPI app + routes
│   ├── config.py        # Settings loaded from .env
│   ├── ingestion.py     # Load + chunk documents
│   ├── embeddings.py    # Local embedding model
│   ├── vectorstore.py   # FAISS build / save / load / search
│   ├── retrieval.py     # Top-k retrieval + source metadata
│   ├── agent.py         # Tool-calling agent (retrieve or answer directly)
│   ├── llm.py           # Groq LLM wrapper
│   ├── schemas.py       # Pydantic request/response models
│   └── static/          # Web UI (index.html, styles.css, app.js)
├── data/                # Uploaded documents (gitignored)
├── vectorstore/         # Persisted FAISS index (gitignored)
├── evaluation/          # RAG evaluation harness
├── scripts/
│   └── ingest_cli.py    # CLI to ingest data/ without the API
├── requirements.txt
├── .env.example       # template — placeholders only, never real keys
└── .gitignore         # ignores .env, .env.example, venv, data, vectorstore
```

## Getting started

### 1. Prerequisites

- Python 3.12
- A free Groq API key from <https://console.groq.com/keys>

### 2. Set up the environment

```bash
python3 -m venv venv
source venv/bin/activate            # macOS / Linux
# .\venv\Scripts\activate          # Windows
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
```

### 3. Configure environment variables

```bash
cp .env.example .env
```

Then open `.env` and set your Groq API key:

```
GROQ_API_KEY=your_key_here
```

> Note: the embedding model runs locally, so no embedding API key or cost is required.

### Security — protect your API key

- `.env` and `.env.example` are listed in `.gitignore`, so they are never committed or pushed.
- **Never put a real API key in `.env.example`** — it exists only to document the variables. Leave it as a placeholder (`GROQ_API_KEY=your_groq_api_key_here`).
- If a key is ever exposed (e.g. GitHub flags it), revoke it immediately at <https://console.groq.com/keys> and update your local `.env`.

### 4. Run the server

```bash
python -m uvicorn app.main:app --reload --reload-dir app
```

Open <http://127.0.0.1:8000/> to use the web UI.

- The `--reload-dir app` flag limits the reloader to watching only your code. Without it, uvicorn watches the whole project (including `venv/`), which triggers endless restarts.
- Interactive API docs are available at <http://127.0.0.1:8000/docs>.

## Usage

### Web UI

1. Drag and drop (or click to browse) PDF/TXT/MD files in the left panel and click **Ingest Documents**.
2. Ask questions in the chat panel.
3. Answers that used your documents list each source file once — click a source to expand and read the supporting text.

### API

| Method | Endpoint  | Description                                              |
| ------ | --------- | -------------------------------------------------------- |
| GET    | `/`       | Web UI                                                   |
| GET    | `/health` | Health check + active model                              |
| POST   | `/ingest` | Upload one or more documents (`files` multipart field)   |
| POST   | `/ask`    | Ask a question (`{"question": "...", "k": 4}`)           |
| GET    | `/docs`   | Swagger UI                                               |

**Ingest documents:**

```bash
curl -X POST http://127.0.0.1:8000/ingest \
  -F "files=@report.pdf" -F "files=@notes.txt"
```

**Ask a question:**

```bash
curl -X POST http://127.0.0.1:8000/ask \
  -H "Content-Type: application/json" \
  -d '{"question": "What are the main points of the report?"}'
```

Response shape:

```json
{
  "answer": "The report focuses on ... (source: report.pdf).",
  "used_retrieval": true,
  "sources": [
    {
      "content": "...",
      "source": "report.pdf",
      "chunk_id": 3,
      "score": 0.86
    }
  ],
  "reasoning": "Model requested retrieval based on the question."
}
```

### CLI ingestion

To ingest every supported file in `data/` without starting the API:

```bash
python scripts/ingest_cli.py
```

## Evaluation

The `evaluation/` folder contains a lightweight RAG evaluation harness. Per question it scores:

1. **Answer relevance** — LLM-judged, 1–5
2. **Retrieval precision** — fraction of retrieved chunks judged relevant
3. **Retrieval efficiency** — did the agent correctly skip retrieval for non-document questions?

Edit `evaluation/test_questions.json` with questions (and expected answers) for your documents, ingest them first, then run:

```bash
python evaluation/evaluate.py
```

## Configuration

All settings come from `.env`:

| Variable             | Default                                    | Description                             |
| -------------------- | ------------------------------------------ | --------------------------------------- |
| `GROQ_API_KEY`       | *(empty)*                                  | Groq API key                            |
| `GROQ_MODEL`         | `llama-3.3-70b-versatile`                  | LLM used for answering + tool decisions |
| `EMBEDDING_MODEL`    | `sentence-transformers/all-MiniLM-L6-v2`   | Local embedding model (CPU)             |
| `CHUNK_SIZE`         | `800`                                      | Chunk size (characters)                 |
| `CHUNK_OVERLAP`      | `120`                                      | Overlap between chunks                  |
| `RETRIEVAL_K`        | `4`                                        | Default number of chunks retrieved      |
| `DATA_DIR`           | `data`                                     | Upload directory                        |
| `VECTORSTORE_DIR`    | `vectorstore/faiss_index`                  | Persisted FAISS index location          |

## Troubleshooting

- **Server keeps restarting / reload loop** — run uvicorn with `--reload-dir app` so `venv/` is not watched.
- **`TypeError: ... unexpected keyword argument 'proxies'`** — `groq 0.11.0` is incompatible with `httpx >= 0.28`; `requirements.txt` pins `httpx==0.27.2`. Do not upgrade httpx in this project.
- **`Address already in use`** — kill the process on port 8000 first: `lsof -ti :8000 | xargs kill`.
- **No documents ingested yet message** — ingest files before asking document-specific questions.
- **First `/ask` or `/ingest` is slow** — the embedding model and its tokenizer download on first use.
# rag-doc-qa
