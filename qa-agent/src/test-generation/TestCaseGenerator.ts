import type { Requirement } from '../requirements/types';
import type { TestCase } from './types';

export interface TestCaseGenerator {
  generate(requirement: Requirement): TestCase[];
}
