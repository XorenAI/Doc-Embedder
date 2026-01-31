import { AppDocument, ChunkingConfig } from "../../src/types";
import { DatabaseManager } from "./DatabaseManager";
import { PostgresManager } from "./PostgresManager";
import { OllamaManager } from "./OllamaManager";
import { OpenAIManager } from "./OpenAIManager";
import { createRequire } from "module";
import { v4 as uuidv4 } from "uuid";
import fs from "fs/promises";
import path from "path";

const require = createRequire(import.meta.url);
// Load these lazily at point of use to avoid bundler issues
const mammoth = require("mammoth");
const cheerio = require("cheerio");

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
      this.db.getProjectDocuments(projectId) as AppDocument[]
    ).filter((d) => d.status === "pending" || d.status === "failed");

    console.log(
      `[ProcessingManager] Found ${documents.length} pending/failed documents for project ${projectId}. Total docs: ${this.db.getProjectDocuments(projectId).length}`,
    );

    if (documents.length === 0)
      return { processed: 0, message: "No pending documents" };

    const vectorConfig = project.vector_store_config;
    if (!vectorConfig || !vectorConfig.url)
      throw new Error("Vector Store not configured");

    // Ensure tables exist
    await this.pg.ensureTables(vectorConfig.url, vectorConfig);

    let processedCount = 0;

    for (const d of documents) {
      const doc = d; // Already cast above
      try {
        console.log(
          `[ProcessingManager] Processing document: ${doc.name} (${doc.id})`,
        );
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
        console.log(
          `[ProcessingManager] Generated ${chunks.length} chunks for doc ${doc.name}`,
        );

        if (chunks.length === 0) {
          throw new Error("No chunks generated from document content");
        }

        const chunksData = [];
        const embeddingsData = [];

        // Validate embedding config
        if (!project.embedding_config || !project.embedding_config.provider) {
          throw new Error(
            "Embedding configuration not set. Please configure embedding provider in Settings.",
          );
        }
        if (!project.embedding_config.model) {
          throw new Error(
            "Embedding model not set. Please configure embedding model in Settings.",
          );
        }

        console.log(
          `[ProcessingManager] Using embedding provider: ${project.embedding_config.provider}, model: ${project.embedding_config.model}`,
        );

        // 3. Generate Embeddings & Prepare Data
        for (let i = 0; i < chunks.length; i++) {
          const chunkText = chunks[i];
          const chunkId = uuidv4();
          let embedding: number[] = [];

          if (project.embedding_config.provider === "ollama") {
            const url =
              project.embedding_config.api_key_ref || "http://localhost:11434";
            console.log(
              `[ProcessingManager] Getting embedding from Ollama: ${url}, chunk ${i + 1}/${chunks.length}`,
            );
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

          if (embedding && embedding.length > 0) {
            chunksData.push({
              id: chunkId,
              documentId: doc.id,
              content: chunkText,
              embeddingId: uuidv4(),
            });
            embeddingsData.push(embedding);
          } else {
            console.warn(
              `[ProcessingManager] Empty embedding for chunk ${i + 1}`,
            );
          }
        }

        console.log(
          `[ProcessingManager] Successfully embedded ${chunksData.length}/${chunks.length} chunks`,
        );

        // 4. Store in Postgres
        if (chunksData.length > 0) {
          console.log(
            `[ProcessingManager] Storing ${chunksData.length} chunks to PostgreSQL...`,
          );
          await this.pg.insertVectorData(
            vectorConfig.url,
            vectorConfig,
            doc,
            chunksData,
            embeddingsData,
          );
          console.log(`[ProcessingManager] Stored successfully!`);

          // Also store chunk records locally for counting
          // First delete any existing chunks from previous processing attempts
          this.db.deleteDocumentChunks(doc.id);
          for (let i = 0; i < chunksData.length; i++) {
            const chunk = chunksData[i];
            this.db.addChunk(doc.id, chunk.id, chunk.content, i);
          }
        } else {
          throw new Error("No chunks with embeddings were generated");
        }

        // 5. Update Status
        this.db.updateDocumentStatus(doc.id, "completed");
        processedCount++;
        console.log(`[ProcessingManager] Document ${doc.name} completed.`);
      } catch (error) {
        console.error(
          `[ProcessingManager] Failed to process document ${doc.id}:`,
          error,
        );
        // We'll update the status to failed but also log the error message if possible
        this.db.updateDocumentStatus(doc.id, "failed");
      }
    }

    return { processed: processedCount, total: documents.length };
  }

  private async readDocument(doc: AppDocument): Promise<string> {
    // Handle URL source type
    if (doc.source_type === "url") {
      try {
        console.log(`[ProcessingManager] Fetching URL: ${doc.source_path}`);
        const response = await fetch(doc.source_path, {
          headers: {
            "User-Agent": "Mozilla/5.0 (compatible; DocEmbedder/1.0)",
          },
        });
        if (!response.ok) {
          throw new Error(
            `HTTP error: ${response.status} ${response.statusText}`,
          );
        }
        const html = await response.text();
        const $ = cheerio.load(html);

        // Remove script, style, nav, footer, and other non-content elements
        $(
          "script, style, nav, footer, header, aside, iframe, noscript",
        ).remove();

        // Extract text from body or main content
        const mainContent =
          $("main, article, .content, #content, .post").text() ||
          $("body").text();

        return mainContent.replace(/\s+/g, " ").trim();
      } catch (e) {
        throw new Error(`Error fetching URL: ${(e as Error).message}`);
      }
    }

    const ext = path.extname(doc.source_path).toLowerCase();

    try {
      if (ext === ".pdf") {
        const dataBuffer = await fs.readFile(doc.source_path);

        try {
          // pdf-parse v2.x uses a class-based API
          const { PDFParse } = await import("pdf-parse");
          const parser = new PDFParse({ data: dataBuffer });
          const textResult = await parser.getText();
          await parser.destroy();
          return textResult.text;
        } catch (importErr) {
          console.log(
            "[ProcessingManager] Dynamic import failed, trying require:",
            importErr,
          );
          // Fallback to require
          const pdfModule = require("pdf-parse");

          if (pdfModule.PDFParse) {
            // v2.x class-based API
            const parser = new pdfModule.PDFParse({ data: dataBuffer });
            const textResult = await parser.getText();
            await parser.destroy();
            return textResult.text;
          } else if (typeof pdfModule === "function") {
            // v1.x function-based API
            const data = await pdfModule(dataBuffer);
            return data.text;
          } else if (typeof pdfModule.default === "function") {
            const data = await pdfModule.default(dataBuffer);
            return data.text;
          } else {
            throw new Error(`Cannot parse PDF: unsupported pdf-parse version`);
          }
        }
      } else if (ext === ".docx") {
        // DOCX support using mammoth
        console.log(
          `[ProcessingManager] Extracting text from DOCX: ${doc.source_path}`,
        );
        const result = await mammoth.extractRawText({ path: doc.source_path });
        return result.value;
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
