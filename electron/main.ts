import { app, BrowserWindow, ipcMain, dialog } from "electron";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { DatabaseManager } from "./managers/DatabaseManager";
import { PostgresManager } from "./managers/PostgresManager";
import { OllamaManager } from "./managers/OllamaManager";
import { OpenAIManager } from "./managers/OpenAIManager";
import { ProcessingManager } from "./managers/ProcessingManager";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// The built directory structure
//
// ├─┬─┬ dist
// │ │ └── index.html
// │ │
// │ ├─┬ dist-electron
// │ │ ├── main.js
// │ │ └── preload.mjs
// │
process.env.APP_ROOT = path.join(__dirname, "..");

// 🚧 Use ['ENV_NAME'] avoid vite:define plugin - Vite@2.x
export const VITE_DEV_SERVER_URL = process.env["VITE_DEV_SERVER_URL"];
export const MAIN_DIST = path.join(process.env.APP_ROOT, "dist-electron");
export const RENDERER_DIST = path.join(process.env.APP_ROOT, "dist");

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL
  ? path.join(process.env.APP_ROOT, "public")
  : RENDERER_DIST;

let win: BrowserWindow | null;
let dbManager: DatabaseManager;
let pgManager: PostgresManager;
let ollamaManager: OllamaManager;
let openAIManager: OpenAIManager;
let processingManager: ProcessingManager;

function createWindow() {
  win = new BrowserWindow({
    icon: path.join(process.env.VITE_PUBLIC, "logo.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.mjs"),
      // Security warning: enabling nodeIntegration is not recommended, but for local tools sometimes useful.
      // We stick to preload.
    },
    width: 1200,
    height: 800,
    titleBarStyle: "hidden", // Premium look: frameless/hidden title bar if we implement custom one.
    // Setting titleBarStyle 'hidden' effectively hides standard frame on Mac, on Windows it might need checks.
    // For now keep standard or 'hidden' with traffic lights offset.
    title: "Cartography",
    backgroundColor: "#09090b", // match theme
  });

  // Test active push message to Renderer-process.
  win.webContents.on("did-finish-load", () => {
    win?.webContents.send("main-process-message", new Date().toLocaleString());
  });

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL);
  } else {
    // win.loadFile('dist/index.html')
    win.loadFile(path.join(RENDERER_DIST, "index.html"));
  }
}

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
    win = null;
  }
});

