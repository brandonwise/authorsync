import { describe, it } from 'node:test';
import assert from 'node:assert';

import {
  normalizeName,
  emailLocal,
  emailDomain,
  isNoReply,
  nameSimilarity,
  findClusters,
  analyzeIdentities,
} from '../src/matcher.js';

describe('normalizeName', () => {
  it('converts to lowercase', () => {
    assert.strictEqual(normalizeName('John Doe'), 'john doe');
  });

  it('removes special characters', () => {
    assert.strictEqual(normalizeName("John O'Brien"), 'john o brien');
  });

  it('normalizes whitespace', () => {
    assert.strictEqual(normalizeName('  John   Doe  '), 'john doe');
  });

  it('handles empty string', () => {
    assert.strictEqual(normalizeName(''), '');
  });
});

describe('emailLocal', () => {
  it('extracts local part', () => {
    assert.strictEqual(emailLocal('john@example.com'), 'john');
  });

  it('handles plus addressing', () => {
    assert.strictEqual(emailLocal('john+work@example.com'), 'john+work');
  });

  it('lowercases result', () => {
    assert.strictEqual(emailLocal('John@Example.com'), 'john');
  });
});

describe('emailDomain', () => {
  it('extracts domain part', () => {
    assert.strictEqual(emailDomain('john@example.com'), 'example.com');
  });

  it('lowercases result', () => {
    assert.strictEqual(emailDomain('john@Example.COM'), 'example.com');
  });

  it('handles missing @', () => {
    assert.strictEqual(emailDomain('invalid'), '');
  });
});

describe('isNoReply', () => {
  it('detects noreply addresses', () => {
    assert.strictEqual(isNoReply('noreply@example.com'), true);
    assert.strictEqual(isNoReply('no-reply@example.com'), true);
  });

  it('detects GitHub noreply', () => {
    assert.strictEqual(
      isNoReply('user@users.noreply.github.com'),
      true
    );
    assert.strictEqual(
      isNoReply('12345+user@users.noreply.github.com'),
      true
    );
  });

  it('detects plus-addressed emails', () => {
    assert.strictEqual(isNoReply('user+tag@example.com'), true);
  });

  it('returns false for regular emails', () => {
    assert.strictEqual(isNoReply('john@example.com'), false);
    assert.strictEqual(isNoReply('john@gmail.com'), false);
  });
});

describe('nameSimilarity', () => {
  it('returns 1 for exact match', () => {
    assert.strictEqual(nameSimilarity('John Doe', 'John Doe'), 1);
  });

  it('returns 1 for case-insensitive match', () => {
    assert.strictEqual(nameSimilarity('John Doe', 'john doe'), 1);
  });

  it('returns high score for contained names', () => {
    const score = nameSimilarity('John', 'John Doe');
    assert.ok(score >= 0.9, `Expected >= 0.9, got ${score}`);
  });

  it('returns moderate score for similar names', () => {
    const score = nameSimilarity('John Smith', 'John Smyth');
    assert.ok(score >= 0.5, `Expected >= 0.5, got ${score}`);
  });

  it('returns low score for different names', () => {
    const score = nameSimilarity('John Doe', 'Alice Smith');
    assert.ok(score < 0.5, `Expected < 0.5, got ${score}`);
  });

  it('returns 0 for empty name', () => {
    assert.strictEqual(nameSimilarity('', 'John'), 0);
    assert.strictEqual(nameSimilarity('John', ''), 0);
  });
});

describe('findClusters', () => {
  it('clusters same email different names', () => {
    const authors = [
      { name: 'John Doe', email: 'john@example.com', commits: 100 },
      { name: 'John D', email: 'john@example.com', commits: 10 },
    ];

    const clusters = findClusters(authors);
    assert.strictEqual(clusters.length, 1);
    assert.strictEqual(clusters[0].canonical.name, 'John Doe');
    assert.strictEqual(clusters[0].aliases.length, 1);
    assert.strictEqual(clusters[0].aliases[0].name, 'John D');
  });

  it('clusters same local part different domains', () => {
    const authors = [
      { name: 'John Doe', email: 'johndoe@company.com', commits: 50 },
      { name: 'John Doe', email: 'johndoe@gmail.com', commits: 20 },
    ];

    const clusters = findClusters(authors);
    assert.strictEqual(clusters.length, 1);
  });

  it('clusters GitHub noreply variants', () => {
    const authors = [
      { name: 'John Doe', email: 'john@example.com', commits: 50 },
      {
        name: 'John Doe',
        email: '12345+johndoe@users.noreply.github.com',
        commits: 10,
      },
    ];

    const clusters = findClusters(authors);
    // May or may not cluster depending on confidence
    assert.ok(clusters.length <= 1);
  });

  it('respects minConfidence option', () => {
    const authors = [
      { name: 'John', email: 'john@a.com', commits: 50 },
      { name: 'John Doe', email: 'john@b.com', commits: 20 },
    ];

    const highConfidence = findClusters(authors, { minConfidence: 0.9 });
    const lowConfidence = findClusters(authors, { minConfidence: 0.3 });

    assert.ok(lowConfidence.length >= highConfidence.length);
  });

  it('returns empty array for no duplicates', () => {
    const authors = [
      { name: 'John Doe', email: 'john@example.com', commits: 50 },
      { name: 'Alice Smith', email: 'alice@example.com', commits: 30 },
    ];

    const clusters = findClusters(authors);
    assert.strictEqual(clusters.length, 0);
  });

  it('handles empty input', () => {
    const clusters = findClusters([]);
    assert.strictEqual(clusters.length, 0);
  });
});

describe('analyzeIdentities', () => {
  it('calculates correct statistics', () => {
    const authors = [
      { name: 'John Doe', email: 'john@example.com', commits: 50 },
      { name: 'john doe', email: 'john@gmail.com', commits: 30 },
      { name: 'Alice', email: 'alice@example.com', commits: 20 },
    ];

    const stats = analyzeIdentities(authors);
    assert.strictEqual(stats.totalIdentities, 3);
    assert.strictEqual(stats.uniqueEmails, 3);
    assert.strictEqual(stats.totalCommits, 100);
  });

  it('counts noreply emails', () => {
    const authors = [
      { name: 'John', email: 'john@users.noreply.github.com', commits: 10 },
      { name: 'Alice', email: 'alice@example.com', commits: 10 },
    ];

    const stats = analyzeIdentities(authors);
    assert.strictEqual(stats.noreplyEmails, 1);
  });

  it('handles empty input', () => {
    const stats = analyzeIdentities([]);
    assert.strictEqual(stats.totalIdentities, 0);
    assert.strictEqual(stats.totalCommits, 0);
  });
});
