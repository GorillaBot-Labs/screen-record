import { describe, expect, it } from 'vitest'
import { recordingElapsedSeconds } from './recording-duration'

describe('recordingElapsedSeconds', () => {
  it('subtracts paused time from elapsed duration', () => {
    expect(
      recordingElapsedSeconds({
        startedAtMs: 0,
        endedAtMs: 65_000,
        pausedTotalMs: 15_000,
      }),
    ).toBe(50)
  })

  it('includes an active pause interval in the elapsed duration', () => {
    expect(
      recordingElapsedSeconds({
        startedAtMs: 0,
        endedAtMs: 40_000,
        pausedAtMs: 30_000,
      }),
    ).toBe(30)
  })

  it('combines accumulated and active pause time', () => {
    expect(
      recordingElapsedSeconds({
        startedAtMs: 1_000,
        endedAtMs: 91_000,
        pausedTotalMs: 10_000,
        pausedAtMs: 81_000,
      }),
    ).toBe(70)
  })

  it('never returns a negative duration', () => {
    expect(
      recordingElapsedSeconds({
        startedAtMs: 10_000,
        endedAtMs: 5_000,
      }),
    ).toBe(0)
  })

  it('rounds to one decimal place', () => {
    expect(
      recordingElapsedSeconds({
        startedAtMs: 0,
        endedAtMs: 1_550,
      }),
    ).toBe(1.6)
  })
})
