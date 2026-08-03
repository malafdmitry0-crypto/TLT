import { beforeEach, describe, expect, it, vi } from 'vitest';
import apiClient from '@/api/client';
import {
  generateSpecification,
  getSpecification,
  getSpecificationErrorDetail,
  saveSpecificationItems,
} from '@/api/specifications';

vi.mock('@/api/client', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
  },
}));

const getMock = vi.mocked(apiClient.get);
const postMock = vi.mocked(apiClient.post);
const putMock = vi.mocked(apiClient.put);

describe('specifications API', () => {
  beforeEach(() => {
    getMock.mockReset();
    postMock.mockReset();
    putMock.mockReset();
  });

  it('loads specification by UUID path without numeric variant query', async () => {
    getMock.mockResolvedValueOnce({ data: null });
    await expect(getSpecification('project-id', 'variant-id')).resolves.toBeNull();
    expect(getMock).toHaveBeenCalledWith(
      '/specifications/project-id/variants/variant-id',
    );
  });

  it('saves manual items on the UUID path', async () => {
    const items = [{
      category: 'extra',
      name: 'Manual',
      article: null,
      unit: 'шт.',
      quantity: '2',
      params: {},
      source: 'manual' as const,
    }];
    putMock.mockResolvedValueOnce({
      data: { project_id: 'project-id', items, electrical_variant_id: 'variant-id' },
    });
    await expect(saveSpecificationItems('project-id', 'variant-id', items)).resolves.toEqual({
      project_id: 'project-id',
      items,
      electrical_variant_id: 'variant-id',
    });
    expect(putMock).toHaveBeenCalledWith(
      '/specifications/project-id/variants/variant-id/items',
      { items },
    );
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
