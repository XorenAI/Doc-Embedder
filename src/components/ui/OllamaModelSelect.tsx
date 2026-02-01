import { useState, useEffect, useCallback } from "react";
import { RefreshCw, ChevronDown } from "lucide-react";
import { cn } from "../../lib/utils";

interface OllamaModel {
  name: string;
  size: number;
  modified_at: string;
}

interface OllamaModelSelectProps {
  baseUrl: string;
  value: string;
  onChange: (model: string) => void;
  className?: string;
}

function formatSize(bytes: number): string {
  if (bytes < 1e9) return `${(bytes / 1e6).toFixed(0)} MB`;
  return `${(bytes / 1e9).toFixed(1)} GB`;
}

export function OllamaModelSelect({
  baseUrl,
  value,
  onChange,
  className,
}: OllamaModelSelectProps) {
  const [models, setModels] = useState<OllamaModel[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchModels = useCallback(async () => {
    if (!baseUrl) return;
    setLoading(true);
    setError(null);
    try {
      const result = await window.ipcRenderer.getOllamaModels(baseUrl);
      if (result.success) {
        setModels(result.models);
        if (result.models.length > 0 && !value) {
          onChange(result.models[0].name);
        }
      } else {
        setError(result.error || "Failed to fetch models");
        setModels([]);
      }
    } catch (e) {
      setError((e as Error).message);
      setModels([]);
    } finally {
      setLoading(false);
    }
  }, [baseUrl]);

  useEffect(() => {
    fetchModels();
  }, [fetchModels]);

  return (
    <div className={cn("space-y-1", className)}>
      <div className="flex gap-1.5">
        <div className="relative flex-1">
          <select
            value={value}
            onChange={(e) => onChange(e.target.value)}
            disabled={loading || models.length === 0}
            className="w-full bg-zinc-950 border border-border rounded-md px-3 py-2 text-[13px] text-white focus:outline-none focus:ring-1 focus:ring-ring appearance-none disabled:opacity-50"
          >
            {models.length === 0 && !loading && (
              <option value="">
                {error ? "Connection failed" : "No models found"}
              </option>
            )}
            {models.length === 0 && loading && (
              <option value="">Loading...</option>
            )}
            {models.map((m) => (
              <option key={m.name} value={m.name}>
                {m.name} ({formatSize(m.size)})
              </option>
            ))}
            {value && !models.find((m) => m.name === value) && models.length > 0 && (
              <option value={value}>{value} (not found)</option>
            )}
          </select>
          <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500 pointer-events-none" />
        </div>
        <button
          onClick={fetchModels}
          disabled={loading}
          className="flex-shrink-0 p-2 rounded-md border border-border hover:bg-zinc-800 text-zinc-500 hover:text-white transition-colors disabled:opacity-50"
          title="Refresh models"
        >
          <RefreshCw
            className={cn("w-3.5 h-3.5", loading && "animate-spin")}
          />
        </button>
      </div>
      {error && (
        <p className="text-[11px] text-red-400/80">{error}</p>
      )}
      {!error && models.length > 0 && (
        <p className="text-[11px] text-zinc-600">
          {models.length} model{models.length !== 1 ? "s" : ""} available
        </p>
      )}
    </div>
  );
}
