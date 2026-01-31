import { VectorStoreConfig, AppDocument } from "../../src/types";
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
      const res = await client.query(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_type = 'BASE TABLE';
      `);

      const tables = res.rows.map(
        (row: { table_name: string }) => row.table_name,
      );
      await client.end();

      return { success: true, tables };
    } catch (error) {
      try {
        await client.end();
      } catch {
        /* ignore */
      }
      return { success: false, error: (error as Error).message };
    }
  }

  async insertVectorData(
    connectionString: string,
    config: VectorStoreConfig,
    doc: AppDocument,
    documentContent: string,
    embeddingModel: string,
    chunks: {
      id: string;
      documentId: string;
      content: string;
      contentHash: string;
      embeddingId: string;
    }[],
    embeddings: number[][],
  ) {
    const docTable = config.documentTable || "documents";
    const chunkTable = config.chunkTable || "chunks";
    const embTable = config.embeddingTable || "embeddings";

    const client = new Client({ connectionString });
    try {
      await client.connect();
      await client.query("BEGIN");

      // Insert Document
      await client.query(
        `INSERT INTO ${docTable} (document_id, source, title, content, doc_metadata, created_at) VALUES ($1, $2, $3, $4, $5, NOW()) ON CONFLICT (document_id) DO NOTHING`,
        [
          doc.id,
          doc.source_type,
          doc.name,
          documentContent,
          doc.metadata ? JSON.stringify(doc.metadata) : null,
        ],
      );

      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        const vector = embeddings[i];

        // Insert Chunk
        await client.query(
          `INSERT INTO ${chunkTable} (chunk_id, document_id, content, content_hash, created_at) VALUES ($1, $2, $3, $4, NOW()) ON CONFLICT (chunk_id) DO NOTHING`,
          [chunk.id, chunk.documentId, chunk.content, chunk.contentHash],
        );

        // Insert Embedding
        const vectorStr = `[${vector.join(",")}]`;
        await client.query(
          `INSERT INTO ${embTable} (embedding_id, chunk_id, embedding, model, created_at) VALUES ($1, $2, $3, $4, NOW()) ON CONFLICT (embedding_id) DO NOTHING`,
          [chunk.embeddingId, chunk.id, vectorStr, embeddingModel],
        );
      }

      await client.query("COMMIT");
      await client.end();
      return true;
    } catch (e) {
      await client.query("ROLLBACK");
      try {
        await client.end();
      } catch {
        /* ignore */
      }
      throw e;
    }
  }

  async searchVectors(
    connectionString: string,
    config: VectorStoreConfig,
    queryVector: number[],
    limit: number = 5,
  ) {
    const docTable = config.documentTable || "documents";
    const chunkTable = config.chunkTable || "chunks";
    const embTable = config.embeddingTable || "embeddings";

    const client = new Client({ connectionString });
    try {
      await client.connect();

      const vectorStr = `[${queryVector.join(",")}]`;

      const query = `
        SELECT 
          c.content, 
          d.title as document_name, 
          (1 - (e.embedding <=> $1)) as similarity
        FROM ${embTable} e
        JOIN ${chunkTable} c ON e.chunk_id = c.chunk_id
        JOIN ${docTable} d ON c.document_id = d.document_id
        ORDER BY e.embedding <=> $1
        LIMIT $2;
      `;

      const res = await client.query(query, [vectorStr, limit]);
      await client.end();
      return res.rows;
    } catch (e) {
      try {
        await client.end();
      } catch {
        /* ignore */
      }
      throw e;
    }
  }

  async deleteDocumentVectors(
    connectionString: string,
    config: VectorStoreConfig,
    documentId: string,
  ) {
    const docTable = config.documentTable || "documents";
    const chunkTable = config.chunkTable || "chunks";
    const embTable = config.embeddingTable || "embeddings";

    const client = new Client({ connectionString });
    try {
      await client.connect();
      await client.query("BEGIN");

      // 1. Delete Embeddings for chunks belonging to this document
      await client.query(
        `DELETE FROM ${embTable} 
         WHERE chunk_id IN (
           SELECT chunk_id FROM ${chunkTable} WHERE document_id = $1
         )`,
        [documentId],
      );

      // 2. Delete Chunks
      await client.query(`DELETE FROM ${chunkTable} WHERE document_id = $1`, [
        documentId,
      ]);

      // 3. Delete Document record
      await client.query(`DELETE FROM ${docTable} WHERE document_id = $1`, [
        documentId,
      ]);

      await client.query("COMMIT");
      await client.end();
      return { success: true };
    } catch (e) {
      await client.query("ROLLBACK");
      try {
        await client.end();
      } catch {
        /* ignore */
      }
      return { success: false, error: (e as Error).message };
    }
  }
}
