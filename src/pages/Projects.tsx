import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Plus,
  ChevronRight,
  Archive,
  ArchiveRestore,
  Copy,
  Download,
  Upload,
} from "lucide-react";
import { Button } from "../components/ui/button";
import { ProjectDialog } from "../components/features/ProjectDialog";
import { Project } from "../types";

const useProjects = () => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [showArchived, setShowArchived] = useState(false);

  const fetchProjects = async (includeArchived = showArchived) => {
    try {
      const data = await window.ipcRenderer.invoke(
        "get-projects",
        includeArchived,
      );
      setProjects(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProjects(showArchived);
  }, [showArchived]);

  const createProject = async (data: {
    name: string;
    description: string;
    color: string;
  }) => {
    await window.ipcRenderer.invoke(
      "create-project",
      data.name,
      data.description,
      data.color,
    );
    await fetchProjects();
  };

  const updateProject = async (
    id: string,
    data: { name: string; description: string; color: string },
  ) => {
    await window.ipcRenderer.invoke("update-project", id, data);
    await fetchProjects();
  };

  const deleteProject = async (id: string) => {
    await window.ipcRenderer.invoke("delete-project", id);
    await fetchProjects();
  };

  const archiveProject = async (id: string, archived: boolean) => {
    await window.ipcRenderer.archiveProject(id, archived);
    await fetchProjects();
  };

  const duplicateProject = async (id: string) => {
    await window.ipcRenderer.duplicateProject(id);
    await fetchProjects();
  };

  const exportConfig = async (id: string) => {
    await window.ipcRenderer.exportProjectConfig(id);
  };

  const importConfig = async () => {
    const result = await window.ipcRenderer.importProjectConfig();
    if (result) await fetchProjects();
  };

  return {
    projects,
    loading,
    showArchived,
    setShowArchived,
    createProject,
    updateProject,
    deleteProject,
    archiveProject,
    duplicateProject,
    exportConfig,
    importConfig,
  };
};

