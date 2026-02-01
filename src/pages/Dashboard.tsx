import { useState, useEffect } from "react";
import { Button } from "../components/ui/button";
import { Plus } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface DashboardStats {
  totalProjects: number;
  totalDocuments: number;
  totalChunks: number;
  activeVectorStores: number;
  recentActivity: Array<{
    name: string;
    project_name: string;
    created_at: string;
  }>;
}

export function Dashboard() {
  const navigate = useNavigate();
  const [stats, setStats] = useState<DashboardStats>({
    totalProjects: 0,
    totalDocuments: 0,
    totalChunks: 0,
    activeVectorStores: 0,
    recentActivity: [],
  });

  useEffect(() => {
    async function fetchStats() {
      try {
        const data = await window.ipcRenderer.invoke("get-dashboard-stats");
        if (data) setStats(data);
      } catch (e) {
        console.error("Failed to fetch dashboard stats", e);
      }
    }
    fetchStats();
  }, []);

  return (
    <div className="flex-1 h-full overflow-y-auto bg-background p-6">
      <header className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-lg font-medium text-white">Overview</h1>
          <p className="text-zinc-500 text-[13px] mt-0.5">
            System status and usage metrics.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => navigate("/projects")}
          >
            Import
          </Button>
          <Button
            onClick={() => navigate("/projects")}
          >
            <Plus className="w-3.5 h-3.5 mr-1.5" />
            New Project
          </Button>
        </div>
      </header>

      {/* Stats Grid */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        <StatsCard
          label="Projects"
          value={stats.totalProjects}
        />
        <StatsCard
          label="Documents"
          value={stats.totalDocuments}
        />
        <StatsCard
          label="Chunks"
          value={stats.totalChunks.toLocaleString()}
        />
        <StatsCard
          label="Vector Stores"
          value={stats.activeVectorStores}
        />
      </div>

      {/* Recent Activity */}
      <div className="border border-border rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex justify-between items-center">
          <h2 className="text-[13px] font-medium text-zinc-300">Recent Activity</h2>
          <button className="text-[12px] text-zinc-500 hover:text-zinc-300 transition-colors">
            View All
          </button>
        </div>

        <div className="divide-y divide-border">
          {stats.recentActivity.length > 0 ? (
            stats.recentActivity.map((item, i) => (
              <div
                key={i}
                className="px-4 py-3 flex items-center gap-3 hover:bg-white/[0.02] transition-colors"
              >
                <div className="w-7 h-7 rounded bg-zinc-800 flex items-center justify-center text-[11px] font-medium text-zinc-400">
                  {item.name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] text-white truncate">
                    {item.name}
                  </p>
                  <p className="text-[11px] text-zinc-500 truncate">
                    {item.project_name}
                  </p>
                </div>
                <span className="text-[11px] text-zinc-600 whitespace-nowrap">
                  {new Date(item.created_at).toLocaleDateString()}
                </span>
              </div>
            ))
          ) : (
            <div className="px-4 py-10 text-center text-zinc-500 text-[13px]">
              No recent documents processed.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatsCard({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="border border-border rounded-lg p-4 hover:bg-zinc-900/30 transition-colors">
      <span className="text-[12px] text-zinc-500 block mb-2">
        {label}
      </span>
      <div className="text-2xl font-semibold text-white tracking-tight tabular-nums">
        {value}
      </div>
    </div>
  );
}
