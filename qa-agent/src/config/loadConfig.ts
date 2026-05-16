import fs from 'node:fs';

import type { QaAgentConfig } from './types';

export function loadConfig(path: string): QaAgentConfig {
  return JSON.parse(fs.readFileSync(path, 'utf8')) as QaAgentConfig;
}
