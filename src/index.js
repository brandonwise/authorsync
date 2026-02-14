/**
 * authorsync - Detect duplicate git authors and generate .mailmap files
 *
 * Main API module
 */

export { scanAuthors, getExistingMailmap, parseMailmap } from './scanner.js';
export {
  findClusters,
  analyzeIdentities,
  normalizeName,
  emailLocal,
  emailDomain,
  isNoReply,
  nameSimilarity,
} from './matcher.js';
export {
  selectCanonical,
  generateMailmap,
  formatMappingSummary,
  generateStats,
} from './mailmap.js';

/**
 * High-level function to analyze a repository and generate mailmap
 * @param {string} [repoPath='.'] - Path to git repository
 * @param {Object} [options] - Options
 * @param {number} [options.minConfidence=0.6] - Minimum confidence for clustering
 * @param {boolean} [options.includeCommitters=false] - Include committer identities
 * @param {boolean} [options.comments=true] - Include comments in mailmap
 * @returns {Object} Analysis result
 */
export async function analyze(repoPath = '.', options = {}) {
  const { scanAuthors } = await import('./scanner.js');
  const { findClusters, analyzeIdentities } = await import('./matcher.js');
  const { generateMailmap, formatMappingSummary, generateStats } = await import(
    './mailmap.js'
  );

  const {
    minConfidence = 0.6,
    includeCommitters = false,
    comments = true,
  } = options;

  // Scan repository
  const authors = scanAuthors(repoPath, { includeCommitters });
  if (authors.length === 0) {
    return {
      authors: [],
      clusters: [],
      stats: analyzeIdentities([]),
      mailmap: '',
      summary: 'No commits found in repository',
    };
  }

  // Find duplicate clusters
  const clusters = findClusters(authors, { minConfidence });

  // Generate outputs
  const stats = analyzeIdentities(authors);
  const clusterStats = generateStats(clusters, authors.length);
  const mailmap = generateMailmap(clusters, { comments });
  const summary = formatMappingSummary(clusters);

  return {
    authors,
    clusters,
    stats: { ...stats, ...clusterStats },
    mailmap,
    summary,
  };
}
