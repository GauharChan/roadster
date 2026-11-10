import { onMounted, onUnmounted } from 'vue'
import type { ControlInput } from '../game/vehicle'

export interface FrameInput extends ControlInput {
  reset: boolean
}

export interface InputBinding {
  sample: () => FrameInput
  setAccel: (down: boolean) => void
  setBrake: (down: boolean) => void
  setSteer: (value: number) => void
  setThrust: (down: boolean) => void
  requestFlip: () => void
  requestReset: () => void
}

export function useInput(): InputBinding {
  const keys = new Set<string>()
  const touch = { accel: false, brake: false, steer: 0, thrust: false }
  const edges = { flip: false, reset: false }

  const onKeyDown = (event: KeyboardEvent) => {
    if (isButtonTarget(event)) return
    if (event.code === 'Space' || event.code.startsWith('Arrow')) event.preventDefault()
    if (event.repeat) {
      keys.add(event.code)
      return
    }
    keys.add(event.code)
    if (event.code === 'KeyF') edges.flip = true
    if (event.code === 'KeyR') edges.reset = true
  }

  const onKeyUp = (event: KeyboardEvent) => {
    keys.delete(event.code)
  }

  onMounted(() => {
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
  })
  onUnmounted(() => {
    window.removeEventListener('keydown', onKeyDown)
    window.removeEventListener('keyup', onKeyUp)
  })

  return {
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
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function isButtonTarget(event: KeyboardEvent): boolean {
  const target = event.target
  return target instanceof HTMLElement && target.tagName === 'BUTTON'
}
