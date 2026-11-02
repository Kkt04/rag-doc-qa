# RAG Document Q&A Assistant

A production-ready Retrieval-Augmented Generation (RAG) system with a modern, sleek web interface and serverless Vercel deployment support. Upload PDFs, TXT, or Markdown documents to build a semantic vector index, and ask questions through a smart tool-calling assistant powered by Groq and LangChain.

---

## Key Highlights

- **Smart Agent Routing** — Uses Groq (`llama-3.3-70b-versatile`) with tool-calling to determine whether a query truly needs document retrieval. Greetings, general knowledge, and conversational queries bypass vector search entirely, saving token latency and computational overhead.
- **Modern Sleek Web UI** — Built with clean glassmorphism, responsive dual-theme support (Dark & Light modes), drag-and-drop document upload, staged queue management with file-type badges, and rich Markdown answer rendering with syntax-styled code blocks.
- **Grounded Answers & Expandable Citations** — When retrieval is triggered, answers are synthesized strictly from document excerpts. Source citations are grouped by file with expandable chunk previews and relevance stats.
- **Vercel Serverless Ready** — Pre-configured with `vercel.json` and `api/index.py` entrypoint. Automatically adapts storage and cache directories to `/tmp` in serverless environments.
- **Evaluation Harness** — Includes an automated scoring pipeline measuring answer relevance, retrieval precision, and routing efficiency.

---

## System Architecture

```
┌────────────────────────────────────────────────────────┐
│                      Web Client                        │
│   (Drag & Drop Upload · Markdown Chat · Theme Toggle)  │
└──────────────────────────┬─────────────────────────────┘
                           │ HTTP / JSON
┌──────────────────────────▼─────────────────────────────┐
│                 FastAPI API Backend                    │
│      (Local Uvicorn or Vercel Serverless Function)     │
└────────────┬─────────────────────────────┬─────────────┘
             │ /ingest                     │ /ask
┌────────────▼──────────────┐ ┌────────────▼─────────────┐
│ Document Ingestion Pipeline│ │   Smart Decision Agent   │
│ - Chunking (800 / 120 ovl)│ │ - Groq Llama 3.3 70B     │
│ - all-MiniLM-L6-v2 Embed   │ │ - Tool Calling Evaluator │
│ - FAISS Vector Indexing    │ └──────┬────────────┬─────┘
└────────────┬──────────────┘        │ No         │ Yes (Needs Docs)
             │ Persist                │            ▼
┌────────────▼──────────────┐        │    ┌──────────────┐
│     FAISS Vector Store     │◄───────┼────┤Top-k Semantic│
│ (Disk / /tmp on Serverless)│        │    │  Retrieval   │
└───────────────────────────┘        │    └──────┬───────┘
                                     │           │ Context
                                     ▼           ▼
                               ┌─────────────────────────┐
                               │  Direct / Grounded Msg  │
                               │  + Formatted Citations  │
                               └─────────────────────────┘
```

---

## Tech Stack

- **Backend Framework:** FastAPI, Uvicorn, Pydantic v2
- **Orchestration & RAG:** LangChain, LangChain-Groq, LangChain-Community, LangChain-HuggingFace
- **LLM Inference:** Groq Cloud (`llama-3.3-70b-versatile`)
- **Embeddings & Vector Search:** HuggingFace `sentence-transformers/all-MiniLM-L6-v2`, FAISS (CPU)
- **Document Extractors:** PyPDF, TextLoader
- **Deployment Platform:** Vercel (Fluid Compute / Serverless Python)

---

## Project Structure

```
.
├── api/
│   └── index.py         # Vercel serverless function entrypoint
├── app/
│   ├── main.py          # FastAPI application & route definitions
│   ├── config.py        # Central configuration (supports Vercel /tmp)
│   ├── ingestion.py     # Document loaders & recursive text chunking
│   ├── embeddings.py    # Local HuggingFace embedding model
│   ├── vectorstore.py   # FAISS index persistence & similarity search
│   ├── retrieval.py     # Top-k retrieval & citation grouping
│   ├── agent.py         # Tool-calling agent (retrieval vs. direct answer)
│   ├── llm.py           # Groq LLM client wrapper
│   ├── schemas.py       # Pydantic request & response schemas
│   └── static/          # Modern Web UI
│       ├── index.html   # HTML5 UI with prompt cards & theme toggler
│       ├── styles.css   # Dark/light theme styles & glassmorphism
│       └── app.js       # Client interaction logic & Markdown rendering
├── data/                # Local uploaded documents directory
├── vectorstore/         # Local FAISS index files
├── evaluation/          # RAG evaluation script & test datasets
├── scripts/
│   └── ingest_cli.py    # Standalone CLI ingestion script
├── vercel.json          # Vercel routing & serverless configuration
├── requirements.txt     # Python dependencies
└── README.md
```

