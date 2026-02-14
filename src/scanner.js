/**
 * Git log scanner - extracts author identities from repository history
 */

import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * @typedef {Object} Author
 * @property {string} name - Author name
 * @property {string} email - Author email
 * @property {number} commits - Number of commits
 */

/**
 * Scan git log for all unique author identities
 * @param {string} [repoPath='.'] - Path to git repository
 * @param {Object} [options] - Scan options
 * @param {boolean} [options.includeCommitters=false] - Include committer identities too
 * @returns {Author[]} Array of unique author identities with commit counts
 */
export function scanAuthors(repoPath = '.', options = {}) {
  const { includeCommitters = false } = options;

  // Get all author name/email combinations with counts
  const format = includeCommitters ? '%aN|%aE%n%cN|%cE' : '%aN|%aE';

  let output;
  try {
    output = execSync(`git log --format="${format}"`, {
      cwd: repoPath,
      encoding: 'utf-8',
      maxBuffer: 50 * 1024 * 1024, // 50MB for large repos
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch (err) {
    if (err.message.includes('not a git repository')) {
      throw new Error(`Not a git repository: ${repoPath}`);
    }
    if (err.message.includes('does not have any commits')) {
      return [];
    }
    throw err;
  }

  const lines = output.trim().split('\n').filter(Boolean);
  const counts = new Map();

  for (const line of lines) {
    const [name, email] = line.split('|');
    if (!name || !email) continue;

    const key = `${name}|${email}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  }

  const authors = [];
  for (const [key, commits] of counts) {
    const [name, email] = key.split('|');
    authors.push({ name, email, commits });
  }

  // Sort by commit count descending
  authors.sort((a, b) => b.commits - a.commits);

  return authors;
}

/**
 * Get existing .mailmap content if present
 * @param {string} [repoPath='.'] - Path to git repository
 * @returns {string|null} Mailmap content or null if not found
 */
export function getExistingMailmap(repoPath = '.') {
  try {
    return readFileSync(join(repoPath, '.mailmap'), 'utf-8');
  } catch {
    return null;
  }
}

/**
 * Parse existing .mailmap file
 * @param {string} content - Mailmap file content
 * @returns {Map<string, {name: string, email: string}>} Map of old identity to canonical
 */
export function parseMailmap(content) {
  const mappings = new Map();
  const lines = content.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    // Format: Canonical Name <canonical@email> Old Name <old@email>
    // Or: Canonical Name <canonical@email> <old@email>
    // Or: Canonical Name <old@email>
    const match = trimmed.match(
      /^([^<]+)?<([^>]+)>(?:\s+([^<]+)?<([^>]+)>)?$/
    );

    if (match) {
      const [, canonicalName, canonicalEmail, oldName, oldEmail] = match;
      const canonical = {
        name: (canonicalName || '').trim(),
        email: canonicalEmail.trim(),
      };

      if (oldEmail) {
        // Full mapping: Canonical <canonical> Old <old>
        const key = `${(oldName || '').trim()}|${oldEmail.trim()}`;
        mappings.set(key, canonical);
      } else if (canonicalName) {
        // Name mapping only: Name <email>
        const key = `|${canonicalEmail.trim()}`;
        mappings.set(key, canonical);
      }
    }
  }

  return mappings;
}
