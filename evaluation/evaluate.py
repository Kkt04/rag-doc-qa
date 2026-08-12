"""
Lightweight evaluation framework for the RAG pipeline.

Measures, per question:
  1. Retrieval precision  -> fraction of retrieved chunks judged "relevant" by an LLM judge
  2. Answer relevance     -> LLM-judged score (1-5) of how well the answer addresses the question
  3. Retrieval efficiency -> did the agent correctly skip retrieval for non-document questions?

Usage:
    python evaluation/evaluate.py
"""
import json
import os
import sys
import statistics

sys.path.append(os.path.join(os.path.dirname(__file__), ".."))

from app.llm import get_llm
from app.vectorstore import load_vectorstore
from app.agent import answer_question

JUDGE_PROMPT = """You are grading a RAG system's output.

Question: {question}
Ground truth (may be approximate): {ground_truth}
System answer: {answer}

Rate the answer's relevance and correctness on a scale of 1-5 where:
1 = irrelevant or wrong, 5 = fully relevant and correct.
Respond with ONLY a single integer (1-5), nothing else.
"""

CHUNK_RELEVANCE_PROMPT = """Question: {question}
Document chunk: {chunk}

Is this chunk relevant to answering the question? Respond with only "yes" or "no".
"""


def score_answer_relevance(judge, question: str, ground_truth: str, answer: str) -> int:
    prompt = JUDGE_PROMPT.format(question=question, ground_truth=ground_truth, answer=answer)
    resp = judge.invoke(prompt).content.strip()
    try:
        return max(1, min(5, int("".join(filter(str.isdigit, resp)) or "3")))
    except ValueError:
        return 3


def score_retrieval_precision(judge, question: str, sources) -> float:
    if not sources:
        return 0.0
    relevant = 0
    for s in sources:
        prompt = CHUNK_RELEVANCE_PROMPT.format(question=question, chunk=s.content[:800])
        resp = judge.invoke(prompt).content.strip().lower()
        if resp.startswith("y"):
            relevant += 1
    return relevant / len(sources)


def run_evaluation(test_file: str = None):
    test_file = test_file or os.path.join(os.path.dirname(__file__), "test_questions.json")
    with open(test_file, "r", encoding="utf-8") as f:
        test_cases = json.load(f)

    store = load_vectorstore()
    judge = get_llm(temperature=0)

    results = []
    for case in test_cases:
        question = case["question"]
        ground_truth = case.get("ground_truth", "")

        resp = answer_question(store, question)

        relevance = score_answer_relevance(judge, question, ground_truth, resp.answer)
        precision = (
            score_retrieval_precision(judge, question, resp.sources)
            if resp.used_retrieval
            else None
        )

        results.append(
            {
                "question": question,
                "used_retrieval": resp.used_retrieval,
                "answer_relevance": relevance,
                "retrieval_precision": precision,
            }
        )
        print(
            f"Q: {question}\n"
            f"  retrieved={resp.used_retrieval}  relevance={relevance}/5  "
            f"precision={precision}\n"
        )

    relevances = [r["answer_relevance"] for r in results]
    precisions = [r["retrieval_precision"] for r in results if r["retrieval_precision"] is not None]
    retrieval_calls = sum(1 for r in results if r["used_retrieval"])

    print("=" * 50)
    print(f"Avg answer relevance : {statistics.mean(relevances):.2f} / 5")
    if precisions:
        print(f"Avg retrieval precision : {statistics.mean(precisions) * 100:.1f}%")
    print(f"Retrieval triggered on {retrieval_calls}/{len(results)} questions "
          f"({retrieval_calls / len(results) * 100:.0f}%)")

    return results


if __name__ == "__main__":
    run_evaluation()