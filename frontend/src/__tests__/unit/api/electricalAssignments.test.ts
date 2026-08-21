import { afterEach, describe, expect, it, vi } from 'vitest';

import apiClient from '@/api/client';
import {
  assignElectricalVariantObjects,
  electricalAssignmentQueryKeys,
  listElectricalVariantAssignments,
  patchElectricalAssignmentOverrides,
  unassignElectricalVariantObjects,
} from '@/api/electricalVariants';

const originalAdapter = apiClient.defaults.adapter;

afterEach(() => {
  apiClient.defaults.adapter = originalAdapter;
});

describe('electrical assignment API', () => {
  it('isolates list cache identity by project, UUID ER, view and page', () => {
    const first = electricalAssignmentQueryKeys.list('project-1', 'er-1', {
      view: 'unassigned',
      page: 1,
      page_size: 50,
    });
    const otherVariant = electricalAssignmentQueryKeys.list('project-1', 'er-2', {
      view: 'unassigned',
      page: 1,
      page_size: 50,
    });
    const otherView = electricalAssignmentQueryKeys.list('project-1', 'er-1', {
      view: 'resistive',
      page: 1,
      page_size: 50,
    });

    expect(first).toEqual([
      'project',
      'project-1',
      'electrical-variant',
      'er-1',
      'assignments',
      'unassigned',
      'all-states',
      1,
      50,
    ]);
    expect(otherVariant).not.toEqual(first);
    expect(otherView).not.toEqual(first);
  });

  it('serializes GET filters and exact PATCH/unassign optimistic-lock payloads', async () => {
    const adapter = vi.fn(async (config) => ({
      config,
      data: config.method === 'get'
        ? {
          project_id: 'project-1',
          electrical_variant_id: 'er-1',
          items: [],
          counts: {
            total: 0,
            filtered: 0,
            by_system: {
              unassigned: 0,
              self_regulating: 0,
              resistive: 0,
              skin: 0,
              mineral: 0,
            },
            by_state: { unassigned: 0, ready: 0, unsupported: 0, stale: 0, error: 0 },
          },
          page_info: {
            page: 1,
            page_size: 50,
            offset: 0,
            total_pages: 0,
            has_next_page: false,
            has_previous_page: false,
          },
        }
        : {
          project_id: 'project-1',
          electrical_variant_id: 'er-1',
          changed_count: 1,
          assignments: [],
          cleanup: {},
          specification_state: 'stale',
        },
      headers: {},
      status: 200,
      statusText: 'OK',
    }));
    apiClient.defaults.adapter = adapter;

    await listElectricalVariantAssignments('project-1', 'er-1', {
      view: 'self_regulating',
      assignment_state: 'ready',
      page: 2,
      page_size: 50,
    });
    await assignElectricalVariantObjects('project-1', 'er-1', {
      system_type: 'self_regulating',
      items: [{ object_id: 'object-1', expected_version: 7 }],
    });
    await unassignElectricalVariantObjects('project-1', 'er-1', {
      confirm: true,
      items: [{ object_id: 'object-1', expected_version: 8 }],
    });

    expect(adapter.mock.calls[0][0]).toMatchObject({
      method: 'get',
      url: '/projects/project-1/electrical-variants/er-1/assignments',
      params: {
        view: 'self_regulating',
        assignment_state: 'ready',
        page: 2,
        page_size: 50,
      },
    });

    const patchPayload = JSON.parse(String(adapter.mock.calls[1][0].data));
    expect(adapter.mock.calls[1][0]).toMatchObject({
      method: 'patch',
      url: '/projects/project-1/electrical-variants/er-1/assignments',
    });
    expect(patchPayload).toEqual({
      system_type: 'self_regulating',
      items: [{ object_id: 'object-1', expected_version: 7 }],
    });

    const unassignPayload = JSON.parse(String(adapter.mock.calls[2][0].data));
    expect(adapter.mock.calls[2][0]).toMatchObject({
      method: 'post',
      url: '/projects/project-1/electrical-variants/er-1/unassign',
    });
    expect(unassignPayload).toEqual({
      confirm: true,
      items: [{ object_id: 'object-1', expected_version: 8 }],
    });
  });

  it('PATCHes a sparse per-object TT override payload under the exact UUID ER', async () => {
    const adapter = vi.fn(async (config) => ({
      config,
      data: { id: 'assignment-1', version: 8, electrical_overrides: {} },
      headers: {},
      status: 200,
      statusText: 'OK',
    }));
    apiClient.defaults.adapter = adapter;

    await patchElectricalAssignmentOverrides(
      'project-1',
      'er-2',
      'object-1',
      {
        expected_version: 7,
        supply_voltage_v: 380,
        manual_cable_model: '30ТТВ2-СР',
      },
    );

    expect(adapter).toHaveBeenCalledTimes(1);
    expect(adapter.mock.calls[0][0]).toMatchObject({
      method: 'patch',
      url: '/projects/project-1/electrical-variants/er-2/assignments/object-1/electrical-overrides',
    });
    expect(JSON.parse(String(adapter.mock.calls[0][0].data))).toEqual({
      expected_version: 7,
      supply_voltage_v: 380,
      manual_cable_model: '30ТТВ2-СР',
    });
  });
});
