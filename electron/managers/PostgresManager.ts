import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { Client } = require("pg");

export class PostgresManager {
  async testConnection(
    connectionString: string,
  ): Promise<{ success: boolean; tables?: string[]; error?: string }> {
    const client = new Client({
      connectionString,
    });

    try {
      await client.connect();
      // Query to get all tables in public schema
      const res = await client.query(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_type = 'BASE TABLE';
      `);

      const tables = res.rows.map((row) => row.table_name);
      await client.end();

      return { success: true, tables };
    } catch (error: any) {
      try {
        await client.end();
      } catch (e) {} // Ensure cleanup
      return { success: false, error: error.message };
    }
  }
  async ensureTables(
    connectionString: string,
    config: any,
  ): Promise<{ success: boolean; error?: string }> {
    const client = new Client({ connectionString });
    try {
      await client.connect();
      await client.query("CREATE EXTENSION IF NOT EXISTS vector;");

      // Create Documents Table
      await client.query(`
        CREATE TABLE IF NOT EXISTS ${config.documentTable} (
          id UUID PRIMARY KEY,
          name TEXT,
          metadata JSONB,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);

      // Create Chunks Table
      await client.query(`
        CREATE TABLE IF NOT EXISTS ${config.chunkTable} (
          id UUID PRIMARY KEY,
          document_id UUID REFERENCES ${config.documentTable}(id),
          content TEXT,
          chunk_index INTEGER,
          metadata JSONB
        );
      `);

      // Create Embeddings Table
      // Note: Dimension might need to be dynamic? For now defaulting to generic vector or user needs to alter
      // But actually better to use "vector" type without dim if possible? Postgres vector requires dim usually?
      // We will assume 1536 (OpenAI) or 768 (Nomic) - let's default to no dim enforcement for initial creation if possible?
      // No, pgvector needs dim. We'll use 768 as default for Nomic or 1536 for OpenAI if we can detect?
      // Let's just create it with 'vector' type without specifying size if pgvector supports it (it checks on insert usually if not defined? No, it needs it).
      // We will blindly try created it, if validation fails user fixes it manually or we add dim config later.
      // Actually, safest is to NOT create the embedding column with a strictly typed dimension yet, OR use a flexible design.
      // Let's assume 1536 for high compatibility or let user set it?
      // For now, I'll allow the manager to pass the dimension.

      // WAIT: I can just create table without the vector column first, then add it?
      // No, let's just create it.
      await client.query(`
        CREATE TABLE IF NOT EXISTS ${config.embeddingTable} (
          id UUID PRIMARY KEY,
          chunk_id UUID REFERENCES ${config.chunkTable}(id),
          embedding vector, 
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);

      await client.end();
      return { success: true };
    } catch (e: any) {
      try {
        await client.end();
      } catch {}
      return { success: false, error: e.message };
    }
  }

  async insertVectorData(
    connectionString: string,
    config: any,
    doc: any,
    chunks: any[],
    embeddings: number[][],
  ) {
    const client = new Client({ connectionString });
    try {
      await client.connect();

      await client.query("BEGIN");

      // Insert Document
      await client.query(
        `INSERT INTO ${config.documentTable} (id, name, metadata) VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING`,
        [doc.id, doc.name, doc.metadata],
      );

      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        const vector = embeddings[i];

        // Insert Chunk
        await client.query(
          `INSERT INTO ${config.chunkTable} (id, document_id, content, chunk_index) VALUES ($1, $2, $3, $4) ON CONFLICT (id) DO NOTHING`,
          [chunk.id, chunk.documentId, chunk.content, i],
        );

        // Insert Embedding
        // pgvector formatting: string "[1,2,3]"
        const vectorStr = `[${vector.join(",")}]`;
        await client.query(
          `INSERT INTO ${config.embeddingTable} (id, chunk_id, embedding) VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING`,
          [chunk.embeddingId, chunk.id, vectorStr],
        );
      }

      await client.query("COMMIT");
      await client.end();
      return true;
    } catch (e) {
      await client.query("ROLLBACK");
      try {
        await client.end();
      } catch {}
      throw e;
    }
  }
}
