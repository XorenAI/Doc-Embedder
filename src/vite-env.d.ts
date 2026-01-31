/// <reference types="vite/client" />

/* eslint-disable @typescript-eslint/no-explicit-any */
interface Window {
  ipcRenderer: {
    on(channel: string, listener: (event: any, ...args: any[]) => void): void;
    off(channel: string, listener: (...args: any[]) => void): void;
    send(channel: string, ...args: any[]): void;
    invoke(channel: string, ...args: any[]): Promise<any>;
    minimize(): Promise<void>;
    maximize(): Promise<void>;
    close(): Promise<void>;
    getSetting(key: string): Promise<any>;
    setSetting(key: string, value: any): Promise<void>;
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
