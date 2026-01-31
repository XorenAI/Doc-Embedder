# Software Requirements Document (SRD)

## RAG Embedding Manager

### Desktop Application for Automated Document Embedding & Vector Storage

**Version:** 1.0.0  
**Date:** January 31, 2026  
**Tech Stack:** Electron + Vite + Bun

---

## 1. Introduction

### 1.1 Purpose

This document defines the software requirements for RAG Embedding Manager, a desktop application that enables users to create, manage, and store vector embeddings from various document sources for Retrieval-Augmented Generation (RAG) applications.

### 1.2 Scope

The application will provide a unified interface for importing documents (PDFs, web pages, text files), configuring embedding models, processing documents into vector embeddings, and storing them in various vector databases—all organized within a project-based workspace.

### 1.3 Target Users

- AI/ML engineers building RAG pipelines
- Developers integrating semantic search
- Data scientists managing document corpora
- Technical teams maintaining knowledge bases

---

## 2. System Overview

### 2.1 Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Electron Main Process                     │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │   Project   │  │  Document   │  │   Vector Store      │  │
│  │   Manager   │  │  Processor  │  │   Connector         │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │  Embedding  │  │   Queue     │  │   Credential        │  │
│  │   Engine    │  │   Manager   │  │   Vault             │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                            │
┌─────────────────────────────────────────────────────────────┐
│                   Electron Renderer Process                  │
│         (Vite + React/Vue + TailwindCSS)                    │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 Technology Stack

- **Runtime:** Electron 28+
- **Build Tool:** Vite 5+
- **Package Manager:** Bun 1.0+
- **Frontend Framework:** React 18+ or Vue 3+
- **Styling:** TailwindCSS
- **Local Database:** SQLite (via better-sqlite3)
- **IPC:** Electron IPC with typed channels

---

## 3. Functional Requirements

### 3.1 Project Management (FR-PM)

| ID        | Requirement                                                                                                        | Priority |
| --------- | ------------------------------------------------------------------------------------------------------------------ | -------- |
| FR-PM-001 | Users shall create, rename, duplicate, and delete projects                                                         | High     |
| FR-PM-002 | Each project shall have isolated configuration for embedding model, vector store connection, and chunking strategy | High     |
| FR-PM-003 | Users shall export project configuration as JSON for backup/sharing                                                | Medium   |
| FR-PM-004 | Users shall import project configuration from JSON                                                                 | Medium   |
| FR-PM-005 | Application shall display a dashboard showing all projects with document count, chunk count, and last activity     | High     |
| FR-PM-006 | Users shall archive projects without deleting data                                                                 | Low      |
| FR-PM-007 | Users shall add tags and descriptions to projects for organization                                                 | Medium   |

### 3.2 Document Management (FR-DM)

| ID        | Requirement                                                                    | Priority |
| --------- | ------------------------------------------------------------------------------ | -------- |
| FR-DM-001 | Users shall import PDF files via drag-drop or file picker                      | High     |
| FR-DM-002 | Users shall import web pages via URL input                                     | High     |
| FR-DM-003 | Users shall import plain text files (.txt, .md)                                | High     |
| FR-DM-004 | Users shall import Word documents (.docx)                                      | Medium   |
| FR-DM-005 | Users shall import HTML files                                                  | Medium   |
| FR-DM-006 | System shall perform OCR on scanned PDFs using Tesseract                       | Medium   |
| FR-DM-007 | System shall detect and warn about duplicate documents based on content hash   | High     |
| FR-DM-008 | Users shall preview document content before processing                         | Medium   |
| FR-DM-009 | Users shall delete documents and their associated embeddings                   | High     |
| FR-DM-010 | System shall track document versions and allow re-embedding on update          | Medium   |
| FR-DM-011 | Users shall batch import multiple files simultaneously                         | High     |
| FR-DM-012 | System shall extract and display document metadata (title, author, page count) | Low      |

### 3.3 Text Processing & Chunking (FR-TC)

