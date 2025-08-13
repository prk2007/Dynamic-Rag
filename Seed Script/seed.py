#!/usr/bin/env python3

import argparse
import asyncio
import hashlib
import os
import sys
from pathlib import Path
from typing import List, Dict, Any, Optional, Tuple

import lancedb
import pandas as pd
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain_community.document_loaders import DirectoryLoader, PyPDFLoader
from langchain_community.vectorstores import LanceDB
from langchain_core.documents import Document
from langchain_ollama import OllamaLLM, OllamaEmbeddings
from langchain.chains.summarize import load_summarize_chain
from langchain_core.prompts import PromptTemplate

# Configuration (equivalent to your config.js)
EMBEDDING_MODEL = "snowflake-arctic-embed2"
CATALOG_TABLE_NAME = "catalog"
CHUNKS_TABLE_NAME = "chunks"
SUMMARIZATION_MODEL = "gemma3:4b"

# Ollama base URL
OLLAMA_BASE_URL = "http://127.0.0.1:11434"


def parse_arguments():
    """Parse command line arguments."""
    parser = argparse.ArgumentParser(description="Seed LanceDB with documents")
    parser.add_argument("--dbpath", required=True, help="Database path")
    parser.add_argument("--filesdir", required=True, help="Directory with files to process")
    parser.add_argument("--overwrite", action="store_true", help="Overwrite existing tables")
    return parser.parse_args()


def validate_args(args):
    """Validate command line arguments."""
    if not args.dbpath or not args.filesdir:
        print("Error: Please provide a database path (--dbpath) and a directory with files (--filesdir) to process")
        sys.exit(1)

    print(f"DATABASE PATH: {args.dbpath}")
    print(f"FILES DIRECTORY: {args.filesdir}")
    print(f"OVERWRITE FLAG: {args.overwrite}")


def calculate_file_hash(file_path: str) -> str:
    """Calculate SHA256 hash of a file."""
    hash_sha256 = hashlib.sha256()
    with open(file_path, "rb") as f:
        for chunk in iter(lambda: f.read(4096), b""):
            hash_sha256.update(chunk)
    return hash_sha256.hexdigest()


async def catalog_record_exists(catalog_table, hash_value: str) -> bool:
    """Check if a catalog record with the given hash exists."""
    try:
        # LanceDB query to check if hash exists
        query_result = catalog_table.search().where(f"hash = '{hash_value}'").limit(1).to_pandas()
        return len(query_result) > 0
    except Exception:
        return False


async def generate_content_overview(docs: List[Document], llm) -> str:
    """Generate content overview using summarization chain."""
    content_overview_template = """Write a high-level one sentence content overview based on the text below:

"{text}"

WRITE THE CONTENT OVERVIEW ONLY, DO NOT WRITE ANYTHING ELSE:"""

    content_overview_prompt = PromptTemplate(
        template=content_overview_template,
        input_variables=["text"]
    )

    # Create summarization chain
    chain = load_summarize_chain(
        llm,
        chain_type="map_reduce",
        combine_prompt=content_overview_prompt
    )

    try:
        result = await chain.ainvoke({"input_documents": docs})
        return result.get("output_text", "")
    except Exception as e:
        print(f"Error generating summary: {e}")
        # Fallback: just take first document's content
        if docs:
            return docs[0].page_content[:200] + "..."
        return "Document content overview"


async def process_documents(
        raw_docs: List[Document],
        catalog_table,
        llm,
        skip_exists_check: bool = False
) -> Tuple[List[str], List[Document]]:
    """Process documents and return skip sources and catalog records."""

    # Group documents by source
    docs_by_source: Dict[str, List[Document]] = {}
    for doc in raw_docs:
        source = doc.metadata.get("source", "")
        if source not in docs_by_source:
            docs_by_source[source] = []
        docs_by_source[source].append(doc)

    skip_sources = []
    catalog_records = []

    # Process each source
    for source, docs in docs_by_source.items():
        if not os.path.exists(source):
            print(f"Warning: Source file {source} does not exist. Skipping...")
            continue

        # Calculate hash of the source document
        file_hash = calculate_file_hash(source)

        # Check if document already exists in catalog
        exists = False if skip_exists_check else await catalog_record_exists(catalog_table, file_hash)

        if exists:
            print(f"Document with hash {file_hash} already exists in the catalog. Skipping...")
            skip_sources.append(source)
        else:
            print(f"Processing source: {source}")
            content_overview = await generate_content_overview(docs, llm)
            print(f"Content overview for source {source}: {content_overview}")

            catalog_record = Document(
                page_content=content_overview,
                metadata={"source": source, "hash": file_hash}
            )
            catalog_records.append(catalog_record)

    return skip_sources, catalog_records


