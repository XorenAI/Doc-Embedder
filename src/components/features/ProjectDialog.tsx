import React, { useState, useEffect } from "react";
import { X, Check } from "lucide-react";
import { Button } from "../ui/button";
import { Project } from "../../types";

interface ProjectDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: {
    name: string;
    description: string;
    color: string;
  }) => Promise<void>;
  project?: Project; // If provided, we are in edit mode
}

const COLORS = [
  { name: "Blue", value: "#2563eb" },
  { name: "Indigo", value: "#4f46e5" },
  { name: "Purple", value: "#9333ea" },
  { name: "Pink", value: "#db2777" },
  { name: "Red", value: "#dc2626" },
  { name: "Orange", value: "#ea580c" },
  { name: "Green", value: "#16a34a" },
  { name: "Teal", value: "#0d9488" },
  { name: "Zinc", value: "#52525b" },
];

export function ProjectDialog({
  isOpen,
  onClose,
  onSubmit,
  project,
}: ProjectDialogProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState(COLORS[0].value);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      if (project) {
        setName(project.name);
        setDescription(project.description);
        setColor(project.color || COLORS[0].value);
      } else {
        setName("");
        setDescription("");
        setColor(COLORS[0].value);
      }
    }
  }, [isOpen, project]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setIsLoading(true);
    try {
      await onSubmit({ name, description, color });
      onClose();
    } catch (error) {
      console.error("Failed to save project", error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-md bg-zinc-900 border border-white/10 rounded-xl shadow-2xl overflow-hidden glass-card animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between p-6 border-b border-white/5">
          <h2 className="text-lg font-semibold text-white">
            {project ? "Edit Project" : "New Project"}
          </h2>
          <button
            onClick={onClose}
            className="text-zinc-500 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="space-y-2">
            <label htmlFor="name" className="text-sm font-medium text-zinc-300">
              Project Name
            </label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Finance Q1 Reports"
              className="w-full px-3 py-2 bg-black/20 border border-white/10 rounded-md text-white placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <label
              htmlFor="description"
              className="text-sm font-medium text-zinc-300"
            >
              Description (Optional)
            </label>
            <textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What is this project about?"
              rows={3}
              className="w-full px-3 py-2 bg-black/20 border border-white/10 rounded-md text-white placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-blue-500/50 resize-none"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-zinc-300">
              Color Tag
            </label>
            <div className="flex flex-wrap gap-2">
              {COLORS.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setColor(c.value)}
                  className={`w-6 h-6 rounded-full transition-transform hover:scale-110 flex items-center justify-center ${
                    color === c.value
                      ? "ring-2 ring-white ring-offset-2 ring-offset-zinc-900"
                      : ""
                  }`}
                  style={{ backgroundColor: c.value }}
                  title={c.name}
                >
                  {color === c.value && (
                    <Check className="w-3 h-3 text-white/90" />
                  )}
                </button>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button
              type="button"
              variant="ghost"
              onClick={onClose}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!name.trim() || isLoading}>
              {isLoading
                ? "Saving..."
                : project
                  ? "Save Changes"
                  : "Create Project"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
