export interface AIProviderImage {
  base64: string;
  mimeType: string;
}

export interface AIProviderRequest {
  systemPrompt: string;
  userPrompt: string;
  model: string;
  temperature?: number;
  maxOutputTokens?: number;
  timeoutMs: number;
  images?: AIProviderImage[];
}

export interface AIProviderResponse {
  content: string;
  model: string;
  tokensInput: number;
  tokensOutput: number;
  latencyMs: number;
}

export const AI_PROVIDER = Symbol('AI_PROVIDER');

export interface AIProvider {
  readonly name: string;
  complete(request: AIProviderRequest): Promise<AIProviderResponse>;
}