| ID        | Requirement                                                                     | Priority |
| --------- | ------------------------------------------------------------------------------- | -------- |
| FR-TC-001 | Users shall configure chunk size (token count: 128-8192)                        | High     |
| FR-TC-002 | Users shall configure chunk overlap (0-50% of chunk size)                       | High     |
| FR-TC-003 | System shall support fixed-size chunking strategy                               | High     |
| FR-TC-004 | System shall support sentence-based chunking                                    | High     |
| FR-TC-005 | System shall support paragraph-based chunking                                   | High     |
| FR-TC-006 | System shall support semantic chunking (using embedding similarity)             | Medium   |
| FR-TC-007 | System shall support recursive character splitting                              | Medium   |
| FR-TC-008 | Users shall define custom text preprocessing rules (regex patterns for removal) | Medium   |
| FR-TC-009 | System shall automatically remove headers/footers from PDFs                     | Medium   |
| FR-TC-010 | Users shall preview chunks before embedding                                     | High     |
| FR-TC-011 | System shall preserve source metadata (page number, section) per chunk          | High     |

### 3.4 Embedding Configuration (FR-EC)

| ID        | Requirement                                                                                            | Priority |
| --------- | ------------------------------------------------------------------------------------------------------ | -------- |
| FR-EC-001 | System shall support OpenAI embedding models (text-embedding-3-small, text-embedding-3-large, ada-002) | High     |
| FR-EC-002 | System shall support Cohere embedding models (embed-english-v3.0, embed-multilingual-v3.0)             | Medium   |
| FR-EC-003 | System shall support Voyage AI embedding models                                                        | Medium   |
| FR-EC-004 | System shall support local models via Ollama                                                           | High     |
| FR-EC-005 | System shall support HuggingFace models via local inference                                            | Medium   |
| FR-EC-006 | Users shall configure API keys per provider with secure storage                                        | High     |
| FR-EC-007 | System shall display estimated cost before processing (for paid APIs)                                  | High     |
| FR-EC-008 | Users shall set rate limits to control API usage                                                       | Medium   |
| FR-EC-009 | System shall provide model comparison tool (embed same doc with multiple models)                       | Low      |
| FR-EC-010 | System shall cache embeddings locally to avoid re-computation                                          | High     |

### 3.5 Vector Store Integration (FR-VS)

| ID        | Requirement                                                            | Priority |
| --------- | ---------------------------------------------------------------------- | -------- |
| FR-VS-001 | System shall support PostgreSQL with pgvector extension                | High     |
| FR-VS-002 | System shall support Pinecone                                          | High     |
| FR-VS-003 | System shall support Qdrant (cloud and self-hosted)                    | Medium   |
| FR-VS-004 | System shall support Weaviate                                          | Medium   |
| FR-VS-005 | System shall support ChromaDB (local)                                  | High     |
| FR-VS-006 | System shall support Milvus                                            | Low      |
| FR-VS-007 | Users shall create and manage multiple connection profiles             | High     |
| FR-VS-008 | Users shall label connections (dev, staging, prod)                     | Medium   |
| FR-VS-009 | System shall test connection before saving                             | High     |
| FR-VS-010 | System shall auto-create collections/indexes with appropriate settings | Medium   |
| FR-VS-011 | Users shall configure index type and distance metric per connection    | Medium   |

### 3.6 Processing Queue & Automation (FR-PQ)

| ID        | Requirement                                                                                   | Priority |
| --------- | --------------------------------------------------------------------------------------------- | -------- |
| FR-PQ-001 | System shall queue documents for batch processing                                             | High     |
| FR-PQ-002 | System shall display real-time progress (documents processed, chunks created, time remaining) | High     |
| FR-PQ-003 | Users shall pause, resume, and cancel processing jobs                                         | High     |
| FR-PQ-004 | System shall retry failed documents with exponential backoff                                  | High     |
| FR-PQ-005 | Users shall configure concurrent processing limit                                             | Medium   |
| FR-PQ-006 | Users shall set up watch folders for auto-import                                              | Medium   |
| FR-PQ-007 | Users shall schedule periodic re-indexing for URL sources                                     | Medium   |
| FR-PQ-008 | System shall send desktop notifications on job completion                                     | Medium   |
| FR-PQ-009 | System shall support webhook notifications to external systems                                | Low      |

