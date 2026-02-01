import { useState, useEffect } from "react";
import { Button } from "../components/ui/button";
import { OllamaModelSelect } from "../components/ui/OllamaModelSelect";
import { useTheme } from "../components/ThemeProvider";

interface AppSettings {
  defaultEmbeddingProvider: "ollama" | "openai";
  defaultEmbeddingModel: string;
  defaultOllamaUrl: string;
  defaultVectorProvider: "pgvector" | "chroma";
  defaultVectorUrl: string;
}

export function Settings() {
  const { setTheme, theme } = useTheme();
  const [settings, setSettings] = useState<AppSettings>({
    defaultEmbeddingProvider: "ollama",
    defaultEmbeddingModel: "nomic-embed-text",
    defaultOllamaUrl: "http://localhost:11434",
    defaultVectorProvider: "pgvector",
    defaultVectorUrl: "postgresql://postgres:password@localhost:5432/vectordb",
  });

  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("app_settings");
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        setSettings((prev) => ({ ...prev, ...parsed }));
      } catch (e) {
        console.error("Failed to parse settings", e);
      }
    }
  }, []);

  const handleSave = () => {
    try {
      const stored = localStorage.getItem("app_settings");
      const current = stored ? JSON.parse(stored) : {};
      const newSettings = { ...current, ...settings };
      localStorage.setItem("app_settings", JSON.stringify(newSettings));
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="flex-1 h-full overflow-y-auto bg-background p-6">
      <header className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-lg font-medium text-white">Settings</h1>
          <p className="text-zinc-500 text-[13px] mt-0.5">
            Global application defaults and preferences.
          </p>
        </div>
        <Button onClick={handleSave}>
          {saved ? "Saved" : "Save Changes"}
        </Button>
      </header>

      <div className="max-w-xl space-y-6">
        {/* Appearance */}
        <section>
          <h3 className="text-[12px] font-medium text-zinc-400 uppercase tracking-wider mb-3">
            Appearance
          </h3>
          <div className="border border-border rounded-lg p-4">
            <label className="block text-[12px] font-medium text-zinc-500 mb-2">Theme</label>
            <div className="flex gap-2">
              {(["dark", "light", "system"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTheme(t)}
                  className={`px-3 py-1.5 rounded-md text-[13px] border transition-colors ${
                    theme === t
                      ? "bg-zinc-800 border-zinc-700 text-white"
                      : "bg-transparent border-border text-zinc-500 hover:text-zinc-300 hover:border-zinc-700"
                  }`}
                >
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* Embedding Defaults */}
        <section>
          <h3 className="text-[12px] font-medium text-zinc-400 uppercase tracking-wider mb-3">
            Embedding Defaults
          </h3>
          <div className="border border-border rounded-lg p-4 space-y-4">
            <div>
              <label className="block text-[12px] font-medium text-zinc-500 mb-1.5">
                Provider
              </label>
              <select
                value={settings.defaultEmbeddingProvider}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    defaultEmbeddingProvider: e.target.value as
                      | "ollama"
                      | "openai",
                  })
                }
                className="w-full bg-zinc-950 border border-border rounded-md px-3 py-2 text-[13px] text-white focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="ollama">Ollama (Local)</option>
                <option value="openai">OpenAI</option>
              </select>
            </div>

            {settings.defaultEmbeddingProvider === "ollama" && (
              <div>
                <label className="block text-[12px] font-medium text-zinc-500 mb-1.5">
                  Ollama URL
                </label>
                <input
                  type="text"
                  value={settings.defaultOllamaUrl}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      defaultOllamaUrl: e.target.value,
                    })
                  }
                  className="w-full bg-zinc-950 border border-border rounded-md px-3 py-2 text-[13px] text-white font-mono focus:outline-none focus:ring-1 focus:ring-ring"
                  placeholder="http://localhost:11434"
                />
              </div>
            )}

            <div>
              <label className="block text-[12px] font-medium text-zinc-500 mb-1.5">
                Model
              </label>
              {settings.defaultEmbeddingProvider === "ollama" ? (
                <OllamaModelSelect
                  baseUrl={settings.defaultOllamaUrl}
                  value={settings.defaultEmbeddingModel}
                  onChange={(model) =>
                    setSettings({
                      ...settings,
                      defaultEmbeddingModel: model,
                    })
                  }
                />
              ) : (
                <input
                  type="text"
                  value={settings.defaultEmbeddingModel}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      defaultEmbeddingModel: e.target.value,
                    })
                  }
                  className="w-full bg-zinc-950 border border-border rounded-md px-3 py-2 text-[13px] text-white focus:outline-none focus:ring-1 focus:ring-ring"
                  placeholder="e.g. text-embedding-3-small"
                />
              )}
            </div>
            <p className="text-[11px] text-zinc-600">
              Used as defaults when creating new projects.
            </p>
          </div>
        </section>

        {/* Vector Database Defaults */}
        <section>
          <h3 className="text-[12px] font-medium text-zinc-400 uppercase tracking-wider mb-3">
            Vector Database Defaults
          </h3>
          <div className="border border-border rounded-lg p-4 space-y-4">
            <div>
              <label className="block text-[12px] font-medium text-zinc-500 mb-1.5">
                Provider
              </label>
              <select
                value={settings.defaultVectorProvider}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    defaultVectorProvider: e.target.value as
                      | "pgvector"
                      | "chroma",
                  })
                }
                className="w-full bg-zinc-950 border border-border rounded-md px-3 py-2 text-[13px] text-white focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="pgvector">PostgreSQL (pgvector)</option>
                <option value="chroma">ChromaDB</option>
                <option value="qdrant" disabled>
                  Qdrant (Coming Soon)
                </option>
              </select>
            </div>

            <div>
              <label className="block text-[12px] font-medium text-zinc-500 mb-1.5">
                Connection String
              </label>
              <input
                type="text"
                value={settings.defaultVectorUrl}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    defaultVectorUrl: e.target.value,
                  })
                }
                className="w-full bg-zinc-950 border border-border rounded-md px-3 py-2 text-[13px] text-white font-mono focus:outline-none focus:ring-1 focus:ring-ring"
                placeholder="postgresql://user:pass@localhost:5432/db"
              />
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
