import { ipcRenderer, contextBridge } from "electron";

// --------- Expose some API to the Renderer process ---------
contextBridge.exposeInMainWorld("ipcRenderer", {
  on(...args: Parameters<typeof ipcRenderer.on>) {
    const [channel, listener] = args;
    return ipcRenderer.on(channel, (event, ...args) =>
      listener(event, ...args),
    );
  },
  off(...args: Parameters<typeof ipcRenderer.off>) {
    const [channel, ...omit] = args;
    return ipcRenderer.off(channel, ...omit);
  },
  send(...args: Parameters<typeof ipcRenderer.send>) {
    const [channel, ...omit] = args;
    return ipcRenderer.send(channel, ...omit);
  },
  invoke(...args: Parameters<typeof ipcRenderer.invoke>) {
    const [channel, ...omit] = args;
    return ipcRenderer.invoke(channel, ...omit);
  },

  // Settings
  getSetting: (key: string) => ipcRenderer.invoke("get-setting", key),
  setSetting: (key: string, value: any) =>
    ipcRenderer.invoke("set-setting", key, value),

  // Documents
  importDocuments: (projectId: string) =>
    ipcRenderer.invoke("import-documents", projectId),
  getProjectDocuments: (projectId: string) =>
    ipcRenderer.invoke("get-project-documents", projectId),

  // Project Config
  updateProjectConfig: (
    projectId: string,
    embeddingConfig: any,
    chunkingConfig: any,
    vectorStoreConfig: any,
  ) =>
    ipcRenderer.invoke(
      "update-project-config",
      projectId,
      embeddingConfig,
      chunkingConfig,
      vectorStoreConfig,
    ),
  testPostgresConnection: (connectionString: string) =>
    ipcRenderer.invoke("test-postgres-connection", connectionString),
  testOllamaConnection: (baseUrl: string) =>
    ipcRenderer.invoke("test-ollama-connection", baseUrl),
  checkOllamaModel: (baseUrl: string, modelName: string) =>
    ipcRenderer.invoke("check-ollama-model", baseUrl, modelName),
  testOpenAIConnection: (apiKey: string) =>
    ipcRenderer.invoke("test-openai-connection", apiKey),
  processProject: (projectId: string) =>
    ipcRenderer.invoke("process-project", projectId),

  // Window controls
  minimize: () => ipcRenderer.invoke("window-minimize"),
  maximize: () => ipcRenderer.invoke("window-maximize"),
  close: () => ipcRenderer.invoke("window-close"),
});
