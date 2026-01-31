/// <reference types="vite/client" />

/* eslint-disable @typescript-eslint/no-explicit-any */
interface Window {
  ipcRenderer: {
    invoke(channel: string, ...args: any[]): Promise<any>;
    importDocuments(projectId: string): Promise<any[]>;
    getProjectDocuments(projectId: string): Promise<any[]>;
    processProject(
      projectId: string,
    ): Promise<{ processed: number; message?: string }>;
    updateProjectConfig(
      projectId: string,
      embeddingConfig: any,
      chunkingConfig: any,
      vectorStoreConfig: any,
    ): Promise<any>;
    testPostgresConnection(url: string): Promise<any>;
    testOllamaConnection(url: string): Promise<any>;
    checkOllamaModel(url: string, model: string): Promise<any>;
    testOpenAIConnection(key: string): Promise<any>;
  };
}
