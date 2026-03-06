#!/usr/bin/env node
const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

const MAX_FILE_BYTES = 1_500_000

const EXCLUDE_DIR_NAMES = new Set([
  'node_modules',
  'dist',
  '.git',
  '.history',
  '.wrangler',
  'android',
  'build',
  '.husky',
  '.github',
])

const SUSPICIOUS_PATTERNS = [
  {
    name: 'jwt',
    // Match a full JWT (3 base64url segments). Avoids false positives like "eyJhbGci..." in docs.
    re: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/,
  },
  {
    name: 'private_key',
    re: /-----BEGIN (?:RSA|EC|OPENSSH|DSA) PRIVATE KEY-----/,
  },
]

const readTextIfSmallUtf8 = (filePath) => {
  let stat
  try {
    stat = fs.statSync(filePath)
  } catch {
    return null
  }

  if (!stat.isFile()) return null
  if (stat.size > MAX_FILE_BYTES) return null

  try {
    return fs.readFileSync(filePath, 'utf8')
  } catch {
    return null
  }
}

const findMatches = (filePath) => {
  const text = readTextIfSmallUtf8(filePath)
  if (text == null) return []
  const hits = []
  for (const { name, re } of SUSPICIOUS_PATTERNS) {
    if (re.test(text)) hits.push(name)
  }
  return hits
}

const tryExec = (cmd) => {
  try {
    return execSync(cmd, { stdio: ['ignore', 'pipe', 'ignore'] }).toString('utf8')
  } catch {
    return null
  }
}

const splitLines = (s) =>
  String(s || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)

const getGitFileList = () => {
  const inside = tryExec('git rev-parse --is-inside-work-tree')
  if (!inside || !inside.trim().toLowerCase().startsWith('true')) return null

  // Prefer staged files (pre-commit). If none, scan tracked files (CI/manual).
  const staged = tryExec('git diff --cached --name-only --diff-filter=ACMR')
  const stagedFiles = splitLines(staged)
  if (stagedFiles.length > 0) return stagedFiles

  const tracked = tryExec('git ls-files')
  const trackedFiles = splitLines(tracked)
  return trackedFiles.length > 0 ? trackedFiles : []
}

const shouldSkipPath = (p) => {
  // Normalize to posix-ish for segment checks
  const rel = String(p).replace(/\\/g, '/')
  const segments = rel.split('/').filter(Boolean)
  return segments.some((seg) => EXCLUDE_DIR_NAMES.has(seg))
}

let found = false

const report = (filePath, hits) => {
  const pretty = filePath.replace(/\\/g, '/')
  console.error(`Potential secret in: ${pretty} (patterns: ${hits.join(', ')})`)
}

const scanPaths = (paths) => {
  for (const rel of paths) {
    if (shouldSkipPath(rel)) continue
    const full = path.resolve(process.cwd(), rel)
    const hits = findMatches(full)
    if (hits.length > 0) {
      report(full, hits)
      found = true
    }
  }
}

const walk = (dir) => {
  let entries
  try {
    entries = fs.readdirSync(dir)
  } catch {
    return
  }
  for (const e of entries) {
    if (EXCLUDE_DIR_NAMES.has(e)) continue
    const full = path.join(dir, e)
    let stat
    try {
      stat = fs.statSync(full)
    } catch {
      continue
    }
    if (stat.isDirectory()) {
      walk(full)
    } else {
      const hits = findMatches(full)
      if (hits.length > 0) {
        report(full, hits)
        found = true
      }
    }
  }
}

const gitFiles = getGitFileList()
if (gitFiles) {
  scanPaths(gitFiles)
} else {
  // Fallback if git isn't available.
  walk(process.cwd())
}

if (found) {
  console.error('\nSecret scan failed. Remove secrets before committing.')
  process.exit(1)
}

console.log('Secret scan passed.')
