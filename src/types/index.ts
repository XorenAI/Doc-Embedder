export interface Project {
  id: string;
  name: string;
  description: string;
  tags: string[];
  embedding_config: EmbeddingConfig | null;
  chunking_config: ChunkingConfig | null;
  vector_store_config: VectorStoreConfig | null;
  vector_store_connection_id: string | null;
  created_at: string;
  updated_at: string;
  archived: boolean;
  document_count?: number;
  chunk_count?: number;
  color?: string;
}

export interface EmbeddingConfig {
  provider: "openai" | "cohere" | "voyage" | "ollama" | "huggingface";
  model: string;
  dimensions: number;
  api_key_ref?: string;
}

export interface VectorStoreConfig {
  provider: "pgvector" | "chroma" | "qdrant";
  url?: string;
  api_key?: string;
  documentTable?: string;
  chunkTable?: string;
  embeddingTable?: string;
}

export interface ChunkingConfig {
  strategy: "fixed" | "sentence" | "paragraph" | "semantic" | "recursive";
  chunk_size: number;
  chunk_overlap: number;
  preprocessing_rules?: Record<string, unknown>;
}

export interface AppDocument {
  id: string;
  project_id: string;
  name: string;
  source_type: "file" | "url";
  source_path: string;
  content_hash?: string;
  metadata?: Record<string, unknown>;
  status: "pending" | "processing" | "completed" | "failed";
  version: number;
  created_at: string;
  processed_at?: string;
}

export interface SearchResult {
  content: string;
  metadata?: Record<string, unknown>;
  document_name: string;
  source_path: string;
  similarity: number;
}
