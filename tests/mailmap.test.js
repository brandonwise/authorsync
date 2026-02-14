import { describe, it } from 'node:test';
import assert from 'node:assert';

import {
  selectCanonical,
  generateMailmap,
  formatMappingSummary,
  generateStats,
} from '../src/mailmap.js';

describe('selectCanonical', () => {
  it('prefers higher commit count', () => {
    const identities = [
      { name: 'John', email: 'john@gmail.com', commits: 10 },
      { name: 'John Doe', email: 'john@gmail.com', commits: 100 },
    ];

    const canonical = selectCanonical(identities);
    assert.strictEqual(canonical.commits, 100);
  });

  it('penalizes noreply emails', () => {
    const identities = [
      { name: 'John', email: 'john@users.noreply.github.com', commits: 100 },
      { name: 'John Doe', email: 'john@example.com', commits: 50 },
    ];

    const canonical = selectCanonical(identities);
    // The one with non-noreply should win despite fewer commits
    assert.strictEqual(canonical.email, 'john@example.com');
  });

  it('prefers company domains over free email', () => {
    const identities = [
      { name: 'John Doe', email: 'john@gmail.com', commits: 50 },
      { name: 'John Doe', email: 'john@company.com', commits: 45 },
    ];

    const canonical = selectCanonical(identities);
    assert.strictEqual(canonical.email, 'john@company.com');
  });

  it('prefers full names when commits are equal', () => {
    const identities = [
      { name: 'John', email: 'john@example.com', commits: 50 },
      { name: 'John Doe', email: 'johnd@example.com', commits: 50 },
    ];

    const canonical = selectCanonical(identities);
    assert.strictEqual(canonical.name, 'John Doe');
  });

  it('penalizes generic names', () => {
    const identities = [
      { name: 'root', email: 'root@localhost', commits: 100 },
      { name: 'John Doe', email: 'john@example.com', commits: 20 },
    ];

    const canonical = selectCanonical(identities);
    assert.strictEqual(canonical.name, 'John Doe');
  });

  it('throws on empty input', () => {
    assert.throws(() => selectCanonical([]), /empty/i);
  });

  it('returns single identity unchanged', () => {
    const identities = [
      { name: 'John Doe', email: 'john@example.com', commits: 50 },
    ];

    const canonical = selectCanonical(identities);
    assert.deepStrictEqual(canonical, identities[0]);
  });
});

describe('generateMailmap', () => {
  it('generates correct format', () => {
    const clusters = [
      {
        canonical: { name: 'John Doe', email: 'john@example.com', commits: 100 },
        aliases: [
          { name: 'John D', email: 'john@example.com', commits: 10 },
        ],
        confidence: 0.9,
        reason: 'exact-email',
      },
    ];

    const mailmap = generateMailmap(clusters, { comments: false });
    assert.ok(mailmap.includes('John Doe <john@example.com> John D <john@example.com>'));
  });

  it('includes header comments by default', () => {
    const clusters = [
      {
        canonical: { name: 'John Doe', email: 'john@example.com', commits: 100 },
        aliases: [{ name: 'John', email: 'j@example.com', commits: 10 }],
        confidence: 0.9,
        reason: 'test',
      },
    ];

    const mailmap = generateMailmap(clusters);
    assert.ok(mailmap.includes('# .mailmap'));
    assert.ok(mailmap.includes('authorsync'));
  });

  it('omits comments when disabled', () => {
    const clusters = [
      {
        canonical: { name: 'John Doe', email: 'john@example.com', commits: 100 },
        aliases: [{ name: 'John', email: 'j@example.com', commits: 10 }],
        confidence: 0.9,
        reason: 'test',
      },
    ];

    const mailmap = generateMailmap(clusters, { comments: false });
    assert.ok(!mailmap.includes('#'));
  });

  it('handles multiple clusters', () => {
    const clusters = [
      {
        canonical: { name: 'John Doe', email: 'john@example.com', commits: 100 },
        aliases: [{ name: 'John', email: 'j@example.com', commits: 10 }],
        confidence: 0.9,
        reason: 'test',
      },
      {
        canonical: { name: 'Alice Smith', email: 'alice@example.com', commits: 50 },
        aliases: [{ name: 'Alice S', email: 'alices@example.com', commits: 5 }],
        confidence: 0.8,
        reason: 'test',
      },
    ];

    const mailmap = generateMailmap(clusters, { comments: false });
    assert.ok(mailmap.includes('John Doe'));
    assert.ok(mailmap.includes('Alice Smith'));
  });

  it('handles multiple aliases per canonical', () => {
    const clusters = [
      {
        canonical: { name: 'John Doe', email: 'john@example.com', commits: 100 },
        aliases: [
          { name: 'John', email: 'j@example.com', commits: 10 },
          { name: 'JD', email: 'jd@example.com', commits: 5 },
        ],
        confidence: 0.9,
        reason: 'test',
      },
    ];

    const mailmap = generateMailmap(clusters, { comments: false });
    const lines = mailmap.trim().split('\n');
    assert.strictEqual(lines.length, 2);
  });

  it('returns empty string for no clusters', () => {
    const mailmap = generateMailmap([], { comments: false });
    assert.strictEqual(mailmap.trim(), '');
  });
});

describe('formatMappingSummary', () => {
  it('formats clusters for display', () => {
    const clusters = [
      {
        canonical: { name: 'John Doe', email: 'john@example.com', commits: 100 },
        aliases: [{ name: 'John', email: 'j@example.com', commits: 10 }],
        confidence: 0.9,
        reason: 'test',
      },
    ];

    const summary = formatMappingSummary(clusters);
    assert.ok(summary.includes('John Doe'));
    assert.ok(summary.includes('john@example.com'));
    assert.ok(summary.includes('←'));
    assert.ok(summary.includes('10 commits'));
  });

  it('handles empty clusters', () => {
    const summary = formatMappingSummary([]);
    assert.strictEqual(summary, '');
  });
});

describe('generateStats', () => {
  it('calculates correct statistics', () => {
    const clusters = [
      {
        canonical: { name: 'John Doe', email: 'john@example.com', commits: 100 },
        aliases: [
          { name: 'John', email: 'j@example.com', commits: 30 },
          { name: 'JD', email: 'jd@example.com', commits: 20 },
        ],
        confidence: 0.9,
        reason: 'test',
      },
    ];

    const stats = generateStats(clusters, 5);
    assert.strictEqual(stats.clustersFound, 1);
    assert.strictEqual(stats.aliasesConsolidated, 2);
    assert.strictEqual(stats.commitsAffected, 50); // 30 + 20
    assert.strictEqual(stats.authorsAfter, 3); // 5 - 2
    assert.strictEqual(stats.reductionPercent, 40); // 2/5 * 100
  });

  it('handles empty clusters', () => {
    const stats = generateStats([], 10);
    assert.strictEqual(stats.clustersFound, 0);
    assert.strictEqual(stats.aliasesConsolidated, 0);
    assert.strictEqual(stats.commitsAffected, 0);
    assert.strictEqual(stats.authorsAfter, 10);
    assert.strictEqual(stats.reductionPercent, 0);
  });

  it('handles zero total authors', () => {
    const stats = generateStats([], 0);
    assert.strictEqual(stats.reductionPercent, 0);
  });
});
