import path from 'node:path';
import YAML from 'yaml';

import { readUtf8FileUnderRoot } from '../shared/paths';
import type { AlgorithmDefinition, RegistryFile } from './types';

function parseRegistryFile(filePath: string): RegistryFile {
  const raw = readUtf8FileUnderRoot(path.dirname(filePath), filePath, 'algorithm registry path');
  const ext = path.extname(filePath).toLowerCase();
  return ext === '.json' ? (JSON.parse(raw) as RegistryFile) : (YAML.parse(raw) as RegistryFile);
}

export class AlgorithmRegistry {
  private readonly algorithms = new Map<string, AlgorithmDefinition>();

  loadFromFile(filePath: string): AlgorithmDefinition[] {
    const parsed = parseRegistryFile(filePath);
    const algorithms = parsed.algorithms ?? [];
    for (const algorithm of algorithms) {
      this.algorithms.set(algorithm.id, algorithm);
    }
    return algorithms;
  }

  add(definition: AlgorithmDefinition): void {
    this.algorithms.set(definition.id, definition);
  }

  getById(id: string): AlgorithmDefinition | undefined {
    return this.algorithms.get(id);
  }

  list(): AlgorithmDefinition[] {
    return [...this.algorithms.values()];
  }
}
