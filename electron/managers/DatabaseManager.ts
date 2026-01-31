import Database from "better-sqlite3";
import { v4 as uuidv4 } from "uuid";
import path from "path";

export class DatabaseManager {
  private db: Database.Database;

  constructor(userDataPath: string) {
    const dbPath = path.join(userDataPath, "doc-embedder.db");
    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this._runMigrations();
  }

  private _runMigrations() {
    const schema = `
      CREATE TABLE IF NOT EXISTS vector_store_connections (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        provider TEXT NOT NULL,
        config TEXT NOT NULL, -- JSON encrypted
        environment TEXT CHECK(environment IN ('dev', 'staging', 'prod')) DEFAULT 'dev',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        last_tested_at TEXT
      );

      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        tags TEXT, -- JSON array
        embedding_config TEXT, -- JSON
        chunking_config TEXT, -- JSON
        vector_store_connection_id TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        archived BOOLEAN DEFAULT 0,
        FOREIGN KEY(vector_store_connection_id) REFERENCES vector_store_connections(id)
      );

      CREATE TABLE IF NOT EXISTS documents (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        name TEXT NOT NULL,
        source_type TEXT CHECK(source_type IN ('file', 'url')) NOT NULL,
        source_path TEXT NOT NULL,
        content_hash TEXT,
        metadata TEXT, -- JSON
        status TEXT CHECK(status IN ('pending', 'processing', 'completed', 'failed')) DEFAULT 'pending',
        version INTEGER DEFAULT 1,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        processed_at TEXT,
        FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS chunks (
        id TEXT PRIMARY KEY,
        document_id TEXT NOT NULL,
        content TEXT NOT NULL,
        token_count INTEGER,
        position INTEGER,
        metadata TEXT, -- JSON
        embedding_id TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(document_id) REFERENCES documents(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS processing_jobs (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        status TEXT CHECK(status IN ('queued', 'running', 'paused', 'completed', 'failed')) DEFAULT 'queued',
        total_documents INTEGER DEFAULT 0,
        processed_documents INTEGER DEFAULT 0,
        total_chunks INTEGER DEFAULT 0,
        error_log TEXT, -- JSON
        started_at TEXT,
        completed_at TEXT,
        FOREIGN KEY(project_id) REFERENCES projects(id)
      );

      CREATE TABLE IF NOT EXISTS embeddings (
        id TEXT PRIMARY KEY,
        chunk_id TEXT NOT NULL,
        vector BLOB NOT NULL,
        dimensions INTEGER NOT NULL,
        model TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(chunk_id) REFERENCES chunks(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      );
    `;

    this.db.exec(schema);

    // Migration: Add vector_store_config if missing
    const columns = this.db.pragma("table_info(projects)") as any[];
    const hasVectorConfig = columns.some(
      (c) => c.name === "vector_store_config",
    );
    if (!hasVectorConfig) {
      this.db
        .prepare("ALTER TABLE projects ADD COLUMN vector_store_config TEXT")
        .run();
    }
    // Migration: Add color if missing
    const hasColor = columns.some((c) => c.name === "color");
    if (!hasColor) {
      this.db.prepare("ALTER TABLE projects ADD COLUMN color TEXT").run();
    }
  }

  // --- Settings ---

  getSetting(key: string) {
    const stmt = this.db.prepare("SELECT value FROM settings WHERE key = ?");
    const row = stmt.get(key) as { value: string } | undefined;
    return row ? JSON.parse(row.value) : null;
  }

  setSetting(key: string, value: any) {
    const stmt = this.db.prepare(`
      INSERT INTO settings (key, value) VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
    `);
    stmt.run(key, JSON.stringify(value));
  }

  // --- Projects ---

  getAllProjects() {
    const stmt = this.db.prepare(`
      SELECT p.*, 
        (SELECT COUNT(*) FROM documents d WHERE d.project_id = p.id) as document_count,
        (SELECT COUNT(*) FROM chunks c JOIN documents d ON c.document_id = d.id WHERE d.project_id = p.id) as chunk_count
      FROM projects p
      WHERE archived = 0
      ORDER BY updated_at DESC
    `);
    return stmt.all().map(this._parseProject);
  }

  createProject(
    name: string,
    description: string = "",
    color: string = "blue",
  ) {
    const id = uuidv4();
    const stmt = this.db.prepare(`
      INSERT INTO projects (id, name, description, color) VALUES (?, ?, ?, ?)
    `);
    stmt.run(id, name, description, color);
    return this.getProject(id);
  }

  updateProject(
    id: string,
    updates: { name?: string; description?: string; color?: string },
  ) {
    const fields = [];
    const values = [];

    if (updates.name !== undefined) {
      fields.push("name = ?");
      values.push(updates.name);
    }
    if (updates.description !== undefined) {
      fields.push("description = ?");
      values.push(updates.description);
    }
    if (updates.color !== undefined) {
      fields.push("color = ?");
      values.push(updates.color);
    }

    if (fields.length === 0) return this.getProject(id);

    fields.push("updated_at = CURRENT_TIMESTAMP");
    values.push(id); // for WHERE clause

    const stmt = this.db.prepare(`
      UPDATE projects SET ${fields.join(", ")} WHERE id = ?
    `);

    stmt.run(...values);
    return this.getProject(id);
  }

