/**
 * PDF-HEAT-08: rebuild full project order after drag within a (possibly filtered) visible list.
 * Hidden (filtered-out) IDs keep relative slots; visible IDs are rewritten in the new visual order.
 */
export function rebuildObjectOrderAfterVisibleMove(
  fullIds: readonly string[],
  visibleIds: readonly string[],
  startIndex: number,
  endIndex: number,
): string[] {
  if (
    startIndex === endIndex
    || startIndex < 0
    || endIndex < 0
    || startIndex >= visibleIds.length
    || endIndex >= visibleIds.length
  ) {
    return [...fullIds];
  }
  const nextVisible = [...visibleIds];
  const [moved] = nextVisible.splice(startIndex, 1);
  if (!moved) return [...fullIds];
  nextVisible.splice(endIndex, 0, moved);

  const visibleSet = new Set(visibleIds);
  let vi = 0;
  return fullIds.map((id) => {
    if (visibleSet.has(id)) {
      const next = nextVisible[vi];
      vi += 1;
      return next ?? id;
    }
    return id;
  });
}
