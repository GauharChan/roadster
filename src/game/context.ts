import type { InjectionKey } from 'vue'
import type { DriveMode } from './vehicle'

export interface GameHudState {
  speedKmh: number
  altitude: number
  mode: DriveMode
  stuntDone: boolean
}

export interface GameController {
  hud: GameHudState
  setAccel: (down: boolean) => void
  setBrake: (down: boolean) => void
  setSteer: (value: number) => void
  setThrust: (down: boolean) => void
  requestFlip: () => void
  requestReset: () => void
}

export const gameKey: InjectionKey<GameController> = Symbol('roadster')
