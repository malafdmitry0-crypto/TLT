import { describe, expect, it } from 'vitest';

describe('elec calc split imports', () => {
  it('imports page/project/workspace', async () => {
    const page = await import('@/pages/ElecCalcPage');
    const project = await import('@/pages/electrical/ElecCalcProject');
    const ws = await import('@/pages/electrical/ElecCalcWorkspace');
    expect(page.default).toBeTypeOf('function');
    expect(project.default).toBeTypeOf('function');
    expect(ws.ElecCalcWorkspace).toBeTypeOf('function');
  });
});
