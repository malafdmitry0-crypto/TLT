export interface ClimateEntry {
  region: string;
  min_temperature: number;
  avg_temperature: number;
  wind_zone: number;
}

export interface InsulationEntry {
  material: string;
  name: string;
  conductivity: number;
  temperature_range?: [number, number];
}

export interface CableTltEntry {
  brand: string;
  model: string;
  power_per_meter: number;
  max_temperature: number;
  min_temperature: number;
  voltage: number;
}

export interface AccessoryEntry {
  category: string;
  name: string;
  article: string | null;
  unit: string;
  per_object: number;
}
