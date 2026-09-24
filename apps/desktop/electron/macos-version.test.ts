import { describe, expect, it } from 'vitest'
import { ensureSupportedMacOs, parseMacOsMajor } from './macos-version'

describe('parseMacOsMajor', () => {
  it('reads the major version from Electron system version strings', () => {
    expect(parseMacOsMajor('14.5')).toBe(14)
    expect(parseMacOsMajor('13.6.4')).toBe(13)
    expect(parseMacOsMajor('10.15.7')).toBe(10)
  })

  it('returns null for empty or non-numeric majors', () => {
    expect(parseMacOsMajor('')).toBeNull()
    expect(parseMacOsMajor('..')).toBeNull()
    expect(parseMacOsMajor('abc.1')).toBeNull()
  })
})

describe('ensureSupportedMacOs', () => {
  it('rejects non-macOS platforms', () => {
    expect(ensureSupportedMacOs('win32', '10.0')).toEqual({
      ok: false,
      error: 'Screen recording is only supported on macOS.',
    })
  })

  it('rejects macOS versions below 13', () => {
    const result = ensureSupportedMacOs('darwin', '12.7.1')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain('macOS 13+')
      expect(result.error).toContain('12.7.1')
    }
  })

  it('accepts macOS 13 and newer', () => {
    expect(ensureSupportedMacOs('darwin', '13.0')).toEqual({ ok: true })
    expect(ensureSupportedMacOs('darwin', '15.1.2')).toEqual({ ok: true })
  })
})
