"""
Standalone CLI to ingest all files in the data/ folder without running the API.

Usage:
    python scripts/ingest_cli.py
"""
import os
import sys

sys.path.append(os.path.join(os.path.dirname(__file__), ".."))

from app.config import settings
from app.ingestion import ingest_files, SUPPORTED_EXTENSIONS
from app.vectorstore import build_vectorstore, save_vectorstore, load_vectorstore, add_to_vectorstore


def main():
    data_dir = settings.DATA_DIR
    if not os.path.isdir(data_dir):
        print(f"Data directory '{data_dir}' not found.")
        return

    file_paths = [
        os.path.join(data_dir, f)
        for f in os.listdir(data_dir)
        if os.path.splitext(f)[1].lower() in SUPPORTED_EXTENSIONS
    ]

    if not file_paths:
        print(f"No supported files ({SUPPORTED_EXTENSIONS}) found in '{data_dir}'.")
        return

    print(f"Ingesting {len(file_paths)} file(s)...")
    chunks = ingest_files(file_paths)
    print(f"Created {len(chunks)} chunks.")

    store = load_vectorstore()
    if store is None:
        store = build_vectorstore(chunks)
    else:
        store = add_to_vectorstore(store, chunks)

    save_vectorstore(store)
    print(f"Vector store saved to '{settings.VECTORSTORE_DIR}'.")


if __name__ == "__main__":
    main()