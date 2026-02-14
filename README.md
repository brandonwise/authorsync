# authorsync

CLI tool to detect duplicate git authors and generate `.mailmap` files.

Find mismatched name/email combinations, cluster similar identities, and output a ready-to-use mailmap for clean git history.

## The Problem

Over time, repositories accumulate duplicate author identities:

```
John Doe <john@company.com>        # Work laptop
John Doe <johndoe@gmail.com>       # Personal
John D <john@company.com>          # Typo
john doe <12345+johndoe@users.noreply.github.com>  # GitHub web edits
```

This fragments your `git shortlog`, blame annotations, and contribution statistics.

## The Solution

`authorsync` scans your git history, detects likely duplicates using smart matching algorithms, and generates a `.mailmap` file that Git uses to normalize author identities.

## Installation

```bash
npm install -g authorsync
```

Or run directly with npx:

```bash
npx authorsync
```

## Usage

### Analyze a Repository

```bash
# Analyze current directory
authorsync

# Analyze specific repo
authorsync -p /path/to/repo
```

Output:
```
📊 Repository Analysis:
   Total identities: 47
   Unique names: 35
   Unique emails: 42
   NoReply emails: 8
   Total commits: 2,847

🔍 Duplicate Detection:
   Clusters found: 7
   Aliases to consolidate: 12
   Authors after cleanup: 35 (26% reduction)

📋 Proposed Mappings:

✓ John Doe <john@company.com>
  ← John D <john@company.com> (5 commits)
  ← John Doe <johndoe@gmail.com> (23 commits)
  ← john doe <12345+johndoe@users.noreply.github.com> (3 commits)

...
```

### Generate Mailmap

```bash
# Output to stdout
authorsync generate

# Save to file
authorsync generate -o .mailmap

# Apply directly to repo
authorsync apply
```

### List All Identities

```bash
authorsync scan
```

Output:
```
NAME                  EMAIL                           COMMITS
--------------------  ------------------------------  -------
John Doe              john@company.com                234
Alice Smith           alice@company.com               189
John Doe              johndoe@gmail.com               23
...

Total: 47 unique identities
```

## Commands

| Command | Description |
|---------|-------------|
| `analyze` | Find duplicate identities (default) |
| `scan` | List all unique author identities |
| `generate` | Generate `.mailmap` file content |
| `apply` | Write `.mailmap` to repository root |

## Options

| Option | Description |
|--------|-------------|
| `-p, --path <dir>` | Repository path (default: `.`) |
| `-c, --confidence <n>` | Minimum confidence 0-1 (default: `0.6`) |
| `-o, --output <file>` | Output file path |
| `--committers` | Include committer identities (not just authors) |
| `--no-comments` | Omit comments from mailmap output |
| `--json` | Output as JSON (for scripting) |
| `-q, --quiet` | Minimal output |
| `-h, --help` | Show help |
| `-v, --version` | Show version |

## How It Works

### Identity Matching

`authorsync` uses multiple signals to detect duplicates:

1. **Exact email match** — Same email, different name variations
2. **Same local part** — `john@company.com` ↔ `john@gmail.com`
3. **GitHub noreply** — Matches `user@users.noreply.github.com` patterns
4. **Name similarity** — Levenshtein distance + word overlap
5. **Domain clustering** — Same domain often means same person

### Canonical Selection

When consolidating identities, `authorsync` picks the "best" canonical identity based on:

- **Commit count** — More commits = more authoritative
- **Email type** — Company > personal > noreply
- **Name completeness** — "John Doe" > "John" > "root"
- **Generic names** — Avoids "root", "admin", "user" as canonical

## Examples

### CI Integration

```yaml
# GitHub Actions
- name: Check author consistency
  run: |
    npx authorsync --json | jq '.stats.clustersFound'
    if [ "$(npx authorsync --json | jq '.stats.clustersFound')" -gt "0" ]; then
      echo "::warning::Duplicate authors detected"
    fi
```

### Pipe to File

```bash
authorsync generate --no-comments > .mailmap
git add .mailmap
git commit -m "chore: add mailmap for author normalization"
```

### JSON Output for Scripting

```bash
authorsync --json | jq '.clusters[].canonical.name'
```

## What is .mailmap?

Git's `.mailmap` file maps author identities to canonical names/emails. Once committed:

- `git log` shows normalized authors
- `git shortlog` aggregates correctly
- `git blame` uses canonical names
- GitHub/GitLab contribution graphs consolidate

The file format is:

```
# Canonical Name <canonical@email> Old Name <old@email>
John Doe <john@company.com> John D <john@company.com>
John Doe <john@company.com> <johndoe@gmail.com>
```

See [gitmailmap documentation](https://git-scm.com/docs/gitmailmap) for details.

## Zero Dependencies

`authorsync` has no runtime dependencies — just Node.js 18+.

## License

MIT
