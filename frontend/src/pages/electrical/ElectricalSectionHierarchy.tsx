/**
 * @module electrical/section-hierarchy
 * @owner electrical
 * @depends none
 * @does-not heat
 *
 * Expandable row content: heating sections after electrical calc.
 */
import type { ElectricalCalcSummary } from '@/types/calculation';

export type ElectricalSectionHierarchyProps = {
  calc: ElectricalCalcSummary | undefined;
};

export function ElectricalSectionHierarchy({ calc }: ElectricalSectionHierarchyProps) {
  const results = (calc?.results ?? {}) as Record<string, unknown>;
  const sections = Array.isArray(results.sections)
    ? (results.sections as Array<Record<string, unknown>>)
    : [];
  const sectionCount = Number(results.section_count ?? results.num_sections ?? 0);

  if (sections.length === 0 && !(sectionCount > 0)) {
    return (
      <div className="section-hierarchy-shell" data-testid="section-hierarchy-shell">
        <strong>Нагревательные секции</strong>
        <div>
          Секции появятся после успешного электрорасчёта с каталогом
          секционирования (Lмакс / Iдоп / Iст.уд).
        </div>
      </div>
    );
  }

  const rows = sections.length
    ? sections
    : Array.from({ length: sectionCount }, (_, i) => ({
        index: i + 1,
        length_m: results.section_length_m,
        power_w: results.section_power_w,
        working_current_a:
          Number(results.section_working_current_a ?? 0) / sectionCount,
        start_current_a:
          Number(results.section_start_current_a ?? 0) / sectionCount,
      }));

  return (
    <div className="section-hierarchy-shell" data-testid="section-hierarchy-shell">
      <strong>
        Нагревательные секции ·
        {' '}
        {sectionCount || sections.length}
      </strong>
      <table style={{ width: '100%', marginTop: 6, fontSize: 12 }}>
        <thead>
          <tr>
            <th style={{ textAlign: 'left' }}>№</th>
            <th style={{ textAlign: 'right' }}>L, м</th>
            <th style={{ textAlign: 'right' }}>P, Вт</th>
            <th style={{ textAlign: 'right' }}>Iраб, А</th>
            <th style={{ textAlign: 'right' }}>Iст, А</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((sec, i) => (
            <tr key={String(sec.index ?? i)}>
              <td>{String(sec.index ?? i + 1)}</td>
              <td style={{ textAlign: 'right' }}>{String(sec.length_m ?? '—')}</td>
              <td style={{ textAlign: 'right' }}>{String(sec.power_w ?? '—')}</td>
              <td style={{ textAlign: 'right' }}>
                {String(sec.working_current_a ?? '—')}
              </td>
              <td style={{ textAlign: 'right' }}>
                {String(sec.start_current_a ?? '—')}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
