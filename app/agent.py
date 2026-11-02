"""
Tool/function-calling agent.

Instead of ALWAYS retrieving from the vector store (which costs latency and tokens
every single time), we let the LLM itself decide, via a tool call, whether the
question actually needs document context.

- Greetings, chit-chat, general knowledge, math -> answered directly, no retrieval.
- Anything about the ingested documents -> LLM calls `retrieve_documents` tool.
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
            "Search the user's uploaded documents for relevant context. "
            "Call this ONLY when the question requires specific facts, figures, "
            "or content that would live inside the uploaded documents. "
            "Do NOT call this for greetings, general knowledge, math, or "
            "questions unrelated to the documents."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "The search query to run against the document store.",
                }
            },
            "required": ["query"],
        },
    },
}

SYSTEM_PROMPT = """You are a document Q&A assistant.
You have a tool called `retrieve_documents` that searches the user's uploaded files.

Rules:
1. If the question needs information from the uploaded documents, call `retrieve_documents`.
2. If the question is a greeting, small talk, general knowledge, or something you can
   confidently answer without the documents, answer directly WITHOUT calling the tool.
3. After you receive retrieved context, answer ONLY using that context. If the context
   doesn't contain the answer, say so honestly — do not make things up.
4. Keep answers concise and cite the source file names you used.
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
                    reasoning=f"Model ({model_name}) judged this didn't require document context.",
                )

            if store is None:
                return AskResponse(
                    answer=(
                        "The model wanted to search your documents, but no documents "
                        "have been ingested yet. Please upload/ingest files first."
                    ),
                    used_retrieval=False,
                    sources=[],
                    reasoning="Retrieval requested but vector store is empty.",
                )

            # Step 2: execute the tool call the model asked for
            call = tool_calls[0]
            query = call["args"].get("query", question)
            context, sources = retrieve(store, query, k=k)

            messages.append(ai_msg)
            messages.append(
                {
                    "role": "tool",
                    "tool_call_id": call["id"],
                    "content": context if context else "No relevant context found.",
                }
            )

            # Step 3: model produces the final grounded answer
            final_msg = llm.invoke(messages)

            return AskResponse(
                answer=final_msg.content,
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