---

## Deploying to Vercel

This repository is pre-configured for zero-friction Vercel deployment via `vercel.json` and `api/index.py`.

### Method 1: Continuous Deployment via GitHub (Recommended)

1. Push your repository to GitHub:
   ```bash
   git add .
   git commit -m "Configure Vercel deployment and modern UI"
   git push origin main
   ```
2. Navigate to [Vercel Dashboard](https://vercel.com/new).
3. Import your **`rag-doc-qa`** repository.
4. In the **Environment Variables** panel, add:
   - `GROQ_API_KEY`: Your free Groq API key (from [Groq Console](https://console.groq.com/keys)).
5. Click **Deploy**. Vercel will build and launch your application globally!

### Method 2: Deploying via Vercel CLI

1. Install or run Vercel CLI:
   ```bash
   npx vercel
   ```
2. Link the project and set environment variable:
   ```bash
   npx vercel env add GROQ_API_KEY
   ```
3. Deploy to production:
   ```bash
   npx vercel --prod
   ```

> **Serverless File System Note:** On Vercel, the filesystem outside `/tmp` is read-only. The application automatically detects Vercel environments and routes `DATA_DIR`, `VECTORSTORE_DIR`, `HF_HOME`, and `TORCH_HOME` to `/tmp` to ensure seamless execution.

---

## Local Development

### 1. Prerequisites

- Python 3.12+
- A free Groq API Key from [console.groq.com/keys](https://console.groq.com/keys)

### 2. Environment Setup

```bash
# Clone the repository
git clone https://github.com/Kkt04/rag-doc-qa.git
cd rag-doc-qa

# Create and activate virtual environment
python3 -m venv venv
source venv/bin/activate    # On Windows: .\venv\Scripts\activate

# Install dependencies
pip install --upgrade pip
pip install -r requirements.txt
```

### 3. Configure `.env`

Create a `.env` file in the root directory:

```bash
GROQ_API_KEY=gsk_your_groq_api_key_here
GROQ_MODEL=llama-3.3-70b-versatile
CHUNK_SIZE=800
CHUNK_OVERLAP=120
RETRIEVAL_K=4
```

### 4. Start the Application

```bash
python -m uvicorn app.main:app --reload --reload-dir app
```

- Web UI: [http://127.0.0.1:8000](http://127.0.0.1:8000)
- Interactive API Docs (Swagger): [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs)

---

## API Reference

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/` | Serves the web interface |
| `GET` | `/health` | Health check & model status |
| `POST` | `/ingest` | Ingest and chunk uploaded documents (`multipart/form-data`) |
| `POST` | `/ask` | Ask a query to the agent (`{"question": "...", "k": 4}`) |
| `GET` | `/docs` | Interactive Swagger API documentation |

### Example cURL Ingestion

```bash
curl -X POST http://127.0.0.1:8000/ingest \
  -F "files=@handbook.pdf" \
  -F "files=@notes.txt"
```

### Example cURL Query

```bash
curl -X POST http://127.0.0.1:8000/ask \
  -H "Content-Type: application/json" \
  -d '{"question": "What are the key policy changes described in the handbook?"}'
```

---

## Evaluation Benchmark

The `evaluation/` directory contains an automated testing suite evaluating:
1. **Answer Relevance** — LLM-as-a-judge score (1 to 5 scale).
2. **Retrieval Precision** — Ratio of retrieved chunks containing relevant grounding context.
3. **Retrieval Efficiency** — Percentage of conversational/non-document queries correctly answered without invoking retrieval.

To run the evaluation:

```bash
python evaluation/evaluate.py
```

---

## License

MIT License. Built with FastAPI, LangChain, and Groq.
