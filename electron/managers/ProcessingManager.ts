import { DatabaseManager } from "./DatabaseManager";
import { PostgresManager } from "./PostgresManager";
import { OllamaManager } from "./OllamaManager";
import { OpenAIManager } from "./OpenAIManager";
import fs from "fs/promises";
import { v4 as uuidv4 } from "uuid";

export class ProcessingManager {
  constructor(
    private db: DatabaseManager,
    private pg: PostgresManager,
    private ollama: OllamaManager,
    private openai: OpenAIManager,
  ) {}

  async processProject(projectId: string) {
    const project = this.db.getProject(projectId);
    if (!project) throw new Error("Project not found");

    const documents = this.db
      .getProjectDocuments(projectId)
      .filter((d: any) => d.status === "pending" || d.status === "failed");
    if (documents.length === 0)
      return { processed: 0, message: "No pending documents" };

    const vectorConfig = project.vector_store_config;
    // Basic validation
    if (!vectorConfig || !vectorConfig.url)
      throw new Error("Vector Store not configured");

    // Ensure tables exist
    await this.pg.ensureTables(vectorConfig.url, vectorConfig);

    let processedCount = 0;

    for (const d of documents) {
      const doc = d as any;
      try {
        // 1. Read Content
        let content = "";
        if (doc.source_type === "file") {
          content = await fs.readFile(doc.source_path, "utf-8");
        } else {
          // TODO: URL fetching
          continue;
        }

        // 2. Chunking (Simple split by paragraphs or max chars for now)
        // A robust chunker would scan token limits. We'll do a naive 1000 char split for MVP.
        const rawChunks = this.chunkText(content, 1000);

        const chunksData = [];
        const embeddingsData = [];

        for (const chunkText of rawChunks) {
          const chunkId = uuidv4();
          let embedding: number[] = [];

          // 3. Generate Embedding
          if (project.embedding_config.provider === "ollama") {
            embedding = await this.ollama.getEmbedding(
              project.embedding_config.api_key_ref || "http://localhost:11434",
              project.embedding_config.model,
              chunkText,
            );
          } else if (project.embedding_config.provider === "openai") {
            embedding = await this.openai.getEmbedding(
              project.embedding_config.api_key_ref,
              project.embedding_config.model,
              chunkText,
            );
          }

          if (embedding.length > 0) {
            chunksData.push({
              id: chunkId,
              documentId: doc.id,
              content: chunkText,
              embeddingId: uuidv4(),
            });
            embeddingsData.push(embedding);
          }
        }

        // 4. Store in Postgres
        if (chunksData.length > 0) {
          await this.pg.insertVectorData(
            vectorConfig.url,
            vectorConfig,
            doc,
            chunksData,
            embeddingsData,
          );
        }

        // 5. Update Status
        this.db.updateDocumentStatus(doc.id, "processed");
        processedCount++;
      } catch (error) {
        console.error(`Failed to process document ${doc.id}:`, error);
        this.db.updateDocumentStatus(doc.id, "failed");
      }
    }

    return { processed: processedCount, total: documents.length };
  }

  private chunkText(text: string, maxLength: number): string[] {
    const chunks: string[] = [];
    let currentChunk = "";

    const sentences = text.split(/([.?!])\s+/); // Simple sentence split approximation

    for (const part of sentences) {
      if (currentChunk.length + part.length > maxLength) {
        if (currentChunk.trim()) chunks.push(currentChunk.trim());
        currentChunk = "";
      }
      currentChunk += part;
    }
    if (currentChunk.trim()) chunks.push(currentChunk.trim());

    if (chunks.length === 0 && text.trim()) return [text.trim()];

    return chunks;
  }
}
