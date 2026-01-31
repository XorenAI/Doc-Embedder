import { useState, useEffect } from "react";
import { Button } from "../components/ui/button";
import { Plus, UploadCloud, FileText } from "lucide-react";
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
    <div className="flex-1 h-full overflow-y-auto bg-background p-8">
      {/* Header */}
      <header className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-white mb-1">Overview</h1>
          <p className="text-zinc-400 text-sm">
            System status and usage metrics.
          </p>
        </div>
        <div className="flex gap-3">
          <Button
            variant="outline"
            className="gap-2"
            onClick={() => navigate("/projects")}
          >
            <UploadCloud className="w-4 h-4" />
            Quick Import
          </Button>
          <Button
            className="gap-2 bg-blue-600 hover:bg-blue-500 text-white border-none"
            onClick={() => navigate("/projects")}
          >
            <Plus className="w-4 h-4" />
            New Project
          </Button>
        </div>
      </header>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatsCard
          label="Total Projects"
          value={stats.totalProjects}
          trend="+2 this week"
        />
        <StatsCard
          label="Processed Docs"
          value={stats.totalDocuments}
          trend="Updated just now"
        />
        <StatsCard
          label="Total Chunks"
          value={stats.totalChunks.toLocaleString()}
          trend="Ready for query"
        />
        <StatsCard
          label="Vector Stores"
          value={stats.activeVectorStores}
          trend="Active"
        />
      </div>

      {/* Recent Activity */}
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-border flex justify-between items-center">
          <h2 className="font-medium text-white">Recent Activity</h2>
          <Button
            variant="ghost"
            size="sm"
            className="text-zinc-400 h-auto py-1"
          >
            View All
          </Button>
        </div>

        <div className="divide-y divide-border">
          {stats.recentActivity.length > 0 ? (
            stats.recentActivity.map((item, i) => (
              <div
                key={i}
                className="px-6 py-4 flex items-center gap-4 hover:bg-white/[0.02] transition-colors"
              >
                <div className="w-8 h-8 rounded bg-blue-500/10 flex items-center justify-center text-blue-400">
                  <FileText className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">
                    {item.name}
                  </p>
                  <p className="text-xs text-zinc-500 truncate">
                    in {item.project_name}
                  </p>
                </div>
                <span className="text-xs text-zinc-500 whitespace-nowrap">
                  {new Date(item.created_at).toLocaleDateString()}
                </span>
              </div>
            ))
          ) : (
            <div className="px-6 py-8 text-center text-zinc-500 text-sm">
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
  trend,
}: {
  label: string;
  value: string | number;
  trend: string;
}) {
  return (
    <div className="bg-card border border-border p-6 rounded-xl flex flex-col justify-between h-32 hover:border-zinc-600/50 hover:bg-zinc-900/30 transition-all duration-300 group shadow-sm">
      <div className="flex justify-between items-start">
        <span className="text-sm font-medium text-zinc-500 group-hover:text-zinc-400 transition-colors">
          {label}
        </span>
        <span className="text-[10px] uppercase tracking-wider font-semibold text-zinc-600 bg-zinc-900/80 border border-zinc-800/80 px-2 py-1 rounded-md group-hover:border-zinc-700 group-hover:text-zinc-500 transition-colors">
          {trend}
        </span>
      </div>
      <div className="text-3xl font-bold text-white tracking-tight tabular-nums">
        {value}
      </div>
    </div>
  );
}
