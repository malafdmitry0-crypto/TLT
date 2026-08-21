import fs from 'node:fs';
import path from 'node:path';

function isInsideRoot(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

export function resolveUnderAllowedRoot(allowedRoot: string, candidate: string, label = 'path'): string {
  const root = path.resolve(allowedRoot);
  const resolved = path.isAbsolute(candidate) ? path.resolve(candidate) : path.resolve(root, candidate);
  if (!isInsideRoot(root, resolved)) {
    throw new Error(`${label} must stay under allowed root: ${root}`);
  }
  return resolved;
}

export function resolveUnderRepoRoot(repoRoot: string, candidate: string, label = 'path'): string {
  return resolveUnderAllowedRoot(repoRoot, candidate, label);
}

export function readUtf8FileUnderRoot(allowedRoot: string, candidate: string, label = 'path'): string {
  const resolved = resolveUnderAllowedRoot(allowedRoot, candidate, label);
  return fs.readFileSync(resolved, 'utf8');
}

export function readBinaryFileUnderRoot(allowedRoot: string, candidate: string, label = 'path'): Buffer {
  const resolved = resolveUnderAllowedRoot(allowedRoot, candidate, label);
  return fs.readFileSync(resolved);
}

export function writeUtf8FileUnderRoot(
  allowedRoot: string,
  candidate: string,
  content: string,
  label = 'path',
): string {
  const resolved = resolveUnderAllowedRoot(allowedRoot, candidate, label);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  fs.writeFileSync(resolved, content);
  return resolved;
}
