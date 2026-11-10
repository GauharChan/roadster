import type { InjectionKey } from 'vue'
import type { NoticeKind } from './hudCue'
import type { DriveMode } from './vehicle'

export interface CourseHintState {
  x: number
  y: number
  angle: number
}

export interface GameHudState {
  speedKmh: number
  altitude: number
  climb: string
  mode: DriveMode
  stuntDone: boolean
  notice: string
  noticeKind: NoticeKind
  courseHint: CourseHintState | null
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
