import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';

import type { FormulaDefinition, RegistryFile } from './types';

function parseRegistryFile(filePath: string): RegistryFile {
  const raw = fs.readFileSync(filePath, 'utf8');
  const ext = path.extname(filePath).toLowerCase();
  return ext === '.json' ? (JSON.parse(raw) as RegistryFile) : (YAML.parse(raw) as RegistryFile);
}

export class FormulaRegistry {
  private readonly formulas = new Map<string, FormulaDefinition>();

  loadFromFile(filePath: string): FormulaDefinition[] {
    const parsed = parseRegistryFile(filePath);
    const formulas = parsed.formulas ?? [];
    for (const formula of formulas) {
      this.formulas.set(formula.id, formula);
    }
    return formulas;
  }

  add(definition: FormulaDefinition): void {
    this.formulas.set(definition.id, definition);
  }

  getById(id: string): FormulaDefinition | undefined {
    return this.formulas.get(id);
  }

  list(): FormulaDefinition[] {
    return [...this.formulas.values()];
  }
}
