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
from langchain_google_genai import GoogleGenerativeAI, GoogleGenerativeAIEmbeddings
from langchain.chains.summarize import load_summarize_chain
from langchain_core.prompts import PromptTemplate

# Configuration
EMBEDDING_MODEL = "models/embedding-001"  # Gemini embedding model
CATALOG_TABLE_NAME = "catalog"
CHUNKS_TABLE_NAME = "chunks"
SUMMARIZATION_MODEL = "gemini-2.0-flash"  # Gemini model for summarization

# You'll need to set this environment variable or pass it directly
# export GOOGLE_API_KEY="your-api-key-here"


def parse_arguments():
    """Parse command line arguments."""
    parser = argparse.ArgumentParser(description="Seed LanceDB with documents using Gemini")
    parser.add_argument("--dbpath", required=True, help="Database path")
    parser.add_argument("--filesdir", required=True, help="Directory with files to process")
    parser.add_argument("--overwrite", action="store_true", help="Overwrite existing tables")
    parser.add_argument("--api-key", help="Google API key (can also use GOOGLE_API_KEY env var)")
    return parser.parse_args()


def validate_args(args):
    """Validate command line arguments."""
    if not args.dbpath or not args.filesdir:
        print("Error: Please provide a database path (--dbpath) and a directory with files (--filesdir) to process")
        sys.exit(1)

    # Check for API key
    api_key = args.api_key or os.environ.get("GOOGLE_API_KEY")
    if not api_key:
        print("Error: Please provide a Google API key via --api-key or GOOGLE_API_KEY environment variable")
        sys.exit(1)

    print(f"DATABASE PATH: {args.dbpath}")
    print(f"FILES DIRECTORY: {args.filesdir}")
    print(f"OVERWRITE FLAG: {args.overwrite}")
    print(f"API KEY: {'*' * 10 + api_key[-4:] if api_key else 'Not set'}")

    return api_key


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
    api_key = validate_args(args)

    # Initialize Gemini models
    print("Initializing Gemini models...")
    
    # Initialize LLM for summarization
    llm = GoogleGenerativeAI(
        model=SUMMARIZATION_MODEL,
        google_api_key=api_key,
        temperature=0.7,
        max_output_tokens=200
    )

    # Initialize embedding model
    embedding_model = GoogleGenerativeAIEmbeddings(
        model=EMBEDDING_MODEL,
        google_api_key=api_key
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
            chunk_size=500,
            chunk_overlap=10
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
