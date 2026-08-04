/**
 * Pure helpers for SpecTable section grouping and empty-state copy (SPEC-P0-a).
 */
import type { SpecificationItem } from '@/types/specification';
import type { SpecificationDiagnostic } from '@/api/specifications';

export type SpecBomSection = 'pipe' | 'tank' | 'common';

type ItemParams = {
  object_type_section?: string;
  bom_section?: string;
  object_type?: string;
};

/** Resolve BOM section for a specification line (BE writes object_type_section). */
export function bomSectionOf(item: SpecificationItem): SpecBomSection {
  const params = (item.params ?? {}) as ItemParams;
  const raw = String(
    params.object_type_section
      || params.bom_section
      || params.object_type
      || 'common',
  ).toLowerCase().trim();

  if (
    raw === 'pipe'
    || raw === 'трубопровод'
    || raw === 'трубопроводы'
    || raw === 'трубы'
  ) {
    return 'pipe';
  }
  if (
    raw === 'tank'
    || raw === 'ёмкость'
    || raw === 'емкость'
    || raw === 'ёмкости'
    || raw === 'емкости'
    || raw === 'бочки'
    || raw === 'бочка'
  ) {
    return 'tank';
  }
  return 'common';
}

export type SpecSectionEmptyKind = 'no_items' | 'unsupported';

/**
 * Honest empty-section copy:
 * - no_items: generated BOM simply has nothing in this section
 * - unsupported: type not calculated in this product version (explicit)
 */
export function specSectionEmptyTitle(
  kind: SpecSectionEmptyKind = 'no_items',
): string {
  if (kind === 'unsupported') {
    return 'Расчёт спецификации для данного типа объекта пока недоступен.';
  }
  return 'Нет позиций в этой секции.';
}

/** Prefer human message; keep code as secondary line when useful. */
export function formatPreflightDiagnosticLines(
  diagnostics: readonly SpecificationDiagnostic[],
): string[] {
  if (diagnostics.length === 0) {
    return ['Есть неназначенные объекты. Подтвердите исключение или исправьте назначения.'];
  }
  return diagnostics.map((diagnostic) => {
    const message = (diagnostic.message || '').trim();
    const code = (diagnostic.code || '').trim();
    if (message && code && !message.includes(code)) {
      return `${message} (${code})`;
    }
    if (message) return message;
    if (code) return code;
    return 'Требуется подтверждение';
  });
}

export function formatPreflightSummary(
  diagnostics: readonly SpecificationDiagnostic[],
): string {
  return formatPreflightDiagnosticLines(diagnostics).join('\n');
}

/** First ER id from pending generate list (MVP: first selected for generate). */
export function resolveFirstGenerateErId(
  generateVariantIds: readonly string[] | null | undefined,
  fallbackErId?: string | null,
): string | null {
  const first = generateVariantIds?.find((id) => typeof id === 'string' && id.trim());
  if (first) return first;
  if (fallbackErId && fallbackErId.trim()) return fallbackErId;
  return null;
}
