import axios from "axios";
import http from "node:http";
import https from "node:https";

export interface ChatStreamMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export class OllamaManager {
  async testConnection(
    baseUrl: string,
  ): Promise<{ success: boolean; version?: string; error?: string }> {
    try {
      const response = await axios.get(`${baseUrl}/api/version`); // Or just / to check if it's up
      return { success: true, version: response.data?.version || "Unknown" };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  async getModels(
    baseUrl: string,
  ): Promise<{ success: boolean; models: { name: string; size: number; modified_at: string }[]; error?: string }> {
    try {
      const response = await axios.get(`${baseUrl}/api/tags`);
      const models = (response.data?.models || []).map((m: any) => ({
        name: m.name as string,
        size: m.size as number,
        modified_at: m.modified_at as string,
      }));
      return { success: true, models };
    } catch (error) {
      return { success: false, models: [], error: (error as Error).message };
    }
  }

  async checkModel(
    baseUrl: string,
    modelName: string,
  ): Promise<{ success: boolean; found: boolean; error?: string }> {
    try {
      const response = await axios.get(`${baseUrl}/api/tags`);
      const models = response.data?.models || [];
      const found = models.some(
        (m: { name: string }) =>
          m.name === modelName || m.name === `${modelName}:latest`,
      );
      return { success: true, found };
    } catch (error) {
      return { success: false, found: false, error: (error as Error).message };
    }
  }

  async chatStream(
    baseUrl: string,
    model: string,
    messages: ChatStreamMessage[],
    onToken: (token: string) => void,
    abortSignal?: AbortSignal,
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const url = new URL(`${baseUrl}/api/chat`);
      const isHttps = url.protocol === "https:";
      const transport = isHttps ? https : http;

      const body = JSON.stringify({ model, messages, stream: true });

      const req = transport.request(
        {
          hostname: url.hostname,
          port: url.port || (isHttps ? 443 : 80),
          path: url.pathname,
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(body),
          },
        },
        (res) => {
          if (res.statusCode && (res.statusCode < 200 || res.statusCode >= 300)) {
            let errBody = "";
            res.on("data", (chunk) => (errBody += chunk));
            res.on("end", () => reject(new Error(`Ollama returned ${res.statusCode}: ${errBody}`)));
            return;
          }

          let buffer = "";
          let fullContent = "";

          res.on("data", (chunk: Buffer) => {
            buffer += chunk.toString();
            const lines = buffer.split("\n");
            buffer = lines.pop() || "";

            for (const line of lines) {
              if (!line.trim()) continue;
              try {
                const parsed = JSON.parse(line);
                if (parsed.message?.content) {
                  fullContent += parsed.message.content;
                  onToken(parsed.message.content);
                }
                if (parsed.done) {
                  resolve(fullContent);
                  return;
                }
              } catch {
                // skip malformed lines
              }
            }
          });

          res.on("end", () => {
            // Process remaining buffer
            if (buffer.trim()) {
              try {
                const parsed = JSON.parse(buffer);
                if (parsed.message?.content) {
                  fullContent += parsed.message.content;
                  onToken(parsed.message.content);
                }
              } catch {
                // ignore
              }
            }
            resolve(fullContent);
          });

          res.on("error", (err) => reject(err));
        },
      );

      req.on("error", (err) => reject(err));

      if (abortSignal) {
        abortSignal.addEventListener("abort", () => {
          req.destroy();
          reject(new Error("Chat stream aborted"));
        });
      }

      req.write(body);
      req.end();
    });
  }

  async getEmbedding(
    baseUrl: string,
    model: string,
    prompt: string,
  ): Promise<number[]> {
    const response = await axios.post(`${baseUrl}/api/embed`, {
      model,
      input: prompt,
    });
    // Handle both response formats: embeddings array (new) or embedding (old)
    return response.data.embeddings?.[0] ?? response.data.embedding ?? [];
  }
}
