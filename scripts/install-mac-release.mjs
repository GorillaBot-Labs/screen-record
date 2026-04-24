#!/usr/bin/env node
/**
 * Copies the freshly built .app from release/mac-* into /Applications.
 * Run after `npm run dist:mac`, or use `npm run dist:mac:install`.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')

if (process.platform !== 'darwin') {
  console.error('install-mac-release: macOS only.')
  process.exit(1)
}

const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'))
const productName = pkg.build?.productName ?? pkg.name
const appBundleName = `${productName}.app`
const releaseDir = path.join(root, 'release')

function findBuiltAppBundle() {
  if (!existsSync(releaseDir)) return null
  for (const name of readdirSync(releaseDir)) {
    if (!name.startsWith('mac')) continue
    const candidate = path.join(releaseDir, name, appBundleName)
    if (existsSync(candidate)) return candidate
  }
  return null
}

const src = findBuiltAppBundle()
if (!src) {
  console.error(
    `Could not find ${appBundleName} under ${releaseDir}/mac-*.\nRun: npm run dist:mac`,
  )
  process.exit(1)
}

const dest = path.join('/Applications', appBundleName)

console.log(`Installing:\n  ${src}\n→ ${dest}`)

try {
  if (existsSync(dest)) {
    rmSync(dest, { recursive: true, force: true })
  }
  execFileSync('ditto', [src, dest], { stdio: 'inherit' })
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err)
  console.error(msg)
  const code = err && typeof err === 'object' && 'code' in err ? err.code : undefined
  if (code === 'EACCES') {
    console.error(
      '\nPermission denied writing to /Applications. Re-run with:\n  sudo npm run install:mac\n',
    )
  }
  process.exit(1)
}

console.log('Done. You can launch Screen Record from Applications.')
