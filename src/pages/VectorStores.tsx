import { Database } from "lucide-react";

export function VectorStores() {
  return (
    <div className="flex-1 h-full overflow-y-auto bg-background p-8">
      <header className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-white mb-1">
            Vector Stores
          </h1>
          <p className="text-zinc-400 text-sm">
            Manage your vector database connections and collections.
          </p>
        </div>
      </header>

      <div className="flex flex-col items-center justify-center h-[50vh] border border-dashed border-zinc-800 rounded-2xl bg-zinc-900/20 text-center p-8">
        <div className="w-16 h-16 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center mb-4">
          <Database className="w-8 h-8 text-zinc-600" />
        </div>
        <h3 className="text-xl font-semibold text-white mb-2">Coming Soon</h3>
        <p className="text-zinc-500 max-w-sm">
          Advanced vector store management features are currently under
          development.
        </p>
      </div>
    </div>
  );
}
