import { AppDocument, ChunkingConfig } from "../../src/types";
import { DatabaseManager } from "./DatabaseManager";
import { PostgresManager } from "./PostgresManager";
import { OllamaManager } from "./OllamaManager";
import { OpenAIManager } from "./OpenAIManager";
import fs from "fs/promises";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const pdf = require("pdf-parse");

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

    const documents = (
      this.db.getProjectDocuments(projectId) as Document[]
    ).filter((d) => d.status === "pending" || d.status === "failed");

    if (documents.length === 0)
      return { processed: 0, message: "No pending documents" };

    const vectorConfig = project.vector_store_config;
    if (!vectorConfig || !vectorConfig.url)
      throw new Error("Vector Store not configured");

    // Ensure tables exist
    await this.pg.ensureTables(vectorConfig.url, vectorConfig);

    let processedCount = 0;

    for (const d of documents) {
      const doc = d as unknown as AppDocument;
      try {
        this.db.updateDocumentStatus(doc.id, "processing");

        // 1. Read Content
        const content = await this.readDocument(doc);
        if (!content || !content.trim()) {
          throw new Error("Empty document content");
        }

        // 2. Chunking
        const chunkConfig = project.chunking_config || {
          strategy: "fixed",
          chunk_size: 1000,
          chunk_overlap: 100,
        };
        const chunks = this.chunkText(content, chunkConfig);
        console.log(`Generated ${chunks.length} chunks for doc ${doc.name}`);

        const chunksData = [];
        const embeddingsData = [];

        // 3. Generate Embeddings & Prepare Data
        for (let i = 0; i < chunks.length; i++) {
          const chunkText = chunks[i];
          const chunkId = uuidv4();
          let embedding: number[] = [];

          if (project.embedding_config.provider === "ollama") {
            const url =
              project.embedding_config.api_key_ref || "http://localhost:11434"; // Temp usage of api_key_ref field for URL
            embedding = await this.ollama.getEmbedding(
              url,
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
        // We'll update the status to failed but also log the error message if possible
        this.db.updateDocumentStatus(doc.id, "failed");
      }
    }

    return { processed: processedCount, total: documents.length };
  }

  private async readDocument(doc: AppDocument): Promise<string> {
    if (doc.source_type === "url") {
      // TODO: Implement URL fetching with cheerio/puppeteer
      throw new Error("URL processing not yet implemented");
    }

    const ext = path.extname(doc.source_path).toLowerCase();

    try {
      if (ext === ".pdf") {
        const dataBuffer = await fs.readFile(doc.source_path);
        const data = await pdf(dataBuffer);
        return data.text;
      } else if ([".txt", ".md", ".json", ".csv"].includes(ext)) {
        return await fs.readFile(doc.source_path, "utf-8");
      } else {
        throw new Error(`Unsupported file extension: ${ext}`);
      }
    } catch (e) {
      throw new Error(`Error reading file: ${(e as Error).message}`);
    }
  }

  private chunkText(text: string, config: ChunkingConfig): string[] {
    const strategy = config.strategy || "fixed";
    const chunkSize = config.chunk_size || 1000;
    const chunkOverlap = config.chunk_overlap || 100;

    if (strategy === "sentence") {
      return this.chunkBySentence(text, chunkSize);
    } else {
      return this.chunkFixed(text, chunkSize, chunkOverlap);
    }
  }

  private chunkFixed(text: string, size: number, overlap: number): string[] {
    if (size <= 0) size = 1000;
    if (overlap >= size) overlap = size - 10;
    if (overlap < 0) overlap = 0;

    const chunks: string[] = [];
    let start = 0;

    while (start < text.length) {
      const end = Math.min(start + size, text.length);
      chunks.push(text.slice(start, end));
      if (end === text.length) break;
      start += size - overlap;
    }

    return chunks;
  }

  private chunkBySentence(text: string, size: number): string[] {
    // Naive sentence splitting.
    // A better approach depends on 'natural' or 'compromise' libraries,
    // but regex is fine for MVP.
    const sentences = text.match(/[^.!?]+[.!?]+(\s+|$)/g) || [text];

    const chunks: string[] = [];
    let currentChunk: string[] = [];
    let currentLength = 0;

    // Use a simple sliding window of sentences
    for (let i = 0; i < sentences.length; i++) {
      const sentence = sentences[i];

      // If adding this sentence exceeds size, push current chunk
      if (currentLength + sentence.length > size && currentChunk.length > 0) {
        chunks.push(currentChunk.join("").trim());

        // Handle overlap: keep last N sentences that fit within overlap limit?
        // Simplified: Just clear and start new.
        // Real overlap with sentences is tricky without token counting.
        // Let's implement a basic overlap: keep the last sentence if it is small enough.

        const lastSentence = currentChunk[currentChunk.length - 1];
        currentChunk = [];
        currentLength = 0;

        // Very basic overlap logic
        if (lastSentence && lastSentence.length < size) {
          currentChunk.push(lastSentence);
          currentLength += lastSentence.length;
        }
      }

      currentChunk.push(sentence);
      currentLength += sentence.length;
    }

    if (currentChunk.length > 0) {
      chunks.push(currentChunk.join("").trim());
    }

    return chunks;
  }

  async searchProject(projectId: string, query: string, limit: number = 5) {
    const project = this.db.getProject(projectId);
    if (!project) throw new Error("Project not found");

    const vectorConfig = project.vector_store_config;
    if (!vectorConfig || !vectorConfig.url)
      throw new Error("Vector Store not configured");

    let queryVector: number[] = [];

    // Generate embedding for the query
    if (project.embedding_config.provider === "ollama") {
      const url =
        project.embedding_config.api_key_ref || "http://localhost:11434";
      queryVector = await this.ollama.getEmbedding(
        url,
        project.embedding_config.model,
        query,
      );
    } else if (project.embedding_config.provider === "openai") {
      queryVector = await this.openai.getEmbedding(
        project.embedding_config.api_key_ref,
        project.embedding_config.model,
        query,
      );
    }

    if (queryVector.length === 0) {
      throw new Error("Failed to generate embedding for query");
    }

    // Search in Postgres
    return await this.pg.searchVectors(
      vectorConfig.url,
      vectorConfig,
      queryVector,
      limit,
    );
  }
}
