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
      className="h-9 bg-zinc-950 flex items-center justify-between select-none"
      style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
    >
      <div className="px-4 text-xs font-medium text-zinc-500">Cartography</div>
      <div
        className="flex h-full"
        style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
      >
        <button
          onClick={handleMinimize}
          className="h-full px-4 hover:bg-white/5 flex items-center justify-center transition-colors text-zinc-400 hover:text-white"
        >
          <Minus className="w-4 h-4" />
        </button>
        <button
          onClick={handleMaximize}
          className="h-full px-4 hover:bg-white/5 flex items-center justify-center transition-colors text-zinc-400 hover:text-white"
        >
          <Square className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={handleClose}
          className="h-full px-4 hover:bg-red-500/80 flex items-center justify-center transition-colors text-zinc-400 hover:text-white group"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
