import { beforeEach, describe, expect, it, vi } from 'vitest';
import { importObjectsExcel } from '@/api/projects';
import apiClient from '@/api/client';

vi.mock('@/api/client', () => ({
  default: { post: vi.fn() },
}));

describe('importObjectsExcel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('preserves structured validation errors from the import response', async () => {
    const response = {
      created: 1,
      valid: 1,
      invalid: 1,
      skipped_duplicates: 0,
      skipped_limit: 0,
      mode: 'merge' as const,
      errors: [],
      validation_errors: [{
        sheet: 'Трубопроводы',
        row: 3,
        field: 'outer_diameter',
        code: 'out_of_range',
        message: 'Наружный диаметр должен быть от 10,8 до 3000 мм',
      }],
    };
    vi.mocked(apiClient.post).mockResolvedValueOnce({ data: response });

    const result = await importObjectsExcel('project-1', new File([''], 'objects.csv'));

    expect(result.invalid).toBe(1);
    expect(result.validation_errors).toEqual(response.validation_errors);
  });
});
