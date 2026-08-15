import { afterEach, describe, expect, it } from 'vitest';

import {
  isElectricalVariantRoutePath,
  isSidebarElectricalVariantRouteOwner,
} from '@/domain/electricalVariantRouteModel';
import { isBrowserRouteCommitPending } from '@/hooks/electricalVariantBrowserRouteModel';

const originalHistoryState = window.history.state;
const originalUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;

afterEach(() => {
  window.history.replaceState(originalHistoryState, '', originalUrl);
});

describe('electricalVariantRouteModel', () => {
  it.each([
    '/workspace',
    '/workspace/heat-calc',
    '/workspace/elec-calc',
    '/workspace/specification',
    '/workspace/report',
    '/report-wizard',
    '/workspace/report/',
  ])('allows er on %s', (pathname) => {
    expect(isElectricalVariantRoutePath(pathname)).toBe(true);
  });

  it.each([
    '/',
    '/projects',
    '/login',
    '/workspace/report-preview',
    '/workspace/heat-calc/object/1',
  ])('rejects er on %s', (pathname) => {
    expect(isElectricalVariantRoutePath(pathname)).toBe(false);
  });

  it('assigns Sidebar URL ownership only to heat calculation', () => {
    expect(isSidebarElectricalVariantRouteOwner('/workspace/heat-calc')).toBe(true);
    expect(isSidebarElectricalVariantRouteOwner('/workspace/heat-calc/')).toBe(true);
    expect(isSidebarElectricalVariantRouteOwner('/workspace')).toBe(false);
    expect(isSidebarElectricalVariantRouteOwner('/workspace/report')).toBe(false);
    expect(isSidebarElectricalVariantRouteOwner('/projects')).toBe(false);
  });

  it('detects when BrowserRouter history is ahead of the committed React location', () => {
    const committed = {
      pathname: '/workspace/report',
      search: '?er=old',
      hash: '',
    };
    window.history.replaceState(
      { idx: 3 },
      '',
      '/workspace/heat-calc?er=new',
    );

    expect(isBrowserRouteCommitPending(committed)).toBe(true);
    expect(isBrowserRouteCommitPending({
      pathname: '/workspace/heat-calc',
      search: '?er=new',
      hash: '',
    })).toBe(false);
  });
});
