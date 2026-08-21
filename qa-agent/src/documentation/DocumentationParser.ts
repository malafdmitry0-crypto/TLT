import type { ParsedDocument } from './types';

export interface DocumentationParser {
  parse(input: string, options?: { id?: string; sourcePath?: string }): ParsedDocument;
}
