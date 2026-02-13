import { HfInference } from "@huggingface/inference";

export interface ChatStreamMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface RerankResult {
  index: number;
  score: number;
}

export class HuggingFaceManager {
  private getClient(apiKey?: string): HfInference {
    if (!apiKey) {
      throw new Error("Hugging Face API key is required");
    }
    return new HfInference(apiKey);
  }

  async testConnection(
    apiKey: string,
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const hf = this.getClient(apiKey);
      // Test with a simple embedding request
      await hf.featureExtraction({
        model: "BAAI/bge-base-en-v1.5",
        inputs: "test",
      });
      return { success: true };
    } catch (error) {
      const err = error as Error;
      return { success: false, error: err.message || "Unknown error" };
    }
  }

  async getEmbedding(
    apiKey: string,
    model: string,
    input: string,
  ): Promise<number[]> {
    try {
      const hf = this.getClient(apiKey);
      const result = await hf.featureExtraction({
        model: model || "BAAI/bge-base-en-v1.5",
        inputs: input,
      });

      // The result can be a single embedding or array of embeddings
      // For single input, it returns a 1D array
      if (Array.isArray(result)) {
        // If it's a 2D array (batch), return the first embedding
        if (Array.isArray(result[0])) {
          return result[0] as number[];
        }
        // If it's a 1D array, return it directly
        return result as number[];
      }

      throw new Error("Unexpected embedding format from Hugging Face");
    } catch (error) {
      const err = error as Error;
      throw new Error(`Hugging Face embedding error: ${err.message}`);
    }
  }

  async rerank(
    apiKey: string,
    model: string,
    query: string,
    documents: string[],
  ): Promise<RerankResult[]> {
    try {
      const hf = this.getClient(apiKey);

      // Use text-classification with query-document pairs
      // BAAI reranker models work as cross-encoders for text pairs
      const pairs = documents.map(doc => `${query} [SEP] ${doc}`);

      // Limit concurrent requests to avoid overwhelming the API
      const BATCH_SIZE = 3;
      const results: RerankResult[] = [];

      for (let i = 0; i < pairs.length; i += BATCH_SIZE) {
        const batch = pairs.slice(i, i + BATCH_SIZE);
        const batchResults = await Promise.all(
          batch.map(async (pair, batchIndex) => {
            const index = i + batchIndex;
            try {
              const result = await hf.textClassification({
                model: model || "BAAI/bge-reranker-base",
                inputs: pair,
              });

              // Extract the relevance score
              let score = 0;
              if (Array.isArray(result)) {
                // Find the "LABEL_1" or highest score
                const positiveLabel = result.find((r: any) => r.label === "LABEL_1" || r.label === "positive");
                if (positiveLabel) {
                  score = positiveLabel.score;
                } else if (result.length > 0) {
                  // Take the highest score
                  score = Math.max(...result.map((r: any) => r.score));
                }
              }

              return { index, score };
            } catch (e) {
              console.warn(`Failed to rerank document ${index}:`, e);
              return { index, score: 0 };
            }
          })
        );
        results.push(...batchResults);
      }

      return results;
    } catch (error) {
      const err = error as Error;
      throw new Error(`Hugging Face rerank error: ${err.message}`);
    }
  }

  async chatStream(
    apiKey: string,
    model: string,
    messages: ChatStreamMessage[],
    onToken: (token: string) => void,
    abortSignal?: AbortSignal,
  ): Promise<string> {
    try {
      const hf = this.getClient(apiKey);

      let fullResponse = "";
      let aborted = false;

      const stream = hf.chatCompletionStream({
        model: model || "mistralai/Mistral-7B-Instruct-v0.2",
        messages: messages.map(msg => ({
          role: msg.role,
          content: msg.content,
        })),
        max_tokens: 2048,
        temperature: 0.7,
        top_p: 0.95,
      });

      // Handle abort signal
      if (abortSignal) {
        abortSignal.addEventListener("abort", () => {
          aborted = true;
        });
      }

      for await (const chunk of stream) {
        if (aborted || abortSignal?.aborted) {
          throw new Error("Chat stream aborted");
        }

        if (chunk.choices && chunk.choices[0]?.delta?.content) {
          const token = chunk.choices[0].delta.content;
          fullResponse += token;
          onToken(token);
        }
      }

      return fullResponse;
    } catch (error) {
      const err = error as Error;
      if (err.message === "Chat stream aborted") {
        throw err;
      }
      throw new Error(`Hugging Face chat error: ${err.message}`);
    }
  }

  async chat(
    apiKey: string,
    model: string,
    messages: ChatStreamMessage[],
  ): Promise<string> {
    try {
      const hf = this.getClient(apiKey);

      const result = await hf.chatCompletion({
        model: model || "mistralai/Mistral-7B-Instruct-v0.2",
        messages: messages.map(msg => ({
          role: msg.role,
          content: msg.content,
        })),
        max_tokens: 2048,
        temperature: 0.7,
        top_p: 0.95,
      });

      return result.choices[0]?.message?.content || "";
    } catch (error) {
      const err = error as Error;
      throw new Error(`Hugging Face chat error: ${err.message}`);
    }
  }
}
