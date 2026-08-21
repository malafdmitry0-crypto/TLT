/** Shared infinite-loading contract for normal (non-excel) glide grids. */
export interface NormalGlideInfiniteLoading {
  loaded: number;
  total: number;
  hasNextPage: boolean;
  loading?: boolean;
}

/** Heat-era alias kept for gradual rename. */
export type HeatCalcNormalInfiniteLoading = NormalGlideInfiniteLoading;
