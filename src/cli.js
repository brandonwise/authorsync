#!/usr/bin/env node
/**
 * authorsync CLI
 *
 * Detect duplicate git authors and generate .mailmap files
 */

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';

import { scanAuthors, getExistingMailmap } from './scanner.js';
import { findClusters, analyzeIdentities } from './matcher.js';
import {
  generateMailmap,
  formatMappingSummary,
  generateStats,
} from './mailmap.js';

const VERSION = '1.0.0';

const HELP = `
authorsync v${VERSION}
Detect duplicate git authors and generate .mailmap files

USAGE:
  authorsync [command] [options]

COMMANDS:
  scan        List all unique author identities
  analyze     Find duplicate identities (default)
  generate    Generate .mailmap file content
  apply       Write .mailmap file to repository

OPTIONS:
  -p, --path <dir>       Repository path (default: .)
  -c, --confidence <n>   Min confidence 0-1 (default: 0.6)
  -o, --output <file>    Output file path
      --committers       Include committer identities
      --no-comments      Omit comments from mailmap
      --json             Output as JSON
  -q, --quiet            Minimal output
  -h, --help             Show this help
  -v, --version          Show version

EXAMPLES:
  authorsync                     # Analyze current repo
  authorsync scan                # List all identities
  authorsync generate > .mailmap # Generate mailmap
  authorsync apply               # Write .mailmap to repo
  authorsync -p ~/project --json # JSON output for scripting
`;

function parseCliArgs() {
  const options = {
    path: { type: 'string', short: 'p', default: '.' },
    confidence: { type: 'string', short: 'c', default: '0.6' },
    output: { type: 'string', short: 'o' },
    committers: { type: 'boolean', default: false },
    'no-comments': { type: 'boolean', default: false },
    json: { type: 'boolean', default: false },
    quiet: { type: 'boolean', short: 'q', default: false },
    help: { type: 'boolean', short: 'h', default: false },
    version: { type: 'boolean', short: 'v', default: false },
  };

  const { values, positionals } = parseArgs({
    options,
    allowPositionals: true,
    strict: false,
  });

  return { values, command: positionals[0] || 'analyze' };
}

function formatAuthorTable(authors) {
  const lines = [];
  const maxName = Math.max(...authors.map((a) => a.name.length), 10);
  const maxEmail = Math.max(...authors.map((a) => a.email.length), 10);

  lines.push(
    `${'NAME'.padEnd(maxName)}  ${'EMAIL'.padEnd(maxEmail)}  COMMITS`
  );
  lines.push(`${'-'.repeat(maxName)}  ${'-'.repeat(maxEmail)}  -------`);

  for (const author of authors) {
    lines.push(
      `${author.name.padEnd(maxName)}  ${author.email.padEnd(maxEmail)}  ${author.commits}`
    );
  }

  return lines.join('\n');
}

function formatStats(stats) {
  const lines = [
    '',
    '📊 Repository Analysis:',
    `   Total identities: ${stats.totalIdentities}`,
    `   Unique names: ${stats.uniqueNames}`,
    `   Unique emails: ${stats.uniqueEmails}`,
    `   Unique domains: ${stats.uniqueDomains}`,
    `   NoReply emails: ${stats.noreplyEmails}`,
    `   Total commits: ${stats.totalCommits}`,
  ];

  if (stats.clustersFound !== undefined) {
    lines.push('');
    lines.push('🔍 Duplicate Detection:');
    lines.push(`   Clusters found: ${stats.clustersFound}`);
    lines.push(`   Aliases to consolidate: ${stats.aliasesConsolidated}`);
    lines.push(
      `   Authors after cleanup: ${stats.authorsAfter} (${stats.reductionPercent}% reduction)`
    );
    lines.push(`   Commits affected: ${stats.commitsAffected}`);
  }

  return lines.join('\n');
}

async function runScan(repoPath, opts) {
  const authors = scanAuthors(repoPath, {
    includeCommitters: opts.committers,
  });

  if (authors.length === 0) {
    console.log('No commits found in repository');
    return;
  }

  if (opts.json) {
    console.log(JSON.stringify(authors, null, 2));
    return;
  }

  console.log(formatAuthorTable(authors));
  console.log(`\nTotal: ${authors.length} unique identities`);
}

