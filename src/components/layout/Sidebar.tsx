// Simplified version of the sidebar for Professional Look
import { useNavigate, useLocation } from "react-router-dom";
import { Home, Settings, Database, Bot, FolderOpen } from "lucide-react";
import { cn } from "../../lib/utils";

export function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();

  const navItems = [
    { id: "/", icon: Home, label: "Overview" },
    { id: "/projects", icon: FolderOpen, label: "Projects" },
    { id: "/vector-store", icon: Database, label: "Vector Stores" },
    { id: "/playground", icon: Bot, label: "Playground" },
    { id: "/settings", icon: Settings, label: "Settings" },
  ];

  return (
    <aside className="w-60 h-full bg-zinc-950 border-r border-border flex flex-col">
      <div className="h-14 flex items-center px-6 border-b border-border/40">
        <div className="flex items-center gap-2.5">
          <img src="/logo.png" alt="Logo" className="w-6 h-6 object-contain" />
          <span className="font-semibold text-sm text-white tracking-tight">
            Cartography
          </span>
        </div>
      </div>

      <nav className="flex-1 px-2 py-4 space-y-0.5">
        {navItems.map((item) => {
          const isActive =
            location.pathname === item.id ||
            (item.id !== "/" && location.pathname.startsWith(item.id));
          return (
            <button
              key={item.id}
              onClick={() => navigate(item.id)}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                isActive
                  ? "bg-zinc-800 text-white"
                  : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200",
              )}
            >
              <item.icon
                className={cn(
                  "w-4 h-4",
                  isActive ? "text-blue-500" : "text-zinc-500",
                )}
              />
              {item.label}
            </button>
          );
        })}
      </nav>

      <div className="p-4 border-t border-border/40">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-linear-to-tr from-zinc-700 to-zinc-600 flex items-center justify-center text-xs font-bold text-white">
            JD
          </div>
          <div className="flex flex-col">
            <span className="text-xs font-medium text-white">Jit Debnath</span>
            <span className="text-[10px] text-zinc-500">Pro License</span>
          </div>
        </div>
      </div>
    </aside>
  );
}
