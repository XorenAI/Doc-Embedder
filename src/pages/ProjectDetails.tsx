import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Settings,
  Database,
  Upload,
  FileText,
  Boxes,
  Play,
} from "lucide-react";
import { Button } from "../components/ui/button";
import { Project } from "../types";

export function ProjectDetails() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [availableTables, setAvailableTables] = useState<string[]>([]); // For PG tables
  const [activeTab, setActiveTab] = useState<
    "documents" | "chunks" | "settings"
  >("documents");

  const [documents, setDocuments] = useState<any[]>([]);

  useEffect(() => {
    async function fetchData() {
      try {
        // @ts-ignore
        const [projectData, documentsData] = await Promise.all([
          // @ts-ignore
          window.ipcRenderer.invoke("get-project", id),
          // @ts-ignore
          window.ipcRenderer.importDocuments
            ? Promise.resolve([])
            : Promise.resolve([]), // Initial load doesn't import, just gets
        ]);

        if (projectData) {
          setProject(projectData);
          // @ts-ignore
          const docs = await window.ipcRenderer.getProjectDocuments(id);
          setDocuments(docs);
        } else {
          navigate("/projects");
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [id, navigate]);

  async function handleImport() {
    try {
      // @ts-ignore
      const newDocs = await window.ipcRenderer.importDocuments(id);
      if (newDocs && newDocs.length > 0) {
        // Refresh documents list
        // @ts-ignore
        const updatedDocs = await window.ipcRenderer.getProjectDocuments(id);
        setDocuments(updatedDocs);

        // Refresh project stats (doc count)
        // @ts-ignore
        const updatedProject = await window.ipcRenderer.invoke(
          "get-project",
          id,
        );
        setProject(updatedProject);
      }
    } catch (error) {
      console.error("Import failed:", error);
    }
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-zinc-500">
        Loading project...
      </div>
    );
  }

  if (!project) return null;

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <header className="border-b border-white/5 bg-zinc-900/50 backdrop-blur-sm px-6 py-4">
        <div className="flex items-center gap-4 mb-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/projects")}
            className="text-zinc-400 hover:text-white pl-0 gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </Button>
        </div>

        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white mb-2">
              {project.name}
            </h1>
            <p className="text-zinc-400 text-sm max-w-2xl">
              {project.description || "No description provided."}
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              onClick={handleImport}
              className="gap-2 bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-500/20 rounded-md px-4 py-2 h-10"
            >
              <Upload className="w-4 h-4" />
              Import PDF/Text
            </Button>
            <Button
              onClick={async () => {
                const confirmed = confirm(
                  "Start processing pending documents? This uses the configured Embedding Provider.",
                );
                if (!confirmed) return;

                try {
                  console.log("Starting processing for project:", id);
                  // @ts-ignore
                  const res = await window.ipcRenderer.processProject(id);
                  console.log("Processing result:", res);

                  if (res.processed === 0 && res.message) {
                    alert(`Nothing to process: ${res.message}`);
                  } else {
                    alert(
                      `Processing Complete! Processed ${res.processed} documents.`,
                    );
                  }

                  // @ts-ignore
                  const updatedDocs =
                    await window.ipcRenderer.getProjectDocuments(id);
                  setDocuments(updatedDocs);
                } catch (e: any) {
                  console.error("Processing error:", e);
                  alert(`Error during processing: ${e.message || e}`);
                }
              }}
              className="gap-2 bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-500/20 rounded-md px-4 py-2 h-10"
            >
              <Play className="w-4 h-4" />
              Process Pending
            </Button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-6 mt-8 border-b border-white/5">
          <button
            onClick={() => setActiveTab("documents")}
            className={`pb-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${activeTab === "documents" ? "border-blue-500 text-blue-400" : "border-transparent text-zinc-400 hover:text-zinc-200"}`}
          >
            <FileText className="w-4 h-4" />
            Documents{" "}
            <span className="bg-zinc-800 text-zinc-300 text-xs px-2 py-0.5 rounded-full ml-1">
              {project.document_count || 0}
            </span>
          </button>
          <button
            onClick={() => setActiveTab("chunks")}
            className={`pb-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${activeTab === "chunks" ? "border-blue-500 text-blue-400" : "border-transparent text-zinc-400 hover:text-zinc-200"}`}
          >
            <Boxes className="w-4 h-4" />
            Chunks{" "}
            <span className="bg-zinc-800 text-zinc-300 text-xs px-2 py-0.5 rounded-full ml-1">
              {project.chunk_count || 0}
            </span>
          </button>
          <button
            onClick={() => setActiveTab("settings")}
            className={`pb-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${activeTab === "settings" ? "border-blue-500 text-blue-400" : "border-transparent text-zinc-400 hover:text-zinc-200"}`}
          >
            <Settings className="w-4 h-4" />
            Settings
          </button>
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {activeTab === "documents" &&
          (documents.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 border border-dashed border-zinc-800 rounded-xl bg-zinc-900/20">
              <div className="w-12 h-12 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center mb-3">
                <Upload className="w-6 h-6 text-zinc-600" />
              </div>
              <p className="text-zinc-400 mb-4">No documents imported yet.</p>
              <Button
                variant="outline"
                className="gap-2"
                onClick={handleImport}
              >
                Import Document
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              {documents.map((doc) => (
                <div
                  key={doc.id}
                  className="flex items-center justify-between p-4 bg-zinc-900/40 border border-white/5 rounded-lg hover:bg-zinc-900/60 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded bg-blue-500/10 flex items-center justify-center text-blue-400">
                      <FileText className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="font-medium text-white">{doc.name}</p>
                      <p className="text-xs text-zinc-500">
                        {new Date(doc.created_at).toLocaleString()}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span
                      className={`px-2 py-0.5 rounded text-xs font-medium uppercase tracking-wider ${
                        doc.status === "processed"
                          ? "bg-green-500/10 text-green-400"
                          : doc.status === "pending"
                            ? "bg-yellow-500/10 text-yellow-400"
                            : "bg-zinc-800 text-zinc-400"
                      }`}
                    >
                      {doc.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ))}

        {activeTab === "settings" && (
          <div className="max-w-2xl space-y-8">
            <section className="space-y-4">
              <h3 className="text-lg font-medium text-white flex items-center gap-2">
                <Database className="w-5 h-5 text-blue-500" />
                Embedding Setup
              </h3>
              <div className="bg-zinc-900/50 border border-border rounded-lg p-6 space-y-6">
                <div>
                  <label className="block text-sm font-medium text-zinc-400 mb-2">
                    Embedding Provider
                  </label>
                  <select
                    className="w-full bg-zinc-950 border border-zinc-700/50 rounded-md px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                    value={project?.embedding_config?.provider || "ollama"}
                    onChange={(e) => {
                      const newConfig = {
                        ...project?.embedding_config,
                        provider: e.target.value,
                      };
                      // @ts-ignore
                      window.ipcRenderer
                        .updateProjectConfig(
                          project.id,
                          newConfig,
                          project.chunking_config,
                          project.vector_store_config,
                        )
                        .then((updated) => setProject(updated));
                    }}
                  >
                    <option value="ollama">Ollama (Local)</option>
                    <option value="openai">OpenAI</option>
                  </select>
                </div>

                {project?.embedding_config?.provider === "ollama" && (
                  <div>
                    <label className="block text-sm font-medium text-zinc-400 mb-2">
                      Ollama Base URL
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        className="flex-1 bg-zinc-950 border border-zinc-700/50 rounded-md px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                        placeholder="http://localhost:11434"
                        value={
                          project?.embedding_config?.api_key_ref ||
                          "http://localhost:11434"
                        } // Using api_key_ref temp for URL for now, or add specific field
                        onChange={(e) => {
                          const newConfig = {
                            ...project?.embedding_config,
                            api_key_ref: e.target.value,
                          };
                          // @ts-ignore
                          window.ipcRenderer
                            .updateProjectConfig(
                              project.id,
                              newConfig,
                              project.chunking_config,
                              project.vector_store_config,
                            )
                            .then((updated) => setProject(updated));
                        }}
                      />
                      <Button
                        variant="outline"
                        className="shrink-0"
                        onClick={async () => {
                          const url =
                            project?.embedding_config?.api_key_ref ||
                            "http://localhost:11434";
                          // @ts-ignore
                          const res =
                            await window.ipcRenderer.testOllamaConnection(url);
                          if (res.success) {
                            alert(
                              `Connection successful! Ollama version: ${res.version}`,
                            );
                          } else {
                            alert(`Connection failed: ${res.error}`);
                          }
                        }}
                      >
                        Test
                      </Button>
                    </div>
                    <p className="text-xs text-zinc-500 mt-1">
                      Default: http://localhost:11434
                    </p>
                  </div>
                )}

                {project?.embedding_config?.provider === "openai" && (
                  <div>
                    <label className="block text-sm font-medium text-zinc-400 mb-2">
                      OpenAI API Key
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="password"
                        className="flex-1 bg-zinc-950 border border-zinc-700/50 rounded-md px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                        placeholder="sk-..."
                        value={project?.embedding_config?.api_key_ref || ""}
                        onChange={(e) => {
                          const newConfig = {
                            ...project?.embedding_config,
                            api_key_ref: e.target.value,
                          };
                          // @ts-ignore
                          window.ipcRenderer
                            .updateProjectConfig(
                              project.id,
                              newConfig,
                              project.chunking_config,
                              project.vector_store_config,
                            )
                            .then((updated) => setProject(updated));
                        }}
                      />
                      <Button
                        variant="outline"
                        className="shrink-0"
                        onClick={async () => {
                          const key = project?.embedding_config?.api_key_ref;
                          if (!key)
                            return alert("Please enter an API Key first");
                          // @ts-ignore
                          const res =
                            await window.ipcRenderer.testOpenAIConnection(key);
                          if (res.success) {
                            alert("Valid API Key!");
                          } else {
                            alert(`Invalid Key: ${res.error}`);
                          }
                        }}
                      >
                        Test
                      </Button>
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-zinc-400 mb-2">
                    Embedding Model Name
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      className="flex-1 bg-zinc-950 border border-zinc-700/50 rounded-md px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                      placeholder="e.g. nomic-embed-text"
                      value={project?.embedding_config?.model || ""}
                      onChange={(e) => {
                        const newConfig = {
                          ...project?.embedding_config,
                          model: e.target.value,
                        };
                        // @ts-ignore
                        window.ipcRenderer
                          .updateProjectConfig(
                            project.id,
                            newConfig,
                            project.chunking_config,
                            project.vector_store_config,
                          )
                          .then((updated) => setProject(updated));
                      }}
                    />
                    {project?.embedding_config?.provider === "ollama" && (
                      <Button
                        variant="outline"
                        className="shrink-0"
                        onClick={async () => {
                          const url =
                            project?.embedding_config?.api_key_ref ||
                            "http://localhost:11434";
                          const model = project?.embedding_config?.model;
                          if (!model)
                            return alert("Please enter a model name first");
                          // @ts-ignore
                          const res = await window.ipcRenderer.checkOllamaModel(
                            url,
                            model,
                          );
                          if (res.found) {
                            alert(
                              `Model '${model}' found available in Ollama!`,
                            );
                          } else {
                            alert(
                              `Model '${model}' NOT found. Make sure to run 'ollama pull ${model}' or check the name.`,
                            );
                          }
                        }}
                      >
                        Check
                      </Button>
                    )}
                  </div>
                  <p className="text-xs text-zinc-500 mt-1">
                    {project?.embedding_config?.provider === "ollama"
                      ? "Make sure you have pulled this model: `ollama pull nomic-embed-text`"
                      : "e.g. text-embedding-3-small"}
                  </p>
                </div>
              </div>
            </section>

            <section className="space-y-4">
              <h3 className="text-lg font-medium text-white flex items-center gap-2">
                <Database className="w-5 h-5 text-green-500" />
                Vector Database
              </h3>
              <div className="bg-zinc-900/50 border border-border rounded-lg p-6 space-y-6">
                <div>
                  <label className="block text-sm font-medium text-zinc-400 mb-2">
                    Vector Store Provider
                  </label>
                  <select
                    className="w-full bg-zinc-950 border border-zinc-700/50 rounded-md px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-green-500/50"
                    value={project?.vector_store_config?.provider || "pgvector"}
                    onChange={(e) => {
                      const newConfig = {
                        ...project?.vector_store_config,
                        provider: e.target.value,
                      };
                      // @ts-ignore
                      window.ipcRenderer
                        .updateProjectConfig(
                          project.id,
                          project.embedding_config,
                          project.chunking_config,
                          newConfig,
                        )
                        .then((updated) => setProject(updated));
                    }}
                  >
                    <option value="pgvector">PostgreSQL (pgvector)</option>
                    <option value="chroma">ChromaDB</option>
                    <option value="qdrant">Qdrant</option>
                  </select>
                </div>

                {project?.vector_store_config?.provider === "pgvector" && (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-zinc-400 mb-2">
                        Connection String
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          className="flex-1 bg-zinc-950 border border-zinc-700/50 rounded-md px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-green-500/50"
                          placeholder="postgresql://user:password@localhost:5432/dbname"
                          value={project?.vector_store_config?.url || ""}
                          onChange={(e) => {
                            const newConfig = {
                              ...project?.vector_store_config,
                              url: e.target.value,
                            };
                            // @ts-ignore
                            window.ipcRenderer
                              .updateProjectConfig(
                                project.id,
                                project.embedding_config,
                                project.chunking_config,
                                newConfig,
                              )
                              .then((updated) => setProject(updated));
                          }}
                        />
                        <Button
                          variant="outline"
                          className="shrink-0"
                          onClick={async () => {
                            // @ts-ignore
                            const res =
                              await window.ipcRenderer.testPostgresConnection(
                                project.vector_store_config.url,
                              );
                            if (res.success) {
                              alert(
                                `Successfully connected! Found tables: ${res.tables.join(", ")}`,
                              );
                              // Can optimize this to store tables in a local state to populate dropdown next
                              setAvailableTables(res.tables);
                            } else {
                              alert(`Connection failed: ${res.error}`);
                            }
                          }}
                        >
                          Test Connection
                        </Button>
                      </div>
                    </div>

                    {availableTables.length > 0 && (
                      <div className="space-y-4 pt-4 border-t border-zinc-800">
                        <h4 className="text-sm font-medium text-zinc-300">
                          Database Tables
                        </h4>

                        {/* Documents Table */}
                        <div>
                          <label className="block text-xs font-medium text-zinc-500 mb-1">
                            Documents Table
                          </label>
                          <div className="relative">
                            <input
                              list="tables-list"
                              type="text"
                              className="w-full bg-zinc-950 border border-zinc-700/50 rounded-md px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-green-500/50"
                              value={
                                project?.vector_store_config?.documentTable ||
                                ""
                              }
                              onChange={(e) => {
                                const newConfig = {
                                  ...project?.vector_store_config,
                                  documentTable: e.target.value,
                                };
                                // @ts-ignore
                                window.ipcRenderer
                                  .updateProjectConfig(
                                    project.id,
                                    project.embedding_config,
                                    project.chunking_config,
                                    newConfig,
                                  )
                                  .then((updated) => setProject(updated));
                              }}
                              placeholder="e.g. project_documents"
                            />
                          </div>
                        </div>

                        {/* Chunks Table */}
                        <div>
                          <label className="block text-xs font-medium text-zinc-500 mb-1">
                            Chunks Table
                          </label>
                          <div className="relative">
                            <input
                              list="tables-list"
                              type="text"
                              className="w-full bg-zinc-950 border border-zinc-700/50 rounded-md px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-green-500/50"
                              value={
                                project?.vector_store_config?.chunkTable || ""
                              }
                              onChange={(e) => {
                                const newConfig = {
                                  ...project?.vector_store_config,
                                  chunkTable: e.target.value,
                                };
                                // @ts-ignore
                                window.ipcRenderer
                                  .updateProjectConfig(
                                    project.id,
                                    project.embedding_config,
                                    project.chunking_config,
                                    newConfig,
                                  )
                                  .then((updated) => setProject(updated));
                              }}
                              placeholder="e.g. project_chunks"
                            />
                          </div>
                        </div>

                        {/* Embeddings Table */}
                        <div>
                          <label className="block text-xs font-medium text-zinc-500 mb-1">
                            Embeddings Table
                          </label>
                          <div className="relative">
                            <input
                              list="tables-list"
                              type="text"
                              className="w-full bg-zinc-950 border border-zinc-700/50 rounded-md px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-green-500/50"
                              value={
                                project?.vector_store_config?.embeddingTable ||
                                ""
                              }
                              onChange={(e) => {
                                const newConfig = {
                                  ...project?.vector_store_config,
                                  embeddingTable: e.target.value,
                                };
                                // @ts-ignore
                                window.ipcRenderer
                                  .updateProjectConfig(
                                    project.id,
                                    project.embedding_config,
                                    project.chunking_config,
                                    newConfig,
                                  )
                                  .then((updated) => setProject(updated));
                              }}
                              placeholder="e.g. project_embeddings"
                            />
                          </div>
                        </div>

                        <datalist id="tables-list">
                          {availableTables.map((t) => (
                            <option key={t} value={t} />
                          ))}
                        </datalist>

                        <p className="text-xs text-zinc-500 italic">
                          Tables will be automatically created if they don't
                          exist during processing.
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {project?.vector_store_config?.provider === "chroma" && (
                  <div>
                    <label className="block text-sm font-medium text-zinc-400 mb-2">
                      ChromaDB URL
                    </label>
                    <input
                      type="text"
                      className="w-full bg-zinc-950 border border-zinc-700/50 rounded-md px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-green-500/50"
                      placeholder="http://localhost:8000"
                      value={project?.vector_store_config?.url || ""}
                      onChange={(e) => {
                        const newConfig = {
                          ...project?.vector_store_config,
                          url: e.target.value,
                        };
                        // @ts-ignore
                        window.ipcRenderer
                          .updateProjectConfig(
                            project.id,
                            project.embedding_config,
                            project.chunking_config,
                            newConfig,
                          )
                          .then((updated) => setProject(updated));
                      }}
                    />
                  </div>
                )}
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
