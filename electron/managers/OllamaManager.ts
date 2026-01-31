import axios from "axios";

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
