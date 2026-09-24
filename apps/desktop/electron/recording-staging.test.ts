import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { isPathInsideRecordingStagingDir, recordingStagingDir } from './recording-staging'

describe('recordingStagingDir', () => {
  it('lives under the OS temp directory', () => {
    expect(recordingStagingDir()).toMatch(/screen-record$/)
  })
})

describe('isPathInsideRecordingStagingDir', () => {
  const root = recordingStagingDir()

  it('accepts the staging root and files inside it', () => {
    expect(isPathInsideRecordingStagingDir(root)).toBe(true)
    expect(isPathInsideRecordingStagingDir(path.join(root, 'recording_test.mp4'))).toBe(true)
  })

  it('rejects paths outside the staging directory', () => {
    expect(isPathInsideRecordingStagingDir('/tmp/other-app/recording.mp4')).toBe(false)
    expect(isPathInsideRecordingStagingDir('/etc/passwd')).toBe(false)
  })

  it('rejects sibling paths that share a prefix', () => {
    expect(isPathInsideRecordingStagingDir(`${root}-backup`)).toBe(false)
  })
})
