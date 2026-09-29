import path from 'node:path';

/**
 * Resolve one or more user-provided path segments against a base directory.
 * Rejects path traversal (including encoded traversal and null bytes),
 * guaranteeing the result stays inside `baseDir`.
 *
 * @param {string} baseDir  absolute base directory
 * @param {string[]} segments  user-provided segments (may be URL-encoded)
 * @returns {string} absolute, safe path inside baseDir
 * @throws {Error} if the resolved path escapes baseDir or is otherwise unsafe
 */
export function safeResolve(baseDir, ...segments) {
  const base = path.resolve(baseDir);
  if (!segments.length) return base;

  for (const seg of segments) {
    if (typeof seg !== 'string' || seg.includes('\0')) {
      throw new Error('Invalid path segment');
    }
  }

  // Decode percent-encoding (handles %2e%2e%2f style traversal).
  const decoded = segments.map((s) => {
    try {
      return decodeURIComponent(s);
    } catch {
      throw new Error('Invalid path encoding');
    }
  });

  const target = path.resolve(base, ...decoded);
  const rel = path.relative(base, target);

  if (rel === '' ) return target;
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error('Path traversal detected');
  }
  return target;
}

/**
 * URL-encode each segment of a forward-slash path for safe embedding in URLs.
 * @param {string} p
 * @returns {string}
 */
export function encodePathSegments(p) {
  return p
    .split('/')
    .filter((s) => s.length > 0)
    .map((s) => encodeURIComponent(s))
    .join('/');
}
