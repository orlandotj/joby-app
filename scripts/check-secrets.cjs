#!/usr/bin/env node
const fs = require('fs')
const path = require('path')

const EXCLUDE = new Set([
  'node_modules',
  'dist',
  '.git',
  '.history',
  'android',
  'build',
  '.husky',
  '.github',
])
const patterns = [
  /eyJ[A-Za-z0-9_-]{30,}/g, // JWT-like long base64 header
  /SUPABASE_KEY|VITE_SUPABASE_KEY|SERVICE_ROLE|service_role|apikey/i,
]

let found = false
function walk(dir) {
  const entries = fs.readdirSync(dir)
  for (const e of entries) {
    if (EXCLUDE.has(e)) continue
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
      let text
      try {
        text = fs.readFileSync(full, 'utf8')
      } catch {
        continue
      }
      for (const re of patterns) {
        if (re.test(text)) {
          console.error(`Potential secret in: ${full} (pattern: ${re})`)
          found = true
        }
      }
    }
  }
}

walk(process.cwd())
if (found) {
  console.error(
    '\nSecret scan failed. Remove or move secrets to .env before committing.'
  )
  process.exit(1)
}
console.log('Secret scan passed.')
