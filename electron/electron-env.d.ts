/// <reference types="vite-plugin-electron/electron-env" />

declare namespace NodeJS {
  interface ProcessEnv {
    /**
     * The built directory structure
     *
     * ```tree
     * ├─┬─┬ dist
     * │ │ └── index.html
     * │ │
     * │ ├─┬ dist-electron
     * │ │ ├── main.js
     * │ │ └── preload.js
     * │
     * ```
     */
    APP_ROOT: string;
    /** /dist/ or /public/ */
    VITE_PUBLIC: string;
  }
}

// Used in Renderer process, expose in `preload.ts`
interface Window {
  ipcRenderer: import("electron").IpcRenderer & {
    minimize: () => Promise<void>;
    maximize: () => Promise<void>;
    close: () => Promise<void>;
    getSetting: (key: string) => Promise<any>;
    setSetting: (key: string, value: any) => Promise<void>;
    importDocuments: (projectId: string) => Promise<any[]>;
    getProjectDocuments: (projectId: string) => Promise<any[]>;
    updateProjectConfig: (
      projectId: string,
      embeddingConfig: any,
      chunkingConfig?: any,
      vectorStoreConfig?: any,
    ) => Promise<any>;
    testPostgresConnection: (
      connectionString: string,
    ) => Promise<{ success: boolean; tables?: string[]; error?: string }>;
    testOpenAIConnection: (
      apiKey: string,
    ) => Promise<{ success: boolean; error?: string }>;
    processProject: (
      projectId: string,
    ) => Promise<{ processed: number; total?: number; message?: string }>;
  };
}
