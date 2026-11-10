import { describe, expect, it } from 'vitest'
import { RAMP, sampleRamp } from './ramp'

describe('sampleRamp', () => {
  it('入口是平的，车头朝 -Z', () => {
    const sample = sampleRamp(0, 0)
    expect(sample.y).toBeCloseTo(0)
    expect(sample.z).toBeCloseTo(RAMP.entranceZ)
    expect(sample.ty).toBeCloseTo(0)
    expect(sample.tz).toBeCloseTo(-1)
    expect(sample.uy).toBeCloseTo(1)
    expect(sample.uz).toBeCloseTo(0)
  })

  it('四分之一圈时车身贴着竖直墙', () => {
    const sample = sampleRamp(Math.PI / 2, 0)
    expect(sample.y).toBeCloseTo(RAMP.radius)
    expect(sample.ty).toBeCloseTo(1)
    expect(sample.tz).toBeCloseTo(0, 5)
    expect(sample.uy).toBeCloseTo(0, 5)
    expect(sample.uz).toBeCloseTo(1)
  })

  it('半圈时车顶朝下', () => {
    const sample = sampleRamp(Math.PI, 0)
    expect(sample.uy).toBeCloseTo(-1)
    expect(sample.ty).toBeCloseTo(0, 5)
    expect(sample.tz).toBeCloseTo(1)
  })

  it('横向偏移落在坡面上', () => {
    expect(sampleRamp(0.4, 3).x).toBeCloseTo(RAMP.centerX + 3)
  })
})
