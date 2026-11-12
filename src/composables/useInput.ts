import { onMounted, onUnmounted } from 'vue'
import { classifyKeyTarget, createControlState, type FrameInput } from '../game/controlState'

export type { FrameInput }

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
  const control = createControlState()

  const onKeyDown = (event: KeyboardEvent) => {
    const target = event.target instanceof HTMLElement ? classifyKeyTarget(event.target) : 'other'
    if (target !== 'other' && event.code !== 'KeyR') return
    if (event.code === 'Space' || event.code.startsWith('Arrow')) event.preventDefault()
    control.keyDown(event.code, target, event.repeat)
  }

  const onKeyUp = (event: KeyboardEvent) => {
    control.keyUp(event.code)
  }

  const onBlur = () => {
    control.releaseStuckInputs()
  }

  const onVisibility = () => {
    if (document.hidden) control.releaseStuckInputs()
  }

  onMounted(() => {
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onBlur)
    document.addEventListener('visibilitychange', onVisibility)
  })
  onUnmounted(() => {
    window.removeEventListener('keydown', onKeyDown)
    window.removeEventListener('keyup', onKeyUp)
    window.removeEventListener('blur', onBlur)
    document.removeEventListener('visibilitychange', onVisibility)
  })

  return {
    sample: () => control.sample(),
    setAccel: control.setAccel,
    setBrake: control.setBrake,
    setSteer: control.setSteer,
    setThrust: control.setThrust,
    requestFlip: control.requestFlip,
    requestReset: control.requestReset,
  }
}
