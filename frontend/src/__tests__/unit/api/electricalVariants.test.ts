import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  delete: vi.fn(),
  withIdempotencyKey: vi.fn((config?: { headers?: Record<string, string> }) => (
    config ?? { headers: { 'Idempotency-Key': 'generated-key' } }
  )),
}));

vi.mock('@/api/client', () => ({
  default: {
    get: apiMocks.get,
    post: apiMocks.post,
    patch: apiMocks.patch,
    delete: apiMocks.delete,
  },
  withIdempotencyKey: apiMocks.withIdempotencyKey,
}));

import {
  activateElectricalVariant,
  copyElectricalVariant,
  createEmptyElectricalVariant,
  deleteElectricalVariant,
  electricalVariantQueryKeys,
  getElectricalVariantReadiness,
  initializeElectricalVariants,
  listElectricalVariants,
  renameElectricalVariant,
} from '@/api/electricalVariants';
import type { ElectricalVariant } from '@/types/electricalVariant';

const projectId = '11111111-1111-4111-8111-111111111111';
const variantId = '22222222-2222-4222-8222-222222222222';

const variant: ElectricalVariant = {
  id: variantId,
  project_id: projectId,
  name: 'ЭР 1',
  sort_order: 0,
  is_active: true,
  copied_from_id: null,
  legacy_variant_number: 1,
  specification_state: 'not_generated',
  created_at: '2026-07-18T10:00:00Z',
  updated_at: '2026-07-18T10:00:00Z',
};

