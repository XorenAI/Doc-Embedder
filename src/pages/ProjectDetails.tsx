import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Upload,
  Play,
} from "lucide-react";
import { Button } from "../components/ui/button";
import { OllamaModelSelect } from "../components/ui/OllamaModelSelect";
import { Project, AppDocument } from "../types";
import { Search as SearchComponent } from "./Search";

export function ProjectDetails() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  useEffect(() => {
    if (!id) {
      navigate("/projects");
      return;
    }
  }, [id, navigate]);
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [availableTables, setAvailableTables] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<
    "documents" | "chunks" | "search" | "settings"
  >("documents");
  const [activeDocTab, setActiveDocTab] = useState<
    "all" | "processed" | "pending" | "failed"
  >("all");

  const [documents, setDocuments] = useState<AppDocument[]>([]);

  useEffect(() => {
    async function fetchData() {
      try {
        if (!id) return;
        const [projectData] = await Promise.all([
          window.ipcRenderer.invoke("get-project", id),
        ]);

        if (projectData) {
          setProject(projectData);
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
    if (!id) return;
    try {
      const newDocs = await window.ipcRenderer.importDocuments(id);
      if (newDocs && newDocs.length > 0) {
        const updatedDocs = await window.ipcRenderer.getProjectDocuments(id);
        setDocuments(updatedDocs);
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

  const [draftEmbedding, setDraftEmbedding] = useState<any>({
    provider: "ollama",
  });
  const [draftChunking, setDraftChunking] = useState<any>({
    strategy: "fixed",
    chunk_size: 1000,
    chunk_overlap: 100,
  });
  const [draftVectorStore, setDraftVectorStore] = useState<any>({
    provider: "pgvector",
  });
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (project) {
      setDraftEmbedding(project.embedding_config || { provider: "ollama" });
      setDraftChunking(
        project.chunking_config || {
          strategy: "fixed",
          chunk_size: 1000,
          chunk_overlap: 100,
        },
      );
      setDraftVectorStore(
        project.vector_store_config || { provider: "pgvector" },
      );
    }
  }, [project?.id]);

  const hasUnsavedChanges =
    project &&
    (JSON.stringify(draftEmbedding) !==
      JSON.stringify(project.embedding_config || {}) ||
      JSON.stringify(draftChunking) !==
        JSON.stringify(project.chunking_config || {}) ||
      JSON.stringify(draftVectorStore) !==
        JSON.stringify(project.vector_store_config || {}));

  const saveSettings = async () => {
    if (!project) return;
    setIsSaving(true);
    try {
      const updated = await window.ipcRenderer.updateProjectConfig(
        project.id,
        draftEmbedding,
        draftChunking,
        draftVectorStore,
      );
      setProject(updated);
      setDraftEmbedding(updated.embedding_config || {});
      setDraftChunking(updated.chunking_config || {});
      setDraftVectorStore(updated.vector_store_config || {});
    } catch (err) {
      console.error("Failed to save settings:", err);
      alert("Failed to save settings. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  const discardChanges = () => {
    if (!project) return;
    setDraftEmbedding(project.embedding_config || {});
    setDraftChunking(project.chunking_config || {});
    setDraftVectorStore(project.vector_store_config || {});
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-zinc-500 text-[13px]">
        Loading project...
      </div>
    );
  }

  if (!project) return null;

  const tabs = [
    { key: "documents" as const, label: "Documents", count: project.document_count || 0 },
    { key: "chunks" as const, label: "Chunks", count: project.chunk_count || 0 },
    { key: "search" as const, label: "Search" },
    { key: "settings" as const, label: "Settings" },
  ];

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <header className="border-b border-border px-6 py-4">
        <div className="flex items-center gap-3 mb-3">
          <button
            onClick={() => navigate("/projects")}
            className="text-zinc-500 hover:text-white transition-colors flex items-center gap-1 text-[13px]"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Projects
          </button>
        </div>

        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-lg font-medium text-white">
              {project.name}
            </h1>
            <p className="text-zinc-500 text-[13px] mt-0.5 max-w-2xl">
              {project.description || "No description provided."}
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={handleImport} variant="outline">
              <Upload className="w-3.5 h-3.5 mr-1.5" />
              Import
            </Button>
            <Button
              onClick={async () => {
                const confirmed = confirm(
                  "Start processing pending documents? This uses the configured Embedding Provider.",
                );
                if (!confirmed) return;

                try {
                  const res = await window.ipcRenderer.processProject(id!);

                  if (res.processed === 0 && res.message) {
                    alert(`Nothing to process: ${res.message}`);
                  } else {
                    alert(
                      `Processing Complete! Processed ${res.processed} documents.`,
                    );
                  }

                  const updatedDocs =
                    await window.ipcRenderer.getProjectDocuments(id || "");
                  setDocuments(updatedDocs);
                } catch (e) {
                  console.error("Processing error:", e);
                  const msg = e instanceof Error ? e.message : String(e);
                  alert(`Error during processing: ${msg}`);
                }
              }}
            >
              <Play className="w-3.5 h-3.5 mr-1.5" />
              Process
            </Button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-0 mt-5 -mb-[1px]">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-3 py-2 text-[13px] font-medium border-b-2 transition-colors ${
                activeTab === tab.key
                  ? "border-white text-white"
                  : "border-transparent text-zinc-500 hover:text-zinc-300"
              }`}
            >
              {tab.label}
              {"count" in tab && (
                <span className="ml-1.5 text-[11px] text-zinc-500">
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {activeTab === "documents" && (
          <div className="space-y-4">
            {/* Status filter */}
            <div className="flex gap-1">
              {(["all", "processed", "pending", "failed"] as const).map(
                (status) => {
                  const label =
                    status === "all"
                      ? "All"
                      : status === "processed"
                        ? "Done"
                        : status.charAt(0).toUpperCase() + status.slice(1);

                  const count = documents.filter((d) =>
                    status === "all"
                      ? true
                      : status === "pending"
                        ? d.status === "pending" || d.status === "processing"
                        : d.status === status,
                  ).length;

                  const isActive = (activeDocTab || "all") === status;

                  return (
                    <button
                      key={status}
                      onClick={() => setActiveDocTab(status)}
                      className={`px-2.5 py-1 rounded text-[12px] font-medium transition-colors ${
                        isActive
                          ? "bg-zinc-800 text-white"
                          : "text-zinc-500 hover:text-zinc-300"
                      }`}
                    >
                      {label}
                      <span className="ml-1 text-zinc-600">{count}</span>
                    </button>
                  );
                },
              )}
            </div>

            {documents.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 border border-dashed border-zinc-800 rounded-lg">
                <p className="text-zinc-500 text-[13px] mb-3">No documents imported yet.</p>
                <Button variant="outline" onClick={handleImport}>
                  Import Document
                </Button>
              </div>
            ) : (
              <div className="border border-border rounded-lg overflow-hidden divide-y divide-border">
                {documents
                  .filter((d) => {
                    const currentTab = activeDocTab || "all";
                    if (currentTab === "all") return true;
                    if (currentTab === "pending")
                      return (
                        d.status === "pending" || d.status === "processing"
                      );
                    return d.status === currentTab;
                  })
                  .map((doc) => (
                    <div
                      key={doc.id}
                      className="flex items-center justify-between px-4 py-3 hover:bg-zinc-900/40 transition-colors group"
                    >
                      <div className="flex items-center gap-3">
                        <div className="min-w-0">
                          <p className="text-[13px] font-medium text-white">{doc.name}</p>
                          <p className="text-[11px] text-zinc-500">
                            {new Date(doc.created_at).toLocaleString()}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[11px] font-medium ${
                            doc.status === "completed"
                              ? "bg-green-500/10 text-green-400"
                              : doc.status === "pending" ||
                                  doc.status === "processing"
                                ? "bg-yellow-500/10 text-yellow-400"
                                : doc.status === "failed"
                                  ? "bg-red-500/10 text-red-400"
                                  : "bg-zinc-800 text-zinc-400"
                          }`}
                        >
                          {doc.status}
                        </span>

                        <button
                          className="p-1.5 rounded opacity-0 group-hover:opacity-100 transition-opacity text-zinc-500 hover:text-red-400 hover:bg-red-500/10"
                          title="Remove"
                          onClick={async (e) => {
                            e.stopPropagation();
                            if (
                              !confirm(
                                `Remove "${doc.name}"? This will delete vectors from the datastore if they exist.`,
                              )
                            )
                              return;

                            try {
                              const res = await window.ipcRenderer.invoke(
                                "delete-document",
                                project?.id,
                                doc.id,
                              );
                              if (res.success) {
                                const updatedDocs =
                                  await window.ipcRenderer.getProjectDocuments(
                                    id || "",
                                  );
                                setDocuments(updatedDocs);
                                const updatedProject =
                                  await window.ipcRenderer.invoke(
                                    "get-project",
                                    id,
                                  );
                                setProject(updatedProject);
                              }
                            } catch (err) {
                              alert("Failed to delete: " + String(err));
                            }
                          }}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M3 6h18" />
                            <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                            <path d="M8 6V4c0-1 1-2 2-2h4c0 1 1 2 2 2v2" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  ))}
                {documents.filter((d) => {
                  const currentTab = activeDocTab || "all";
                  if (currentTab === "all") return true;
                  if (currentTab === "pending")
                    return d.status === "pending" || d.status === "processing";
                  return d.status === currentTab;
                }).length === 0 && (
                  <div className="text-center py-8 text-zinc-500 text-[13px]">
                    No documents in this category.
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {activeTab === "search" && <SearchComponent projectId={id!} />}

        {activeTab === "settings" && (
          <div className="max-w-xl space-y-6">
            {/* Save/Discard bar */}
            <div
              className={`flex items-center justify-between px-3 py-2 rounded-md border text-[13px] ${
                hasUnsavedChanges
                  ? "bg-amber-500/5 border-amber-500/30"
                  : "bg-zinc-900/30 border-border"
              }`}
            >
              <div className="flex items-center gap-2">
                <div
                  className={`w-1.5 h-1.5 rounded-full ${
                    hasUnsavedChanges ? "bg-amber-500" : "bg-green-500"
                  }`}
                />
                <span
                  className={`text-[12px] ${
                    hasUnsavedChanges ? "text-amber-400" : "text-zinc-500"
                  }`}
                >
                  {hasUnsavedChanges ? "Unsaved changes" : "Saved"}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {hasUnsavedChanges && (
                  <Button variant="ghost" size="sm" onClick={discardChanges}>
                    Discard
                  </Button>
                )}
                <Button
                  size="sm"
                  onClick={saveSettings}
                  disabled={!hasUnsavedChanges || isSaving}
                >
                  {isSaving ? "Saving..." : "Save"}
                </Button>
              </div>
            </div>

            {/* Embedding Setup */}
            <section>
              <h3 className="text-[12px] font-medium text-zinc-400 uppercase tracking-wider mb-3">
                Embedding
              </h3>
              <div className="border border-border rounded-lg p-4 space-y-4">
                <div>
                  <label className="block text-[12px] font-medium text-zinc-500 mb-1.5">
                    Provider
                  </label>
                  <select
                    className="w-full bg-zinc-950 border border-border rounded-md px-3 py-2 text-[13px] text-white focus:outline-none focus:ring-1 focus:ring-ring"
                    value={draftEmbedding?.provider || "ollama"}
                    onChange={(e) => {
                      setDraftEmbedding({
                        ...draftEmbedding,
                        provider: e.target.value,
                      });
                    }}
                  >
                    <option value="ollama">Ollama (Local)</option>
                    <option value="openai">OpenAI</option>
                  </select>
                </div>

                {draftEmbedding?.provider === "ollama" && (
                  <div>
                    <label className="block text-[12px] font-medium text-zinc-500 mb-1.5">
                      Ollama Base URL
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        className="flex-1 bg-zinc-950 border border-border rounded-md px-3 py-2 text-[13px] text-white focus:outline-none focus:ring-1 focus:ring-ring"
                        placeholder="http://localhost:11434"
                        value={draftEmbedding?.api_key_ref || ""}
                        onChange={(e) => {
                          setDraftEmbedding({
                            ...draftEmbedding,
                            api_key_ref: e.target.value,
                          });
                        }}
                      />
                      <Button
                        variant="outline"
                        onClick={async () => {
                          const url =
                            draftEmbedding?.api_key_ref ||
                            "http://localhost:11434";
                          const res =
                            await window.ipcRenderer.testOllamaConnection(url);
                          if (res.success) {
                            alert(`Connected. Ollama version: ${res.version}`);
                          } else {
                            alert(`Connection failed: ${res.error}`);
                          }
                        }}
                      >
                        Test
                      </Button>
                    </div>
                    <p className="text-[11px] text-zinc-600 mt-1">
                      Default: http://localhost:11434
                    </p>
                  </div>
                )}

                {draftEmbedding?.provider === "openai" && (
                  <div>
                    <label className="block text-[12px] font-medium text-zinc-500 mb-1.5">
                      OpenAI API Key
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="password"
                        className="flex-1 bg-zinc-950 border border-border rounded-md px-3 py-2 text-[13px] text-white focus:outline-none focus:ring-1 focus:ring-ring"
                        placeholder="sk-..."
                        value={draftEmbedding?.api_key_ref || ""}
                        onChange={(e) => {
                          setDraftEmbedding({
                            ...draftEmbedding,
                            api_key_ref: e.target.value,
                          });
                        }}
                      />
                      <Button
                        variant="outline"
                        onClick={async () => {
                          const key = draftEmbedding?.api_key_ref;
                          if (!key)
                            return alert("Please enter an API Key first");
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
                  <label className="block text-[12px] font-medium text-zinc-500 mb-1.5">
                    Model Name
                  </label>
                  {draftEmbedding?.provider === "ollama" ? (
                    <OllamaModelSelect
                      baseUrl={draftEmbedding?.api_key_ref || "http://localhost:11434"}
                      value={draftEmbedding?.model || ""}
                      onChange={(model) => {
                        setDraftEmbedding({
                          ...draftEmbedding,
                          model,
                        });
                      }}
                    />
                  ) : (
                    <>
                      <input
                        type="text"
                        className="w-full bg-zinc-950 border border-border rounded-md px-3 py-2 text-[13px] text-white focus:outline-none focus:ring-1 focus:ring-ring"
                        placeholder="e.g. text-embedding-3-small"
                        value={draftEmbedding?.model || ""}
                        onChange={(e) => {
                          setDraftEmbedding({
                            ...draftEmbedding,
                            model: e.target.value,
                          });
                        }}
                      />
                      <p className="text-[11px] text-zinc-600 mt-1">
                        e.g. text-embedding-3-small
                      </p>
                    </>
                  )}
                </div>
              </div>
            </section>

            {/* Chunking */}
            <section>
              <h3 className="text-[12px] font-medium text-zinc-400 uppercase tracking-wider mb-3">
                Chunking
              </h3>
              <div className="border border-border rounded-lg p-4 space-y-4">
                <div>
                  <label className="block text-[12px] font-medium text-zinc-500 mb-1.5">
                    Strategy
                  </label>
                  <select
                    className="w-full bg-zinc-950 border border-border rounded-md px-3 py-2 text-[13px] text-white focus:outline-none focus:ring-1 focus:ring-ring"
                    value={draftChunking?.strategy || "fixed"}
                    onChange={(e) => {
                      setDraftChunking({
                        ...draftChunking,
                        strategy: e.target.value,
                      });
                    }}
                  >
                    <option value="fixed">Fixed Size</option>
                    <option value="sentence">Sentence-based</option>
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[12px] font-medium text-zinc-500 mb-1.5">
                      Chunk Size
                    </label>
                    <input
                      type="number"
                      min="100"
                      max="10000"
                      className="w-full bg-zinc-950 border border-border rounded-md px-3 py-2 text-[13px] text-white focus:outline-none focus:ring-1 focus:ring-ring"
                      value={draftChunking?.chunk_size || 1000}
                      onChange={(e) => {
                        setDraftChunking({
                          ...draftChunking,
                          chunk_size: parseInt(e.target.value) || 1000,
                        });
                      }}
                    />
                  </div>
                  <div>
                    <label className="block text-[12px] font-medium text-zinc-500 mb-1.5">
                      Overlap
                    </label>
                    <input
                      type="number"
                      min="0"
                      max="500"
                      className="w-full bg-zinc-950 border border-border rounded-md px-3 py-2 text-[13px] text-white focus:outline-none focus:ring-1 focus:ring-ring"
                      value={draftChunking?.chunk_overlap || 100}
                      onChange={(e) => {
                        setDraftChunking({
                          ...draftChunking,
                          chunk_overlap: parseInt(e.target.value) || 100,
                        });
                      }}
                    />
                  </div>
                </div>
              </div>
            </section>

            {/* Vector Database */}
            <section>
              <h3 className="text-[12px] font-medium text-zinc-400 uppercase tracking-wider mb-3">
                Vector Database
              </h3>
              <div className="border border-border rounded-lg p-4 space-y-4">
                <div>
                  <label className="block text-[12px] font-medium text-zinc-500 mb-1.5">
                    Provider
                  </label>
                  <select
                    className="w-full bg-zinc-950 border border-border rounded-md px-3 py-2 text-[13px] text-white focus:outline-none focus:ring-1 focus:ring-ring"
                    value={draftVectorStore?.provider || "pgvector"}
                    onChange={(e) => {
                      setDraftVectorStore({
                        ...draftVectorStore,
                        provider: e.target.value,
                      });
                    }}
                  >
                    <option value="pgvector">PostgreSQL (pgvector)</option>
                    <option value="chroma">ChromaDB</option>
                    <option value="qdrant">Qdrant</option>
                  </select>
                </div>

                {draftVectorStore?.provider === "pgvector" && (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-[12px] font-medium text-zinc-500 mb-1.5">
                        Connection String
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          className="flex-1 bg-zinc-950 border border-border rounded-md px-3 py-2 text-[13px] text-white font-mono focus:outline-none focus:ring-1 focus:ring-ring"
                          placeholder="postgresql://user:password@localhost:5432/dbname"
                          value={draftVectorStore?.url || ""}
                          onChange={(e) => {
                            setDraftVectorStore({
                              ...draftVectorStore,
                              url: e.target.value,
                            });
                          }}
                        />
                        <Button
                          variant="outline"
                          onClick={async () => {
                            const res =
                              await window.ipcRenderer.testPostgresConnection(
                                draftVectorStore?.url || "",
                              );
                            if (res.success) {
                              alert(
                                `Connected. Tables: ${res.tables.join(", ")}`,
                              );
                              setAvailableTables(res.tables);
                            } else {
                              alert(`Connection failed: ${res.error}`);
                            }
                          }}
                        >
                          Test
                        </Button>
                      </div>
                    </div>

                    {availableTables.length > 0 && (
                      <div className="space-y-3 pt-3 border-t border-border">
                        <p className="text-[12px] font-medium text-zinc-400">Tables</p>

                        <div>
                          <label className="block text-[11px] text-zinc-500 mb-1">
                            Documents Table
                          </label>
                          <input
                            list="tables-list"
                            type="text"
                            className="w-full bg-zinc-950 border border-border rounded-md px-3 py-2 text-[13px] text-white focus:outline-none focus:ring-1 focus:ring-ring"
                            value={
                              project?.vector_store_config?.documentTable || ""
                            }
                            onChange={(e) => {
                              const newConfig = {
                                ...project?.vector_store_config,
                                documentTable: e.target.value,
                              };
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

                        <div>
                          <label className="block text-[11px] text-zinc-500 mb-1">
                            Chunks Table
                          </label>
                          <input
                            list="tables-list"
                            type="text"
                            className="w-full bg-zinc-950 border border-border rounded-md px-3 py-2 text-[13px] text-white focus:outline-none focus:ring-1 focus:ring-ring"
                            value={
                              project?.vector_store_config?.chunkTable || ""
                            }
                            onChange={(e) => {
                              const newConfig = {
                                ...project?.vector_store_config,
                                chunkTable: e.target.value,
                              };
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

                        <div>
                          <label className="block text-[11px] text-zinc-500 mb-1">
                            Embeddings Table
                          </label>
                          <input
                            list="tables-list"
                            type="text"
                            className="w-full bg-zinc-950 border border-border rounded-md px-3 py-2 text-[13px] text-white focus:outline-none focus:ring-1 focus:ring-ring"
                            value={
                              project?.vector_store_config?.embeddingTable || ""
                            }
                            onChange={(e) => {
                              const newConfig = {
                                ...project?.vector_store_config,
                                embeddingTable: e.target.value,
                              };
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

                        <datalist id="tables-list">
                          {availableTables.map((t) => (
                            <option key={t} value={t} />
                          ))}
                        </datalist>

                        <p className="text-[11px] text-zinc-600">
                          Tables are auto-created during processing if they don't exist.
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {draftVectorStore?.provider === "chroma" && (
                  <div>
                    <label className="block text-[12px] font-medium text-zinc-500 mb-1.5">
                      ChromaDB URL
                    </label>
                    <input
                      type="text"
                      className="w-full bg-zinc-950 border border-border rounded-md px-3 py-2 text-[13px] text-white focus:outline-none focus:ring-1 focus:ring-ring"
                      placeholder="http://localhost:8000"
                      value={draftVectorStore?.url || ""}
                      onChange={(e) => {
                        setDraftVectorStore({
                          ...draftVectorStore,
                          url: e.target.value,
                        });
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