app.on("activate", () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.whenReady().then(() => {
  // Initialize Database
  const userDataPath = app.getPath("userData");
  console.log("Initializing Database at:", userDataPath);
  dbManager = new DatabaseManager(userDataPath);
  pgManager = new PostgresManager();
  ollamaManager = new OllamaManager();
  openAIManager = new OpenAIManager();
  processingManager = new ProcessingManager(
    dbManager,
    pgManager,
    ollamaManager,
    openAIManager,
  );

  // IPC Handlers
  ipcMain.handle("get-projects", () => {
    return dbManager.getAllProjects();
  });

  ipcMain.handle("create-project", (_, name, description, color) => {
    return dbManager.createProject(name, description, color);
  });

  ipcMain.handle("update-project", (_, id, updates) => {
    return dbManager.updateProject(id, updates);
  });

  ipcMain.handle("delete-project", async (_, id) => {
    // 1. Cleanup vectors
    try {
      const project = dbManager.getProject(id);
      if (
        project &&
        project.vector_store_config &&
        project.vector_store_config.url
      ) {
        console.log(`Cleaning up vectors for project ${id}...`);
        // Ideally we have a bulk delete by metadata in PGVector, but our schema links to chunks/docs.
        // If we delete the document record in Postgres, cascade should handle it?
        // We configured PG tables with references but did we put ON DELETE CASCADE?
        // Checking PostgresManager:
        // "chunks" references "documents"(id) -- NO CASCADE specified in CREATE TABLE in PostgresManager.ts line 62?
        // Wait, looking at PostgresManager.ts again:
        // line 62: document_id UUID REFERENCES ${config.documentTable}(id),
        // No ON DELETE CASCADE.
        // So we must manually delete.
        // Efficient way: get all doc IDs, delete all chunks where doc_id IN (...), delete all docs where id IN (...)

        // For now, let's iterate documents since we have the helper `deleteDocumentVectors`.
        const docs = dbManager.getProjectDocuments(id) as { id: string }[];
        for (const doc of docs) {
          await pgManager.deleteDocumentVectors(
            project.vector_store_config.url,
            project.vector_store_config,
            doc.id,
          );
        }
      }
    } catch (e) {
      console.error("Error cleaning up vectors during project deletion:", e);
    }

    // 2. Delete local
    dbManager.deleteProject(id);
    return { success: true };
  });

  ipcMain.handle("get-project", (_, id) => {
    return dbManager.getProject(id);
  });

  // Window Controls
  ipcMain.handle("window-minimize", () => {
    win?.minimize();
  });
  ipcMain.handle("window-maximize", () => {
    if (win?.isMaximized()) {
      win.unmaximize();
    } else {
      win?.maximize();
    }
  });
  ipcMain.handle("window-close", () => {
    win?.close();
  });

  // Settings
  ipcMain.handle("get-setting", (_, key) => {
    return dbManager.getSetting(key);
  });
  ipcMain.handle("set-setting", (_, key, value) => {
    return dbManager.setSetting(key, value);
  });

  ipcMain.handle("get-dashboard-stats", () => {
    return dbManager.getDashboardStats();
  });

  ipcMain.handle("import-documents", async (_, projectId) => {
    if (!win) return [];

    const result = await dialog.showOpenDialog(win, {
      title: "Import Documents",
      properties: ["openFile", "multiSelections"],
      filters: [
        { name: "Documents", extensions: ["pdf", "txt", "md", "json"] },
      ],
    });

    if (result.canceled || result.filePaths.length === 0) {
      return [];
    }

    const importedDocs = [];
    for (const filePath of result.filePaths) {
      const fileName = path.basename(filePath);
      const doc = dbManager.addDocument(projectId, fileName, filePath, "file");
      importedDocs.push(doc);
    }

    return importedDocs;
  });

  ipcMain.handle("get-project-documents", (_, projectId) => {
    return dbManager.getProjectDocuments(projectId);
  });

  ipcMain.handle("delete-document", async (_, projectId, documentId) => {
    const project = dbManager.getProject(projectId);
    if (!project) throw new Error("Project not found");

    const doc = dbManager.getDocument(documentId);
    if (!doc) throw new Error("Document not found");

    // 1. Try to delete vectors if configured and document was processed/failed (might have partials)
    if (project.vector_store_config && project.vector_store_config.url) {
      // We only attempt to delete from vector store. If it fails (e.g. DB down), we log but allow invalidation.
      // User probably wants it gone from the UI regardless.
      console.log(
        `Attempting to delete vectors for doc ${documentId} from ${project.vector_store_config.provider}`,
      );
      if (project.vector_store_config.provider === "pgvector") {
        const res = await pgManager.deleteDocumentVectors(
          project.vector_store_config.url,
          project.vector_store_config,
          documentId,
        );
        if (!res.success) {
          console.warn("Failed to delete vectors from Postgres:", res.error);
          // We deliberately don't throw here to allow local deletion
        }
      }
      // TODO: Handle Chroma/Qdrant deletion
    }

    // 2. Delete from local database (Cascades to chunks)
    dbManager.deleteDocument(documentId);
    return { success: true };
  });

  ipcMain.handle(
    "update-project-config",
    (_, projectId, embeddingConfig, chunkingConfig, vectorStoreConfig) => {
      return dbManager.updateProjectConfig(
        projectId,
        embeddingConfig,
        chunkingConfig,
        vectorStoreConfig,
      );
    },
  );

  ipcMain.handle("test-postgres-connection", async (_, connectionString) => {
    return await pgManager.testConnection(connectionString);
  });

  ipcMain.handle("test-ollama-connection", async (_, baseUrl) => {
    // Lazy init or move top level if needed, but for now importing here or assuming it's available?
    // Better to init properly at top.
    return await ollamaManager.testConnection(baseUrl);
  });

  ipcMain.handle("check-ollama-model", async (_, baseUrl, modelName) => {
    return await ollamaManager.checkModel(baseUrl, modelName);
  });

  ipcMain.handle("process-project", async (_, projectId) => {
    return await processingManager.processProject(projectId);
  });

  ipcMain.handle("search-project", async (_, projectId, query, limit) => {
    return await processingManager.searchProject(projectId, query, limit);
  });

  createWindow();
});
