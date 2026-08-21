/**
 * Значимые варианты теплорасчёта — трубы и резервуары (кейс 1 §5.2–5.4, §5.13).
 *
 * «Значимый» = отдельная ветка формулы, а не перебор чисел: каждая строка
 * таблиц ниже включает свой участок `backend/app/formulas/heat_loss/pipe.py`
 * или `tank.py` (размещение, стенка, слои, локальные элементы, форма, грунт).
 * Золотые числа проверяют unit-тесты бэкенда; здесь проверяется сквозной путь
 * сессия → API → расчёт → БД → таблица объектов и признак «Рассчитан».
 *
 * Объекты создаются пачкой в одной гостевой сессии: гостевые сессии с одного
 * IP лимитированы, поэтому вариант ≠ отдельный тест.
 */
import { expect, test, type Page } from '@playwright/test';

import {
  createCalculatedPipe,
  createCalculatedTank,
  fetchProjectObjects,
  loginAsGuest,
} from './helpers/workspace';

type HeatResults = Record<string, number | boolean | null | undefined>;

interface Variant {
  /** Ветка формулы, которую включает вариант. */
  name: string;
  params: Record<string, unknown>;
  check: (results: HeatResults) => void;
}

/** Число из результата: не null и конечное. */
function value(results: HeatResults, key: string): number {
  const raw = results[key];
  expect(typeof raw === 'number' && Number.isFinite(raw), `${key} должен быть числом`).toBeTruthy();
  return raw as number;
}

/** Общая проверка: расчёт выполнен и физически осмыслен. */
function expectCalculated(results: HeatResults, totalKey: string) {
  expect(value(results, totalKey)).toBeGreaterThan(0);
  expect(value(results, 'safety_factor_applied')).toBeGreaterThanOrEqual(1);
}

const REFERENCE_LAYER = { thickness: 0.05, material: 'mineral_wool_boards_120' };
const CUSTOM_LAYER = {
  thickness: 0.03,
  material: 'other',
  conductivity: 0.045,
  temperature_range: [-60, 400],
};

