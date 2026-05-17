import fs from 'node:fs';
import path from 'node:path';

import type { ReportResult } from '../reporting/types';

export type ContractDriftFinding = {
  id: string;
  severity: 'low' | 'medium' | 'high';
  title: string;
  evidence: string;
  recommendation: string;
};

export type ContractDriftSummary = {
  checkedFiles: string[];
  jsonFieldKeys: string[];
  findings: ContractDriftFinding[];
};

function readIfExists(filePath: string): string {
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';
}

function keysFromJson(filePath: string): string[] {
  if (!fs.existsSync(filePath)) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as unknown;
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      const source = parsed as Record<string, unknown>;
      if (typeof source.fields === 'object' && source.fields !== null && !Array.isArray(source.fields)) {
        return Object.keys(source.fields as Record<string, unknown>);
      }
      return Object.keys(source);
    }
  } catch {
    return [];
  }
  return [];
}

export function auditContractDrift(repoRoot: string): ContractDriftSummary {
  const heatFieldsPath = path.join(repoRoot, 'frontend/src/config/heatcalc-fields.default.json');
  const electricalFieldsPath = path.join(repoRoot, 'frontend/src/config/electrical-fields.default.json');
  const frontendTypesPath = path.join(repoRoot, 'frontend/src/types/calculation.ts');
  const backendSchemasPath = path.join(repoRoot, 'backend/app/schemas/calculation.py');
  const importServicePath = path.join(repoRoot, 'backend/app/services/excel_import_service.py');
  const exportServicePath = path.join(repoRoot, 'backend/app/services/project_io_service.py');
  const checkedFiles = [
    heatFieldsPath,
    electricalFieldsPath,
    frontendTypesPath,
    backendSchemasPath,
    importServicePath,
    exportServicePath,
  ].filter(fs.existsSync);
  const frontendTypes = readIfExists(frontendTypesPath);
  const backendSchemas = readIfExists(backendSchemasPath);
  const importExport = `${readIfExists(importServicePath)}\n${readIfExists(exportServicePath)}`;
  const jsonFieldKeys = [...new Set([...keysFromJson(heatFieldsPath), ...keysFromJson(electricalFieldsPath)])].sort();
  const findings: ContractDriftFinding[] = [];

  for (const key of jsonFieldKeys) {
    const snakeOrCamel = key.includes('_')
      ? [key, key.replace(/_([a-z])/g, (_, char: string) => char.toUpperCase())]
      : [key, key.replace(/[A-Z]/g, (char) => `_${char.toLowerCase()}`)];
    const inFrontendTypes = snakeOrCamel.some((candidate) => frontendTypes.includes(candidate));
    const inBackendSchemas = snakeOrCamel.some((candidate) => backendSchemas.includes(candidate));
    if (!inFrontendTypes && !inBackendSchemas) {
      findings.push({
        id: `contract-field-unreferenced-${key}`,
        severity: 'medium',
        title: 'Table field key is not referenced by backend schemas or frontend types',
        evidence: key,
        recommendation: 'Verify this field is intentionally display-only or add it to typed contracts/import-export mapping.',
      });
    }
    if (!snakeOrCamel.some((candidate) => importExport.includes(candidate)) && /temperature|heat|loss|cable|diameter|length|height/.test(key)) {
      findings.push({
        id: `contract-import-export-gap-${key}`,
        severity: 'low',
        title: 'Important field may be missing from import/export mapping',
        evidence: key,
        recommendation: 'Check Excel/CSV import-export roundtrip for this field.',
      });
    }
  }

  return {
    checkedFiles: checkedFiles.map((file) => path.relative(repoRoot, file)),
    jsonFieldKeys,
    findings: findings.slice(0, 100),
  };
}

export function contractDriftToReportResult(summary: ContractDriftSummary): ReportResult {
  const needsReview = summary.findings.length > 0;
  return {
    testCase: {
      id: 'audit-contract-drift',
      requirementId: 'audit_backend_frontend_import_export_contracts',
      input: { checkedFiles: summary.checkedFiles },
      kind: 'property',
      metadata: {},
    },
    expected: { value: 'No obvious field drift across UI/backend/import-export contracts', warnings: [], metadata: {} },
    actual: { value: summary, status: needsReview ? 'error' : 'success', warnings: [], metadata: {} },
    deterministic: {
      verdict: needsReview ? 'needs_review' : 'pass',
      severity: summary.findings.some((finding) => finding.severity === 'high') ? 'high' : needsReview ? 'medium' : 'low',
      reason: needsReview ? `${summary.findings.length} contract drift finding(s)` : 'No contract drift findings',
      differences: summary.findings.map((finding) => ({
        path: finding.id,
        expected: 'field contract is aligned',
        actual: finding.title,
        reason: finding.evidence,
      })),
      numericDelta: summary.findings.length,
      toleranceUsed: { absoluteTolerance: 0, relativeTolerance: 0 },
    },
    finalVerdict: needsReview ? 'needs_review' : 'pass',
  };
}
