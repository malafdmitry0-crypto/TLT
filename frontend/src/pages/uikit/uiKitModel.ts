export type Density = 'compact' | 'comfortable';
export type HeatScope = 'pipe' | 'tank' | 'all';

export interface HeatLossRow {
  id: string;
  name: string;
  type: string;
  objectType: Exclude<HeatScope, 'all'>;
  temperature: string;
  heatLoss: string;
  insulation: string;
  status: string;
}

/* Реальная палитра приложения — только semantic token refs (hex живут в tokens.css). */
export const colorTokens = [
  { name: 'Primary 700', value: 'var(--color-primary)', className: 'primary' },
  { name: 'Primary 500 · Link', value: 'var(--color-primary-light)', className: 'link' },
  { name: 'Label 600', value: 'var(--tlt-field-label-color)', className: 'label' },
  { name: 'Success 700', value: 'var(--ui-success)', className: 'green' },
  { name: 'Warning 700', value: 'var(--ui-warning)', className: 'amber' },
  { name: 'Danger 600', value: 'var(--color-danger-border)', className: 'red' },
] as const;

/* Статусы = реальные статусы теплового расчёта (heatLossCalcStatus) */
export const rows: HeatLossRow[] = [
  { id: 'Т-101', name: 'Подающий трубопровод', type: 'Труба', objectType: 'pipe', temperature: '+95', heatLoss: '184,6', insulation: 'Минвата · 60 мм', status: 'Рассчитан' },
  { id: 'Е-204', name: 'Резервуар технической воды', type: 'Резервуар', objectType: 'tank', temperature: '+40', heatLoss: '—', insulation: 'ППУ · 80 мм', status: 'Не рассчитан' },
  { id: 'Т-118', name: 'Дренажная линия', type: 'Труба', objectType: 'pipe', temperature: '+12', heatLoss: '—', insulation: 'Минвата · 40 мм', status: 'Ошибка' },
];

export const pipeMaterialOptions = [
  { label: 'Углеродистая сталь', value: 'steel' },
  { label: 'Нержавеющая сталь', value: 'stainless' },
  { label: 'Полиэтилен', value: 'plastic' },
];

export const climateCityOptions = [
  { label: 'Москва', value: 'moscow', description: 'Расчётная температура −25 °C' },
  { label: 'Санкт-Петербург', value: 'spb', description: 'Расчётная температура −24 °C' },
  { label: 'Норильск', value: 'norilsk', description: 'Расчётная температура −46 °C' },
];

export const insulationMaterialOptions = [
  { label: 'Минеральная вата', value: 'mineral-wool', description: 'λ = 0,040 Вт/(м·К)' },
  { label: 'Пенополиуретан (ППУ)', value: 'pur', description: 'λ = 0,027 Вт/(м·К)' },
  { label: 'Вспененный каучук', value: 'rubber', description: 'λ = 0,036 Вт/(м·К)' },
];

export const navigation = [
  ['foundation', 'Основа'],
  ['actions', 'Действия'],
  ['forms', 'Поля'],
  ['states', 'Состояния'],
  ['data', 'Данные'],
  ['heatcalc', 'Теплопотери'],
  ['primitives', 'Компоненты'],
  ['patterns', 'Паттерны'],
] as const;
