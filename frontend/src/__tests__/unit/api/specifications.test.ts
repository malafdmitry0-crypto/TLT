import { beforeEach, describe, expect, it, vi } from 'vitest';
import apiClient from '@/api/client';
import {
  candidateGroupNeedsUserChoice,
  generateSpecification,
  getCatalogSelections,
  getSpecification,
  getSpecificationErrorDetail,
  putCatalogSelections,
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
        candidate_groups: [],
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

  it('rejects an unknown generation status instead of treating it as a partial result', async () => {
    postMock.mockResolvedValueOnce({
      status: 409,
      data: {
        project_id: 'project-id',
        settings_version: 2,
        results: [{
          electrical_variant_id: 'variant-id',
          status: 'legacy_partial',
          diagnostics: [],
          candidate_groups: [],
        }],
      },
    });

    await expect(generateSpecification('project-id', {
      variant_ids: ['variant-id'],
      options: {},
      exclude_unassigned_confirmed: false,
      catalog_selections: {},
    })).rejects.toThrow('Некорректный ответ формирования спецификации');
  });

  it('loads and replaces catalog selections on the UUID path', async () => {
    getMock.mockResolvedValueOnce({
      data: {
        project_id: 'project-id',
        electrical_variant_id: 'variant-id',
        collection_version: 1,
        selections: [],
      },
    });
    await expect(getCatalogSelections('project-id', 'variant-id')).resolves.toMatchObject({
      collection_version: 1,
      selections: [],
    });
    expect(getMock).toHaveBeenCalledWith(
      '/specifications/project-id/variants/variant-id/catalog-selections',
    );

    const body = {
      expected_version: 1,
      selections: [{
        candidate_group_key: 'cg_key',
        catalog_version_id: 'catalog-1',
        catalog_item_id: 'item-1',
        candidate_set_fingerprint: `sha256:${'a'.repeat(64)}`,
      }],
    };
    putMock.mockResolvedValueOnce({
      data: {
        project_id: 'project-id',
        electrical_variant_id: 'variant-id',
        collection_version: 2,
        selections: body.selections,
      },
    });
    await expect(putCatalogSelections('project-id', 'variant-id', body)).resolves.toMatchObject({
      collection_version: 2,
    });
    expect(putMock).toHaveBeenCalledWith(
      '/specifications/project-id/variants/variant-id/catalog-selections',
      body,
    );
  });

  it('classifies multi-candidate groups that still need an engineer choice', () => {
    expect(candidateGroupNeedsUserChoice({
      group_key: 'g',
      electrical_variant_id: 'er',
      category: 'connection_kit',
      conditions: {},
      selection_source: 'auto_single',
      candidates: [{
        catalog_item_id: 'a',
        catalog_id: 'c',
        catalog_version: 'v1',
        category: 'connection_kit',
        name: 'A',
        mark: 'A',
        nomenclature_code: '1',
        supply_unit: 'шт.',
      }],
      selected_catalog_item_id: 'a',
    })).toBe(false);

    expect(candidateGroupNeedsUserChoice({
      group_key: 'g',
      electrical_variant_id: 'er',
      category: 'connection_kit',
      conditions: {},
      selection_source: 'none',
      candidates: [
        {
          catalog_item_id: 'a',
          catalog_id: 'c',
          catalog_version: 'v1',
          category: 'connection_kit',
          name: 'A',
          mark: 'A',
          nomenclature_code: '1',
          supply_unit: 'шт.',
        },
        {
          catalog_item_id: 'b',
          catalog_id: 'c',
          catalog_version: 'v1',
          category: 'connection_kit',
          name: 'B',
          mark: 'B',
          nomenclature_code: '2',
          supply_unit: 'шт.',
        },
      ],
      selected_catalog_item_id: null,
    })).toBe(true);
  });
});
