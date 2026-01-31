import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, FileText, Boxes, ArrowRight, FolderOpen } from "lucide-react";
import { Button } from "../components/ui/button";
import { CreateProjectDialog } from "../components/features/CreateProjectDialog";
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

  const createProject = async (name: string, description: string) => {
    await window.ipcRenderer.invoke("create-project", name, description);
    await fetchProjects();
  };

  return { projects, loading, createProject };
};

export function ProjectsPage() {
  const { projects, loading, createProject } = useProjects();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const navigate = useNavigate();

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
          onClick={() => setIsCreateOpen(true)}
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
          <Button onClick={() => setIsCreateOpen(true)} variant="outline">
            Create First Project
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {projects.map((project) => (
            <div
              key={project.id}
              onClick={() => navigate(`/projects/${project.id}`)}
              className="group flex items-center justify-between p-4 bg-card border border-border transition-all hover:bg-zinc-900/50 hover:border-zinc-700 cursor-pointer rounded-lg"
            >
              <div className="flex items-center gap-4 min-w-0">
                <div className="flex-shrink-0 w-8 h-8 rounded bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-500 group-hover:text-zinc-300 transition-colors">
                  <span className="text-xs font-semibold">
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

                <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                  <ArrowRight className="w-4 h-4 text-zinc-600" />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <CreateProjectDialog
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onCreate={createProject}
      />
    </div>
  );
}
