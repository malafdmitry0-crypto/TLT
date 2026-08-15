/** Shared URL contract for selecting an electrical variant across feature routes. */
export const ELECTRICAL_VARIANT_URL_PARAM = 'er';

const ELECTRICAL_VARIANT_ROUTE_PATHS = new Set([
  '/workspace',
  '/workspace/heat-calc',
  '/workspace/elec-calc',
  '/workspace/specification',
  '/workspace/report',
  '/report-wizard',
]);

function normalizePathname(pathname: string): string {
  const withoutTrailingSlash = pathname.replace(/\/+$/, '');
  return withoutTrailingSlash || '/';
}

/** `er` is meaningful only on pages that consume an electrical calculation variant. */
export function isElectricalVariantRoutePath(pathname: string): boolean {
  return ELECTRICAL_VARIANT_ROUTE_PATHS.has(normalizePathname(pathname));
}

/**
 * MainLayout's Sidebar is the route-selection owner only for heat calculation.
 * Every other eligible page mounts its own variant controller.
 */
export function isSidebarElectricalVariantRouteOwner(pathname: string): boolean {
  return normalizePathname(pathname) === '/workspace/heat-calc';
}
