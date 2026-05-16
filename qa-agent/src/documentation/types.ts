export type DocumentSection = {
  id: string;
  title: string;
  level: number;
  content: string;
  startLine: number;
  endLine: number;
};

export type ParsedDocument = {
  id: string;
  sourcePath?: string;
  raw: string;
  sections: DocumentSection[];
  metadata: Record<string, unknown>;
};
