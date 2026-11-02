"""
Tool/function-calling agent.

Instead of ALWAYS retrieving from the vector store (which costs latency and tokens
every single time), we let the LLM itself decide, via a tool call, whether the
question actually needs document context.

- Greetings, chit-chat, general knowledge, math -> answered directly, no retrieval.
- Specific questions or summarization of ingested documents -> LLM calls `retrieve_documents` tool.
"""
from typing import Any, Optional

from app.config import settings
from app.llm import get_llm
from app.retrieval import retrieve
from app.schemas import AskResponse

RETRIEVE_TOOL = {
    "type": "function",
    "function": {
        "name": "retrieve_documents",
        "description": (
            "Search and retrieve context from the user's uploaded documents. "
            "Call this whenever the question asks about facts, policies, data, "
            "summaries, key takeaways, insights, or topics in the uploaded files. "
            "Do NOT call this for pure greetings (e.g. 'Hello'), basic math, or "
            "general conversational chit-chat."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "The search query or topic to look up in the documents.",
                }
            },
            "required": ["query"],
        },
    },
}

SYSTEM_PROMPT = """You are an expert document Q&A and analysis assistant.
You have access to a tool called `retrieve_documents` that searches the user's uploaded files.

Rules:
1. If the user asks about the uploaded documents, policies, facts, or asks to summarize, extract key takeaways, or analyze the documents, ALWAYS call `retrieve_documents`.
2. If the user asks a broad question like "Summarize the uploaded documents" or "What are the main takeaways?", call `retrieve_documents` with query "summary key takeaways".
3. If the question is a purely conversational greeting, small talk, general math, or general knowledge completely unrelated to documents, answer directly WITHOUT calling the tool.
4. After you receive retrieved context, answer accurately and thoroughly based strictly on that context.
5. If the user asks for a summary or key takeaways, provide a well-structured, formatted response with clear headers and bullet points.
6. Always cite the source file names for the information you provide.
"""


def answer_question(
    store: Optional[Any], question: str, k: int = None
) -> AskResponse:
    candidate_models = [
        "openai/gpt-oss-120b",
        "openai/gpt-oss-20b",
        "qwen/qwen3.8-27b",
        settings.GROQ_MODEL,
    ]
    models_to_try = []
    for m in candidate_models:
        if m and m not in models_to_try:
            models_to_try.append(m)

    last_error = None
    for model_name in models_to_try:
        try:
            llm = get_llm(model_name=model_name)

            messages = [
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": question},
            ]

            # Step 1: let the model decide — direct answer vs tool call
            ai_msg = llm.invoke(messages, tools=[RETRIEVE_TOOL])
            tool_calls = getattr(ai_msg, "tool_calls", None) or []

            if not tool_calls:
                # Model chose to answer directly -> zero retrieval cost
                return AskResponse(
                    answer=ai_msg.content,
                    used_retrieval=False,
                    sources=[],
                    reasoning=f"Model ({model_name}) answered directly without needing document retrieval.",
                )

            # Check if store has documents
            has_docs = store is not None and hasattr(store, "docs") and len(store.docs) > 0
            if not has_docs:
                return AskResponse(
                    answer=(
                        "The assistant identified that your question requires document context, "
                        "but no documents are currently loaded in your session. Please upload your files in the "
                        "Knowledge Base panel on the left to index them."
                    ),
                    used_retrieval=False,
                    sources=[],
                    reasoning="Retrieval requested by agent but document index is empty.",
                )

            # Step 2: execute the tool call the model asked for
            call = tool_calls[0]
            query = call["args"].get("query", question)
            context, sources = retrieve(store, query, k=k)

            # If no relevant chunks were found in the documents
            if not sources or not context.strip():
                return AskResponse(
                    answer=(
                        f"I searched your uploaded documents for relevant context regarding '{query}', "
                        "but could not find matching sections. Please ensure the relevant file "
                        "is uploaded or try rephrasing your question."
                    ),
                    used_retrieval=True,
                    sources=[],
                    reasoning="No sufficiently matching chunks found in the document index.",
                )

            # Step 3: synthesize grounded answer
            tool_content = (
                f"Retrieved document context:\n{context}\n\n"
                "Please provide a clear, accurate, and comprehensive response to the user's question based strictly on the context above. Cite the source files."
            )

            messages.append(ai_msg)
            messages.append(
                {
                    "role": "tool",
                    "tool_call_id": call["id"],
                    "content": tool_content,
                }
            )

            try:
                final_msg = llm.invoke(messages, tools=[RETRIEVE_TOOL])
            except Exception:
                final_msg = llm.invoke(messages)

            answer_content = final_msg.content
            if not answer_content and getattr(final_msg, "tool_calls", None):
                # Fallback if model returned an extra tool call instead of text
                answer_content = (
                    "Based on the retrieved context:\n"
                    + "\n\n".join([f"> {s.content}" for s in sources[:2]])
                )

            return AskResponse(
                answer=answer_content,
                used_retrieval=True,
                sources=sources,
                reasoning=f"Grounded response using {len(sources)} document chunk(s) via {model_name}.",
            )
        except Exception as e:
            err_str = str(e).lower()
            if (
                "model_not_found" in err_str
                or "does not exist" in err_str
                or "decommissioned" in err_str
                or "deprecated" in err_str
            ):
                last_error = e
                continue
            raise e

    if last_error:
        raise last_error
    raise RuntimeError("Failed to obtain answer from candidate models.")
