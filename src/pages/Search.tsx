import { useState } from "react";
import { Loader2 } from "lucide-react";
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
    <div className="max-w-3xl space-y-4">
      <div className="flex gap-2">
        <input
          type="text"
          className="flex-1 bg-zinc-950 border border-border rounded-md px-3 py-2 text-[13px] text-white focus:outline-none focus:ring-1 focus:ring-ring"
          placeholder="Search your documents..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSearch()}
        />
        <input
          type="number"
          min="1"
          max="20"
          className="w-16 bg-zinc-950 border border-border rounded-md px-2 py-2 text-[13px] text-white text-center focus:outline-none focus:ring-1 focus:ring-ring"
          value={limit}
          onChange={(e) => setLimit(parseInt(e.target.value))}
          title="Limit"
        />
        <Button
          onClick={handleSearch}
          disabled={loading || !query.trim()}
        >
          {loading ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            "Search"
          )}
        </Button>
      </div>

      <div className="space-y-2">
        {results.map((result, idx) => (
          <div
            key={idx}
            className="border border-border rounded-lg px-4 py-3 hover:bg-zinc-900/30 transition-colors"
          >
            <div className="flex justify-between items-start mb-1.5">
              <span className="text-[13px] font-medium text-zinc-300">
                {result.document_name}
              </span>
              <span className="text-[11px] text-zinc-600 bg-zinc-900 px-1.5 py-0.5 rounded">
                {(result.similarity * 100).toFixed(1)}%
              </span>
            </div>
            <p className="text-[13px] text-zinc-400 leading-relaxed">
              {result.content}
            </p>
            {result.metadata && Object.keys(result.metadata).length > 0 && (
              <div className="mt-2 pt-2 border-t border-border flex gap-1.5 flex-wrap">
                {Object.entries(result.metadata).map(([k, v]) => (
                  <span
                    key={k}
                    className="text-[11px] text-zinc-600 bg-zinc-900 px-1.5 py-0.5 rounded"
                  >
                    {k}: {String(v)}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}

        {results.length === 0 && !loading && query && (
          <p className="text-center text-zinc-500 text-[13px] mt-8">No results found.</p>
        )}
      </div>
    </div>
  );
}
