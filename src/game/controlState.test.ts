import { describe, expect, it } from 'vitest'
import { classifyKeyTarget, createControlState } from './controlState'

describe('按键释放', () => {
  it('松开记录后必须重新按下才会喷气', () => {
    const control = createControlState()
    control.keyDown('Space', 'other')
    expect(control.sample().thrust).toBe(true)
    control.releaseStuckInputs()
    expect(control.sample().thrust).toBe(false)
    expect(control.sample().thrust).toBe(false)
    control.keyDown('Space', 'other')
    expect(control.sample().thrust).toBe(true)
  })

  it('触控按住的推进也会在释放记录后停下', () => {
    const control = createControlState()
    control.setThrust(true)
    expect(control.sample().thrust).toBe(true)
    control.releaseStuckInputs()
    expect(control.sample().thrust).toBe(false)
  })

  it('重置按钮聚焦时 R 仍会重置，空格不会变成喷气', () => {
    const control = createControlState()
    control.keyDown('KeyR', 'reset-button')
    const first = control.sample()
    expect(first.reset).toBe(true)
    expect(first.thrust).toBe(false)
    expect(control.sample().reset).toBe(false)

    control.keyDown('Space', 'reset-button')
    expect(control.sample().thrust).toBe(false)

    control.keyDown('KeyR', 'button', true)
    expect(control.sample().reset).toBe(false)
    control.keyDown('KeyR', 'button')
    expect(control.sample().reset).toBe(true)
  })

  it('普通焦点下油门、翻转和转向仍可用', () => {
    const control = createControlState()
    control.keyDown('KeyW', 'other')
    control.keyDown('KeyD', 'other')
    control.keyDown('KeyF', 'other')
    const frame = control.sample()
    expect(frame.throttle).toBe(1)
    expect(frame.steer).toBe(1)
    expect(frame.flip).toBe(true)
    expect(control.sample().flip).toBe(false)
    control.keyUp('KeyW')
    expect(control.sample().throttle).toBe(0)
  })

  it('重置按钮和普通按钮能区分', () => {
    expect(classifyKeyTarget(null)).toBe('other')
    expect(classifyKeyTarget({ tagName: 'BODY' })).toBe('other')
    expect(classifyKeyTarget({ tagName: 'BUTTON' })).toBe('button')
    expect(classifyKeyTarget({ tagName: 'BUTTON', dataset: { action: 'reset' } })).toBe('reset-button')
  })
})
