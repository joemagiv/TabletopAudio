import { createHash } from 'node:crypto';
import path from 'node:path';

/**
 * Generate a stable, url-safe id for a library item from its path relative to
 * the library root (forward slashes). Deterministic across restarts.
 *
 * @param {string} relativePath - path relative to library root, any separators
 * @returns {string} 12-char hex id
 */
export function itemId(relativePath) {
  const normalized = relativePath.split(path.sep).join('/');
  return createHash('sha1').update(normalized).digest('hex').slice(0, 12);
}