### 3.7 Search & Testing (FR-ST)

| ID        | Requirement                                                                    | Priority |
| --------- | ------------------------------------------------------------------------------ | -------- |
| FR-ST-001 | Users shall perform semantic search queries against project embeddings         | High     |
| FR-ST-002 | System shall display top-k results with relevance scores                       | High     |
| FR-ST-003 | System shall highlight matched chunks in source document context               | Medium   |
| FR-ST-004 | Users shall configure search parameters (top-k, similarity threshold, filters) | High     |
| FR-ST-005 | Users shall save and replay test queries                                       | Medium   |
| FR-ST-006 | System shall export search results as JSON/CSV                                 | Medium   |
| FR-ST-007 | Users shall compare search results across different embedding models           | Low      |

### 3.8 Analytics & Monitoring (FR-AN)

| ID        | Requirement                                                                                           | Priority |
| --------- | ----------------------------------------------------------------------------------------------------- | -------- |
| FR-AN-001 | System shall display project dashboard (document count, chunk count, vector dimensions, storage size) | High     |
| FR-AN-002 | System shall display processing history with timestamps and status                                    | High     |
| FR-AN-003 | System shall track and display API usage and costs per project                                        | Medium   |
| FR-AN-004 | System shall maintain error logs with stack traces                                                    | High     |
| FR-AN-005 | Users shall export logs for debugging                                                                 | Medium   |
| FR-AN-006 | System shall display embedding distribution visualization                                             | Low      |

---

## 4. Non-Functional Requirements

### 4.1 Performance (NFR-P)

| ID        | Requirement                                          | Target         |
| --------- | ---------------------------------------------------- | -------------- |
| NFR-P-001 | Application cold start time                          | < 3 seconds    |
| NFR-P-002 | Document import (single PDF < 10MB)                  | < 2 seconds    |
| NFR-P-003 | Chunk preview generation                             | < 500ms        |
| NFR-P-004 | Search query response (local ChromaDB, 100k vectors) | < 200ms        |
| NFR-P-005 | UI responsiveness during background processing       | No frame drops |
| NFR-P-006 | Memory usage (idle)                                  | < 200MB        |
| NFR-P-007 | Memory usage (processing 1000 documents)             | < 2GB          |

### 4.2 Security (NFR-S)

| ID        | Requirement                                                                                                |
| --------- | ---------------------------------------------------------------------------------------------------------- |
| NFR-S-001 | API keys shall be stored in OS keychain (macOS Keychain, Windows Credential Manager, Linux Secret Service) |
| NFR-S-002 | Database connection strings shall be encrypted at rest                                                     |
| NFR-S-003 | Application shall not transmit telemetry without explicit user consent                                     |
| NFR-S-004 | Local SQLite database shall be encrypted using SQLCipher                                                   |
| NFR-S-005 | Application shall sanitize file paths to prevent directory traversal                                       |

### 4.3 Reliability (NFR-R)

| ID        | Requirement                                                              |
| --------- | ------------------------------------------------------------------------ |
| NFR-R-001 | Application shall gracefully handle API rate limits with automatic retry |
| NFR-R-002 | Application shall recover from crashes without data loss (atomic writes) |
| NFR-R-003 | Processing jobs shall be resumable after application restart             |
| NFR-R-004 | Application shall validate document integrity before processing          |

### 4.4 Usability (NFR-U)

| ID        | Requirement                                                     |
| --------- | --------------------------------------------------------------- |
| NFR-U-001 | Application shall provide keyboard shortcuts for common actions |
| NFR-U-002 | Application shall support light and dark themes                 |
| NFR-U-003 | Application shall display contextual help tooltips              |
| NFR-U-004 | Application shall remember window size and position             |
| NFR-U-005 | Application shall provide first-run onboarding wizard           |