const PIPE_VARIANTS: Variant[] = [
  {
    name: 'на открытом воздухе, α по скорости ветра',
    params: {},
    check: (r) => {
      expectCalculated(r, 'total_heat_loss_design');
      expect(value(r, 'alpha_vnesh_applied')).toBeGreaterThan(0);
      expect(value(r, 'wind_speed_applied')).toBe(3);
      expect(value(r, 'wall_resistance')).toBeGreaterThan(0);
    },
  },
  {
    name: 'на открытом воздухе, α задан вручную',
    params: { alpha_vnesh: 15, wind_speed: null },
    check: (r) => {
      expectCalculated(r, 'total_heat_loss_design');
      expect(value(r, 'alpha_vnesh_applied')).toBe(15);
      // ручной α перебивает ветер — скорость в расчёт не идёт
      expect(r.wind_speed_applied ?? null).toBeNull();
    },
  },
  {
    name: 'в помещении, α по размещению',
    params: {
      placement: 'indoor',
      wind_speed: null,
      insulation_temperature_basis: 'indoor',
      ambient_temperature: 20,
      process_temperature: 90,
    },
    check: (r) => {
      expectCalculated(r, 'total_heat_loss_design');
      expect(value(r, 'alpha_vnesh_applied')).toBeGreaterThan(0);
      expect(r.wind_speed_applied ?? null).toBeNull();
    },
  },
  {
    name: 'подземная прокладка: сопротивление грунта вместо α',
    params: {
      placement: 'underground',
      insulation_temperature_basis: 'channel',
      ambient_temperature: null,
      wind_speed: null,
      ground_temperature: 5,
      ground_conductivity: 1.2,
      pipe_centerline_depth: 1.2,
    },
    check: (r) => {
      expectCalculated(r, 'total_heat_loss_design');
      expect(value(r, 'ground_conductivity_applied')).toBe(1.2);
      // под землёй внешняя теплоотдача не участвует
      expect(r.alpha_vnesh_applied ?? null).toBeNull();
      expect(value(r, 'external_resistance')).toBeGreaterThan(0);
    },
  },
  {
    // λ трубы задаётся строго одним источником: справочный материал ИЛИ число
    name: 'нестандартный материал трубы: λ вручную',
    params: { pipe_material: null, pipe_lambda: 45 },
    check: (r) => {
      expectCalculated(r, 'total_heat_loss_design');
      expect(value(r, 'wall_resistance')).toBeGreaterThan(0);
    },
  },
  {
    name: 'летний режим tm: другая расчётная λ изоляции',
    params: { insulation_temperature_basis: 'outdoor_summer', ambient_temperature: 10 },
    check: (r) => {
      expectCalculated(r, 'total_heat_loss_design');
      expect(value(r, 'insulation_resistance')).toBeGreaterThan(0);
    },
  },
  {
    name: 'два слоя изоляции',
    params: { insulation_layers: [REFERENCE_LAYER, { thickness: 0.04, material: 'mineral_wool_boards_120' }] },
    check: (r) => {
      expectCalculated(r, 'total_heat_loss_design');
      expect(value(r, 'insulation_resistance')).toBeGreaterThan(0);
    },
  },
  {
    name: 'три слоя, внешний — нестандартный материал',
    params: { insulation_layers: [REFERENCE_LAYER, { thickness: 0.04, material: 'mineral_wool_boards_120' }, CUSTOM_LAYER] },
    check: (r) => {
      expectCalculated(r, 'total_heat_loss_design');
      expect(value(r, 'insulation_resistance')).toBeGreaterThan(0);
    },
  },
  {
    name: 'локальные элементы увеличивают расчётную длину',
    params: { pipe_length: 50, num_local_elements: 4, local_element_equiv_length: 1.5 },
    check: (r) => {
      expectCalculated(r, 'total_heat_loss_design');
      expect(value(r, 'local_elements_count_applied')).toBe(4);
      expect(value(r, 'local_element_equiv_length_applied')).toBe(1.5);
      // L_эф = L + n·L_экв = 50 + 4·1,5
      expect(value(r, 'effective_length')).toBeCloseTo(56, 3);
      expect(value(r, 'additional_equivalent_length')).toBeCloseTo(6, 3);
    },
  },
  {
    name: 'коэффициент запаса: проектные теплопотери выше базовых',
    params: { safety_factor: 1.3 },
    check: (r) => {
      expectCalculated(r, 'total_heat_loss_design');
      expect(value(r, 'safety_factor_applied')).toBeCloseTo(1.3, 3);
      expect(value(r, 'total_heat_loss_design'))
        .toBeCloseTo(value(r, 'total_heat_loss_base') * 1.3, 3);
    },
  },
];

