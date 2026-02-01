import React from "react";
import { Minus, X, Square } from "lucide-react";

export function TitleBar() {
  const handleMinimize = () => {
    window.ipcRenderer.minimize();
  };

  const handleMaximize = () => {
    window.ipcRenderer.maximize();
  };

  const handleClose = () => {
    window.ipcRenderer.close();
  };

  return (
    <div
      className="h-8 bg-zinc-950 flex items-center justify-between select-none border-b border-border/40"
      style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
    >
      <div className="px-3 text-[11px] text-zinc-600">Cartography</div>
      <div
        className="flex h-full"
        style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
      >
        <button
          onClick={handleMinimize}
          className="h-full px-3 hover:bg-white/5 flex items-center justify-center transition-colors text-zinc-500 hover:text-zinc-300"
        >
          <Minus className="w-3.5 h-3.5" strokeWidth={1.5} />
        </button>
        <button
          onClick={handleMaximize}
          className="h-full px-3 hover:bg-white/5 flex items-center justify-center transition-colors text-zinc-500 hover:text-zinc-300"
        >
          <Square className="w-3 h-3" strokeWidth={1.5} />
        </button>
        <button
          onClick={handleClose}
          className="h-full px-3 hover:bg-red-500/80 flex items-center justify-center transition-colors text-zinc-500 hover:text-white"
        >
          <X className="w-3.5 h-3.5" strokeWidth={1.5} />
        </button>
      </div>
    </div>
  );
}
