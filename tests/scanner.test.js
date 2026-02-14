import { describe, it } from 'node:test';
import assert from 'node:assert';

import { parseMailmap } from '../src/scanner.js';

describe('parseMailmap', () => {
  it('parses simple name mapping', () => {
    const content = 'John Doe <john@example.com>';
    const mappings = parseMailmap(content);
    
    assert.strictEqual(mappings.size, 1);
    const entry = mappings.get('|john@example.com');
    assert.strictEqual(entry.name, 'John Doe');
  });

  it('parses full mapping with old identity', () => {
    const content = 'John Doe <john@example.com> John D <jd@example.com>';
    const mappings = parseMailmap(content);

    assert.strictEqual(mappings.size, 1);
    const entry = mappings.get('John D|jd@example.com');
    assert.ok(entry);
    assert.strictEqual(entry.name, 'John Doe');
    assert.strictEqual(entry.email, 'john@example.com');
  });

  it('parses email-only mapping', () => {
    const content = 'John Doe <john@example.com> <old@example.com>';
    const mappings = parseMailmap(content);

    assert.strictEqual(mappings.size, 1);
    const entry = mappings.get('|old@example.com');
    assert.ok(entry);
    assert.strictEqual(entry.name, 'John Doe');
  });

  it('ignores comments', () => {
    const content = `# This is a comment
John Doe <john@example.com>
# Another comment`;
    const mappings = parseMailmap(content);

    assert.strictEqual(mappings.size, 1);
  });

  it('ignores empty lines', () => {
    const content = `

John Doe <john@example.com>

Alice Smith <alice@example.com>

`;
    const mappings = parseMailmap(content);

    assert.strictEqual(mappings.size, 2);
  });

  it('handles multiple entries', () => {
    const content = `John Doe <john@example.com> John <j@example.com>
Alice Smith <alice@example.com> Alice <a@example.com>`;
    const mappings = parseMailmap(content);

    assert.strictEqual(mappings.size, 2);
    assert.ok(mappings.has('John|j@example.com'));
    assert.ok(mappings.has('Alice|a@example.com'));
  });

  it('handles empty content', () => {
    const mappings = parseMailmap('');
    assert.strictEqual(mappings.size, 0);
  });

  it('handles whitespace in names', () => {
    const content = '  John   Doe  <john@example.com>   Old Name  <old@example.com>';
    const mappings = parseMailmap(content);

    // Should trim names
    const entry = mappings.get('Old Name|old@example.com');
    assert.ok(entry);
    assert.strictEqual(entry.name, 'John   Doe');
  });
});
