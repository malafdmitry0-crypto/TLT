import type { AlgorithmRegistry } from '../registry/AlgorithmRegistry';
import type { FormulaRegistry } from '../registry/FormulaRegistry';
import type { RegistryExample } from '../registry/types';
import type { Requirement } from '../requirements/types';
import type { TestCaseGenerator } from './TestCaseGenerator';
import type { TestCase } from './types';

export class EdgeCaseGenerator implements TestCaseGenerator {
  constructor(
    private readonly formulaRegistry?: FormulaRegistry,
    private readonly algorithmRegistry?: AlgorithmRegistry,
  ) {}

  generate(requirement: Requirement): TestCase[] {
    if (requirement.type === 'formula') {
      const formulaId = String(
        (requirement.expectedBehavior as { formulaId?: string } | undefined)?.formulaId ??
          requirement.id,
      );
      const formula = this.formulaRegistry?.getById(formulaId);
      return this.examplesToCases(requirement, formula?.examples ?? [], { formulaId });
    }

    if (requirement.type === 'algorithm') {
      const algorithmId = String(
        (requirement.expectedBehavior as { algorithmId?: string } | undefined)?.algorithmId ??
          requirement.id,
      );
      const algorithm = this.algorithmRegistry?.getById(algorithmId);
      return this.examplesToCases(requirement, algorithm?.examples ?? [], { algorithmId });
    }

    return [];
  }

  private examplesToCases(
    requirement: Requirement,
    examples: RegistryExample[],
    metadata: Record<string, string>,
  ): TestCase[] {
    return examples.map((example, index) => ({
      id: example.id ?? `${requirement.id}-${example.kind ?? 'fixed'}-${index + 1}`,
      requirementId: requirement.id,
      input: example.input,
      expected: example.expected,
      kind: example.kind ?? 'fixed',
      metadata: {
        ...metadata,
        ...example.metadata,
      },
    }));
  }
}
