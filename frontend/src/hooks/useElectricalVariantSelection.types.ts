import type { ElectricalVariantPendingOperation } from '@/hooks/useElectricalVariantCommandsController';
import type {
  ElectricalReadinessResponse,
  ElectricalVariant,
} from '@/types/electricalVariant';

export interface UseElectricalVariantSelectionOptions {
  projectId: string | null | undefined;
  enabled?: boolean;
  /** False for read-only consumers when another mounted controller owns the URL. */
  syncRouteSelection?: boolean;
}

export interface ElectricalVariantSelectionController {
  projectId: string | null;
  variants: ElectricalVariant[];
  selectedVariantId: string | null;
  selectedVariant: ElectricalVariant | null;
  activeVariant: ElectricalVariant | null;
  isLoading: boolean;
  isFetching: boolean;
  isError: boolean;
  listError: unknown;
  isEmpty: boolean;
  readiness: ElectricalReadinessResponse | null;
  isReadinessLoading: boolean;
  isReadinessFetching: boolean;
  readinessError: unknown;
  mutationError: unknown;
  mutationNotice?: string | null;
  isMutating: boolean;
  pendingOperation: ElectricalVariantPendingOperation;
  selectVariant: (variantId: string) => void;
  /** Select tab and sync backend is_active (current tab = working ER). */
  selectAndActivateVariant: (variantId: string) => Promise<ElectricalVariant | void>;
  retryList: () => Promise<void>;
  retryReadiness: () => Promise<void>;
  initializeVariant: () => Promise<ElectricalVariant>;
  createVariant: (name?: string) => Promise<ElectricalVariant>;
  copySelectedVariant: (name?: string) => Promise<ElectricalVariant>;
  renameVariant: (variantId: string, name: string) => Promise<ElectricalVariant>;
  activateVariant: (
    variantId: string,
    options?: { silent?: boolean },
  ) => Promise<ElectricalVariant>;
  deleteVariant: (variantId: string) => Promise<void>;
  clearMutationError: () => void;
}
