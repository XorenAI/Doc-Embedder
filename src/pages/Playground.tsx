import { useState, useEffect, useRef, useCallback } from "react";
import {
  Send,
  Square,
  Trash2,
  Settings2,
  ChevronDown,
  Search,
  Bot,
  User,
  Loader2,
  X,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Button } from "../components/ui/button";
import { OllamaModelSelect } from "../components/ui/OllamaModelSelect";
import { cn } from "../lib/utils";
import { Project, ChatMessage } from "../types";

interface PlaygroundMessage extends ChatMessage {
  id: string;
  ragContext?: string[];
}

interface PlaygroundConfig {
  provider: "ollama" | "huggingface";
  ollamaUrl: string;
  huggingfaceApiKey: string;
  model: string;
  projectId: string;
  systemPrompt: string;
  ragEnabled: boolean;
  ragLimit: number;
  temperature: number;
}

const DEFAULT_CONFIG: PlaygroundConfig = {
  provider: "huggingface",
  ollamaUrl: "http://localhost:11434",
  huggingfaceApiKey: "",
  model: "mistralai/Mistral-7B-Instruct-v0.2",
  projectId: "",
  systemPrompt: "",
  ragEnabled: false,
  ragLimit: 5,
  temperature: 0.7,
};

export function Playground() {
  const [messages, setMessages] = useState<PlaygroundMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [searching, setSearching] = useState(false);
  const [sending, setSending] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);
  const [config, setConfig] = useState<PlaygroundConfig>(DEFAULT_CONFIG);
  const [projects, setProjects] = useState<Project[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<
    "idle" | "connected" | "error"
  >("idle");

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const streamingRef = useRef(false);
  const assistantBufferRef = useRef("");

  // Load projects and settings
  useEffect(() => {
    async function init() {
      try {
        const data = await window.ipcRenderer.invoke("get-projects");
        setProjects(data || []);
      } catch (e) {
        console.error("Failed to load projects:", e);
      }

      // Load global app settings from database
      try {
        const appSettings = await window.ipcRenderer.getSetting("app_settings");
        console.log("[Playground] Loaded app settings:", appSettings);

        if (appSettings) {
          const newConfig: PlaygroundConfig = {
            ...config,
            provider: (appSettings.defaultEmbeddingProvider === "huggingface" ? "huggingface" : "ollama") as "ollama" | "huggingface",
            ollamaUrl: appSettings.defaultOllamaUrl || config.ollamaUrl,
            huggingfaceApiKey: appSettings.defaultHuggingFaceApiKey || "",
            model: appSettings.defaultEmbeddingProvider === "huggingface"
              ? "mistralai/Mistral-7B-Instruct-v0.2"
              : config.model,
          };

          console.log("[Playground] Setting config from global settings:", newConfig);

          // Check if there's saved playground config that should override
          // BUT always keep huggingfaceApiKey from global settings
          const saved = localStorage.getItem("playground_config");
          if (saved) {
            const parsed = JSON.parse(saved);
            console.log("[Playground] Found localStorage config, merging:", parsed);
            // Merge but preserve HuggingFace API key from global settings
            setConfig({ ...newConfig, ...parsed, huggingfaceApiKey: newConfig.huggingfaceApiKey });
          } else {
            setConfig(newConfig);
          }
        }
      } catch (e) {
        console.error("Failed to load settings:", e);
      }
    }
    init();
  }, []);

  // Save config on change (excluding HuggingFace API key which comes from global settings)
  useEffect(() => {
    const { huggingfaceApiKey, ...configToSave } = config;
    localStorage.setItem("playground_config", JSON.stringify(configToSave));
  }, [config]);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Reload HuggingFace API key from global settings when provider changes to HuggingFace
  useEffect(() => {
    async function reloadHFKey() {
      if (config.provider === "huggingface") {
        try {
          const appSettings = await window.ipcRenderer.getSetting("app_settings");
          if (appSettings?.defaultHuggingFaceApiKey) {
            setConfig(prev => ({
              ...prev,
              huggingfaceApiKey: appSettings.defaultHuggingFaceApiKey,
            }));
          }
        } catch (e) {
          console.error("Failed to reload HuggingFace API key:", e);
        }
      }
    }
    reloadHFKey();
  }, [config.provider]);

  // Stable callback refs to ensure proper cleanup
  const handleTokenRef = useRef((_event: unknown, token: string) => {
    // Only process if we're actually streaming
    if (!streamingRef.current) {
      console.warn("[Playground] Received token but not streaming, ignoring");
      return;
    }

    assistantBufferRef.current += token;

    setMessages((prev) => {
      const lastIdx = prev.length - 1;

      // Ensure assistant message exists
      if (lastIdx >= 0 && prev[lastIdx].role === "assistant") {
        const updated = [...prev];
        updated[lastIdx] = {
          ...updated[lastIdx],
          content: assistantBufferRef.current,
        };
        return updated;
      }

      // Fallback: create assistant message if it doesn't exist
      console.error("[Playground] Assistant message not found, creating one");
      return [...prev, {
        id: crypto.randomUUID(),
        role: "assistant" as const,
        content: assistantBufferRef.current,
      }];
    });
  });

  const handleDoneRef = useRef(() => {
    console.log("[Playground] Chat done, final buffer length:", assistantBufferRef.current.length);
    streamingRef.current = false;
    setStreaming(false);
    assistantBufferRef.current = "";
  });

  const handleErrorRef = useRef((_event: unknown, errorMsg: string) => {
    streamingRef.current = false;
    setStreaming(false);
    assistantBufferRef.current = "";
    setMessages((prev) => {
      const updated = [...prev];
      const last = updated[updated.length - 1];
      if (last && last.role === "assistant") {
        updated[updated.length - 1] = {
          ...last,
          content: `Error: ${errorMsg}`,
        };
      }
      return updated;
    });
  });

  // Stable callback wrappers using useCallback
  const handleToken = useCallback((event: unknown, token: string) => {
    handleTokenRef.current(event, token);
  }, []);

  const handleDone = useCallback(() => {
    handleDoneRef.current();
  }, []);

  const handleError = useCallback((event: unknown, errorMsg: string) => {
    handleErrorRef.current(event, errorMsg);
  }, []);

  // Listen for streaming tokens - only runs once on mount
  useEffect(() => {
    window.ipcRenderer.on("chat-token", handleToken);
    window.ipcRenderer.on("chat-done", handleDone);
    window.ipcRenderer.on("chat-error", handleError);

    return () => {
      window.ipcRenderer.off("chat-token", handleToken);
      window.ipcRenderer.off("chat-done", handleDone);
      window.ipcRenderer.off("chat-error", handleError);
    };
  }, [handleToken, handleDone, handleError]);

  // Test connection
  const testConnection = useCallback(async () => {
    try {
      let result;
      if (config.provider === "huggingface") {
        if (!config.huggingfaceApiKey) {
          setConnectionStatus("idle");
          return;
        }
        result = await window.ipcRenderer.invoke(
          "test-huggingface-connection",
          config.huggingfaceApiKey,
        );
      } else {
        result = await window.ipcRenderer.invoke(
          "test-ollama-connection",
          config.ollamaUrl,
        );
      }
      setConnectionStatus(result.success ? "connected" : "error");
    } catch {
      setConnectionStatus("error");
    }
  }, [config.provider, config.ollamaUrl, config.huggingfaceApiKey]);

  useEffect(() => {
    if (
      (config.provider === "ollama" && config.ollamaUrl) ||
      (config.provider === "huggingface" && config.huggingfaceApiKey)
    ) {
      testConnection();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.provider, config.ollamaUrl, config.huggingfaceApiKey]);

  async function handleSend() {
    const trimmed = input.trim();
    if (!trimmed || streaming || searching || sending) return;

    // Validate API key/URL before proceeding
    if (config.provider === "huggingface" && !config.huggingfaceApiKey) {
      setConnectionStatus("error");
      alert("Please set your HuggingFace API key in Settings.");
      return;
    }

    if (config.provider === "ollama" && !config.ollamaUrl) {
      setConnectionStatus("error");
      alert("Please set your Ollama URL in the config panel.");
      return;
    }

    const userMsg: PlaygroundMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: trimmed,
    };

    // Clear input and show user message immediately
    setInput("");
    setMessages((prev) => [...prev, userMsg]);
    setSending(true);

    // Build system prompt with optional RAG context
    let systemPrompt = config.systemPrompt;
    let ragContext: string[] = [];

    if (config.ragEnabled && config.projectId) {
      try {
        setSearching(true);
        const results = await window.ipcRenderer.invoke(
          "search-project",
          config.projectId,
          trimmed,
          config.ragLimit,
        );
        setSearching(false);

        if (results && results.length > 0) {
          ragContext = results.map(
            (r: { document_name: string; content: string; similarity: number }) =>
              `[${r.document_name} (${(r.similarity * 100).toFixed(0)}% match)]\n${r.content}`,
          );
          const contextBlock = ragContext.join("\n\n---\n\n");
          systemPrompt = [
            systemPrompt,
            "\n\nUse the following retrieved documents as context to answer the user's question. If the context doesn't contain relevant information, say so.\n\n<context>",
            contextBlock,
            "</context>",
          ]
            .filter(Boolean)
            .join("");
        }
      } catch (e) {
        console.error("RAG search failed:", e);
        setSearching(false);
        setSending(false);
        return;
      }
    }

    // Create assistant placeholder
    const assistantMsg: PlaygroundMessage = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: "",
      ragContext: ragContext.length > 0 ? ragContext : undefined,
    };

    // Add assistant message placeholder and start streaming
    setMessages((prev) => [...prev, assistantMsg]);
    setSending(false);
    setStreaming(true);
    streamingRef.current = true;
    assistantBufferRef.current = "";

    // Build message history for the API (without system messages and without ragContext/id)
    const chatHistory = [...messages, userMsg]
      .filter((m) => m.role !== "system")
      .map((m) => ({ role: m.role, content: m.content }));

    try {
      const urlOrApiKey = config.provider === "huggingface"
        ? config.huggingfaceApiKey
        : config.ollamaUrl;

      await window.ipcRenderer.chatSend(
        config.provider,
        urlOrApiKey,
        config.model,
        chatHistory,
        systemPrompt || undefined,
      );
    } catch (e) {
      console.error("Chat send failed:", e);
      setStreaming(false);
      streamingRef.current = false;
      setSending(false);
    }
  }

  function handleAbort() {
    // Synchronize both streaming states
    streamingRef.current = false;
    setStreaming(false);
    setSending(false);
    assistantBufferRef.current = "";
    window.ipcRenderer.chatAbort();
  }

  function handleClear() {
    if (streaming) handleAbort();
    setMessages([]);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  // Auto-resize textarea
  function handleInputChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInput(e.target.value);
    const el = e.target;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 160) + "px";
  }

  const selectedProject = projects.find((p) => p.id === config.projectId);

  return (
    <div className="flex-1 h-full flex flex-col bg-background overflow-hidden">
      {/* Header */}
      <header className="flex-shrink-0 flex items-center justify-between px-6 py-3 border-b border-border">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-lg font-medium text-white">Playground</h1>
            <p className="text-zinc-500 text-[13px] mt-0.5">
              Chat with your documents using RAG.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Connection indicator */}
          <div className="flex items-center gap-1.5 mr-2">
            <div
              className={cn(
                "w-1.5 h-1.5 rounded-full",
                connectionStatus === "connected"
                  ? "bg-emerald-500"
                  : connectionStatus === "error"
                    ? "bg-red-500"
                    : "bg-zinc-600",
              )}
            />
            <span className="text-[11px] text-zinc-500">
              {connectionStatus === "connected"
                ? "Ollama connected"
                : connectionStatus === "error"
                  ? "Disconnected"
                  : "Checking..."}
            </span>
          </div>

          <Button
            variant="ghost"
            size="icon"
            onClick={handleClear}
            disabled={messages.length === 0 && !streaming}
            title="Clear chat"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
          <Button
            variant={configOpen ? "secondary" : "ghost"}
            size="icon"
            onClick={() => setConfigOpen(!configOpen)}
            title="Configuration"
          >
            <Settings2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Chat area */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-6 py-4">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <div className="w-10 h-10 rounded-lg bg-zinc-900 border border-border flex items-center justify-center mb-4">
                  <Bot className="w-5 h-5 text-zinc-500" />
                </div>
                <p className="text-[13px] text-zinc-400 mb-1">
                  Start a conversation
                </p>
                <p className="text-[12px] text-zinc-600 max-w-sm">
                  {config.ragEnabled && config.projectId
                    ? `RAG enabled with project "${selectedProject?.name || "Unknown"}". Your documents will be used as context.`
                    : "Enable RAG in settings to chat with your documents, or just chat directly with the model."}
                </p>
              </div>
            ) : (
              <div className="max-w-3xl mx-auto space-y-1">
                {messages.map((msg) => (
                  <MessageBubble key={msg.id} message={msg} />
                ))}

                {/* Sending indicator */}
                {sending && !searching && (
                  <div className="flex gap-3 py-3">
                    <div className="flex-shrink-0 w-6 h-6 rounded bg-zinc-800 border border-border flex items-center justify-center mt-0.5">
                      <Send className="w-3.5 h-3.5 text-blue-400 animate-pulse" />
                    </div>
                    <div className="flex-1">
                      <div className="text-[13px] leading-relaxed text-zinc-400 flex items-center gap-2">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        Sending message...
                      </div>
                    </div>
                  </div>
                )}

                {/* Searching indicator */}
                {searching && (
                  <div className="flex gap-3 py-3">
                    <div className="flex-shrink-0 w-6 h-6 rounded bg-zinc-800 border border-border flex items-center justify-center mt-0.5">
                      <Search className="w-3.5 h-3.5 text-blue-400 animate-pulse" />
                    </div>
                    <div className="flex-1">
                      <div className="text-[13px] leading-relaxed text-zinc-400 flex items-center gap-2">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        Searching {config.ragLimit} documents...
                      </div>
                    </div>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>
            )}
          </div>

          {/* Input area */}
          <div className="flex-shrink-0 border-t border-border px-6 py-3">
            <div className="max-w-3xl mx-auto">
              {/* RAG indicator */}
              {config.ragEnabled && config.projectId && (
                <div className="flex items-center gap-1.5 mb-2">
                  <Search className="w-3 h-3 text-blue-400" />
                  <span className="text-[11px] text-blue-400/80">
                    RAG: {selectedProject?.name || "Unknown project"} ({config.ragLimit} results)
                  </span>
                </div>
              )}

              <div className="relative flex items-end gap-2">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={handleInputChange}
                  onKeyDown={handleKeyDown}
                  placeholder={
                    sending
                      ? "Sending message..."
                      : searching
                      ? "Searching documents..."
                      : streaming
                      ? "Generating response..."
                      : "Type a message... (Enter to send, Shift+Enter for newline)"
                  }
                  disabled={streaming || searching || sending}
                  rows={1}
                  className="flex-1 bg-zinc-950 border border-border rounded-lg px-3 py-2.5 text-[13px] text-white resize-none focus:outline-none focus:ring-1 focus:ring-ring placeholder:text-zinc-600 disabled:opacity-50"
                  style={{ maxHeight: 160 }}
                />
                {streaming ? (
                  <Button
                    variant="destructive"
                    size="icon"
                    onClick={handleAbort}
                    title="Stop generating"
                  >
                    <Square className="w-3 h-3" />
                  </Button>
                ) : (
                  <Button
                    size="icon"
                    onClick={handleSend}
                    disabled={!input.trim()}
                    title="Send message"
                  >
                    <Send className="w-3.5 h-3.5" />
                  </Button>
                )}
              </div>

              <p className="text-[11px] text-zinc-600 mt-1.5">
                {config.model} via {config.ollamaUrl}
              </p>
            </div>
          </div>
        </div>

        {/* Config sidebar */}
        {configOpen && (
          <div className={cn(
            "w-72 flex-shrink-0 border-l border-border overflow-y-auto bg-zinc-950/50",
            (streaming || searching) && "pointer-events-none opacity-60"
          )}>
            <div className="p-4 space-y-5">
              <div className="flex items-center justify-between">
                <h3 className="text-[12px] font-medium text-zinc-400 uppercase tracking-wider">
                  Configuration
                </h3>
                <button
                  onClick={() => setConfigOpen(false)}
                  className="p-1 rounded hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300 transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Provider Selection */}
              <div>
                <label className="block text-[12px] font-medium text-zinc-500 mb-1.5">
                  Provider
                </label>
                <select
                  value={config.provider}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      provider: e.target.value as "ollama" | "huggingface",
                    })
                  }
                  className="w-full bg-zinc-950 border border-border rounded-md px-3 py-2 text-[13px] text-white focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  <option value="huggingface">Hugging Face</option>
                  <option value="ollama">Ollama (Local)</option>
                </select>
              </div>

              {/* Ollama URL */}
              {config.provider === "ollama" && (
                <div>
                  <label className="block text-[12px] font-medium text-zinc-500 mb-1.5">
                    Ollama URL
                  </label>
                  <input
                    type="text"
                    value={config.ollamaUrl}
                    onChange={(e) =>
                      setConfig({ ...config, ollamaUrl: e.target.value })
                    }
                    className="w-full bg-zinc-950 border border-border rounded-md px-3 py-2 text-[13px] text-white font-mono focus:outline-none focus:ring-1 focus:ring-ring"
                    placeholder="http://localhost:11434"
                  />
                </div>
              )}

              {/* HuggingFace API Key info */}
              {config.provider === "huggingface" && (
                <div>
                  <label className="block text-[12px] font-medium text-zinc-500 mb-1.5">
                    API Key
                  </label>
                  <div className="w-full bg-zinc-900/50 border border-border rounded-md px-3 py-2 text-[13px] text-zinc-500">
                    {config.huggingfaceApiKey ? (
                      <span className="flex items-center gap-2">
                        <span className="text-emerald-500">✓</span>
                        Configured in Settings
                      </span>
                    ) : (
                      <span className="text-amber-500">Not configured - set in Settings</span>
                    )}
                  </div>
                  <p className="text-[11px] text-zinc-600 mt-1">
                    API key is managed in Settings page.
                  </p>
                </div>
              )}

              {/* Model */}
              <div>
                <label className="block text-[12px] font-medium text-zinc-500 mb-1.5">
                  Model
                </label>
                {config.provider === "ollama" ? (
                  <OllamaModelSelect
                    baseUrl={config.ollamaUrl}
                    value={config.model}
                    onChange={(model) => setConfig({ ...config, model })}
                  />
                ) : (
                  <input
                    type="text"
                    value={config.model}
                    onChange={(e) =>
                      setConfig({ ...config, model: e.target.value })
                    }
                    className="w-full bg-zinc-950 border border-border rounded-md px-3 py-2 text-[13px] text-white focus:outline-none focus:ring-1 focus:ring-ring"
                    placeholder="mistralai/Mistral-7B-Instruct-v0.2"
                  />
                )}
              </div>

              {/* RAG Section */}
              <div>
                <label className="block text-[12px] font-medium text-zinc-400 uppercase tracking-wider mb-3">
                  RAG Settings
                </label>
                <div className="space-y-3">
                  {/* RAG Toggle */}
                  <div className="flex items-center justify-between">
                    <span className="text-[12px] text-zinc-500">
                      Enable RAG
                    </span>
                    <button
                      onClick={() =>
                        setConfig({ ...config, ragEnabled: !config.ragEnabled })
                      }
                      className={cn(
                        "w-8 h-[18px] rounded-full transition-colors relative",
                        config.ragEnabled ? "bg-blue-600" : "bg-zinc-700",
                      )}
                    >
                      <div
                        className={cn(
                          "absolute top-[2px] w-[14px] h-[14px] rounded-full bg-white transition-transform",
                          config.ragEnabled ? "left-[16px]" : "left-[2px]",
                        )}
                      />
                    </button>
                  </div>

                  {/* Project Select */}
                  {config.ragEnabled && (
                    <>
                      <div>
                        <label className="block text-[12px] font-medium text-zinc-500 mb-1.5">
                          Project
                        </label>
                        <div className="relative">
                          <select
                            value={config.projectId}
                            onChange={(e) =>
                              setConfig({
                                ...config,
                                projectId: e.target.value,
                              })
                            }
                            className="w-full bg-zinc-950 border border-border rounded-md px-3 py-2 text-[13px] text-white focus:outline-none focus:ring-1 focus:ring-ring appearance-none"
                          >
                            <option value="">Select a project...</option>
                            {projects.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.name}
                              </option>
                            ))}
                          </select>
                          <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500 pointer-events-none" />
                        </div>
                      </div>

                      {/* Result limit */}
                      <div>
                        <label className="block text-[12px] font-medium text-zinc-500 mb-1.5">
                          Context Results
                        </label>
                        <input
                          type="number"
                          min={1}
                          max={20}
                          value={config.ragLimit}
                          onChange={(e) =>
                            setConfig({
                              ...config,
                              ragLimit: parseInt(e.target.value) || 5,
                            })
                          }
                          className="w-full bg-zinc-950 border border-border rounded-md px-3 py-2 text-[13px] text-white focus:outline-none focus:ring-1 focus:ring-ring"
                        />
                        <p className="text-[11px] text-zinc-600 mt-1">
                          Number of document chunks to retrieve.
                        </p>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* System Prompt */}
              <div>
                <label className="block text-[12px] font-medium text-zinc-500 mb-1.5">
                  System Prompt
                </label>
                <textarea
                  value={config.systemPrompt}
                  onChange={(e) =>
                    setConfig({ ...config, systemPrompt: e.target.value })
                  }
                  rows={4}
                  className="w-full bg-zinc-950 border border-border rounded-md px-3 py-2 text-[13px] text-white resize-none focus:outline-none focus:ring-1 focus:ring-ring"
                  placeholder="You are a helpful assistant..."
                />
                <p className="text-[11px] text-zinc-600 mt-1">
                  Optional instructions prepended to the conversation.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: PlaygroundMessage }) {
  const isUser = message.role === "user";
  const isEmpty = !message.content && !isUser;

  return (
    <div className={cn("flex gap-3 py-3", isUser ? "justify-end" : "")}>
      {!isUser && (
        <div className="flex-shrink-0 w-6 h-6 rounded bg-zinc-800 border border-border flex items-center justify-center mt-0.5">
          <Bot className="w-3.5 h-3.5 text-zinc-400" />
        </div>
      )}

      <div
        className={cn(
          "min-w-0",
          isUser ? "max-w-[80%]" : "flex-1 max-w-[calc(100%-2.25rem)]",
        )}
      >
        {/* RAG context indicator */}
        {!isUser && message.ragContext && message.ragContext.length > 0 && (
          <div className="flex items-center gap-1.5 mb-1.5">
            <Search className="w-3 h-3 text-blue-400/60" />
            <span className="text-[11px] text-blue-400/60">
              {message.ragContext.length} document
              {message.ragContext.length > 1 ? "s" : ""} referenced
            </span>
          </div>
        )}

        <div
          className={cn(
            "text-[13px] leading-relaxed break-words",
            isUser
              ? "bg-zinc-800/80 text-zinc-200 px-3.5 py-2.5 rounded-2xl rounded-br-md whitespace-pre-wrap"
              : "text-zinc-300",
          )}
        >
          {isEmpty ? (
            <span className="inline-flex items-center gap-1.5 text-zinc-500">
              <Loader2 className="w-3 h-3 animate-spin" />
              Thinking...
            </span>
          ) : isUser ? (
            message.content
          ) : (
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                code({ className, children, ...props }: any) {
                  const isInline = !className?.includes('language-');
                  return isInline ? (
                    <code className="bg-zinc-800 px-1 py-0.5 rounded text-[12px] font-mono" {...props}>
                      {children}
                    </code>
                  ) : (
                    <code className="block bg-zinc-900 p-3 rounded-lg my-2 text-[12px] font-mono overflow-x-auto" {...props}>
                      {children}
                    </code>
                  );
                },
                p({ children }) {
                  return <p className="mb-2 last:mb-0">{children}</p>;
                },
                ul({ children }) {
                  return <ul className="list-disc list-inside mb-2 space-y-1">{children}</ul>;
                },
                ol({ children }) {
                  return <ol className="list-decimal list-inside mb-2 space-y-1">{children}</ol>;
                },
                li({ children }) {
                  return <li className="text-zinc-300">{children}</li>;
                },
                strong({ children }) {
                  return <strong className="font-semibold text-white">{children}</strong>;
                },
                em({ children }) {
                  return <em className="italic text-zinc-300">{children}</em>;
                },
                h1({ children }) {
                  return <h1 className="text-lg font-bold text-white mt-4 mb-2">{children}</h1>;
                },
                h2({ children }) {
                  return <h2 className="text-base font-bold text-white mt-3 mb-2">{children}</h2>;
                },
                h3({ children }) {
                  return <h3 className="text-[13px] font-semibold text-white mt-2 mb-1">{children}</h3>;
                },
                blockquote({ children }) {
                  return <blockquote className="border-l-2 border-zinc-700 pl-3 italic text-zinc-400 my-2">{children}</blockquote>;
                },
                a({ href, children }) {
                  return <a href={href} className="text-blue-400 hover:text-blue-300 underline" target="_blank" rel="noopener noreferrer">{children}</a>;
                },
              }}
            >
              {message.content}
            </ReactMarkdown>
          )}
        </div>
      </div>

      {isUser && (
        <div className="flex-shrink-0 w-6 h-6 rounded bg-blue-600/20 border border-blue-500/20 flex items-center justify-center mt-0.5">
          <User className="w-3.5 h-3.5 text-blue-400" />
        </div>
      )}
    </div>
  );
}
