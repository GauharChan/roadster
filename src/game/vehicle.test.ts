import { describe, expect, it } from 'vitest'
import type { ControlInput, VehicleState } from './vehicle'
import { carUp, createVehicle, stepVehicle } from './vehicle'

const IDLE: ControlInput = { throttle: 0, steer: 0, thrust: false, flip: false }
const GAS: ControlInput = { ...IDLE, throttle: 1 }

function run(state: VehicleState, input: ControlInput, seconds: number, dt = 1 / 60): void {
  const steps = Math.round(seconds / dt)
  for (let step = 0; step < steps; step += 1) stepVehicle(state, input, dt)
}

describe('stepVehicle', () => {
  it('油门会把车推向坡道', () => {
    const state = createVehicle()
    const startZ = state.z
    run(state, GAS, 1)
    expect(state.mode).toBe('ground')
    expect(state.speed).toBeGreaterThan(10)
    expect(state.z).toBeLessThan(startZ)
  })

  it('对准入口会贴上环坡', () => {
    const state = createVehicle()
    state.z = 0.5
    state.speed = 20
    stepVehicle(state, IDLE, 1 / 60)
    expect(state.mode).toBe('ramp')
    expect(state.rampTheta).toBeGreaterThan(0)
  })

  it('坡上速度不够会往回滑', () => {
    const state = createVehicle()
    state.mode = 'ramp'
    state.rampTheta = 1.2
    state.speed = 2
    const before = state.rampTheta
    run(state, IDLE, 0.6)
    expect(state.mode).toBe('ramp')
    expect(state.rampTheta).toBeLessThan(before)
  })

  it('倒出坡道口回到地面', () => {
    const state = createVehicle()
    state.mode = 'ramp'
    state.rampTheta = 0.05
    state.speed = -6
    run(state, IDLE, 0.5)
    expect(state.mode).toBe('ground')
    expect(state.z).toBeGreaterThan(0)
  })

  it('从路面加速可以冲出坡唇并带向上的速度', () => {
    const state = createVehicle()
    let launched = false
    for (let step = 0; step < 60 * 12; step += 1) {
      stepVehicle(state, GAS, 1 / 60)
      if (state.mode === 'air' && state.leftRamp) {
        launched = true
        expect(state.vy).toBeGreaterThan(0)
        break
      }
    }
    expect(launched).toBe(true)
  })

  it('地面按推进会离地，且不算离坡', () => {
    const state = createVehicle()
    stepVehicle(state, { ...IDLE, thrust: true }, 1 / 60)
    expect(state.mode).toBe('air')
    expect(state.leftRamp).toBe(false)
    expect(state.vy).toBeGreaterThan(8)
  })

  it('空中翻转一整圈后记为完成旋转', () => {
    const state = createVehicle()
    state.mode = 'air'
    state.y = 40
    state.vy = 8
    stepVehicle(state, { ...IDLE, flip: true }, 1 / 60)
    expect(state.rollTime).toBeGreaterThan(0)
    run(state, IDLE, 1)
    expect(state.didRoll).toBe(true)
    expect(state.mode).toBe('air')
    expect(carUp(state).y).toBeGreaterThan(0.8)
  })

  it('按住推进会把倒扣的车逐渐扶正', () => {
    const state = createVehicle()
    state.mode = 'air'
    state.y = 60
    state.vy = 10
    state.qz = 1
    state.qw = 0
    expect(carUp(state).y).toBeCloseTo(-1)
    run(state, { ...IDLE, thrust: true }, 0.5)
    expect(state.mode).toBe('air')
    expect(carUp(state).y).toBeGreaterThan(-0.6)
  })

  it('离坡、翻转、放平落地算完成一轮', () => {
    const state = createVehicle()
    state.mode = 'air'
    state.leftRamp = true
    state.didRoll = true
    state.y = 0.04
    state.vy = -4
    stepVehicle(state, IDLE, 1 / 60)
    expect(state.mode).toBe('ground')
    expect(state.stuntDone).toBe(true)
    expect(state.y).toBe(0)
    expect(state.event).toBe('land')
  })

  it('倒扣落地会被扶正，并且不算完成', () => {
    const state = createVehicle()
    state.mode = 'air'
    state.leftRamp = true
    state.didRoll = true
    state.y = 0.04
    state.vy = -4
    state.qz = 1
    state.qw = 0
    stepVehicle(state, IDLE, 1 / 60)
    expect(state.mode).toBe('ground')
    expect(state.stuntDone).toBe(false)
    expect(state.event).toBe('recover')
    expect(carUp(state).y).toBeGreaterThan(0.9)
  })

  it('落得太猛即使车身放平也不算完成', () => {
    const state = createVehicle()
    state.mode = 'air'
    state.leftRamp = true
    state.didRoll = true
    state.y = 0.04
    state.vy = -40
    stepVehicle(state, IDLE, 1 / 60)
    expect(state.mode).toBe('ground')
    expect(state.stuntDone).toBe(false)
    expect(state.event).toBe('recover')
  })
})