  deleteProject(id: string) {
    // Because of ON DELETE CASCADE on documents and chunks (if set), this helps,
    // but we need to ensure we delete from vector store first in IPC handler or here if logic moved.
    // Local constraints will handle local cascade if defined.
    // Checking schema: FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE is NOT on documents in schema string above?
    // Wait, let me check schema string again.
    // Line 53: FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
    // Yes, it is there.
    const stmt = this.db.prepare("DELETE FROM projects WHERE id = ?");
    stmt.run(id);
  }

  getProject(id: string) {
    const stmt = this.db.prepare("SELECT * FROM projects WHERE id = ?");
    const project = stmt.get(id);
    return project ? this._parseProject(project) : null;
  }

  getDashboardStats() {
    const projects = this.db
      .prepare("SELECT COUNT(*) as count FROM projects WHERE archived = 0")
      .get() as { count: number };
    const documents = this.db
      .prepare("SELECT COUNT(*) as count FROM documents")
      .get() as { count: number };
    const chunks = this.db
      .prepare("SELECT COUNT(*) as count FROM chunks")
      .get() as { count: number };
    const vectorStores = this.db
      .prepare("SELECT COUNT(*) as count FROM vector_store_connections")
      .get() as { count: number };

    // Get recent activity (last 5 created documents)
    const recentActivity = this.db
      .prepare(
        `
      SELECT d.name, p.name as project_name, d.created_at 
      FROM documents d 
      JOIN projects p ON d.project_id = p.id 
      ORDER BY d.created_at DESC 
      LIMIT 5
    `,
      )
      .all();

    return {
      totalProjects: projects.count,
      totalDocuments: documents.count,
      totalChunks: chunks.count,
      activeVectorStores: vectorStores.count,
      recentActivity,
    };
  }

  // --- Documents ---

  addDocument(
    projectId: string,
    fileName: string,
    filePath: string,
    sourceType: "file" | "url" = "file",
  ) {
    const id = uuidv4();
    const stmt = this.db.prepare(`
      INSERT INTO documents (id, project_id, name, source_type, source_path, status)
      VALUES (?, ?, ?, ?, ?, 'pending')
    `);
    stmt.run(id, projectId, fileName, sourceType, filePath);
    return this.getDocument(id);
  }

  getDocument(id: string) {
    const stmt = this.db.prepare("SELECT * FROM documents WHERE id = ?");
    return stmt.get(id);
  }

  updateDocumentStatus(id: string, status: string) {
    const stmt = this.db.prepare(
      "UPDATE documents SET status = ?, processed_at = CURRENT_TIMESTAMP WHERE id = ?",
    );
    stmt.run(status, id);
  }

  deleteDocument(id: string) {
    const stmt = this.db.prepare("DELETE FROM documents WHERE id = ?");
    stmt.run(id);
  }

  getProjectDocuments(projectId: string) {
    const stmt = this.db.prepare(
      "SELECT * FROM documents WHERE project_id = ? ORDER BY created_at DESC",
    );
    return stmt.all(projectId);
  }

  // --- Chunks (for local tracking/counting) ---

  addChunk(
    documentId: string,
    chunkId: string,
    content: string,
    position: number = 0,
  ) {
    const stmt = this.db.prepare(`
      INSERT INTO chunks (id, document_id, content, position) VALUES (?, ?, ?, ?)
    `);
    stmt.run(chunkId, documentId, content, position);
  }

  getDocumentChunks(documentId: string) {
    const stmt = this.db.prepare(
      "SELECT * FROM chunks WHERE document_id = ? ORDER BY position",
    );
    return stmt.all(documentId);
  }

  deleteDocumentChunks(documentId: string) {
    const stmt = this.db.prepare("DELETE FROM chunks WHERE document_id = ?");
    stmt.run(documentId);
  }

  updateProjectConfig(
    projectId: string,
    embeddingConfig: any,
    chunkingConfig: any = null,
    vectorStoreConfig: any = null,
  ) {
    // Column guaranteed to exist by _runMigrations
    const stmt = this.db.prepare(`
      UPDATE projects 
      SET embedding_config = ?, chunking_config = ?, vector_store_config = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);

    stmt.run(
      JSON.stringify(embeddingConfig),
      chunkingConfig ? JSON.stringify(chunkingConfig) : null,
      vectorStoreConfig ? JSON.stringify(vectorStoreConfig) : null,
      projectId,
    );
    return this.getProject(projectId);
  }

  // --- Helpers ---

  private _parseProject(row: unknown) {
    const r = row as any; // Temporary/pragmatic typing for sqlite result
    return {
      ...r,
      tags: r.tags ? JSON.parse(r.tags) : [],
      embedding_config: r.embedding_config
        ? JSON.parse(r.embedding_config)
        : null,
      chunking_config: r.chunking_config ? JSON.parse(r.chunking_config) : null,
      vector_store_config: r.vector_store_config
        ? JSON.parse(r.vector_store_config)
        : null,
      archived: Boolean(r.archived),
    };
  }
}
