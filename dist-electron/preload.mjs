"use strict";
const electron = require("electron");
electron.contextBridge.exposeInMainWorld("ipcRenderer", {
  on(...args) {
    const [channel, listener] = args;
    return electron.ipcRenderer.on(
      channel,
      (event, ...args2) => listener(event, ...args2)
    );
  },
  off(...args) {
    const [channel, ...omit] = args;
    return electron.ipcRenderer.off(channel, ...omit);
  },
  send(...args) {
    const [channel, ...omit] = args;
    return electron.ipcRenderer.send(channel, ...omit);
  },
  invoke(...args) {
    const [channel, ...omit] = args;
    return electron.ipcRenderer.invoke(channel, ...omit);
  },
  // Settings
  getSetting: (key) => electron.ipcRenderer.invoke("get-setting", key),
  setSetting: (key, value) => electron.ipcRenderer.invoke("set-setting", key, value),
  // Documents
  importDocuments: (projectId) => electron.ipcRenderer.invoke("import-documents", projectId),
  getProjectDocuments: (projectId) => electron.ipcRenderer.invoke("get-project-documents", projectId),
  // Project Config
  updateProjectConfig: (projectId, embeddingConfig, chunkingConfig, vectorStoreConfig) => electron.ipcRenderer.invoke(
    "update-project-config",
    projectId,
    embeddingConfig,
    chunkingConfig,
    vectorStoreConfig
  ),
  testPostgresConnection: (connectionString) => electron.ipcRenderer.invoke("test-postgres-connection", connectionString),
  testOllamaConnection: (baseUrl) => electron.ipcRenderer.invoke("test-ollama-connection", baseUrl),
  checkOllamaModel: (baseUrl, modelName) => electron.ipcRenderer.invoke("check-ollama-model", baseUrl, modelName),
  testOpenAIConnection: (apiKey) => electron.ipcRenderer.invoke("test-openai-connection", apiKey),
  processProject: (projectId) => electron.ipcRenderer.invoke("process-project", projectId),
  // Window controls
  minimize: () => electron.ipcRenderer.invoke("window-minimize"),
  maximize: () => electron.ipcRenderer.invoke("window-maximize"),
  close: () => electron.ipcRenderer.invoke("window-close")
});
