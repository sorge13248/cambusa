import { existsSync } from 'node:fs';
import { basename, dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const currentDir = typeof import.meta.url === 'string' ? dirname(fileURLToPath(import.meta.url)) : '';

/**
 * Discovers the project root directory whether executing from:
 * - repo root (e.g. `npm run start:backend`)
 * - backend subdirectory (e.g. `cd backend && npm run start:dev`)
 * - production container (`/app` with `/app/backend`)
 */
export function getProjectRootDir(): string {
  // If cwd is 'backend' and parent has package.json
  if (basename(process.cwd()) === 'backend' && existsSync(resolve(process.cwd(), '..', 'package.json'))) {
    return resolve(process.cwd(), '..');
  }
  // If cwd is root containing package.json and backend/
  if (existsSync(resolve(process.cwd(), 'package.json')) && existsSync(resolve(process.cwd(), 'backend'))) {
    return process.cwd();
  }
  // Fallback: traverse up from currentDir
  if (currentDir) {
    let curr = resolve(currentDir);
    while (curr !== dirname(curr)) {
      if (existsSync(resolve(curr, 'package.json')) && existsSync(resolve(curr, 'backend'))) {
        return curr;
      }
      curr = dirname(curr);
    }
  }
  return process.cwd();
}

/**
 * Resolves the SQLite database file path.
 * If an absolute path is provided, it is used directly (e.g. in Docker /data/cambusa.sqlite).
 * If relative or omitted, it resolves relative to the monorepo root (e.g. /path/to/repo/cambusa.sqlite).
 */
export function resolveDatabasePath(rawPath?: string): string {
  let target = rawPath ?? process.env.DB_PATH;
  if (!target || target.trim() === '') {
    target = 'cambusa.sqlite';
  }
  if (target === ':memory:' || target.startsWith('file::memory:')) {
    return target;
  }
  if (isAbsolute(target)) {
    return target;
  }

  const projectRoot = getProjectRootDir();

  // If target already exists relative to project root
  if (existsSync(resolve(projectRoot, target))) {
    return resolve(projectRoot, target);
  }

  // If a file with the basename already exists in project root, prioritize it
  const fileBaseName = basename(target);
  if (existsSync(resolve(projectRoot, fileBaseName))) {
    return resolve(projectRoot, fileBaseName);
  }

  // If cwd has it
  if (existsSync(resolve(process.cwd(), target))) {
    return resolve(process.cwd(), target);
  }

  // If file doesn't exist yet, normalize path so that it is created in the project root
  const cleanedRelative = target.replace(/^(\.\.[/\\])+/, '');
  return resolve(projectRoot, cleanedRelative);
}

/**
 * Resolves the uploads directory path.
 * If absolute, used directly.
 * If relative or omitted, resolves relative to project root.
 */
export function resolveUploadsDir(rawDir?: string): string {
  let target = rawDir ?? process.env.UPLOADS_DIR;
  if (!target || target.trim() === '') {
    target = 'uploads';
  }
  if (isAbsolute(target)) {
    return target;
  }

  const projectRoot = getProjectRootDir();

  // If target already exists relative to project root
  if (existsSync(resolve(projectRoot, target))) {
    return resolve(projectRoot, target);
  }

  const dirBaseName = basename(target);
  if (existsSync(resolve(projectRoot, dirBaseName))) {
    return resolve(projectRoot, dirBaseName);
  }

  // If cwd has it
  if (existsSync(resolve(process.cwd(), target))) {
    return resolve(process.cwd(), target);
  }

  const cleanedRelative = target.replace(/^(\.\.[/\\])+/, '');
  return resolve(projectRoot, cleanedRelative);
}

// Automatically load environment variables upon module import
export function loadEnvironment(): void {
  const projectRoot = getProjectRootDir();
  const rootEnv = resolve(projectRoot, '.env');
  if (existsSync(rootEnv)) {
    dotenv.config({ path: rootEnv });
  }

  const localEnv = resolve(process.cwd(), '.env');
  if (localEnv !== rootEnv && existsSync(localEnv)) {
    dotenv.config({ path: localEnv });
  }
}

loadEnvironment();
