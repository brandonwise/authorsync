/**
 * Identity matcher - finds similar/duplicate author identities
 */

/**
 * @typedef {Object} Author
 * @property {string} name - Author name
 * @property {string} email - Author email
 * @property {number} commits - Number of commits
 */

/**
 * @typedef {Object} IdentityCluster
 * @property {Author} canonical - The canonical identity (highest commit count)
 * @property {Author[]} aliases - Other identities that likely belong to same person
 * @property {number} confidence - Confidence score (0-1)
 * @property {string} reason - Why these were clustered
 */

/**
 * Normalize a name for comparison
 * @param {string} name - Name to normalize
 * @returns {string} Normalized name
 */
function normalizeName(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extract email local part (before @)
 * @param {string} email - Email address
 * @returns {string} Local part
 */
function emailLocal(email) {
  return email.split('@')[0].toLowerCase();
}

/**
 * Extract email domain
 * @param {string} email - Email address
 * @returns {string} Domain part
 */
function emailDomain(email) {
  const parts = email.split('@');
  return parts[1] ? parts[1].toLowerCase() : '';
}

/**
 * Check if email is a noreply/bot address
 * @param {string} email - Email address
 * @returns {boolean} True if noreply/bot
 */
function isNoReply(email) {
  const lower = email.toLowerCase();
  return (
    lower.includes('noreply') ||
    lower.includes('no-reply') ||
    lower.includes('@users.noreply.github.com') ||
    lower.includes('@users.noreply.gitlab.com') ||
    lower.includes('+') // GitHub private email format
  );
}

/**
 * Calculate Levenshtein distance between two strings
 * @param {string} a - First string
 * @param {string} b - Second string
 * @returns {number} Edit distance
 */
function levenshtein(a, b) {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const matrix = [];
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

/**
 * Calculate name similarity score (0-1)
 * @param {string} name1 - First name
 * @param {string} name2 - Second name
 * @returns {number} Similarity score
 */
function nameSimilarity(name1, name2) {
  const n1 = normalizeName(name1);
  const n2 = normalizeName(name2);

  if (n1 === n2) return 1;
  if (!n1 || !n2) return 0;

  // Check if one contains the other (e.g., "John" vs "John Doe")
  if (n1.includes(n2) || n2.includes(n1)) return 0.9;

  // Check word overlap
  const words1 = new Set(n1.split(' '));
  const words2 = new Set(n2.split(' '));
  const intersection = [...words1].filter((w) => words2.has(w));
  const union = new Set([...words1, ...words2]);
  const jaccardSim = intersection.length / union.size;
  if (jaccardSim > 0.5) return 0.7 + jaccardSim * 0.2;

  // Levenshtein-based similarity
  const maxLen = Math.max(n1.length, n2.length);
  const distance = levenshtein(n1, n2);
  const similarity = 1 - distance / maxLen;

  return similarity;
}

/**
 * Check if two emails likely belong to same person
 * @param {string} email1 - First email
 * @param {string} email2 - Second email
 * @returns {{match: boolean, confidence: number, reason: string}} Match result
 */
function emailsMatch(email1, email2) {
  const e1 = email1.toLowerCase();
  const e2 = email2.toLowerCase();

  if (e1 === e2) return { match: true, confidence: 1, reason: 'exact-email' };

  const local1 = emailLocal(e1);
  const local2 = emailLocal(e2);

  // Same local part, different domain (common when using personal vs work email)
  if (local1 === local2 && local1.length > 3) {
    return { match: true, confidence: 0.8, reason: 'same-local-part' };
  }

  // GitHub noreply pattern: user+ID@users.noreply.github.com
  const ghMatch1 = e1.match(/^(\d+\+)?([^@]+)@users\.noreply\.github\.com$/);
  const ghMatch2 = e2.match(/^(\d+\+)?([^@]+)@users\.noreply\.github\.com$/);
  if (ghMatch1 && ghMatch2 && ghMatch1[2] === ghMatch2[2]) {
    return { match: true, confidence: 0.95, reason: 'github-noreply-username' };
  }

  // GitHub noreply vs regular email with same username
  if (ghMatch1 && local2 === ghMatch1[2]) {
    return { match: true, confidence: 0.7, reason: 'github-noreply-match' };
  }
  if (ghMatch2 && local1 === ghMatch2[2]) {
    return { match: true, confidence: 0.7, reason: 'github-noreply-match' };
  }

  return { match: false, confidence: 0, reason: '' };
}

/**
 * Find clusters of similar identities
 * @param {Author[]} authors - List of author identities
 * @param {Object} [options] - Matching options
 * @param {number} [options.minConfidence=0.6] - Minimum confidence to cluster
 * @returns {IdentityCluster[]} Clusters of similar identities
 */
export function findClusters(authors, options = {}) {
  const { minConfidence = 0.6 } = options;
  const clusters = [];
  const assigned = new Set();

  // Sort by commits descending for canonical selection
  const sorted = [...authors].sort((a, b) => b.commits - a.commits);

  for (let i = 0; i < sorted.length; i++) {
    if (assigned.has(i)) continue;

    const canonical = sorted[i];
    const aliases = [];
    let clusterReason = '';

    for (let j = i + 1; j < sorted.length; j++) {
      if (assigned.has(j)) continue;

      const candidate = sorted[j];
      let confidence = 0;
      let reason = '';

      // Check email match
      const emailResult = emailsMatch(canonical.email, candidate.email);
      if (emailResult.match) {
        confidence = emailResult.confidence;
        reason = emailResult.reason;
      }

      // Check name similarity if emails don't match
      if (!emailResult.match) {
        const nameSim = nameSimilarity(canonical.name, candidate.name);
        if (nameSim > 0.8) {
          // High name similarity - check if same domain
          if (emailDomain(canonical.email) === emailDomain(candidate.email)) {
            confidence = nameSim * 0.9;
            reason = 'similar-name-same-domain';
          } else {
            confidence = nameSim * 0.7;
            reason = 'similar-name';
          }
        }
      }

      // If email matches but names very different, lower confidence
      if (emailResult.match) {
        const nameSim = nameSimilarity(canonical.name, candidate.name);
        if (nameSim < 0.3) {
          confidence = emailResult.confidence * 0.6;
          reason = `${emailResult.reason}-name-mismatch`;
        }
      }

      if (confidence >= minConfidence) {
        aliases.push(candidate);
        assigned.add(j);
        if (!clusterReason) clusterReason = reason;
      }
    }

    if (aliases.length > 0) {
      assigned.add(i);
      clusters.push({
        canonical,
        aliases,
        confidence: Math.min(...aliases.map(() => 0.8)), // Simplified
        reason: clusterReason,
      });
    }
  }

  // Sort clusters by total commits
  clusters.sort(
    (a, b) =>
      b.canonical.commits +
      b.aliases.reduce((sum, al) => sum + al.commits, 0) -
      (a.canonical.commits + a.aliases.reduce((sum, al) => sum + al.commits, 0))
  );

  return clusters;
}

/**
 * Analyze repository for identity issues
 * @param {Author[]} authors - List of author identities
 * @returns {Object} Analysis summary
 */
export function analyzeIdentities(authors) {
  const noreplyCount = authors.filter((a) => isNoReply(a.email)).length;
  const uniqueNames = new Set(authors.map((a) => normalizeName(a.name))).size;
  const uniqueEmails = new Set(authors.map((a) => a.email.toLowerCase())).size;
  const uniqueDomains = new Set(
    authors.map((a) => emailDomain(a.email))
  ).size;

  return {
    totalIdentities: authors.length,
    uniqueNames,
    uniqueEmails,
    uniqueDomains,
    noreplyEmails: noreplyCount,
    potentialDuplicates: authors.length - uniqueNames,
    totalCommits: authors.reduce((sum, a) => sum + a.commits, 0),
  };
}

export { normalizeName, emailLocal, emailDomain, isNoReply, nameSimilarity };
