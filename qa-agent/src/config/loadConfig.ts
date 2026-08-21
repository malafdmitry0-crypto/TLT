import fs from 'node:fs';

import { resolveUnderAllowedRoot } from '../shared/paths';
import type { QaAgentConfig } from './types';

export function loadConfig(configPath: string, allowedRoot = process.cwd()): QaAgentConfig {
  const resolved = resolveUnderAllowedRoot(allowedRoot, configPath, 'QA agent config path');
  return JSON.parse(fs.readFileSync(resolved, 'utf8')) as QaAgentConfig;
}
