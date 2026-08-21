/**
 * Admin DatabasePage form → API payload normalization.
 */
import type {
  AccessoryExtendedPayload,
  CableExtendedPayload,
} from '@/types/admin';

export type CableFormValues = Partial<Omit<CableExtendedPayload, 'params'>> & {
  params_json?: string;
  conductor_section_mm2?: number | null;
};
export type AccessoryFormValues = Partial<Omit<AccessoryExtendedPayload, 'params'>> & {
  params_json?: string;
};

export function emptyToNull(value: unknown) {
  return value === '' || value === undefined ? null : value;
}

export function parseParamsJson(value: string | undefined): Record<string, unknown> | null {
  if (!value || !value.trim()) return null;
  const parsed = JSON.parse(value);
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('params должен быть JSON-объектом');
  }
  return parsed as Record<string, unknown>;
}

export function formatParamsJson(value: Record<string, unknown> | null | undefined) {
  return value ? JSON.stringify(value, null, 2) : '';
}

export function numberParam(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value.replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function cableConductorSection(params: Record<string, unknown> | null | undefined): number | null {
  return numberParam(params?.conductor_section_mm2 ?? params?.conductor_cross_section);
}

export function normalizeCablePayload(values: CableFormValues): Partial<CableExtendedPayload> {
  const parsedParams = parseParamsJson(values.params_json) ?? {};
  const conductorSection = emptyToNull(values.conductor_section_mm2);
  if (conductorSection !== null) {
    parsedParams.conductor_section_mm2 = conductorSection;
  }
  const params = Object.keys(parsedParams).length > 0 ? parsedParams : null;

  return {
    cable_type: values.cable_type ?? 'self_regulating',
    brand: String(values.brand ?? '').trim(),
    model: String(values.model ?? '').trim(),
    power_per_meter: emptyToNull(values.power_per_meter) as number | null,
    max_temperature: emptyToNull(values.max_temperature) as number | null,
    min_temperature: emptyToNull(values.min_temperature) as number | null,
    resistance_per_meter: emptyToNull(values.resistance_per_meter) as number | null,
    supplier_name: emptyToNull(values.supplier_name) as string | null,
    article: emptyToNull(values.article) as string | null,
    currency: (emptyToNull(values.currency) as string | null) ?? 'RUB',
    price_per_meter: emptyToNull(values.price_per_meter) as number | null,
    stock_quantity_m: emptyToNull(values.stock_quantity_m) as number | null,
    stock_status: emptyToNull(values.stock_status) as CableExtendedPayload['stock_status'],
    lead_time_days: emptyToNull(values.lead_time_days) as number | null,
    supplier_priority: emptyToNull(values.supplier_priority) as number | null,
    is_preferred: Boolean(values.is_preferred),
    order_multiple_m: emptyToNull(values.order_multiple_m) as number | null,
    min_order_quantity_m: emptyToNull(values.min_order_quantity_m) as number | null,
    is_discontinued: Boolean(values.is_discontinued),
    replacement_group: emptyToNull(values.replacement_group) as string | null,
    price_updated_at: emptyToNull(values.price_updated_at) as string | null,
    stock_updated_at: emptyToNull(values.stock_updated_at) as string | null,
    commercial_data_source: emptyToNull(values.commercial_data_source) as string | null,
    params,
    is_active: values.is_active ?? true,
  };
}

export function normalizeAccessoryPayload(
  values: AccessoryFormValues
): Partial<AccessoryExtendedPayload> {
  return {
    category: String(values.category ?? '').trim(),
    name: String(values.name ?? '').trim(),
    article: emptyToNull(values.article) as string | null,
    params: parseParamsJson(values.params_json),
    is_active: values.is_active ?? true,
  };
}