describe('electrical variants API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lists project variants using the lifecycle path', async () => {
    apiMocks.get.mockResolvedValueOnce({ data: [variant] });

    await expect(listElectricalVariants(projectId)).resolves.toEqual([variant]);

    expect(apiMocks.get).toHaveBeenCalledWith(
      `/projects/${projectId}/electrical-variants`,
    );
  });

  it('loads project readiness using the readiness path', async () => {
    const readiness = {
      project_id: projectId,
      ready: false,
      total_objects: 1,
      ready_objects: 0,
      issues: [
        {
          code: 'ELECTRICAL_OBJECT_NOT_READY',
          message: 'Тепловой расчёт не готов',
          object_id: '33333333-3333-4333-8333-333333333333',
          details: { total_heat_loss_design: null },
        },
      ],
    };
    apiMocks.get.mockResolvedValueOnce({ data: readiness });

    await expect(getElectricalVariantReadiness(projectId)).resolves.toEqual(readiness);

    expect(apiMocks.get).toHaveBeenCalledWith(
      `/projects/${projectId}/electrical-readiness`,
    );
  });

  it('initializes the first variant without an invented request body', async () => {
    const response = {
      project_id: projectId,
      created: true,
      assignments_created: 1,
      variant,
    };
    apiMocks.post.mockResolvedValueOnce({ data: response });

    await expect(initializeElectricalVariants(projectId)).resolves.toEqual(response);

    expect(apiMocks.post).toHaveBeenCalledWith(
      `/projects/${projectId}/electrical-variants/initialize`,
    );
  });

  it('creates an empty variant with the exact optional-name body', async () => {
    apiMocks.post.mockResolvedValueOnce({ data: variant });

    await expect(
      createEmptyElectricalVariant(projectId, { name: 'Резервный ЭР' }),
    ).resolves.toEqual(variant);

    expect(apiMocks.post).toHaveBeenCalledWith(
      `/projects/${projectId}/electrical-variants`,
      { name: 'Резервный ЭР' },
      { headers: { 'Idempotency-Key': 'generated-key' } },
    );
  });

  it('preserves an explicitly supplied create retry key through the HTTP config', async () => {
    apiMocks.post.mockResolvedValueOnce({ data: variant });

    await createEmptyElectricalVariant(
      projectId,
      { name: 'Резервный ЭР' },
      'create-retry-key',
    );

    expect(apiMocks.withIdempotencyKey).toHaveBeenCalledWith({
      headers: { 'Idempotency-Key': 'create-retry-key' },
    });
    expect(apiMocks.post).toHaveBeenCalledWith(
      `/projects/${projectId}/electrical-variants`,
      { name: 'Резервный ЭР' },
      { headers: { 'Idempotency-Key': 'create-retry-key' } },
    );
  });

  it('copies a variant with a generated Idempotency-Key', async () => {
    const copied = { ...variant, id: '44444444-4444-4444-8444-444444444444' };
    apiMocks.post.mockResolvedValueOnce({ data: copied });

    await expect(
      copyElectricalVariant(projectId, variantId, { name: 'Копия ЭР' }),
    ).resolves.toEqual(copied);

    expect(apiMocks.withIdempotencyKey).toHaveBeenCalledWith(undefined);
    expect(apiMocks.post).toHaveBeenCalledWith(
      `/projects/${projectId}/electrical-variants/${variantId}/copy`,
      { name: 'Копия ЭР' },
      { headers: { 'Idempotency-Key': 'generated-key' } },
    );
  });

  it('preserves an explicitly supplied copy retry key through the HTTP config', async () => {
    const copied = { ...variant, id: '44444444-4444-4444-8444-444444444444' };
    apiMocks.post.mockResolvedValueOnce({ data: copied });

    await copyElectricalVariant(
      projectId,
      variantId,
      { name: 'Копия ЭР' },
      'retry-key',
    );

    expect(apiMocks.withIdempotencyKey).toHaveBeenCalledWith({
      headers: { 'Idempotency-Key': 'retry-key' },
    });
    expect(apiMocks.post).toHaveBeenCalledWith(
      `/projects/${projectId}/electrical-variants/${variantId}/copy`,
      { name: 'Копия ЭР' },
      { headers: { 'Idempotency-Key': 'retry-key' } },
    );
  });

  it('renames a variant with PATCH and the exact name body', async () => {
    const renamed = { ...variant, name: 'Новый ЭР' };
    apiMocks.patch.mockResolvedValueOnce({ data: renamed });

    await expect(
      renameElectricalVariant(projectId, variantId, { name: 'Новый ЭР' }),
    ).resolves.toEqual(renamed);

    expect(apiMocks.patch).toHaveBeenCalledWith(
      `/projects/${projectId}/electrical-variants/${variantId}`,
      { name: 'Новый ЭР' },
    );
  });

  it('activates a variant without an invented request body', async () => {
    apiMocks.post.mockResolvedValueOnce({ data: variant });

    await expect(activateElectricalVariant(projectId, variantId)).resolves.toEqual(variant);

    expect(apiMocks.post).toHaveBeenCalledWith(
      `/projects/${projectId}/electrical-variants/${variantId}/activate`,
    );
  });

  it('deletes a variant and returns the deterministic active fallback', async () => {
    const response = {
      project_id: projectId,
      deleted_variant_id: variantId,
      active_variant_id: '55555555-5555-4555-8555-555555555555',
    };
    apiMocks.delete.mockResolvedValueOnce({ data: response });

    await expect(deleteElectricalVariant(projectId, variantId)).resolves.toEqual(response);

    expect(apiMocks.delete).toHaveBeenCalledWith(
      `/projects/${projectId}/electrical-variants/${variantId}`,
    );
  });

  it('builds stable project- and exact-variant-scoped query keys', () => {
    expect(electricalVariantQueryKeys.list(projectId)).toEqual([
      'project',
      projectId,
      'electrical-variants',
    ]);
    expect(electricalVariantQueryKeys.readiness(projectId)).toEqual([
      'project',
      projectId,
      'electrical-readiness',
    ]);
    expect(electricalVariantQueryKeys.detail(projectId, variantId)).toEqual([
      'project',
      projectId,
      'electrical-variant',
      variantId,
    ]);
  });
});
