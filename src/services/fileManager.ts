import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export function createTempDir(baseDir: string): string {
  const dirName = `md2wechat-${randomUUID()}`;
  const dirPath = path.join(baseDir, dirName);
  fs.mkdirSync(dirPath, { recursive: true });
  return dirPath;
}

export function cleanupTempDir(dirPath: string): void {
  try {
    fs.rmSync(dirPath, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
}