### 4.5 Compatibility (NFR-C)

| ID        | Requirement                                                  |
| --------- | ------------------------------------------------------------ |
| NFR-C-001 | Application shall run on macOS 12+ (Intel and Apple Silicon) |
| NFR-C-002 | Application shall run on Windows 10/11 (x64)                 |
| NFR-C-003 | Application shall run on Ubuntu 22.04+ / Debian 11+          |
| NFR-C-004 | Application shall support system proxy settings              |

---

## 5. Data Model

### 5.1 Core Entities

```
Project
├── id: UUID
├── name: string
├── description: string
├── tags: string[]
├── embedding_config: EmbeddingConfig
├── chunking_config: ChunkingConfig
├── vector_store_connection_id: UUID
├── created_at: timestamp
├── updated_at: timestamp
└── archived: boolean

Document
├── id: UUID
├── project_id: UUID (FK)
├── name: string
├── source_type: enum (file, url)
├── source_path: string
├── content_hash: string
├── metadata: JSON
├── status: enum (pending, processing, completed, failed)
├── version: integer
├── created_at: timestamp
└── processed_at: timestamp

Chunk
├── id: UUID
├── document_id: UUID (FK)
├── content: text
├── token_count: integer
├── position: integer
├── metadata: JSON (page_number, section, etc.)
├── embedding_id: string (external vector store ID)
└── created_at: timestamp

VectorStoreConnection
├── id: UUID
├── name: string
├── provider: enum (pgvector, pinecone, qdrant, weaviate, chroma, milvus)
├── config: JSON (encrypted)
├── environment: enum (dev, staging, prod)
├── created_at: timestamp
└── last_tested_at: timestamp

EmbeddingConfig
├── provider: enum (openai, cohere, voyage, ollama, huggingface)
├── model: string
├── dimensions: integer
└── api_key_ref: string (keychain reference)

ChunkingConfig
├── strategy: enum (fixed, sentence, paragraph, semantic, recursive)
├── chunk_size: integer
├── chunk_overlap: integer
└── preprocessing_rules: JSON

ProcessingJob
├── id: UUID
├── project_id: UUID (FK)
├── status: enum (queued, running, paused, completed, failed)
├── total_documents: integer
├── processed_documents: integer
├── total_chunks: integer
├── error_log: JSON
├── started_at: timestamp
└── completed_at: timestamp
```

---

## 6. User Interface Specifications

### 6.1 Main Views

1. **Dashboard View** - Overview of all projects with quick stats
2. **Project View** - Single project workspace with tabs:
   - Documents (list, import, preview)
   - Configuration (embedding, chunking, vector store)
   - Processing (queue, progress, history)
   - Search (query playground)
   - Analytics (stats, logs)
3. **Settings View** - Global settings:
   - API key management
   - Vector store connections
   - Theme preferences
   - Default configurations

### 6.2 Key Interactions

- Drag-and-drop file import
- Right-click context menus
- Inline editing for names/descriptions
- Modal dialogs for configuration
- Toast notifications for status updates
- Command palette (Cmd/Ctrl + K)

---

## 7. API & Integration Specifications

### 7.1 Embedding Provider APIs

| Provider | Endpoint                         | Auth Method  |
| -------- | -------------------------------- | ------------ |
| OpenAI   | `api.openai.com/v1/embeddings`   | Bearer token |
| Cohere   | `api.cohere.ai/v1/embed`         | Bearer token |
| Voyage   | `api.voyageai.com/v1/embeddings` | Bearer token |
| Ollama   | `localhost:11434/api/embeddings` | None (local) |

### 7.2 Vector Store Protocols

| Store    | Protocol       | Default Port |
| -------- | -------------- | ------------ |
| pgvector | PostgreSQL     | 5432         |
| Pinecone | HTTPS REST     | 443          |
| Qdrant   | gRPC / REST    | 6333/6334    |
| Weaviate | GraphQL / REST | 8080         |
| ChromaDB | REST           | 8000         |

