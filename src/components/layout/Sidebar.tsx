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
    <aside className="w-52 h-full bg-zinc-950 border-r border-border flex flex-col">
      <div className="h-12 flex items-center px-4 border-b border-border/40">
        <div className="flex items-center gap-2">
          <img src="/logo.png" alt="Logo" className="w-5 h-5 object-contain" />
          <span className="font-medium text-[13px] text-white tracking-tight">
            Cartography
          </span>
        </div>
      </div>

      <nav className="flex-1 px-2 py-3 space-y-0.5">
        {navItems.map((item) => {
          const isActive =
            location.pathname === item.id ||
            (item.id !== "/" && location.pathname.startsWith(item.id));
          return (
            <button
              key={item.id}
              onClick={() => navigate(item.id)}
              className={cn(
                "w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-[13px] transition-colors",
                isActive
                  ? "bg-zinc-800/80 text-white"
                  : "text-zinc-500 hover:bg-zinc-900 hover:text-zinc-300",
              )}
            >
              <item.icon
                className={cn(
                  "w-4 h-4",
                  isActive ? "text-zinc-300" : "text-zinc-600",
                )}
                strokeWidth={1.5}
              />
              {item.label}
            </button>
          );
        })}
      </nav>

      <div className="px-3 py-3 border-t border-border/40">
        <div className="flex items-center gap-2.5">
          <div className="w-6 h-6 rounded-full bg-zinc-800 flex items-center justify-center text-[10px] font-medium text-zinc-400">
            JD
          </div>
          <div className="flex flex-col">
            <span className="text-[12px] text-zinc-300">Jit Debnath</span>
            <span className="text-[10px] text-zinc-600">Pro</span>
          </div>
        </div>
      </div>
    </aside>
  );
}
