import { useState } from "react";
import { Search as SearchIcon, Loader2, FileText } from "lucide-react";
import { Button } from "../components/ui/button";

import { SearchResult } from "../types";

interface SearchProps {
  projectId: string;
}

export function Search({ projectId }: SearchProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [limit, setLimit] = useState(5);

  async function handleSearch() {
    if (!query.trim()) return;
    setLoading(true);
    setResults([]);

    try {
      const res = await window.ipcRenderer.invoke(
        "search-project",
        projectId,
        query,
        limit,
      );
      setResults(res);
    } catch (error) {
      console.error("Search failed:", error);
      alert("Search failed. Check console for details.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex flex-col gap-4">
        <label className="text-lg font-medium text-white">
          Semantic Search
        </label>
        <div className="flex gap-2">
          <input
            type="text"
            className="flex-1 bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
            placeholder="Ask a question about your documents..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          />
          <div className="w-24">
            <input
              type="number"
              min="1"
              max="20"
              className="w-full h-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 text-center"
              value={limit}
              onChange={(e) => setLimit(parseInt(e.target.value))}
              title="Limit results"
            />
          </div>
          <Button
            onClick={handleSearch}
            disabled={loading || !query.trim()}
            className="bg-blue-600 hover:bg-blue-500 text-white px-6 h-auto"
          >
            {loading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <SearchIcon className="w-5 h-5" />
            )}
          </Button>
        </div>
      </div>

      <div className="space-y-4">
        {results.map((result, idx) => (
          <div
            key={idx}
            className="bg-zinc-900/40 border border-white/5 rounded-lg p-5 hover:bg-zinc-900/60 transition-colors"
          >
            <div className="flex justify-between items-start mb-2">
              <div className="flex items-center gap-2 text-blue-400 text-sm font-medium">
                <FileText className="w-4 h-4" />
                {result.document_name}
              </div>
              <div className="text-xs text-zinc-500 bg-zinc-800/50 px-2 py-1 rounded">
                Score: {(result.similarity * 100).toFixed(1)}%
              </div>
            </div>
            <p className="text-zinc-300 text-sm leading-relaxed">
              {result.content}
            </p>
            {result.metadata && Object.keys(result.metadata).length > 0 && (
              <div className="mt-3 pt-3 border-t border-white/5 flex gap-2 flex-wrap">
                {Object.entries(result.metadata).map(([k, v]) => (
                  <span
                    key={k}
                    className="text-xs text-zinc-500 bg-zinc-950 px-1.5 py-0.5 rounded border border-zinc-800"
                  >
                    {k}: {String(v)}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}

        {results.length === 0 && !loading && query && (
          <p className="text-center text-zinc-500 mt-10">No results found.</p>
        )}
      </div>
    </div>
  );
}
