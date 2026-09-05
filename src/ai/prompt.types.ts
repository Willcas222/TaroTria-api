import type { Prompt, PromptVersion } from '@prisma/client';

export type PromptWithVersions = Prompt & { versions: PromptVersion[] };

export interface AdminPromptVersion {
  id: string;
  version: number;
  systemPrompt: string;
  userPromptTemplate: string;
  model: string;
  temperature: number | null;
  maxOutputTokens: number | null;
  outputSchema: unknown;
  status: string;
  authorId: string | null;
  publishedAt: Date | null;
  createdAt: Date;
}

export interface AdminPrompt {
  id: string;
  code: string;
  name: string;
  versions: AdminPromptVersion[];
}

export function toAdminPrompt(prompt: PromptWithVersions): AdminPrompt {
  return {
    id: prompt.id,
    code: prompt.code,
    name: prompt.name,
    versions: prompt.versions.map((version) => ({
      id: version.id,
      version: version.version,
      systemPrompt: version.systemPrompt,
      userPromptTemplate: version.userPromptTemplate,
      model: version.model,
      temperature: version.temperature,
      maxOutputTokens: version.maxOutputTokens,
      outputSchema: version.outputSchema,
      status: version.status,
      authorId: version.authorId,
      publishedAt: version.publishedAt,
      createdAt: version.createdAt,
    })),
  };
}
