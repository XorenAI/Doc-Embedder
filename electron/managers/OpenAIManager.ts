import axios from "axios";

export class OpenAIManager {
  async testConnection(
    apiKey: string,
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // Simple call to list models to verify API key
      await axios.get("https://api.openai.com/v1/models", {
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      });
      return { success: true };
    } catch (error) {
      // Axios error structure
      const err = error as {
        response?: { data?: { error?: { message?: string } } };
        message?: string;
      };
      const msg =
        err.response?.data?.error?.message || err.message || "Unknown error";
      return { success: false, error: msg };
    }
  }

  async getEmbedding(
    apiKey: string,
    model: string,
    input: string,
  ): Promise<number[]> {
    const response = await axios.post(
      "https://api.openai.com/v1/embeddings",
      {
        input,
        model,
      },
      {
        headers: { Authorization: `Bearer ${apiKey}` },
      },
    );
    return response.data.data[0].embedding;
  }
}
