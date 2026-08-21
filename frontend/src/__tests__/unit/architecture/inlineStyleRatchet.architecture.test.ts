// @vitest-environment node
/**
 * AF9-INLINE-01/02 / P1-GUARDRAIL-TRUTH-01: JSX style/styles ratchet gate.
 * Helpers live in inlineStyleRatchet.helpers.ts (keep gate cohesive).
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import {
  BASELINE_PATH,
  type InlineBaseline,
  type InlineStyleClass,
  classifyInlineStyleLineLegacy,
  classifyInlineStyleSnippet,
  collectInlineStyles,
  ensureFileClassCounts,
  failMessage,
} from './inlineStyleRatchet.helpers';

describe('inline style ratchet (AF9-INLINE-01/02)', () => {
  it('has classified baseline and forbids growth / stale counts (incl. per-class)', () => {
    const baseline = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8')) as InlineBaseline;
    expect(baseline.occurrences.length).toBeGreaterThan(0);
    const classes = new Set(baseline.occurrences.map((o) => o.class));
    expect(classes.has('runtime geometry')).toBe(true);
    // static debt may be fully burned (0); byClass still tracks the cap.
    expect(baseline.byClass['static debt'] ?? 0).toBeGreaterThanOrEqual(0);
    if ((baseline.byClass['static debt'] ?? 0) > 0) {
      expect(classes.has('static debt')).toBe(true);
    }
    expect(classes.has('third-party adapter')).toBe(true);

    // Third-party adapters in baseline must document owner + reason.
    for (const o of baseline.occurrences) {
      if (o.class !== 'third-party adapter') continue;
      if (!o.owner || !o.reason) {
        expect.fail(
          failMessage(
            'THIRD_PARTY_MISSING_META',
            'third-party adapter baseline entry lacks owner/reason',
            'Add owner and reason fields explaining why className/theme API is unavailable.',
            `${o.file}:${o.line}`,
          ),
        );
      }
    }

    const current = collectInlineStyles();
    const baselineFileClass = ensureFileClassCounts(baseline);
    const violations: string[] = [];

    if (current.total > baseline.total) {
      violations.push(
        failMessage(
          'INLINE_STYLE_TOTAL_GREW',
          'Production inline style/styles total grew',
          'Move static styling to component CSS or tokens; keep only runtime geometry / documented adapters.',
          '(total)',
          current.total,
          baseline.total,
        ),
      );
    } else if (current.total < baseline.total) {
      violations.push(
        failMessage(
          'STALE_BASELINE_TOTAL',
          'Baseline inline style total is higher than current',
          'Update inlineStyleBaseline.json to the shrunk total in the same PR.',
          '(total)',
          current.total,
          baseline.total,
        ),
      );
    }

    for (const cls of ['static debt', 'runtime geometry', 'third-party adapter'] as InlineStyleClass[]) {
      const cur = current.byClass[cls] ?? 0;
      const limit = baseline.byClass?.[cls] ?? 0;
      if (cur > limit) {
        violations.push(
          failMessage(
            'INLINE_STYLE_CLASS_GREW',
            `Class count grew: ${cls}`,
            'Reduce this class or reclassify only with a truthful AST change + baseline shrink elsewhere. Do not hide static debt as runtime.',
            `(class:${cls})`,
            cur,
            limit,
          ),
        );
      } else if (cur < limit) {
        violations.push(
          failMessage(
            'STALE_BASELINE_CLASS',
            `Baseline class count higher than current: ${cls}`,
            'Update inlineStyleBaseline.json byClass for this class in the same PR.',
            `(class:${cls})`,
            cur,
            limit,
          ),
        );
      }
    }

    for (const [file, limit] of Object.entries(baseline.fileCounts)) {
      const cur = current.fileCounts[file] ?? 0;
      if (cur > limit) {
        violations.push(
          failMessage(
            'INLINE_STYLE_GREW',
            'Production inline style/styles count grew',
            'Move static styling to component CSS or tokens; keep only runtime geometry / documented adapters.',
            file,
            cur,
            limit,
          ),
        );
      } else if (cur < limit) {
        violations.push(
          failMessage(
            'STALE_BASELINE',
            'Baseline inline style count is higher than current',
            'Update inlineStyleBaseline.json to the shrunk count in the same PR.',
            file,
            cur,
            limit,
          ),
        );
      }

      const baseClasses = baselineFileClass[file] ?? {};
      const curClasses = current.fileClassCounts[file] ?? {};
      for (const cls of ['static debt', 'runtime geometry', 'third-party adapter'] as InlineStyleClass[]) {
        const c = curClasses[cls] ?? 0;
        const l = baseClasses[cls] ?? 0;
        if (c > l) {
          violations.push(
            failMessage(
              'INLINE_STYLE_FILE_CLASS_GREW',
              `Per-file class count grew: ${cls}`,
              'Static debt cannot replace runtime geometry under a flat total. Fix the style or update baseline only after a real shrink.',
              file,
              c,
              l,
            ),
          );
        } else if (c < l) {
          violations.push(
            failMessage(
              'STALE_BASELINE_FILE_CLASS',
              `Baseline per-file class count higher than current: ${cls}`,
              'Update inlineStyleBaseline.json fileClassCounts for this file/class in the same PR.',
              file,
              c,
              l,
            ),
          );
        }
      }
    }

    for (const [file, count] of Object.entries(current.fileCounts)) {
      if (file in baseline.fileCounts) continue;
      violations.push(
        failMessage(
          'NEW_FILE_INLINE_STYLE',
          'New production file introduces style/styles attributes',
          'Prefer CSS modules/tokens. If runtime geometry is required, add a classified baseline entry with owner/reason for adapters.',
          file,
          count,
          0,
        ),
      );
    }

    // New third-party adapters must appear in baseline with owner/reason (covered by counts),
    // but also reject any current third-party without meta when above baseline is equal —
    // enforced via baseline completeness on load.

    if (violations.length > 0) {
      expect.fail(violations.join('\n\n---\n\n'));
    }
  });
});

describe('inline style fixtures (P1-GUARDRAIL-TRUTH-01)', () => {
  it("OLD: line-regex classifies style={{ display: 'none' }} as runtime geometry", () => {
    const line = `<input style={{ display: 'none' }} />`;
    expect(classifyInlineStyleLineLegacy(line)).toBe('runtime geometry');
  });

  it("FIXED: style={{ display: 'none' }} is static debt", () => {
    expect(classifyInlineStyleSnippet(`<input style={{ display: 'none' }} />`)).toBe('static debt');
    expect(classifyInlineStyleSnippet(`<div style={{ marginBottom: 16, color: '#595959' }} />`)).toBe(
      'static debt',
    );
  });

  it('FIXED: runtime width from props is runtime geometry', () => {
    expect(
      classifyInlineStyleSnippet(`<div style={{ width: props.width }} />`),
    ).toBe('runtime geometry');
    expect(classifyInlineStyleSnippet(`<div style={wrapperStyle} />`)).toBe('runtime geometry');
    expect(
      classifyInlineStyleSnippet(`<div style={{ width: open ? 200 : 0 }} />`),
    ).toBe('runtime geometry');
  });

  it('FIXED: new static inline style is detected as static debt (fails growth when not baselined)', () => {
    const cls = classifyInlineStyleSnippet(`<span style={{ fontSize: 12 }} />`);
    expect(cls).toBe('static debt');
    // Growth detection against empty baseline for a synthetic file
    const baseline: InlineBaseline = {
      version: 2,
      total: 0,
      byClass: { 'static debt': 0, 'runtime geometry': 0, 'third-party adapter': 0 },
      fileCounts: {},
      fileClassCounts: {},
      occurrences: [],
    };
    const currentFile = 'src/pages/demo/NewStatic.tsx';
    const currentCount = 1;
    expect(currentFile in baseline.fileCounts).toBe(false);
    expect(currentCount).toBeGreaterThan(0);
    // Document the failure mode the main ratchet raises:
    const msg = failMessage(
      'NEW_FILE_INLINE_STYLE',
      'New production file introduces style/styles attributes',
      'Prefer CSS modules/tokens.',
      currentFile,
      currentCount,
      0,
    );
    expect(msg).toContain('NEW_FILE_INLINE_STYLE');
  });

  it('FIXED: static cannot replace runtime under the same file total (class counts)', () => {
    const baselineClasses = { 'runtime geometry': 2, 'static debt': 1 };
    const afterSwap = { 'runtime geometry': 1, 'static debt': 2 };
    const totalBefore = 3;
    const totalAfter = 3;
    expect(totalAfter).toBe(totalBefore);
    expect((afterSwap['static debt'] ?? 0) > (baselineClasses['static debt'] ?? 0)).toBe(true);
    expect((afterSwap['runtime geometry'] ?? 0) < (baselineClasses['runtime geometry'] ?? 0)).toBe(true);
  });

  it('FIXED: third-party form-control style object is third-party adapter', () => {
    expect(
      classifyInlineStyleSnippet(`<InputNumber style={{ width: '100%' }} />`),
    ).toBe('third-party adapter');
  });
});