export function ProjectsPage() {
  const {
    projects,
    loading,
    showArchived,
    setShowArchived,
    createProject,
    updateProject,
    deleteProject,
    archiveProject,
    duplicateProject,
    exportConfig,
    importConfig,
  } = useProjects();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | undefined>(
    undefined,
  );
  const navigate = useNavigate();

  const handleCreateOpen = () => {
    setEditingProject(undefined);
    setIsDialogOpen(true);
  };

  const handleEditProject = (project: Project) => {
    setEditingProject(project);
    setIsDialogOpen(true);
  };

  const handleDeleteProject = async (id: string) => {
    if (
      confirm(
        "Are you sure you want to delete this project? All documents and their vectors will be permanently removed.",
      )
    ) {
      await deleteProject(id);
    }
  };

  const handleSaveProject = async (data: {
    name: string;
    description: string;
    color: string;
  }) => {
    if (editingProject) {
      await updateProject(editingProject.id, data);
    } else {
      await createProject(data);
    }
  };

  return (
    <div className="flex-1 h-full overflow-y-auto bg-background p-6">
      <header className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-lg font-medium text-white">Projects</h1>
          <p className="text-zinc-500 text-[13px] mt-0.5">
            Manage your document collections and embedding pipelines.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={importConfig}>
            <Upload className="w-3.5 h-3.5 mr-1.5" />
            Import
          </Button>
          <Button onClick={handleCreateOpen}>
            <Plus className="w-3.5 h-3.5 mr-1.5" />
            New Project
          </Button>
        </div>
      </header>

      {/* Show archived toggle */}
      <div className="flex items-center gap-2 mb-4">
        <button
          onClick={() => setShowArchived(!showArchived)}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-[12px] font-medium transition-colors ${
            showArchived
              ? "bg-zinc-800 text-white"
              : "text-zinc-500 hover:text-zinc-300"
          }`}
        >
          <Archive className="w-3 h-3" />
          {showArchived ? "Showing archived" : "Show archived"}
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64 text-zinc-500 text-[13px]">
          Loading projects...
        </div>
      ) : projects.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-[50vh] border border-dashed border-zinc-800 rounded-lg text-center p-6">
          <p className="text-[13px] text-zinc-400 mb-4">
            {showArchived
              ? "No projects found."
              : "No projects yet. Create one to get started."}
          </p>
          {!showArchived && (
            <Button onClick={handleCreateOpen} variant="outline">
              Create First Project
            </Button>
          )}
        </div>
      ) : (
        <div className="border border-border rounded-lg overflow-hidden divide-y divide-border">
          {projects.map((project) => (
            <div
              key={project.id}
              onClick={() => navigate(`/projects/${project.id}`)}
              className={`group flex items-center justify-between px-4 py-3 hover:bg-zinc-900/40 cursor-pointer transition-colors ${
                project.archived ? "opacity-50" : ""
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className="flex-shrink-0 w-2 h-2 rounded-full"
                  style={{ backgroundColor: project.color || "#2563eb" }}
                />
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-[13px] font-medium text-white truncate">
                      {project.name}
                    </h3>
                    {project.archived && (
                      <span className="text-[10px] text-zinc-500 bg-zinc-800 px-1.5 py-0.5 rounded">
                        Archived
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-zinc-500 truncate max-w-md">
                    {project.description || "No description"}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-6 text-[11px] text-zinc-500">
                <div className="hidden md:flex items-center gap-4">
                  <span>{project.document_count || 0} docs</span>
                  <span>{project.chunk_count || 0} chunks</span>
                </div>

                <span className="w-20 text-right">
                  {new Date(project.updated_at).toLocaleDateString()}
                </span>

                <div
                  className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={(e) => e.stopPropagation()}
                >
                  {/* Duplicate */}
                  <button
                    className="p-1.5 rounded hover:bg-zinc-800 text-zinc-500 hover:text-white transition-colors"
                    title="Duplicate"
                    onClick={(e) => {
                      e.stopPropagation();
                      duplicateProject(project.id);
                    }}
                  >
                    <Copy className="w-[13px] h-[13px]" strokeWidth={2} />
                  </button>
                  {/* Export */}
                  <button
                    className="p-1.5 rounded hover:bg-zinc-800 text-zinc-500 hover:text-white transition-colors"
                    title="Export Config"
                    onClick={(e) => {
                      e.stopPropagation();
                      exportConfig(project.id);
                    }}
                  >
                    <Download className="w-[13px] h-[13px]" strokeWidth={2} />
                  </button>
                  {/* Archive / Unarchive */}
                  <button
                    className="p-1.5 rounded hover:bg-zinc-800 text-zinc-500 hover:text-white transition-colors"
                    title={project.archived ? "Unarchive" : "Archive"}
                    onClick={(e) => {
                      e.stopPropagation();
                      archiveProject(project.id, !project.archived);
                    }}
                  >
                    {project.archived ? (
                      <ArchiveRestore
                        className="w-[13px] h-[13px]"
                        strokeWidth={2}
                      />
                    ) : (
                      <Archive
                        className="w-[13px] h-[13px]"
                        strokeWidth={2}
                      />
                    )}
                  </button>
                  {/* Edit */}
                  <button
                    className="p-1.5 rounded hover:bg-zinc-800 text-zinc-500 hover:text-white transition-colors"
                    title="Edit"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleEditProject(project);
                    }}
                  >
                    <svg
                      width="13"
                      height="13"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M12 20h9" />
                      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
                    </svg>
                  </button>
                  {/* Delete */}
                  <button
                    className="p-1.5 rounded hover:bg-red-500/10 text-zinc-500 hover:text-red-400 transition-colors"
                    title="Delete"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteProject(project.id);
                    }}
                  >
                    <svg
                      width="13"
                      height="13"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M3 6h18" />
                      <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                      <path d="M8 6V4c0-1 1-2 2-2h4c0 1 1 2 2 2v2" />
                    </svg>
                  </button>
                </div>

                <ChevronRight className="w-3.5 h-3.5 text-zinc-600" />
              </div>
            </div>
          ))}
        </div>
      )}

      <ProjectDialog
        isOpen={isDialogOpen}
        onClose={() => setIsDialogOpen(false)}
        onSubmit={handleSaveProject}
        project={editingProject}
      />
    </div>
  );
}
