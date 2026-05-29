import { describe, expect, it, beforeEach } from 'vitest';
import {
  HEATCALC_GUEST_TABLE_VIEW_STORAGE_KEY,
  HEATCALC_REGISTERED_TABLE_VIEW_CACHE_KEY,
  getDefaultTableViewSettings,
  normalizeTableViewSettings,
  readGuestTableViewSettings,
  readRegisteredTableViewCache,
  resolveTableFontSize,
  writeGuestTableViewSettings,
  writeRegisteredTableViewCache,
} from '@/utils/heatCalcTableViewSettings';

describe('heatCalcTableViewSettings', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns JSON default without writing it to localStorage', () => {
    expect(readGuestTableViewSettings()).toEqual({
      version: 2,
      fontSize: 'standard',
      tableLabelFormat: 'short',
      settingsLabelFormat: 'full',
      formPlacement: 'top',
      sideFormWidthPct: 34,
      formSectionWeights: [1.655, 1.35, 1.2],
    });
    expect(localStorage.getItem(HEATCALC_GUEST_TABLE_VIEW_STORAGE_KEY)).toBeNull();
  });

  it('normalizes unknown or CSS-rich payloads to token-only settings', () => {
    expect(normalizeTableViewSettings({
      version: 1,
      fontSize: 'large',
      fontSizePx: 22,
      lineHeight: 3,
      tableLabelFormat: 'compact',
      settingsLabelFormat: 'short',
      inlineEditingEnabled: true,
      formPlacement: 'left',
      sideFormWidthPct: 42.25,
      formSectionWeights: [1.2, 1.4, 1.1],
    })).toEqual({
      version: 2,
      fontSize: 'large',
      tableLabelFormat: 'compact',
      settingsLabelFormat: 'short',
      formPlacement: 'left',
      sideFormWidthPct: 42.3,
      formSectionWeights: [1.2, 1.4, 1.1],
    });
    expect(normalizeTableViewSettings({
      version: 1,
      formSectionWeights: [1.2, 1.4, 1.1, 0.6],
    })).toMatchObject({
      formSectionWeights: [1.8, 1.4, 1.1],
    });
    expect(normalizeTableViewSettings({ version: 1, fontSize: 'huge' })).toEqual(
      getDefaultTableViewSettings(),
    );
    expect(normalizeTableViewSettings({
      version: 1,
      sideFormWidthPct: 80,
    })).toMatchObject({ sideFormWidthPct: 62 });
  });

  it('writes guest settings only after explicit user change', () => {
    writeGuestTableViewSettings({
      version: 2,
      fontSize: 'compact',
      tableLabelFormat: 'full',
      settingsLabelFormat: 'compact',
      formPlacement: 'bottom',
      sideFormWidthPct: 44,
      formSectionWeights: [1, 1.5, 1.1],
    });

    expect(JSON.parse(localStorage.getItem(HEATCALC_GUEST_TABLE_VIEW_STORAGE_KEY) ?? '{}')).toEqual({
      version: 2,
      fontSize: 'compact',
      tableLabelFormat: 'full',
      settingsLabelFormat: 'compact',
      formPlacement: 'bottom',
      sideFormWidthPct: 44,
      formSectionWeights: [1, 1.5, 1.1],
    });
  });

  it('uses registered cache only for matching user id', () => {
    writeRegisteredTableViewCache('user-1', {
      version: 2,
      fontSize: 'comfortable',
      tableLabelFormat: 'compact',
      settingsLabelFormat: 'short',
      formPlacement: 'right',
      sideFormWidthPct: 52,
      formSectionWeights: [1, 1.4, 1.2],
    });

    expect(readRegisteredTableViewCache('user-1')).toEqual({
      version: 2,
      fontSize: 'comfortable',
      tableLabelFormat: 'compact',
      settingsLabelFormat: 'short',
      formPlacement: 'right',
      sideFormWidthPct: 52,
      formSectionWeights: [1, 1.4, 1.2],
    });
    expect(readRegisteredTableViewCache('user-2')).toBeNull();
    expect(JSON.parse(localStorage.getItem(HEATCALC_REGISTERED_TABLE_VIEW_CACHE_KEY) ?? '{}')).toHaveProperty(
      'cachedAt',
    );
  });

  it('resolves visual tokens from default JSON', () => {
    expect(resolveTableFontSize({
      version: 2,
      fontSize: 'large',
      tableLabelFormat: 'short',
      settingsLabelFormat: 'full',
      formPlacement: 'top',
      sideFormWidthPct: 34,
      formSectionWeights: [1.655, 1.35, 1.2],
    })).toMatchObject({
      key: 'large',
      label: 'Крупный',
      fontSizePx: 14,
    });
  });
});
