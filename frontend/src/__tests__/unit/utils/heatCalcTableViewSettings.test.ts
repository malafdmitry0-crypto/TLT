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
      version: 1,
      fontSize: 'standard',
      inlineEditingEnabled: false,
      formPlacement: 'top',
    });
    expect(localStorage.getItem(HEATCALC_GUEST_TABLE_VIEW_STORAGE_KEY)).toBeNull();
  });

  it('normalizes unknown or CSS-rich payloads to token-only settings', () => {
    expect(normalizeTableViewSettings({
      version: 1,
      fontSize: 'large',
      fontSizePx: 22,
      lineHeight: 3,
      inlineEditingEnabled: true,
      formPlacement: 'left',
    })).toEqual({ version: 1, fontSize: 'large', inlineEditingEnabled: true, formPlacement: 'left' });
    expect(normalizeTableViewSettings({ version: 1, fontSize: 'huge' })).toEqual(
      getDefaultTableViewSettings(),
    );
  });

  it('writes guest settings only after explicit user change', () => {
    writeGuestTableViewSettings({
      version: 1,
      fontSize: 'compact',
      inlineEditingEnabled: false,
      formPlacement: 'bottom',
    });

    expect(JSON.parse(localStorage.getItem(HEATCALC_GUEST_TABLE_VIEW_STORAGE_KEY) ?? '{}')).toEqual({
      version: 1,
      fontSize: 'compact',
      inlineEditingEnabled: false,
      formPlacement: 'bottom',
    });
  });

  it('uses registered cache only for matching user id', () => {
    writeRegisteredTableViewCache('user-1', {
      version: 1,
      fontSize: 'comfortable',
      inlineEditingEnabled: false,
      formPlacement: 'right',
    });

    expect(readRegisteredTableViewCache('user-1')).toEqual({
      version: 1,
      fontSize: 'comfortable',
      inlineEditingEnabled: false,
      formPlacement: 'right',
    });
    expect(readRegisteredTableViewCache('user-2')).toBeNull();
    expect(JSON.parse(localStorage.getItem(HEATCALC_REGISTERED_TABLE_VIEW_CACHE_KEY) ?? '{}')).toHaveProperty(
      'cachedAt',
    );
  });

  it('resolves visual tokens from default JSON', () => {
    expect(resolveTableFontSize({
      version: 1,
      fontSize: 'large',
      inlineEditingEnabled: false,
      formPlacement: 'top',
    })).toMatchObject({
      key: 'large',
      label: 'Крупный',
      fontSizePx: 14,
    });
  });
});
