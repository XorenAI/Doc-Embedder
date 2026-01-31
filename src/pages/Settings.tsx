import { useState, useEffect } from "react";
import {
  Settings as SettingsIcon,
  Palette,
  Database,
  Cpu,
  Save,
  Check,
} from "lucide-react";
import { Button } from "../components/ui/button";
import { useTheme } from "../components/ThemeProvider";

interface AppSettings {
  // Theme is handled by ThemeProvider
  defaultEmbeddingProvider: "ollama" | "openai";
  defaultEmbeddingModel: string;
  defaultVectorProvider: "pgvector" | "chroma";
  defaultVectorUrl: string;
}

export function Settings() {
  const { setTheme, theme } = useTheme();
  const [settings, setSettings] = useState<AppSettings>({
    defaultEmbeddingProvider: "ollama",
    defaultEmbeddingModel: "nomic-embed-text",
    defaultVectorProvider: "pgvector",
    defaultVectorUrl: "postgresql://postgres:password@localhost:5432/vectordb",
  });

  const [saved, setSaved] = useState(false);

  // Load ONLY non-theme settings from localStorage on mount (theme is handled by provider)
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
      // Merge current theme (handled by Provider) with new settings
      const newSettings = { ...current, ...settings };
      localStorage.setItem("app_settings", JSON.stringify(newSettings));
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="flex-1 h-full overflow-y-auto bg-background p-8">
      <header className="flex justify-between items-center mb-10">
        <div>
          <h1 className="text-2xl font-semibold text-white mb-1 flex items-center gap-3">
            <SettingsIcon className="w-6 h-6 text-zinc-400" />
            Settings
          </h1>
          <p className="text-zinc-400 text-sm">
            Manage global application defaults and preferences.
          </p>
        </div>
        <Button
          onClick={handleSave}
          className={`gap-2 min-w-[120px] transition-all duration-300 ${
            saved
              ? "bg-green-600 hover:bg-green-500"
              : "bg-blue-600 hover:bg-blue-500"
          }`}
        >
          {saved ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
          {saved ? "Saved" : "Save Changes"}
        </Button>
      </header>

      <div className="max-w-4xl space-y-8">
        {/* Appearance Section */}
        <section className="space-y-4">
          <h3 className="text-lg font-medium text-white flex items-center gap-2 border-b border-white/5 pb-2">
            <Palette className="w-5 h-5 text-purple-400" />
            Appearance
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-zinc-900/40 p-6 rounded-lg border border-white/5">
            <div className="space-y-3">
              <label className="text-sm font-medium text-zinc-300">Theme</label>
              <div className="grid grid-cols-3 gap-3">
                {(["dark", "light", "system"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setTheme(t)}
                    className={`px-4 py-2 rounded-md text-sm border transition-all ${
                      theme === t
                        ? "bg-blue-600/20 border-blue-500/50 text-blue-400 ring-2 ring-blue-500/20"
                        : "bg-zinc-950 border-zinc-800 text-zinc-400 hover:bg-zinc-900 hover:border-zinc-700"
                    }`}
                  >
                    {t.charAt(0).toUpperCase() + t.slice(1)}
                  </button>
                ))}
              </div>
              <p className="text-xs text-zinc-500">
                Select your preferred interface theme.
              </p>
            </div>
          </div>
        </section>

        {/* Global Embedding Defaults */}
        <section className="space-y-4">
          <h3 className="text-lg font-medium text-white flex items-center gap-2 border-b border-white/5 pb-2">
            <Cpu className="w-5 h-5 text-blue-400" />
            Embedding Defaults
          </h3>
          <div className="bg-zinc-900/40 p-6 rounded-lg border border-white/5 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-300">
                  Default Provider
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
                  className="w-full bg-zinc-950 border border-zinc-700/50 rounded-md px-3 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                >
                  <option value="ollama">Ollama (Local)</option>
                  <option value="openai">OpenAI</option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-300">
                  Default Model
                </label>
                <input
                  type="text"
                  value={settings.defaultEmbeddingModel}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      defaultEmbeddingModel: e.target.value,
                    })
                  }
                  className="w-full bg-zinc-950 border border-zinc-700/50 rounded-md px-3 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                  placeholder="e.g. nomic-embed-text"
                />
              </div>
            </div>
            <p className="text-xs text-zinc-500 bg-blue-500/5 border border-blue-500/10 p-3 rounded">
              These settings will be used as the default configuration when
              creating new projects.
            </p>
          </div>
        </section>

        {/* Global Vector Database Defaults */}
        <section className="space-y-4">
          <h3 className="text-lg font-medium text-white flex items-center gap-2 border-b border-white/5 pb-2">
            <Database className="w-5 h-5 text-green-400" />
            Vector Database Defaults
          </h3>
          <div className="bg-zinc-900/40 p-6 rounded-lg border border-white/5 space-y-6">
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-300">
                  Default Provider
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
                  className="w-full bg-zinc-950 border border-zinc-700/50 rounded-md px-3 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                >
                  <option value="pgvector">PostgreSQL (pgvector)</option>
                  <option value="chroma">ChromaDB</option>
                  <option value="qdrant" disabled>
                    Qdrant (Coming Soon)
                  </option>
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-300">
                  Connection String / URL
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
                  className="w-full bg-zinc-950 border border-zinc-700/50 rounded-md px-3 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 font-mono text-sm"
                  placeholder="postgresql://user:pass@localhost:5432/db"
                />
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
