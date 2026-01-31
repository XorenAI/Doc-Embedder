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
  Search as SearchIcon,
} from "lucide-react";
import { Button } from "../components/ui/button";
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
  const [availableTables, setAvailableTables] = useState<string[]>([]); // For PG tables
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
        // Refresh documents list

        const updatedDocs = await window.ipcRenderer.getProjectDocuments(id);
        setDocuments(updatedDocs);

        // Refresh project stats (doc count)

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

  // Draft state for settings - allows editing without immediate save
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

  // Initialize drafts when project loads
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
  }, [project?.id]); // Only reset when project changes

  // Check if there are unsaved changes
  const hasUnsavedChanges =
    project &&
    (JSON.stringify(draftEmbedding) !==
      JSON.stringify(project.embedding_config || {}) ||
      JSON.stringify(draftChunking) !==
        JSON.stringify(project.chunking_config || {}) ||
      JSON.stringify(draftVectorStore) !==
        JSON.stringify(project.vector_store_config || {}));

  // Save all settings
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
      // Re-sync drafts with saved values
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

  // Revert to saved values
  const discardChanges = () => {
    if (!project) return;
    setDraftEmbedding(project.embedding_config || {});
    setDraftChunking(project.chunking_config || {});
    setDraftVectorStore(project.vector_store_config || {});
  };

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

                  const res = await window.ipcRenderer.processProject(id!);
                  console.log("Processing result:", res);

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
            onClick={() => setActiveTab("search")}
            className={`pb-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${activeTab === "search" ? "border-blue-500 text-blue-400" : "border-transparent text-zinc-400 hover:text-zinc-200"}`}
          >
            <SearchIcon className="w-4 h-4" />
            Search
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
        {activeTab === "documents" && (
          <div className="space-y-6">
            {/* Status Tabs */}
            <div className="flex gap-2 border-b border-white/5 pb-4 overflow-x-auto">
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
                        ? d.status === "pending" || d.status === "processing" // Group pending/processing
                        : d.status === status,
                  ).length;

                  const isActive = (activeDocTab || "all") === status; // We need a new state for this sub-tab

                  return (
                    <button
                      key={status}
                      onClick={() => setActiveDocTab(status)}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors flex items-center gap-2 ${
                        isActive
                          ? "bg-blue-600 text-white shadow-lg shadow-blue-500/20"
                          : "bg-zinc-900 border border-zinc-800 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
                      }`}
                    >
                      {label}
                      <span
                        className={`px-1.5 py-0.5 rounded-full text-[10px] ${
                          isActive
                            ? "bg-white/20 text-white"
                            : "bg-zinc-800 text-zinc-500"
                        }`}
                      >
                        {count}
                      </span>
                    </button>
                  );
                },
              )}
            </div>

            {documents.length === 0 ? (
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
                      className="flex items-center justify-between p-4 bg-zinc-900/40 border border-white/5 rounded-lg hover:bg-zinc-900/60 transition-colors group"
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-10 h-10 rounded flex items-center justify-center ${
                            doc.status === "completed"
                              ? "bg-green-500/10 text-green-400"
                              : doc.status === "failed"
                                ? "bg-red-500/10 text-red-400"
                                : "bg-blue-500/10 text-blue-400"
                          }`}
                        >
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
                            doc.status === "completed"
                              ? "bg-green-500/10 text-green-400"
                              : doc.status === "pending" ||
                                  doc.status === "processing"
                                ? "bg-yellow-500/10 text-yellow-400"
                                : "bg-zinc-800 text-zinc-400"
                          }`}
                        >
                          {doc.status}
                        </span>

                        <Button
                          variant="ghost"
                          size="icon"
                          className="opacity-0 group-hover:opacity-100 transition-opacity text-zinc-500 hover:text-red-400 hover:bg-red-500/10"
                          title="Remove Document"
                          onClick={async (e) => {
                            e.stopPropagation();
                            if (
                              !confirm(
                                `Are you sure you want to remove "${doc.name}"? This will delete vectors from the datastore if they exist.`,
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
                                // Refresh list
                                const updatedDocs =
                                  await window.ipcRenderer.getProjectDocuments(
                                    id || "",
                                  );
                                setDocuments(updatedDocs);
                                // Refresh project stats
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
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="16"
                            height="16"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            className="lucide lucide-trash-2"
                          >
                            <path d="M3 6h18" />
                            <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                            <path d="M8 6V4c0-1 1-2 2-2h4c0 1 1 2 2 2v2" />
                            <line x1="10" x2="10" y1="11" y2="17" />
                            <line x1="14" x2="14" y1="11" y2="17" />
                          </svg>
                        </Button>
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
                  <div className="text-center py-10 text-zinc-500 text-sm">
                    No documents in this category.
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {activeTab === "search" && <SearchComponent projectId={id!} />}

        {activeTab === "settings" && (
          <div className="max-w-2xl space-y-8">
            {/* Save/Discard Header */}
            <div
              className={`flex items-center justify-between p-4 rounded-lg border transition-all ${
                hasUnsavedChanges
                  ? "bg-amber-500/10 border-amber-500/50 shadow-[0_0_15px_rgba(245,158,11,0.15)]"
                  : "bg-zinc-900/30 border-zinc-700/30"
              }`}
            >
              <div className="flex items-center gap-2">
                {hasUnsavedChanges ? (
                  <>
                    <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                    <span className="text-amber-400 font-medium text-sm">
                      Unsaved Changes
                    </span>
                  </>
                ) : (
                  <>
                    <div className="w-2 h-2 rounded-full bg-green-500" />
                    <span className="text-green-400/70 text-sm">
                      All changes saved
                    </span>
                  </>
                )}
              </div>
              <div className="flex items-center gap-2">
                {hasUnsavedChanges && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={discardChanges}
                    className="text-zinc-400 hover:text-white"
                  >
                    Discard
                  </Button>
                )}
                <Button
                  variant={hasUnsavedChanges ? "default" : "outline"}
                  size="sm"
                  onClick={saveSettings}
                  disabled={!hasUnsavedChanges || isSaving}
                  className={
                    hasUnsavedChanges
                      ? "bg-amber-500 hover:bg-amber-600 text-black"
                      : ""
                  }
                >
                  {isSaving ? "Saving..." : "Save Settings"}
                </Button>
              </div>
            </div>

            <section className="space-y-4">
              <h3 className="text-lg font-medium text-white flex items-center gap-2">
                <Database className="w-5 h-5 text-blue-500" />
                Embedding Setup
              </h3>
              <div
                className={`bg-zinc-900/50 border rounded-lg p-6 space-y-6 transition-all ${
                  JSON.stringify(draftEmbedding) !==
                  JSON.stringify(project?.embedding_config || {})
                    ? "border-amber-500/50 shadow-[0_0_10px_rgba(245,158,11,0.1)]"
                    : "border-border"
                }`}
              >
                <div>
                  <label className="block text-sm font-medium text-zinc-400 mb-2">
                    Embedding Provider
                  </label>
                  <select
                    className="w-full bg-zinc-950 border border-zinc-700/50 rounded-md px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
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
                    <label className="block text-sm font-medium text-zinc-400 mb-2">
                      Ollama Base URL
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        className="flex-1 bg-zinc-950 border border-zinc-700/50 rounded-md px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
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
                        className="shrink-0"
                        onClick={async () => {
                          const url =
                            draftEmbedding?.api_key_ref ||
                            "http://localhost:11434";

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

                {draftEmbedding?.provider === "openai" && (
                  <div>
                    <label className="block text-sm font-medium text-zinc-400 mb-2">
                      OpenAI API Key
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="password"
                        className="flex-1 bg-zinc-950 border border-zinc-700/50 rounded-md px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
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
                        className="shrink-0"
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
                  <label className="block text-sm font-medium text-zinc-400 mb-2">
                    Embedding Model Name
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      className="flex-1 bg-zinc-950 border border-zinc-700/50 rounded-md px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                      placeholder="e.g. nomic-embed-text"
                      value={draftEmbedding?.model || ""}
                      onChange={(e) => {
                        setDraftEmbedding({
                          ...draftEmbedding,
                          model: e.target.value,
                        });
                      }}
                    />
                    {draftEmbedding?.provider === "ollama" && (
                      <Button
                        variant="outline"
                        className="shrink-0"
                        onClick={async () => {
                          const url =
                            draftEmbedding?.api_key_ref ||
                            "http://localhost:11434";
                          const model = draftEmbedding?.model;
                          if (!model)
                            return alert("Please enter a model name first");

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
                    {draftEmbedding?.provider === "ollama"
                      ? "Make sure you have pulled this model: `ollama pull nomic-embed-text`"
                      : "e.g. text-embedding-3-small"}
                  </p>
                </div>
              </div>
            </section>

            <section className="space-y-4">
              <h3 className="text-lg font-medium text-white flex items-center gap-2">
                <Boxes className="w-5 h-5 text-purple-500" />
                Chunking Configuration
              </h3>
              <div
                className={`bg-zinc-900/50 border rounded-lg p-6 space-y-6 transition-all ${
                  JSON.stringify(draftChunking) !==
                  JSON.stringify(project?.chunking_config || {})
                    ? "border-amber-500/50 shadow-[0_0_10px_rgba(245,158,11,0.1)]"
                    : "border-border"
                }`}
              >
                <div>
                  <label className="block text-sm font-medium text-zinc-400 mb-2">
                    Chunking Strategy
                  </label>
                  <select
                    className="w-full bg-zinc-950 border border-zinc-700/50 rounded-md px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50"
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
                  <p className="text-xs text-zinc-500 mt-1">
                    Fixed Size splits by character count; Sentence-based splits
                    by sentence boundaries.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-zinc-400 mb-2">
                      Chunk Size (characters)
                    </label>
                    <input
                      type="number"
                      min="100"
                      max="10000"
                      className="w-full bg-zinc-950 border border-zinc-700/50 rounded-md px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50"
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
                    <label className="block text-sm font-medium text-zinc-400 mb-2">
                      Chunk Overlap (characters)
                    </label>
                    <input
                      type="number"
                      min="0"
                      max="500"
                      className="w-full bg-zinc-950 border border-zinc-700/50 rounded-md px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50"
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

            <section className="space-y-4">
              <h3 className="text-lg font-medium text-white flex items-center gap-2">
                <Database className="w-5 h-5 text-green-500" />
                Vector Database
              </h3>
              <div
                className={`bg-zinc-900/50 border rounded-lg p-6 space-y-6 transition-all ${
                  JSON.stringify(draftVectorStore) !==
                  JSON.stringify(project?.vector_store_config || {})
                    ? "border-amber-500/50 shadow-[0_0_10px_rgba(245,158,11,0.1)]"
                    : "border-border"
                }`}
              >
                <div>
                  <label className="block text-sm font-medium text-zinc-400 mb-2">
                    Vector Store Provider
                  </label>
                  <select
                    className="w-full bg-zinc-950 border border-zinc-700/50 rounded-md px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-green-500/50"
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
                      <label className="block text-sm font-medium text-zinc-400 mb-2">
                        Connection String
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          className="flex-1 bg-zinc-950 border border-zinc-700/50 rounded-md px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-green-500/50"
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
                          className="shrink-0"
                          onClick={async () => {
                            const res =
                              await window.ipcRenderer.testPostgresConnection(
                                draftVectorStore?.url || "",
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
