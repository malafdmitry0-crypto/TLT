import { test } from '@playwright/test';

import {
  createCalculatedPipe,
  currentGuestContext,
  loginAsGuest,
} from './helpers/workspace';
import {
  expectAutoCandidateParamVariants,
} from './helpers/electrical-candidate-selection';

test.describe('electrical candidate selection — param change variants', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('electrical.tableEngine', 'table');
    });
  });

  test('изменение параметров ТЛТ-авторасчёта создаёт отдельный кандидат', async ({ page }) => {
    await loginAsGuest(page);
    const { projectId, sessionId } = await currentGuestContext(page);
    const pipeName = `E2E TLT controls ${Date.now()}`;
    const pipe = await createCalculatedPipe(page, pipeName, {
      outer_diameter: 0.108,
      pipe_length: 12,
      insulation_layers: [
        { thickness: 0.03, material: 'mineral_wool_boards_120' },
      ],
      ambient_temperature: 1,
      process_temperature: 65,
    });

    await expectAutoCandidateParamVariants(
      page,
      projectId,
      sessionId,
      pipe.id,
      'self_regulating',
      { supply_voltage: 220, winding_coefficient: 1, number_of_threads: 1 },
      [
        { number_of_threads: 2 },
        { winding_coefficient: 1.05 },
        { winding_pitch: 500 },
      ],
    );
  });

  test('изменение параметров резистивного авторасчёта создаёт отдельный кандидат', async ({ page }) => {
    await loginAsGuest(page);
    const { projectId, sessionId } = await currentGuestContext(page);
    const pipeName = `E2E resistive controls ${Date.now()}`;
    const pipe = await createCalculatedPipe(page, pipeName, {
      outer_diameter: 0.108,
      pipe_length: 12,
      insulation_layers: [
        { thickness: 0.03, material: 'mineral_wool_boards_120' },
      ],
      ambient_temperature: 1,
      process_temperature: 65,
    });

    await expectAutoCandidateParamVariants(
      page,
      projectId,
      sessionId,
      pipe.id,
      'single_core',
      { supply_voltage: 220, connection_type: 'line_1ph', winding_coefficient: 1 },
      [
        { connection_type: 'star_3ph' },
        { supply_voltage: 230 },
        { winding_coefficient: 1.05 },
      ],
    );
  });

  test('изменение параметров ТТ Р3-авторасчёта создаёт отдельный кандидат', async ({ page }) => {
    await loginAsGuest(page);
    const { projectId, sessionId } = await currentGuestContext(page);
    const pipeName = `E2E R3 controls ${Date.now()}`;
    const pipe = await createCalculatedPipe(page, pipeName, {
      outer_diameter: 0.108,
      pipe_length: 12,
      insulation_layers: [
        { thickness: 0.03, material: 'mineral_wool_boards_120' },
      ],
      ambient_temperature: 1,
      process_temperature: 65,
    });

    await expectAutoCandidateParamVariants(
      page,
      projectId,
      sessionId,
      pipe.id,
      'three_core',
      { supply_voltage: 220, connection_type: 'line_1ph', winding_coefficient: 1 },
      [
        { connection_type: 'star_3x3' },
        { supply_voltage: 230 },
        { winding_coefficient: 1.05 },
      ],
    );
  });

});
