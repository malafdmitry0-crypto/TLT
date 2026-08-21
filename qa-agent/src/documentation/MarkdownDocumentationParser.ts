import type { DocumentationParser } from './DocumentationParser';
import type { DocumentSection, ParsedDocument } from './types';

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '');
}

export class MarkdownDocumentationParser implements DocumentationParser {
  parse(input: string, options: { id?: string; sourcePath?: string } = {}): ParsedDocument {
    const lines = input.split(/\r?\n/);
    const headings: Array<{ line: number; level: number; title: string }> = [];

    lines.forEach((line, index) => {
      const match = /^(#{1,6})\s+(.+?)\s*$/.exec(line);
      if (match) {
        headings.push({ line: index + 1, level: match[1].length, title: match[2] });
      }
    });

    const sections: DocumentSection[] = headings.map((heading, index) => {
      const next = headings[index + 1];
      const startLine = heading.line;
      const endLine = next ? next.line - 1 : lines.length;
      const content = lines.slice(startLine, endLine).join('\n').trim();
      return {
        id: slugify(heading.title) || `section-${index + 1}`,
        title: heading.title,
        level: heading.level,
        content,
        startLine,
        endLine,
      };
    });

    if (sections.length === 0 && input.trim()) {
      sections.push({
        id: 'document',
        title: options.id ?? 'Document',
        level: 1,
        content: input.trim(),
        startLine: 1,
        endLine: lines.length,
      });
    }

    return {
      id: options.id ?? options.sourcePath ?? 'document',
      sourcePath: options.sourcePath,
      raw: input,
      sections,
      metadata: { parser: 'MarkdownDocumentationParser' },
    };
  }
}
