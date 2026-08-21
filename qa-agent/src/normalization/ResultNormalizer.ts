import type { ActualResult } from '../runners/types';
import type { NormalizedResult } from './types';

export class ResultNormalizer {
  normalize(rawResult: ActualResult): NormalizedResult {
    return {
      value: rawResult.value,
      unit: rawResult.unit,
      status: rawResult.status,
      warnings: [],
      metadata: rawResult.metadata,
    };
  }
}
