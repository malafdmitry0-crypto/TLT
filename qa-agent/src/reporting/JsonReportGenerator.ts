import fs from 'node:fs';
import path from 'node:path';

import type { Metadata } from '../shared/types';
import type { Report, ReportGenerator, ReportResult } from './types';

export class JsonReportGenerator implements ReportGenerator {
  constructor(private readonly outputPath?: string) {}

  generate(results: ReportResult[], metadata: Metadata = {}): Report {
    const report: Report = {
      summary: {
        total: results.length,
        passed: results.filter((result) => result.finalVerdict === 'pass').length,
        failed: results.filter((result) => result.finalVerdict === 'fail').length,
        needsReview: results.filter((result) => result.finalVerdict === 'needs_review').length,
      },
      results,
      groupedFailures: results
        .filter((result) => result.finalVerdict !== 'pass')
        .reduce<Record<string, ReportResult[]>>((groups, result) => {
          const key = result.deterministic.reason || result.finalVerdict;
          groups[key] = [...(groups[key] ?? []), result];
          return groups;
        }, {}),
      metadata: {
        generatedAt: new Date().toISOString(),
        ...metadata,
      },
    };

    if (this.outputPath) {
      fs.mkdirSync(path.dirname(this.outputPath), { recursive: true });
      fs.writeFileSync(this.outputPath, `${JSON.stringify(report, null, 2)}\n`);
    }

    return report;
  }
}
