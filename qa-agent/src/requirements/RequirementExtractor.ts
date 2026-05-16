import type { ParsedDocument } from '../documentation/types';
import type { Requirement } from './types';

export interface RequirementExtractor {
  extract(parsedDocument: ParsedDocument): Promise<Requirement[]> | Requirement[];
}