---

## 8. Deployment & Distribution

### 8.1 Build Outputs

- macOS: DMG installer + notarized app bundle
- Windows: NSIS installer + portable ZIP
- Linux: AppImage + DEB + RPM

### 8.2 Auto-Update

- Electron-updater with GitHub Releases backend
- Differential updates where possible
- User-configurable update channel (stable/beta)

---

## 9. Development Milestones

### Phase 1: Core MVP (Weeks 1-4)

- Project CRUD operations
- PDF import and text extraction
- Fixed-size chunking
- OpenAI embeddings integration
- ChromaDB local storage
- Basic search playground

### Phase 2: Enhanced Processing (Weeks 5-8)

- Additional document formats (URL, DOCX, MD)
- Multiple chunking strategies
- Processing queue with progress
- Duplicate detection
- Cost estimation

### Phase 3: Multi-Provider Support (Weeks 9-12)

- Additional embedding providers (Cohere, Ollama)
- Additional vector stores (pgvector, Pinecone, Qdrant)
- Connection profiles
- Secure credential storage

### Phase 4: Advanced Features (Weeks 13-16)

- Watch folders and automation
- Analytics dashboard
- Export/import configurations
- Model comparison tool
- OCR support

### Phase 5: Polish & Release (Weeks 17-20)

- Performance optimization
- Cross-platform testing
- Auto-update system
- Documentation
- Beta release

---

## 10. Appendices

### A. Glossary

| Term            | Definition                                                                    |
| --------------- | ----------------------------------------------------------------------------- |
| Chunk           | A segment of text extracted from a document for embedding                     |
| Embedding       | A vector representation of text in high-dimensional space                     |
| RAG             | Retrieval-Augmented Generation - enhancing LLM outputs with retrieved context |
| Vector Store    | A database optimized for storing and querying vector embeddings               |
| Semantic Search | Finding content based on meaning rather than keyword matching                 |

### B. References

- OpenAI Embeddings Documentation
- LangChain Text Splitters
- Electron Security Best Practices
- OWASP Desktop App Security Guidelines

---

**Document Control**

| Version | Date       | Author | Changes         |
| ------- | ---------- | ------ | --------------- |
| 1.0.0   | 2026-01-31 | —      | Initial release |

# Additional Feature: Vector Space Explorer (FR-VE)

## Overview

This feature allows users to connect to existing pgvector databases, browse tables containing embeddings, and visualize/explore the document space. This is essential for users who want to inspect what's already been embedded, understand clustering patterns, or manage existing vector data.

---

## Functional Requirements

| ID        | Requirement                                                                                       | Priority |
| --------- | ------------------------------------------------------------------------------------------------- | -------- |
| FR-VE-001 | Users shall connect to any pgvector-enabled PostgreSQL database                                   | High     |
| FR-VE-002 | System shall auto-detect tables containing vector columns                                         | High     |
| FR-VE-003 | Users shall manually select/specify table and column mappings if auto-detect fails                | High     |
| FR-VE-004 | System shall display table schema (columns, types, row count, vector dimensions)                  | High     |
| FR-VE-005 | Users shall browse paginated list of documents/chunks in selected table                           | High     |
| FR-VE-006 | Users shall search/filter table contents by metadata columns                                      | Medium   |
| FR-VE-007 | Users shall preview full text content of any row                                                  | High     |
| FR-VE-008 | System shall visualize vectors in 2D/3D space using dimensionality reduction (UMAP/t-SNE/PCA)     | Medium   |
| FR-VE-009 | Users shall color-code visualization by metadata field (source document, category, etc.)          | Medium   |
| FR-VE-010 | Users shall click on points in visualization to view document details                             | Medium   |
| FR-VE-011 | Users shall perform similarity search directly from the explorer (click a point → find neighbors) | Medium   |
| FR-VE-012 | Users shall delete selected rows/vectors from the table                                           | Medium   |
| FR-VE-013 | Users shall export table contents as CSV/JSON                                                     | Low      |
| FR-VE-014 | System shall show cluster statistics (density, spread, outliers)                                  | Low      |
| FR-VE-015 | Users shall save table configurations as "views" for quick access                                 | Low      |

