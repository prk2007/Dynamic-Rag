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
from langchain_openai import ChatOpenAI, OpenAIEmbeddings
from langchain.chains.summarize import load_summarize_chain
from langchain_core.prompts import PromptTemplate

# Configuration
EMBEDDING_MODEL = "text-embedding-3-small"  # OpenAI embedding model (or "text-embedding-ada-002" for older/cheaper)
CATALOG_TABLE_NAME = "catalog"
CHUNKS_TABLE_NAME = "chunks"
SUMMARIZATION_MODEL = "gpt-3.5-turbo"  # OpenAI model for summarization (or "gpt-4" for better quality)
MAX_PAGES_FOR_SUMMARY = 10  # Maximum number of pages to use for summarization
MAX_CHARS_FOR_SUMMARY = 4000  # Maximum characters to send for summarization

# You'll need to set this environment variable or pass it directly
# export OPENAI_API_KEY="your-api-key-here"


def parse_arguments():
    """Parse command line arguments."""
    parser = argparse.ArgumentParser(description="Seed LanceDB with documents using OpenAI")
    parser.add_argument("--dbpath", required=True, help="Database path")
    parser.add_argument("--filesdir", required=True, help="Directory with files to process")
    parser.add_argument("--overwrite", action="store_true", help="Overwrite existing tables")
    parser.add_argument("--api-key", help="OpenAI API key (can also use OPENAI_API_KEY env var)")
    parser.add_argument("--max-pages", type=int, default=10, help="Maximum pages to use for summarization (default: 10)")
    return parser.parse_args()


def validate_args(args):
    """Validate command line arguments."""
    if not args.dbpath or not args.filesdir:
        print("Error: Please provide a database path (--dbpath) and a directory with files (--filesdir) to process")
        sys.exit(1)

    # Check for API key
    api_key = args.api_key or os.environ.get("OPENAI_API_KEY")
    if not api_key:
        print("Error: Please provide an OpenAI API key via --api-key or OPENAI_API_KEY environment variable")
        sys.exit(1)

    print(f"DATABASE PATH: {args.dbpath}")
    print(f"FILES DIRECTORY: {args.filesdir}")
    print(f"OVERWRITE FLAG: {args.overwrite}")
    print(f"MAX PAGES FOR SUMMARY: {args.max_pages}")
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


async def generate_content_overview(docs: List[Document], llm, max_pages: int = MAX_PAGES_FOR_SUMMARY) -> str:
    """Generate content overview using summarization chain with first 10 pages only."""
    # Filter to only first 10 pages
    first_10_pages = []
    page_numbers = set()
    
    for doc in docs:
        page_num = doc.metadata.get("page", 0)
        if page_num < max_pages:  # First N pages
            first_10_pages.append(doc)
            page_numbers.add(page_num)
    
    # If no docs in first 10 pages, take first few docs regardless
    if not first_10_pages:
        first_10_pages = docs[:10]
    
    print(f"  Using {len(first_10_pages)} chunks from pages {sorted(page_numbers)} for summarization")
    
    # Combine text from first 10 pages with length limit
    combined_text = ""
    max_chars = MAX_CHARS_FOR_SUMMARY  # Limit to avoid token limits
    
    for doc in first_10_pages:
        if len(combined_text) + len(doc.page_content) > max_chars:
            break
        combined_text += doc.page_content + "\n\n"
    
    # Create a simple prompt instead of using chain for better control
    prompt = f"""Write a high-level one sentence content overview based on the first pages of this document:

{combined_text[:max_chars]}

WRITE THE CONTENT OVERVIEW ONLY, DO NOT WRITE ANYTHING ELSE:"""

    try:
        # Direct LLM call for better error handling
        result = await llm.ainvoke(prompt)
        return result.content.strip()
    except Exception as e:
        print(f"  Error generating summary: {e}")
        # Fallback: just take first document's content
        if docs:
            return f"Document starting with: {docs[0].page_content[:150]}..."
        return "Document content overview"


