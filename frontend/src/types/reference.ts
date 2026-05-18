export interface ClimateEntry {
  city?: string;
  region: string;
  min_temperature?: number;
  avg_temperature?: number;
  wind_zone?: number;
  t_0_98?: number;
  t_0_92?: number;
  t_cold_day_0_98?: number;
  t_cold_day_0_92?: number;
  t_cold_fiveday_0_98?: number;
  t_cold_fiveday_0_92?: number;
  t_0_94?: number;
  t_abs_min?: number;
  daily_amplitude_cold_month?: number;
  humidity_cold_month?: number;
  humidity_15h_cold_month?: number;
  prevailing_wind_dec_feb?: string;
  wind_max_jan?: number;
  wind_avg_cold?: number;
}

export interface InsulationEntry {
  material: string;
  name: string;
  conductivity: number;
  temperature_range?: [number, number];
  density_kg_m3?: number | string;
  conductivity_20_plus?: number | [number, number] | { a: number; b: number } | null;
  conductivity_19_minus?: number[] | null;
  selectable?: boolean;
  deprecated?: boolean;
  requires_material_reselection?: boolean;
  reselection_message?: string;
  material_family?: string;
  source?: string;
}

export interface CableTltEntry {
  brand: string;
  model: string;
  power_per_meter: number;
  max_temperature: number;
  min_temperature: number;
  voltage: number;
}

export interface CableTtEntry {
  model: string;
  series: 'ТТН' | 'ТТВ' | 'ТТХ';
  nominal_power: number;
  q1: number;
  q2: number;
  max_product_temp: number;
  max_vapor_temp: number;
  voltage: number;
}

export interface AccessoryEntry {
  category: string;
  name: string;
  article: string | null;
  unit: string;
  per_object: number;
}

export interface PipeMaterialEntry {
  material: string;
  name: string;
  formula: string;
  a: number;
  b: number;
  accuracy: string;
}

export interface SoilConductivityEntry {
  soil: string;
  soil_code: string;
  density_kg_m3: number | null;
  moisture_percent: number;
  conductivity: number;
}

export interface ResistiveCableEntry {
  cable_type: string;
  brand: string;
  model: string;
  source: string;
  resistance_per_meter?: number | null;
  resistance_ohm_km?: number;
  technical_data_complete?: boolean;
  technical_data_missing?: string[];
  conductor_section_mm2?: number;
  conductor_cross_section?: number;
  diameter_mm?: number;
  nominal_section_length_m?: Record<'20' | '30' | '40', number | null>;
  nominal_size_mm?: string;
  mass_kg_km?: number;
  min_bend_radius_mm?: number;
  price_per_meter?: number | null;
  stock_quantity_m?: number | null;
  stock_status?: string | null;
  lead_time_days?: number | null;
  supplier_priority?: number | null;
  is_preferred?: boolean;
  commercial_data_source?: string | null;
}

export interface ResistiveCablesReference {
  single_core: ResistiveCableEntry[];
  three_core: ResistiveCableEntry[];
  common: Record<string, Record<string, string | number>>;
}
