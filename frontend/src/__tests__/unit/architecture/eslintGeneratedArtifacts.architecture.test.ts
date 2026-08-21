// @vitest-environment node
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND_ROOT = path.resolve(HERE, '../../../..');

describe('ESLint generated-artifact boundary', () => {
  it('ignores the Vite dependency optimizer cache without hiding source files', async () => {
    const eslint = new ESLint({ cwd: FRONTEND_ROOT });

    await expect(
      eslint.isPathIgnored(path.join(FRONTEND_ROOT, '.vite/deps/generated-vendor.js')),
    ).resolves.toBe(true);
    await expect(
      eslint.isPathIgnored(path.join(FRONTEND_ROOT, '.vite/deps/generated-vendor.js.map')),
    ).resolves.toBe(true);
    await expect(
      eslint.isPathIgnored(path.join(FRONTEND_ROOT, 'src/main.tsx')),
    ).resolves.toBe(false);
  });
});
