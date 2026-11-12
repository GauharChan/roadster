import type { ControlInput } from './vehicle'

export type TargetKind = 'reset-button' | 'button' | 'other'

export interface FrameInput extends ControlInput {
  reset: boolean
}

export interface ControlState {
  keyDown: (code: string, target: TargetKind, repeat?: boolean) => void
  keyUp: (code: string) => void
  releaseStuckInputs: () => void
  setAccel: (down: boolean) => void
  setBrake: (down: boolean) => void
  setSteer: (value: number) => void
  setThrust: (down: boolean) => void
  requestFlip: () => void
  requestReset: () => void
  sample: () => FrameInput
}

export function classifyKeyTarget(target: {
  tagName?: string
  dataset?: { action?: string }
} | null): TargetKind {
  if (!target || target.tagName !== 'BUTTON') return 'other'
  if (target.dataset?.action === 'reset') return 'reset-button'
  return 'button'
}

export function createControlState(): ControlState {
  const keys = new Set<string>()
  const touch = { accel: false, brake: false, steer: 0, thrust: false }
  const edges = { flip: false, reset: false }

  return {
    keyDown(code, target, repeat = false) {
      if (target !== 'other' && code !== 'KeyR') return
      keys.add(code)
      if (repeat) return
      if (code === 'KeyF') edges.flip = true
      if (code === 'KeyR') edges.reset = true
    },
    keyUp(code) {
      keys.delete(code)
    },
    releaseStuckInputs() {
      keys.clear()
      touch.accel = false
      touch.brake = false
      touch.steer = 0
      touch.thrust = false
    },
    setAccel(down) {
      touch.accel = down
    },
    setBrake(down) {
      touch.brake = down
    },
    setSteer(value) {
      touch.steer = clamp(value, -1, 1)
    },
    setThrust(down) {
      touch.thrust = down
    },
    requestFlip() {
      edges.flip = true
    },
    requestReset() {
      edges.reset = true
    },
    sample() {
      const throttle = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0)
        + (keys.has('KeyS') || keys.has('ArrowDown') ? -1 : 0)
        + (touch.accel ? 1 : 0)
        + (touch.brake ? -1 : 0)
      const steer = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0)
        + (keys.has('KeyA') || keys.has('ArrowLeft') ? -1 : 0)
        + touch.steer
      const input: FrameInput = {
        throttle: clamp(throttle, -1, 1),
        steer: clamp(steer, -1, 1),
        thrust: keys.has('Space') || touch.thrust,
        flip: edges.flip,
        reset: edges.reset,
      }
      edges.flip = false
      edges.reset = false
      return input
    },
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}
