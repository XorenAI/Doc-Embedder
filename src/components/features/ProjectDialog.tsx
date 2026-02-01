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
  project?: Project;
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
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />

      <div className="relative w-full max-w-sm bg-zinc-900 border border-border rounded-lg shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h2 className="text-[13px] font-medium text-white">
            {project ? "Edit Project" : "New Project"}
          </h2>
          <button
            onClick={onClose}
            className="text-zinc-500 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-3">
          <div>
            <label htmlFor="name" className="block text-[12px] font-medium text-zinc-500 mb-1.5">
              Name
            </label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Finance Q1 Reports"
              className="w-full px-3 py-2 bg-zinc-950 border border-border rounded-md text-[13px] text-white placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-ring"
              autoFocus
            />
          </div>

          <div>
            <label
              htmlFor="description"
              className="block text-[12px] font-medium text-zinc-500 mb-1.5"
            >
              Description
            </label>
            <textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What is this project about?"
              rows={2}
              className="w-full px-3 py-2 bg-zinc-950 border border-border rounded-md text-[13px] text-white placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-ring resize-none"
            />
          </div>

          <div>
            <label className="block text-[12px] font-medium text-zinc-500 mb-1.5">
              Color
            </label>
            <div className="flex flex-wrap gap-1.5">
              {COLORS.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setColor(c.value)}
                  className={`w-5 h-5 rounded-full transition-transform hover:scale-110 flex items-center justify-center ${
                    color === c.value
                      ? "ring-2 ring-white ring-offset-1 ring-offset-zinc-900"
                      : ""
                  }`}
                  style={{ backgroundColor: c.value }}
                  title={c.name}
                >
                  {color === c.value && (
                    <Check className="w-2.5 h-2.5 text-white/90" />
                  )}
                </button>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-1">
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
                  ? "Save"
                  : "Create"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
