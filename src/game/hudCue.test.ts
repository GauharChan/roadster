import { describe, expect, it } from 'vitest'
import { formatClimb, showMoment, tickMoment } from './hudCue'

describe('升降趋势', () => {
  it('正的竖直速度写成上升，负的写成下降', () => {
    expect(formatClimb(4.2)).toBe('+4 上升')
    expect(formatClimb(1.2)).toBe('+1 上升')
    expect(formatClimb(-4.2)).toBe('-4 下降')
    expect(formatClimb(-1.2)).toBe('-1 下降')
  })

  it('接近 0 时不标成上升或下降', () => {
    expect(formatClimb(0)).toBe('0')
    expect(formatClimb(0.2)).toBe('0')
    expect(formatClimb(-0.2)).toBe('0')
  })
})

describe('着陆与重置反馈', () => {
  it('着陆、硬着陆扶正、手动重置是三句不同的话', () => {
    const land = showMoment('land')
    const recover = showMoment('recover')
    const reset = showMoment('reset')
    expect(land.text).toBe('已着陆')
    expect(recover.text).toBe('硬着陆，已扶正')
    expect(reset.text).toBe('已手动重置')
    expect(new Set([land.text, recover.text, reset.text]).size).toBe(3)
    expect(land.text.includes('传送')).toBe(false)
    expect(land.text.includes('重置')).toBe(false)
    expect(recover.text.includes('扶正')).toBe(true)
    expect(reset.text.includes('重置')).toBe(true)
  })

  it('短时显示后消失，着陆不会自己变成重置', () => {
    let notice = showMoment('land')
    notice = tickMoment(notice, 2.8)
    expect(notice.text).toBe('已着陆')
    expect(notice.kind).toBe('land')
    notice = tickMoment(notice, 0.5)
    expect(notice.text).toBe('')
    expect(notice.kind).toBe('none')
  })
})
