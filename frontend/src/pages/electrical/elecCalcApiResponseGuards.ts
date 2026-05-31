import type { ApiError } from '@/api/client';
import type { BatchElectricalResponse } from '@/types/calculation';

export function isBatchElectricalResponse(result: unknown): result is BatchElectricalResponse {
  return typeof result === 'object' && result !== null && 'calculated' in result;
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof Error;
}

export function isTargetVariantNotEmptyError(error: unknown): error is ApiError {
  return isApiError(error) && error.status === 409 && error.code === 'target_not_empty';
}