const TANK_VARIANTS: Variant[] = [
  {
    name: 'цилиндрический на открытом воздухе',
    params: {},
    check: (r) => {
      expectCalculated(r, 'total_heat_loss_design');
      expect(value(r, 'surface_area_bare')).toBeGreaterThan(0);
      expect(value(r, 'alpha_vnesh_applied')).toBeGreaterThan(0);
    },
  },
  {
    name: 'прямоугольный: площадь по длине, ширине и высоте',
    params: { shape: 'rectangular', diameter: null, length: 3, width: 2, height: 2.5 },
    check: (r) => {
      expectCalculated(r, 'total_heat_loss_design');
      expect(value(r, 'surface_area_bare')).toBeGreaterThan(0);
    },
  },
  {
    name: 'подземный: поверхность делится на воздушную и грунтовую',
    params: {
      placement: 'underground',
      insulation_temperature_basis: 'channel',
      tank_buried_height: 1.5,
      height: 3,
      ground_temperature: 5,
      ground_conductivity: 1.2,
      ambient_temperature: -20,
      wind_speed: 3,
    },
    check: (r) => {
      expectCalculated(r, 'total_heat_loss_design');
      expect(value(r, 'air_surface_area')).toBeGreaterThan(0);
      expect(value(r, 'ground_surface_area')).toBeGreaterThan(0);
      expect(value(r, 'heat_loss_ground_base')).toBeGreaterThan(0);
      expect(value(r, 'ground_conductivity_applied')).toBe(1.2);
    },
  },
  {
    name: 'со стенкой: добавляется сопротивление стенки',
    params: { wall_thickness: 0.008, wall_lambda: 45 },
    check: (r) => {
      expectCalculated(r, 'total_heat_loss_design');
      expect(value(r, 'wall_resistance_areal_bare')).toBeGreaterThan(0);
    },
  },
  {
    name: 'в помещении, α по размещению',
    params: {
      placement: 'indoor',
      wind_speed: null,
      insulation_temperature_basis: 'indoor',
      ambient_temperature: 20,
      process_temperature: 90,
    },
    check: (r) => {
      expectCalculated(r, 'total_heat_loss_design');
      expect(r.wind_speed_applied ?? null).toBeNull();
    },
  },
  {
    name: 'дополнительные потери q_additional входят в итог',
    params: { q_additional: 500 },
    check: (r) => {
      expectCalculated(r, 'total_heat_loss_design');
      expect(value(r, 'q_additional_applied')).toBe(500);
      expect(value(r, 'total_heat_loss_design'))
        .toBeCloseTo(value(r, 'total_heat_loss_base') * value(r, 'safety_factor_applied') + 500, 2);
    },
  },
  {
    name: 'три слоя, внешний — нестандартный материал',
    params: { insulation_layers: [{ thickness: 0.08, material: 'mineral_wool_boards_120' }, { thickness: 0.05, material: 'mineral_wool_boards_120' }, CUSTOM_LAYER] },
    check: (r) => {
      expectCalculated(r, 'total_heat_loss_design');
      expect(value(r, 'insulation_resistance_areal_bare')).toBeGreaterThan(0);
    },
  },
];

async function runVariants(
  page: Page,
  variants: Variant[],
  create: typeof createCalculatedPipe,
  prefix: string,
) {
  const created: Record<string, string> = {};
  for (const [index, variant] of variants.entries()) {
    const name = `${prefix} ${index + 1}. ${variant.name}`;
    const object = await create(page, name, variant.params);
    created[object.id] = variant.name;

    expect(object.is_valid, `${variant.name}: объект должен быть валиден`).toBe(true);
    expect(object.results, `${variant.name}: должны быть результаты`).toBeTruthy();
    variant.check(object.results as HeatResults);
  }
  return created;
}

test.describe('теплопотери — значимые варианты расчёта', () => {
  test('трубы: размещение, стенка, слои, локальные элементы, запас', async ({ page }) => {
    await loginAsGuest(page);
    const created = await runVariants(page, PIPE_VARIANTS, createCalculatedPipe, 'Труба');

    // сквозная проверка: все варианты сохранены и остались рассчитанными
    const objects = await fetchProjectObjects(page);
    const pipes = objects.filter((item) => item.object_type === 'pipe');
    expect(pipes).toHaveLength(PIPE_VARIANTS.length);
    for (const pipe of pipes) {
      expect(pipe.is_valid, `${created[pipe.id]}: объект не должен стать невалидным`).toBe(true);
      expect(pipe.results).toBeTruthy();
    }

    await page.reload({ waitUntil: 'networkidle' });
    await expect(
      page.getByRole('button', { name: new RegExp(`Трубопровод:\\s*${PIPE_VARIANTS.length}`) }),
    ).toBeVisible();
  });

  test('резервуары: форма, размещение, стенка, слои, доп. потери', async ({ page }) => {
    await loginAsGuest(page);
    const created = await runVariants(page, TANK_VARIANTS, createCalculatedTank, 'Резервуар');

    const objects = await fetchProjectObjects(page);
    const tanks = objects.filter((item) => item.object_type === 'tank');
    expect(tanks).toHaveLength(TANK_VARIANTS.length);
    for (const tank of tanks) {
      expect(tank.is_valid, `${created[tank.id]}: объект не должен стать невалидным`).toBe(true);
      expect(tank.results).toBeTruthy();
    }

    await page.reload({ waitUntil: 'networkidle' });
    await expect(
      page.getByRole('button', { name: new RegExp(`Резервуар:\\s*${TANK_VARIANTS.length}`) }),
    ).toBeVisible();
  });
});
