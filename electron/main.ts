import { app, BrowserWindow, ipcMain, dialog, Notification } from "electron";
import fs from "node:fs/promises";
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
let chatAbortController: AbortController | null = null;

function createWindow() {
  const savedBounds = dbManager.getSetting("window_bounds");

  win = new BrowserWindow({
    icon: path.join(process.env.VITE_PUBLIC, "logo.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.mjs"),
    },
    width: savedBounds?.width || 1200,
    height: savedBounds?.height || 800,
    x: savedBounds?.x,
    y: savedBounds?.y,
    titleBarStyle: "hidden",
    title: "Cartography",
    backgroundColor: "#09090b",
  });

  win.on("close", () => {
    if (win) {
      dbManager.setSetting("window_bounds", win.getBounds());
    }
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
  ipcMain.handle("get-projects", (_, includeArchived) => {
    return dbManager.getAllProjects(includeArchived);
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

  ipcMain.handle("archive-project", (_, id, archived) => {
    return dbManager.archiveProject(id, archived);
  });

  ipcMain.handle("duplicate-project", (_, id) => {
    const project = dbManager.getProject(id);
    if (!project) throw new Error("Project not found");
    const newProject = dbManager.createProject(
      project.name + " (Copy)",
      project.description,
      project.color,
    );
    if (newProject && (project.embedding_config || project.chunking_config || project.vector_store_config)) {
      dbManager.updateProjectConfig(
        newProject.id,
        project.embedding_config,
        project.chunking_config,
        project.vector_store_config,
      );
    }
    return dbManager.getProject(newProject.id);
  });

  ipcMain.handle("export-project-config", async (_, id) => {
    if (!win) return null;
    const project = dbManager.getProject(id);
    if (!project) throw new Error("Project not found");
    const result = await dialog.showSaveDialog(win, {
      title: "Export Project Configuration",
      defaultPath: `${project.name.replace(/[^a-z0-9]/gi, "_")}_config.json`,
      filters: [{ name: "JSON", extensions: ["json"] }],
    });
    if (result.canceled || !result.filePath) return null;
    const config = {
      name: project.name,
      description: project.description,
      tags: project.tags,
      color: project.color,
      embedding_config: project.embedding_config,
      chunking_config: project.chunking_config,
      vector_store_config: project.vector_store_config,
    };
    await fs.writeFile(result.filePath, JSON.stringify(config, null, 2));
    return result.filePath;
  });

  ipcMain.handle("import-project-config", async () => {
    if (!win) return null;
    const result = await dialog.showOpenDialog(win, {
      title: "Import Project Configuration",
      filters: [{ name: "JSON", extensions: ["json"] }],
      properties: ["openFile"],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    const content = await fs.readFile(result.filePaths[0], "utf-8");
    const config = JSON.parse(content);
    const project = dbManager.createProject(
      config.name || "Imported Project",
      config.description || "",
      config.color || "#2563eb",
    );
    if (project && (config.embedding_config || config.chunking_config || config.vector_store_config)) {
      dbManager.updateProjectConfig(
        project.id,
        config.embedding_config,
        config.chunking_config,
        config.vector_store_config,
      );
    }
    return dbManager.getProject(project!.id);
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

  ipcMain.handle("get-ollama-models", async (_, baseUrl) => {
    return await ollamaManager.getModels(baseUrl);
  });

  ipcMain.handle("check-ollama-model", async (_, baseUrl, modelName) => {
    return await ollamaManager.checkModel(baseUrl, modelName);
  });

  ipcMain.handle("process-project", async (_, projectId) => {
    const result = await processingManager.processProject(projectId);
    if (Notification.isSupported()) {
      const project = dbManager.getProject(projectId);
      new Notification({
        title: "Processing Complete",
        body: `${project?.name || "Project"}: ${result.processed} document${result.processed !== 1 ? "s" : ""} processed.`,
      }).show();
    }
    return result;
  });

  ipcMain.handle("search-project", async (_, projectId, query, limit) => {
    return await processingManager.searchProject(projectId, query, limit);
  });

  // Chat streaming
  ipcMain.handle("chat-send", async (event, ollamaUrl, model, messages, systemPrompt) => {
    chatAbortController = new AbortController();

    const chatMessages = systemPrompt
      ? [{ role: "system" as const, content: systemPrompt }, ...messages]
      : messages;

    try {
      await ollamaManager.chatStream(
        ollamaUrl,
        model,
        chatMessages,
        (token) => {
          event.sender.send("chat-token", token);
        },
        chatAbortController.signal,
      );
      event.sender.send("chat-done");
    } catch (err) {
      const msg = (err as Error).message;
      if (msg !== "Chat stream aborted") {
        event.sender.send("chat-error", msg);
      } else {
        event.sender.send("chat-done");
      }
    } finally {
      chatAbortController = null;
    }
  });

  ipcMain.handle("chat-abort", () => {
    if (chatAbortController) {
      chatAbortController.abort();
      chatAbortController = null;
    }
  });

  createWindow();
});