---

## Table Configuration Schema

```
VectorTableConfig
├── id: UUID
├── connection_id: UUID (FK to VectorStoreConnection)
├── table_name: string
├── schema_name: string (default: "public")
├── column_mappings: ColumnMappings
├── display_name: string (user-friendly alias)
├── created_at: timestamp
└── last_accessed_at: timestamp

ColumnMappings
├── id_column: string (primary key column)
├── vector_column: string (the pgvector column)
├── content_column: string (text content)
├── metadata_columns: string[] (additional columns to display)
├── timestamp_column: string (optional, for sorting)
└── source_column: string (optional, document origin)
```

---

## User Interface: Vector Space Explorer View

### Layout

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Vector Space Explorer                                          [+ Add] │
├─────────────────────────────────────────────────────────────────────────┤
│ ┌───────────────┐ ┌───────────────────────────────────────────────────┐ │
│ │ CONNECTIONS   │ │ TABLE: embeddings.document_chunks                 │ │
│ │               │ │ Rows: 45,231 | Dimensions: 1536 | Size: 892 MB    │ │
│ │ ▼ Production  │ ├───────────────────────────────────────────────────┤ │
│ │   • documents │ │ ┌─────────────────────────────────────┐           │ │
│ │   • chunks    │ │ │                                     │  [2D][3D] │ │
│ │   • qa_pairs  │ │ │      Vector Space Visualization     │  [UMAP]   │ │
│ │               │ │ │            (interactive)            │  [t-SNE]  │ │
│ │ ▶ Staging     │ │ │                                     │  [PCA]    │ │
│ │               │ │ │         ·  · ·    ·                 │           │ │
│ │ ▶ Development │ │ │       ·  ·    ·  · ·  ·             │  Color by:│ │
│ │               │ │ │     ·   ·  ·   ·    ·               │  [source] │ │
│ │               │ │ │        ·    ·  ·   ·                │           │ │
│ │               │ │ └─────────────────────────────────────┘           │ │
│ │               │ ├───────────────────────────────────────────────────┤ │
│ │               │ │ Search: [_____________________] [Filter ▼]        │ │
│ │               │ ├───────────────────────────────────────────────────┤ │
│ │               │ │ ID       │ Content (preview)      │ Source │ Date │ │
│ │               │ │──────────┼────────────────────────┼────────┼──────│ │
│ │               │ │ chunk_01 │ "The RAG pipeline..." │ doc1   │ 1/30 │ │
│ │               │ │ chunk_02 │ "Embeddings are..."   │ doc1   │ 1/30 │ │
│ │               │ │ chunk_03 │ "Vector databases..." │ doc2   │ 1/29 │ │
│ │               │ │ ...      │ ...                    │ ...    │ ...  │ │
│ │               │ ├───────────────────────────────────────────────────┤ │
│ │               │ │ ◀ Page 1 of 453 ▶        [Export] [Delete Selected]│ │
│ └───────────────┘ └───────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────┘
```

### Interaction Flows

**Adding a new table:**

1. Select connection from sidebar
2. Click "+ Add Table"
3. System queries `information_schema` to find vector columns
4. User selects table from dropdown (or enters manually)
5. System auto-maps columns based on common naming patterns
6. User reviews/adjusts column mappings
7. User assigns display name
8. Table appears in sidebar under connection

**Exploring vectors:**

1. Click table in sidebar → loads metadata and first page
2. Visualization renders asynchronously (samples 5000 points max for performance)
3. Hover on visualization point → tooltip shows preview
4. Click point → scrolls table to that row, opens detail panel
5. Right-click point → "Find similar" → runs k-NN query

**Similarity search from explorer:**

1. Click any row in table or point in visualization
2. Click "Find Similar" button
3. Configure k (number of neighbors) and threshold
4. Results displayed as highlighted points + filtered table

---

## Technical Implementation Notes

### Auto-Detection Query

```sql
SELECT
    t.table_schema,
    t.table_name,
    c.column_name,
    c.udt_name,
    (SELECT reltuples::bigint FROM pg_class WHERE relname = t.table_name) as row_estimate
