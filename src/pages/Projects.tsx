import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, FileText, Boxes, ArrowRight, FolderOpen } from "lucide-react";
import { Button } from "../components/ui/button";
import { ProjectDialog } from "../components/features/ProjectDialog";
import { Project } from "../types";

// Mock IPC for now until we are sure it's linked
// In a real app we'd use a custom hook calling window.ipcRenderer
const useProjects = () => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchProjects = async () => {
    try {
      const data = await window.ipcRenderer.invoke("get-projects");
      setProjects(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProjects();
  }, []);

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

  return { projects, loading, createProject, updateProject, deleteProject };
};

export function ProjectsPage() {
  const { projects, loading, createProject, updateProject, deleteProject } =
    useProjects();
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
    <div className="flex-1 h-full overflow-y-auto bg-background p-8">
      {/* Header */}
      <header className="flex justify-between items-center mb-10">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">Projects</h1>
          <p className="text-zinc-400">
            Manage your document collections and embedding pipelines.
          </p>
        </div>
        <Button
          onClick={handleCreateOpen}
          className="gap-2 bg-linear-to-r from-blue-600 to-indigo-600 shadow-lg shadow-blue-500/25"
        >
          <Plus className="w-4 h-4" />
          New Project
        </Button>
      </header>

      {loading ? (
        <div className="flex items-center justify-center h-64 text-zinc-500">
          Loading projects...
        </div>
      ) : projects.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-[50vh] border border-dashed border-zinc-800 rounded-2xl bg-zinc-900/20 text-center p-8">
          <div className="w-16 h-16 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center mb-4">
            <FolderOpen className="w-8 h-8 text-zinc-600" />
          </div>
          <h3 className="text-xl font-semibold text-white mb-2">
            No projects yet
          </h3>
          <p className="text-zinc-500 max-w-sm mb-6">
            Create a new project to start importing documents and generating
            embeddings.
          </p>
          <Button onClick={handleCreateOpen} variant="outline">
            Create First Project
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {projects.map((project) => (
            <div
              key={project.id}
              onClick={() => navigate(`/projects/${project.id}`)}
              className="group flex items-center justify-between p-4 bg-card border border-border transition-all hover:bg-zinc-900/50 hover:border-zinc-700 cursor-pointer rounded-lg relative overflow-hidden"
            >
              {/* Color Stripe */}
              <div
                className="absolute left-0 top-0 bottom-0 w-1"
                style={{ backgroundColor: project.color || "#2563eb" }}
              />

              <div className="flex items-center gap-4 min-w-0 ml-2">
                <div
                  className="flex-shrink-0 w-8 h-8 rounded border flex items-center justify-center text-zinc-500 group-hover:text-zinc-300 transition-colors"
                  style={{
                    backgroundColor: (project.color || "#2563eb") + "20",
                    borderColor: (project.color || "#2563eb") + "40",
                  }}
                >
                  <span
                    className="text-xs font-bold"
                    style={{ color: project.color || "#2563eb" }}
                  >
                    {project.name.charAt(0).toUpperCase()}
                  </span>
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-medium text-white truncate">
                    {project.name}
                  </h3>
                  <p className="text-xs text-zinc-500 truncate max-w-md">
                    {project.description || "No description"}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-8 text-xs text-zinc-500">
                <div className="hidden md:flex items-center gap-6">
                  <div className="flex items-center gap-2" title="Documents">
                    <FileText className="w-3.5 h-3.5" />
                    <span>{project.document_count || 0}</span>
                  </div>
                  <div className="flex items-center gap-2" title="Chunks">
                    <Boxes className="w-3.5 h-3.5" />
                    <span>{project.chunk_count || 0}</span>
                  </div>
                </div>

                <div className="w-24 text-right">
                  {new Date(project.updated_at).toLocaleDateString()}
                </div>

                <div
                  className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-zinc-400 hover:text-white"
                    title="Edit Project"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleEditProject(project);
                    }}
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="14"
                      height="14"
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
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-zinc-400 hover:text-red-400 hover:bg-red-500/10"
                    title="Delete Project"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteProject(project.id);
                    }}
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="14"
                      height="14"
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
                      <line x1="10" x2="10" y1="11" y2="17" />
                      <line x1="14" x2="14" y1="11" y2="17" />
                    </svg>
                  </Button>
                  <ArrowRight className="w-4 h-4 text-zinc-600 ml-2" />
                </div>
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
