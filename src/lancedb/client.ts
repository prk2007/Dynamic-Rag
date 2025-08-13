import * as lancedb from "@lancedb/lancedb";
import {
  LanceDB, LanceDBArgs
} from "@langchain/community/vectorstores/lancedb";
import { OpenAIEmbeddings } from "@langchain/openai";
import * as defaults from '../config.js'

export let client: lancedb.Connection;
export let chunksTable: lancedb.Table;
export let chunksVectorStore: LanceDB; 
export let catalogTable: lancedb.Table;
export let catalogVectorStore: LanceDB; 
const OPENAI_API_KEY = "{OPEN_AI_KEY}";
const OPENAI_EMBEDDING_MODEL = "text-embedding-3-small";

console.log

export async function connectToLanceDB(databaseUrl: string, chunksTableName: string, catalogTableName: string) {
  try {
    console.error(`Connecting to database: ${databaseUrl}`);
    client = await lancedb.connect(databaseUrl);

    chunksTable = await client.openTable(chunksTableName);
    chunksVectorStore = new LanceDB(new OpenAIEmbeddings({modelName: OPENAI_EMBEDDING_MODEL,openAIApiKey:OPENAI_API_KEY}), { table: chunksTable })

    catalogTable = await client.openTable(catalogTableName);
    catalogVectorStore = new LanceDB(new OpenAIEmbeddings({modelName: OPENAI_EMBEDDING_MODEL,openAIApiKey:OPENAI_API_KEY}), { table: catalogTable })

  } catch (error) {
    console.error("LanceDB connection error:", error);
    throw error;
  }
}

export async function closeLanceDB() {
  await client?.close();
}
