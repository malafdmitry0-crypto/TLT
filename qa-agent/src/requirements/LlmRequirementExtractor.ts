import type { ParsedDocument } from '../documentation/types';
import type { LlmClient } from '../llm/LlmClient';
import { REQUIREMENT_EXTRACTION_SYSTEM_PROMPT } from '../llm/prompts';
import type { RequirementExtractor } from './RequirementExtractor';
import type { Requirement } from './types';

function isRequirement(value: unknown): value is Requirement {
  if (typeof value !== 'object' || value === null) return false;
  const item = value as Partial<Requirement>;
  return (
    typeof item.id === 'string' &&
    typeof item.sourceSection === 'string' &&
    typeof item.description === 'string' &&
    ['formula', 'algorithm', 'ui', 'api', 'text'].includes(String(item.type)) &&
    Array.isArray(item.inputs) &&
    Array.isArray(item.tags)
  );
}

export class LlmRequirementExtractor implements RequirementExtractor {
  constructor(private readonly llmClient: LlmClient) {}

  async extract(parsedDocument: ParsedDocument): Promise<Requirement[]> {
    const response = await this.llmClient.completeJson({
      system: REQUIREMENT_EXTRACTION_SYSTEM_PROMPT,
      user: JSON.stringify({
        documentId: parsedDocument.id,
        sections: parsedDocument.sections.map((section) => ({
          id: section.id,
          title: section.title,
          content: section.content,
        })),
      }),
    });

    const items = Array.isArray(response) ? response : (response as { requirements?: unknown }).requirements;
    if (!Array.isArray(items)) return [];
    return items.filter(isRequirement);
  }
}