async def main():
    """Main function."""
    args = parse_arguments()
    validate_args(args)

    # Initialize models
    print("Initializing models...")
    llm = OllamaLLM(
        model=SUMMARIZATION_MODEL,
        base_url=OLLAMA_BASE_URL,
        timeout=600
    )

    # Fixed: Remove timeout parameter from OllamaEmbeddings
    embedding_model = OllamaEmbeddings(
        model=EMBEDDING_MODEL,
        base_url=OLLAMA_BASE_URL
    )

    # Connect to LanceDB
    print("Connecting to LanceDB...")
    db = lancedb.connect(args.dbpath)

    # Check if tables exist
    catalog_table = None
    chunks_table = None
    catalog_table_exists = True

    try:
        catalog_table = db.open_table(CATALOG_TABLE_NAME)
    except Exception:
        print(f'Looks like the catalog table "{CATALOG_TABLE_NAME}" doesn\'t exist. We\'ll create it later.')
        catalog_table_exists = False

    try:
        chunks_table = db.open_table(CHUNKS_TABLE_NAME)
    except Exception:
        print(f'Looks like the chunks table "{CHUNKS_TABLE_NAME}" doesn\'t exist. We\'ll create it later.')

    # Drop tables if overwrite is specified
    if args.overwrite:
        try:
            if CATALOG_TABLE_NAME in db.table_names():
                db.drop_table(CATALOG_TABLE_NAME)
            if CHUNKS_TABLE_NAME in db.table_names():
                db.drop_table(CHUNKS_TABLE_NAME)
            catalog_table_exists = False
        except Exception as e:
            print(f"Error dropping tables. Maybe they don't exist! {e}")

    # Load documents
    print("Loading files...")
    loader = DirectoryLoader(
        args.filesdir,
        glob="**/*.pdf",
        loader_cls=PyPDFLoader,
        show_progress=True
    )

    raw_docs = loader.load()

    # Clean metadata (keep only essential fields)
    for doc in raw_docs:
        if hasattr(doc, 'metadata'):
            doc.metadata = {
                "source": doc.metadata.get("source", ""),
                "page": doc.metadata.get("page", 0)
            }

    print(f"Loaded {len(raw_docs)} documents")

    # Process documents for catalog
    print("Loading LanceDB catalog store...")
    skip_sources, catalog_records = await process_documents(
        raw_docs,
        catalog_table,
        llm,
        args.overwrite or not catalog_table_exists
    )

    # Create catalog store
    if catalog_records:
        print(f"Creating catalog with {len(catalog_records)} records...")
        catalog_store = LanceDB.from_documents(
            catalog_records,
            embedding_model,
            connection=db,
            table_name=CATALOG_TABLE_NAME
        )
    else:
        print("No new catalog records to create")

    print(f"Number of new catalog records: {len(catalog_records)}")
    print(f"Number of skipped sources: {len(skip_sources)}")

    # Filter out skipped sources
    filtered_raw_docs = [
        doc for doc in raw_docs
        if doc.metadata.get("source", "") not in skip_sources
    ]

    print(f"Processing {len(filtered_raw_docs)} documents for chunking...")

    # Split documents into chunks
    if filtered_raw_docs:
        print("Loading LanceDB vector store...")
        splitter = RecursiveCharacterTextSplitter(
            chunk_size=400,  # Smaller chunks
            chunk_overlap=50,  # Better overlap
            separators=["\n\n", "\n", ".", "!", "?", ";", " ", ""],  # Better splitting
        )
        docs = splitter.split_documents(filtered_raw_docs)

        # Create vector store
        if docs:
            print(f"Creating vector store with {len(docs)} chunks...")
            vector_store = LanceDB.from_documents(
                docs,
                embedding_model,
                connection=db,
                table_name=CHUNKS_TABLE_NAME
            )
        else:
            print("No documents to chunk")

        print(f"Number of new chunks: {len(docs)}")
    else:
        print("No new documents to process for chunking")

    print("Seeding completed successfully!")


if __name__ == "__main__":
    # Run the async main function
    asyncio.run(main())