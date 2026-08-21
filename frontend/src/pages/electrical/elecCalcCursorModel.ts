import type { ProjectObjectsPageCursor } from '@/types/project';

export function projectObjectsPageCursorsEqual(
  left?: ProjectObjectsPageCursor | null,
  right?: ProjectObjectsPageCursor | null,
) {
  if (left == null || right == null) return left == null && right == null;
  return left.id === right.id
    && left.sort_order === right.sort_order
    && left.key === right.key
    && left.value === right.value
    && left.value_is_null === right.value_is_null;
}
