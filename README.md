# RAG Document Q&A Assistant

A production-ready Retrieval-Augmented Generation (RAG) system with a modern, sleek web interface and serverless Vercel deployment. Upload PDFs, TXT, or Markdown documents to build a semantic vector index, and ask questions through a smart tool-calling assistant powered by Groq and LangChain.

🔗 **Live Production URL:** [https://rag-doc-qa-woad.vercel.app](https://rag-doc-qa-woad.vercel.app)  
📖 **API Documentation (Swagger):** [https://rag-doc-qa-woad.vercel.app/docs](https://rag-doc-qa-woad.vercel.app/docs)

---

## Key Highlights

- **Smart Agent Routing** — Uses Groq high-speed LPU inference (`openai/gpt-oss-120b` / `openai/gpt-oss-20b` / `qwen/qwen3.8-27b`) with tool-calling to determine whether a query truly needs document retrieval. Greetings, general knowledge, and conversational queries bypass vector search entirely, saving token latency and computational overhead.
- **Modern Sleek Web UI** — Built with clean glassmorphism, responsive dual-theme support (Dark & Light modes with instant persistence), drag-and-drop document upload, staged queue management with file-type badges, and rich Markdown answer rendering with syntax-styled code blocks.
- **Grounded Answers & Expandable Citations** — When retrieval is triggered, answers are synthesized strictly from document excerpts. Source citations are grouped by file with expandable chunk previews and relevance stats.
- **Optimized for Vercel Serverless** — Uses a lightweight BM25 Okapi retrieval engine (<40 MB total bundle), fitting comfortably within Vercel's 500 MB limit and achieving sub-millisecond similarity queries with zero PyTorch/CUDA bloat. Storage and cache directories automatically adapt to `/tmp` in serverless environments.
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
│ - Chunking (800 / 120 ovl)│ │ - Groq LPU Inference     │
│ - Text tokenization       │ │ - Tool Calling Evaluator │
│ - In-Memory BM25 Indexing │ └──────┬────────────┬─────┘
└────────────┬──────────────┘        │ No         │ Yes (Needs Docs)
             │ Persist                │            ▼
┌────────────▼──────────────┐        │    ┌──────────────┐
│     Vector / Doc Store     │◄───────┼────┤Top-k Semantic│
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
- **Orchestration & RAG:** LangChain, LangChain-Groq, LangChain-Community
- **LLM Inference:** Groq Cloud LPU (`openai/gpt-oss-120b`, `openai/gpt-oss-20b`, `qwen/qwen3.8-27b`)
- **Retrieval Engine:** High-performance BM25 Okapi with document length normalization and sublinear term frequency
- **Document Extractors:** PyPDF, TextLoader
- **Deployment Platform:** Vercel (Fluid Compute / Serverless Python runtime)

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
│   ├── embeddings.py    # Embeddings configuration loader
│   ├── vectorstore.py   # BM25 vector index persistence & retrieval
│   ├── retrieval.py     # Top-k retrieval & citation grouping
│   ├── agent.py         # Tool-calling agent (retrieval vs. direct answer)
│   ├── llm.py           # Groq LLM client wrapper
│   ├── schemas.py       # Pydantic request & response schemas
│   └── static/          # Modern Web UI
│       ├── index.html   # HTML5 UI with prompt cards & theme toggler
│       ├── styles.css   # Dark/light theme styles & glassmorphism
│       └── app.js       # Client interaction logic & Markdown rendering
├── public/              # Static CDN assets served by Vercel edge
├── data/                # Local uploaded documents directory
├── vectorstore/         # Local persisted index files
├── evaluation/          # RAG evaluation script & test datasets
├── scripts/
│   └── ingest_cli.py    # Standalone CLI ingestion script
├── vercel.json          # Vercel routing & serverless configuration
├── requirements.txt     # Python dependencies (<40 MB lightweight bundle)
└── README.md
```

---

## Live Deployment

The application is deployed on Vercel at:  
👉 **[https://rag-doc-qa-woad.vercel.app](https://rag-doc-qa-woad.vercel.app)**

### Deploying Your Own Copy

1. **Push to GitHub**:
   ```bash
   git add .
   git commit -m "Deploy RAG Document Q&A"
   git push origin main
   ```
2. **Import into Vercel**:
   - Go to [vercel.com/new](https://vercel.com/new) and select your repository.
3. **Configure Environment Variables**:
   - `GROQ_API_KEY`: Your free API key from [Groq Console](https://console.groq.com/keys).
   - *(Optional)* `GROQ_MODEL`: Model name (defaults to `openai/gpt-oss-120b`).
4. **Deploy**:
   - Vercel automatically detects the FastAPI configuration via `vercel.json` and deploys your application globally.

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
GROQ_API_KEY=your_groq_api_key_here
GROQ_MODEL=openai/gpt-oss-120b
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
curl -X POST https://rag-doc-qa-woad.vercel.app/ingest \
  -F "files=@handbook.pdf" \
  -F "files=@notes.txt"
```

### Example cURL Query

```bash
curl -X POST https://rag-doc-qa-woad.vercel.app/ask \
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
