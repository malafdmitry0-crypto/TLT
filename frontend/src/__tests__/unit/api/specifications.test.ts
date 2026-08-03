import { beforeEach, describe, expect, it, vi } from 'vitest';
import apiClient from '@/api/client';
import {
  generateSpecification,
  getSpecificationErrorDetail,
} from '@/api/specifications';

vi.mock('@/api/client', () => ({
  default: {
    post: vi.fn(),
  },
}));

const postMock = vi.mocked(apiClient.post);

describe('specifications API', () => {
  beforeEach(() => {
    postMock.mockReset();
  });

  it('normalizes the canonical error envelope by code rather than an Error message', () => {
    expect(getSpecificationErrorDetail({
      message: 'interceptor message is not the contract',
      detail: {
        code: 'SPEC_VARIANT_IDS_REQUIRED',
        message: 'Выберите хотя бы один ЭР',
        issues: [],
        details: {},
      },
    })).toEqual({
      code: 'SPEC_VARIANT_IDS_REQUIRED',
      message: 'Выберите хотя бы один ЭР',
      issues: [],
      details: {},
    });
  });

  it('treats a 409 preflight body as a canonical generation result', async () => {
    const result = {
      project_id: 'project-id',
      settings_version: 2,
      results: [{
        electrical_variant_id: 'variant-id',
        status: 'confirmation_required' as const,
        items: [],
        excluded_unassigned_object_ids: [],
        diagnostics: [],
        snapshot: null,
      }],
    };
    postMock.mockResolvedValueOnce({ status: 409, data: result });

    await expect(generateSpecification('project-id', {
      variant_ids: ['variant-id'],
      options: {},
      exclude_unassigned_confirmed: false,
      catalog_selections: {},
    })).resolves.toEqual(result);
  });

  it('keeps a typed 422 error envelope on the error path', async () => {
    postMock.mockResolvedValueOnce({
      status: 422,
      data: {
        detail: {
          code: 'SPEC_REQUEST_INVALID',
          message: 'Некорректный запрос',
        },
      },
    });

    const promise = generateSpecification('project-id', {
      variant_ids: ['variant-id'],
      options: {},
      exclude_unassigned_confirmed: false,
      catalog_selections: {},
    });
    await expect(promise).rejects.toMatchObject({
      status: 422,
      code: 'SPEC_REQUEST_INVALID',
      detail: {
        code: 'SPEC_REQUEST_INVALID',
        message: 'Некорректный запрос',
      },
    });
  });
});
