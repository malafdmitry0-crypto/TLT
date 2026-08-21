// @vitest-environment node
/* eslint-disable security/detect-non-literal-fs-filename */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const EXPECTED_UPLOAD_MB = 10;

function repoRoot(): string | null {
  const cwd = process.cwd();
  if (existsSync(resolve(cwd, 'backend/app/core/config.py'))) {
    return cwd;
  }
  const parent = resolve(cwd, '..');
  if (existsSync(resolve(parent, 'backend/app/core/config.py'))) {
    return parent;
  }
  return null;
}

function readRepoFile(path: string): string {
  const root = repoRoot();
  if (!root) {
    throw new Error('Repository root is not mounted in this test environment');
  }
  return readFileSync(resolve(root, path), 'utf-8');
}

const describeWithRepo = repoRoot() ? describe : describe.skip;

describeWithRepo('upload limits', () => {
  it('keeps backend, nginx and Caddy upload limits aligned', () => {
    const backendConfig = readRepoFile('backend/app/core/config.py');
    const nginxConfig = readRepoFile('frontend/nginx.conf');
    const caddyfile = readRepoFile('Caddyfile');

    const backendMatch = backendConfig.match(/MAX_UPLOAD_BYTES:\s*int\s*=\s*(\d+)\s*\*\s*1024\s*\*\s*1024/);
    const nginxMatch = nginxConfig.match(/client_max_body_size\s+(\d+)m;/);
    const caddyMatch = caddyfile.match(/max_size\s+(\d+)MB/);

    expect(Number(backendMatch?.[1])).toBe(EXPECTED_UPLOAD_MB);
    expect(Number(nginxMatch?.[1])).toBe(EXPECTED_UPLOAD_MB);
    expect(Number(caddyMatch?.[1])).toBe(EXPECTED_UPLOAD_MB);
  });
});
