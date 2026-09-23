#!/usr/bin/env node
/**
 * Preflight for distribution signing.
 * Usage: node scripts/check-signing.mjs [mac|win|all]
 */
import { execSync } from 'node:child_process'
import { existsSync } from 'node:fs'

const target = (process.argv[2] || 'all').toLowerCase()
const errors = []
const notes = []

function hasEnv(...keys) {
  return keys.every((key) => Boolean(process.env[key] && String(process.env[key]).trim()))
}

function checkMac() {
  notes.push('macOS: Gatekeeper-clean installs need Developer ID Application + notarization')

  let identities = ''
  try {
    identities = execSync('security find-identity -v -p codesigning', { encoding: 'utf8' })
  } catch {
    errors.push('Could not read macOS code-signing identities from Keychain')
    return
  }

  const hasDeveloperId = /Developer ID Application:/i.test(identities)
  const hasDevelopment = /Apple Development:/i.test(identities)

  if (!hasDeveloperId) {
    errors.push(
      'No "Developer ID Application" identity found. Apple Development certs only work locally — create a Developer ID Application cert in your paid Apple Developer account.'
    )
  } else {
    notes.push('Found Developer ID Application identity')
  }

  if (hasDevelopment && !hasDeveloperId) {
    notes.push('Apple Development identity is present, but it will not satisfy Gatekeeper for other users')
  }

  const apiKeyPath = process.env.APPLE_API_KEY
  const hasApiKey =
    hasEnv('APPLE_API_KEY', 'APPLE_API_KEY_ID', 'APPLE_API_ISSUER') &&
    (!apiKeyPath || existsSync(apiKeyPath))
  const hasAppleId = hasEnv('APPLE_ID', 'APPLE_APP_SPECIFIC_PASSWORD', 'APPLE_TEAM_ID')
  const hasKeychain = hasEnv('APPLE_KEYCHAIN', 'APPLE_KEYCHAIN_PROFILE')

  if (!hasApiKey && !hasAppleId && !hasKeychain) {
    errors.push(
      'Notarization credentials missing. Set either:\n' +
        '  - APPLE_API_KEY + APPLE_API_KEY_ID + APPLE_API_ISSUER  (recommended)\n' +
        '  - APPLE_ID + APPLE_APP_SPECIFIC_PASSWORD + APPLE_TEAM_ID\n' +
        '  - APPLE_KEYCHAIN + APPLE_KEYCHAIN_PROFILE'
    )
  } else if (apiKeyPath && !existsSync(apiKeyPath)) {
    errors.push(`APPLE_API_KEY path does not exist: ${apiKeyPath}`)
  } else {
    notes.push('Notarization credentials detected')
  }

  if (!existsSync('build/entitlements.mac.plist')) {
    errors.push('Missing build/entitlements.mac.plist')
  }
}

function checkWin() {
  notes.push('Windows: SmartScreen-clean installs need an Authenticode code-signing certificate')

  const hasLink = Boolean(process.env.CSC_LINK || process.env.WIN_CSC_LINK)
  const hasPassword = Boolean(process.env.CSC_KEY_PASSWORD || process.env.WIN_CSC_KEY_PASSWORD)
  const hasSubject = Boolean(process.env.CSC_NAME || process.env.WIN_CSC_NAME)

  if (!hasLink && !hasSubject) {
    errors.push(
      'Windows signing credentials missing. Set either:\n' +
        '  - CSC_LINK (path or base64 .pfx) + CSC_KEY_PASSWORD\n' +
        '  - WIN_CSC_LINK + WIN_CSC_KEY_PASSWORD\n' +
        '  - CSC_NAME (certificate subject in Windows cert store)'
    )
  } else if (hasLink && !hasPassword && !hasSubject) {
    errors.push('CSC_LINK/WIN_CSC_LINK is set but CSC_KEY_PASSWORD/WIN_CSC_KEY_PASSWORD is missing')
  } else {
    notes.push('Windows signing credentials detected')
  }
}

if (target === 'mac' || target === 'all') checkMac()
if (target === 'win' || target === 'all') checkWin()

for (const note of notes) console.log(`• ${note}`)
if (errors.length) {
  console.error('\nSigning preflight failed:\n')
  for (const error of errors) console.error(`✖ ${error}\n`)
  process.exit(1)
}

console.log('\nSigning preflight passed.')