FROM information_schema.tables t
JOIN information_schema.columns c
    ON t.table_name = c.table_name
    AND t.table_schema = c.table_schema
WHERE c.udt_name = 'vector'
    AND t.table_type = 'BASE TABLE'
ORDER BY t.table_schema, t.table_name;
```

### Dimensionality Reduction

For visualization, vectors must be reduced to 2D/3D:

| Method | Use Case                               | Performance           |
| ------ | -------------------------------------- | --------------------- |
| PCA    | Fast preview, linear relationships     | < 1s for 10k vectors  |
| t-SNE  | Cluster visualization, local structure | 5-30s for 10k vectors |
| UMAP   | Best overall, preserves global + local | 2-10s for 10k vectors |

Implementation options:

- **Client-side:** Use `umap-js` or `druid` for smaller datasets (< 10k)
- **Server-side:** For large datasets, compute reduction in background job and cache

### Sampling Strategy for Large Tables

```
If row_count <= 5,000:
    Load all vectors for visualization
Else if row_count <= 50,000:
    Random sample 5,000 vectors
    Show "Showing 5,000 of {total}" indicator
Else:
    Stratified sample by metadata column (if configured)
    Or random sample 5,000
    Offer "Load more" option
```

### Caching

- Cache dimensionality reduction results per table (invalidate on row count change)
- Cache column mappings in local SQLite
- Use cursor-based pagination for table browsing

---

## Updated Data Model Addition

```
VectorTableView (new entity)
├── id: UUID
├── config_id: UUID (FK to VectorTableConfig)
├── name: string
├── filters: JSON (saved filter conditions)
├── sort_column: string
├── sort_direction: enum (asc, desc)
├── visible_columns: string[]
├── visualization_settings: VisualizationSettings
└── created_at: timestamp

VisualizationSettings
├── method: enum (pca, tsne, umap)
├── dimensions: enum (2d, 3d)
├── color_by_column: string
├── point_size: integer
├── cached_projection_id: string
└── last_computed_at: timestamp

DimensionalityReductionCache
├── id: UUID
├── config_id: UUID (FK to VectorTableConfig)
├── method: enum (pca, tsne, umap)
├── sample_size: integer
├── row_count_at_compute: integer
├── projection_data: BLOB (compressed coordinates)
├── computed_at: timestamp
└── expires_at: timestamp
```

---

## Non-Functional Requirements (Additions)

| ID         | Requirement                               | Target       |
| ---------- | ----------------------------------------- | ------------ |
| NFR-VE-001 | Table auto-detection query response       | < 2 seconds  |
| NFR-VE-002 | Initial table load (first 100 rows)       | < 1 second   |
| NFR-VE-003 | Visualization render (5000 points, 2D)    | < 3 seconds  |
| NFR-VE-004 | UMAP computation (5000 vectors, 1536 dim) | < 10 seconds |
| NFR-VE-005 | Similarity search (k=10, 100k vectors)    | < 500ms      |
| NFR-VE-006 | Memory usage for visualization            | < 500MB      |

---

## Development Milestone Update

Add to **Phase 3** or create new **Phase 3.5: Vector Space Explorer (Weeks 10-12)**

- Week 10: Connection browser, table detection, column mapping UI
- Week 11: Table browsing, search/filter, row detail view
- Week 12: Visualization (PCA first, then UMAP), caching, similarity search from explorer

---

This feature turns the app from just an "embedding pipeline" into a full "vector space management tool" which is much more valuable for debugging, auditing, and understanding your RAG system.