async function runAnalyze(repoPath, opts) {
  const authors = scanAuthors(repoPath, {
    includeCommitters: opts.committers,
  });

  if (authors.length === 0) {
    console.log('No commits found in repository');
    return;
  }

  const minConfidence = parseFloat(opts.confidence);
  const clusters = findClusters(authors, { minConfidence });
  const stats = analyzeIdentities(authors);
  const clusterStats = generateStats(clusters, authors.length);

  if (opts.json) {
    console.log(
      JSON.stringify(
        {
          authors,
          clusters,
          stats: { ...stats, ...clusterStats },
        },
        null,
        2
      )
    );
    return;
  }

  console.log(formatStats({ ...stats, ...clusterStats }));

  if (clusters.length === 0) {
    console.log('\n✨ No duplicate identities found!');
    return;
  }

  console.log('\n📋 Proposed Mappings:');
  console.log(formatMappingSummary(clusters));
  console.log('\n💡 Run `authorsync generate` to create a .mailmap file');
}

async function runGenerate(repoPath, opts) {
  const authors = scanAuthors(repoPath, {
    includeCommitters: opts.committers,
  });

  if (authors.length === 0) {
    console.error('No commits found in repository');
    process.exit(1);
  }

  const minConfidence = parseFloat(opts.confidence);
  const clusters = findClusters(authors, { minConfidence });

  if (clusters.length === 0) {
    if (!opts.quiet) {
      console.error('No duplicate identities found');
    }
    process.exit(0);
  }

  const mailmap = generateMailmap(clusters, {
    comments: !opts['no-comments'],
  });

  if (opts.json) {
    console.log(JSON.stringify({ mailmap, clusters }, null, 2));
    return;
  }

  if (opts.output) {
    writeFileSync(opts.output, mailmap);
    if (!opts.quiet) {
      console.log(`✅ Written to ${opts.output}`);
    }
  } else {
    console.log(mailmap);
  }
}

async function runApply(repoPath, opts) {
  const existingMailmap = getExistingMailmap(repoPath);
  if (existingMailmap && !opts.quiet) {
    console.log('⚠️  Existing .mailmap found - will be overwritten');
  }

  const authors = scanAuthors(repoPath, {
    includeCommitters: opts.committers,
  });

  if (authors.length === 0) {
    console.error('No commits found in repository');
    process.exit(1);
  }

  const minConfidence = parseFloat(opts.confidence);
  const clusters = findClusters(authors, { minConfidence });

  if (clusters.length === 0) {
    console.log('✨ No duplicate identities found - no .mailmap needed');
    process.exit(0);
  }

  const mailmap = generateMailmap(clusters, {
    comments: !opts['no-comments'],
  });

  const outputPath = join(repoPath, '.mailmap');
  writeFileSync(outputPath, mailmap);

  if (!opts.quiet) {
    const stats = generateStats(clusters, authors.length);
    console.log(`✅ Created ${outputPath}`);
    console.log(`   Consolidated ${stats.aliasesConsolidated} aliases into ${stats.clustersFound} canonical identities`);
    console.log('\n💡 Commit the .mailmap file to your repository');
  }
}

async function main() {
  const { values: opts, command } = parseCliArgs();

  if (opts.help) {
    console.log(HELP);
    process.exit(0);
  }

  if (opts.version) {
    console.log(`authorsync v${VERSION}`);
    process.exit(0);
  }

  const repoPath = opts.path;

  try {
    switch (command) {
      case 'scan':
        await runScan(repoPath, opts);
        break;
      case 'analyze':
        await runAnalyze(repoPath, opts);
        break;
      case 'generate':
      case 'gen':
        await runGenerate(repoPath, opts);
        break;
      case 'apply':
      case 'write':
        await runApply(repoPath, opts);
        break;
      default:
        console.error(`Unknown command: ${command}`);
        console.error('Run `authorsync --help` for usage');
        process.exit(1);
    }
  } catch (err) {
    if (err.message.includes('Not a git repository')) {
      console.error(`Error: ${repoPath} is not a git repository`);
      process.exit(1);
    }
    throw err;
  }
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