async def process_documents(
        raw_docs: List[Document],
        catalog_table,
        llm,
        skip_exists_check: bool = False,
        max_pages: int = MAX_PAGES_FOR_SUMMARY
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
            content_overview = await generate_content_overview(docs, llm, max_pages)
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

    # Set API key in environment if provided via command line
    if args.api_key:
        os.environ["OPENAI_API_KEY"] = args.api_key

    # Initialize OpenAI models
    print("Initializing OpenAI models...")
    
    # Initialize LLM for summarization
    llm = ChatOpenAI(
        model=SUMMARIZATION_MODEL,
        temperature=0.7,
        max_tokens=200,
        api_key=api_key
    )

    # Initialize embedding model
    embedding_model = OpenAIEmbeddings(
        model=EMBEDDING_MODEL,
        api_key=api_key
    )
    
    # Test embedding dimension by generating a test embedding
    print("Testing embedding dimensions...")
    test_embedding = embedding_model.embed_query("test")
    embedding_dim = len(test_embedding)
    print(f"Embedding dimension: {embedding_dim}")

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

    # Drop tables if overwrite is specified or if dimension mismatch
    should_recreate_tables = args.overwrite
    
    # Check if we need to recreate tables due to embedding dimension mismatch
    if catalog_table_exists and not args.overwrite:
        try:
            # Check the schema of existing table
            existing_schema = catalog_table.schema
            print(f"Existing table schema: {existing_schema}")
            # If there's an issue, we'll recreate the tables
        except Exception as e:
            print(f"Could not read existing table schema: {e}")
            should_recreate_tables = True
    
    if should_recreate_tables:
        try:
            if CATALOG_TABLE_NAME in db.table_names():
                print(f"Dropping existing catalog table...")
                db.drop_table(CATALOG_TABLE_NAME)
            if CHUNKS_TABLE_NAME in db.table_names():
                print(f"Dropping existing chunks table...")
                db.drop_table(CHUNKS_TABLE_NAME)
            catalog_table_exists = False
            catalog_table = None
            chunks_table = None
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
        should_recreate_tables or not catalog_table_exists,
        args.max_pages
    )

    # Create catalog store
    if catalog_records:
        print(f"Creating catalog with {len(catalog_records)} records...")
        try:
            # If table exists, try to add to it
            if catalog_table_exists and catalog_table is not None:
                catalog_store = LanceDB(
                    connection=db,
                    embedding=embedding_model,
                    table_name=CATALOG_TABLE_NAME
                )
                catalog_store.add_documents(catalog_records)
            else:
                # Create new table
                catalog_store = LanceDB.from_documents(
                    catalog_records,
                    embedding_model,
                    connection=db,
                    table_name=CATALOG_TABLE_NAME,
                    mode="overwrite"  # Force overwrite mode for new tables
                )
        except Exception as e:
            print(f"Error creating catalog store: {e}")
            print("Attempting to recreate catalog table...")
            # Drop and recreate
            if CATALOG_TABLE_NAME in db.table_names():
                db.drop_table(CATALOG_TABLE_NAME)
            catalog_store = LanceDB.from_documents(
                catalog_records,
                embedding_model,
                connection=db,
                table_name=CATALOG_TABLE_NAME,
                mode="overwrite"
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
            try:
                # Process in batches to handle rate limits better
                batch_size = 100
                for i in range(0, len(docs), batch_size):
                    batch = docs[i:i+batch_size]
                    print(f"Processing batch {i//batch_size + 1}/{(len(docs) + batch_size - 1)//batch_size}")
                    
                    if i == 0:
                        # Create new vector store with first batch
                        vector_store = LanceDB.from_documents(
                            batch,
                            embedding_model,
                            connection=db,
                            table_name=CHUNKS_TABLE_NAME,
                            mode="overwrite" if should_recreate_tables else "append"
                        )
                    else:
                        # Add subsequent batches
                        vector_store.add_documents(batch)
                    
                    # Small delay between batches to avoid rate limits (optional for OpenAI)
                    if i + batch_size < len(docs):
                        await asyncio.sleep(0.5)
            except Exception as e:
                print(f"Error creating vector store: {e}")
                print("Attempting to recreate chunks table...")
                # Drop and recreate
                if CHUNKS_TABLE_NAME in db.table_names():
                    db.drop_table(CHUNKS_TABLE_NAME)
                
                # Retry with overwrite mode
                for i in range(0, len(docs), batch_size):
                    batch = docs[i:i+batch_size]
                    print(f"Retrying batch {i//batch_size + 1}/{(len(docs) + batch_size - 1)//batch_size}")
                    
                    if i == 0:
                        vector_store = LanceDB.from_documents(
                            batch,
                            embedding_model,
                            connection=db,
                            table_name=CHUNKS_TABLE_NAME,
                            mode="overwrite"
                        )
                    else:
                        vector_store.add_documents(batch)
                    
                    if i + batch_size < len(docs):
                        await asyncio.sleep(0.5)
        else:
            print("No documents to chunk")

        print(f"Number of new chunks: {len(docs)}")
    else:
        print("No new documents to process for chunking")

    print("Seeding completed successfully!")


if __name__ == "__main__":
    # Run the async main function
    asyncio.run(main())
