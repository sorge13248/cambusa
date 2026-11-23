import { describe, expect, it } from 'vitest';
import { resolve } from 'node:path';
import { getProjectRootDir, resolveDatabasePath, resolveUploadsDir } from './load-env.js';

describe('Environment and Path Resolution', () => {
  it('correctly discovers project root directory', () => {
    const root = getProjectRootDir();
    expect(root).toBeDefined();
    expect(root).not.toMatch(/\/backend$/);
  });

  it('resolves database path to project root by default', () => {
    const dbPath = resolveDatabasePath();
    const root = getProjectRootDir();
    expect(dbPath).toBe(resolve(root, 'cambusa.sqlite'));
  });

  it('resolves relative database path to project root even if prefixed with relative traversal', () => {
    const root = getProjectRootDir();
    expect(resolveDatabasePath('cambusa.sqlite')).toBe(resolve(root, 'cambusa.sqlite'));
    expect(resolveDatabasePath('../cambusa.sqlite')).toBe(resolve(root, 'cambusa.sqlite'));
    expect(resolveDatabasePath('../../cambusa.sqlite')).toBe(resolve(root, 'cambusa.sqlite'));
  });

  it('preserves absolute database paths', () => {
    const absPath = '/data/custom-cambusa.sqlite';
    expect(resolveDatabasePath(absPath)).toBe(absPath);
  });

  it('preserves in-memory database paths', () => {
    expect(resolveDatabasePath(':memory:')).toBe(':memory:');
    expect(resolveDatabasePath('file::memory:')).toBe('file::memory:');
  });

  it('resolves uploads directory to project root by default', () => {
    const root = getProjectRootDir();
    const uploads = resolveUploadsDir();
    expect(uploads).toBe(resolve(root, 'uploads'));
  });

  it('preserves absolute uploads directory', () => {
    const absDir = '/data/custom-uploads';
    expect(resolveUploadsDir(absDir)).toBe(absDir);
  });
});
