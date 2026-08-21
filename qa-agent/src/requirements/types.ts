import type { Metadata, Tolerance } from '../shared/types';

export type RequirementType = 'formula' | 'algorithm' | 'ui' | 'api' | 'text';

export type Requirement = {
  id: string;
  sourceSection: string;
  description: string;
  type: RequirementType;
  inputs: string[];
  expectedBehavior: unknown;
  tolerance?: Tolerance;
  tags: string[];
  metadata?: Metadata;
};
