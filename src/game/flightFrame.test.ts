import { describe, expect, it } from 'vitest'
import { createVehicle } from './vehicle'
import {
  FIELD_HOME,
  HINT_COLOR,
  VIEW_FOV_DEG,
  courseMarkers,
  frameFlightCamera,
  courseHintLayout,
  isCourseInView,
  isPointInView,
  type FlightFrame,
} from './flightFrame'

function pitchAboveHorizon(frame: FlightFrame): number {
  const dx = frame.lookX - frame.cameraX
  const dy = frame.lookY - frame.cameraY
  const dz = frame.lookZ - frame.cameraZ
  return (Math.atan2(dy, Math.hypot(dx, dz)) * 180) / Math.PI
}

describe('朝前的稳定取景', () => {
  it('40、49、60 米仍看向前方，视线不随高度仰起', () => {
    expect(VIEW_FOV_DEG).toBe(48)
    ;[40, 49, 60, 200].forEach((y) => {
      const frame = frameFlightCamera({ x: 10, y, z: -30, headingX: 0, headingZ: -1 })
      expect(Math.abs(pitchAboveHorizon(frame))).toBeLessThan(14)
      expect(frame.cameraY).toBeGreaterThan(y)
      expect(frame.cameraY).toBeLessThan(y + 8)
      expect((-30 - frame.cameraZ) * -1).toBeGreaterThan(6)
      expect((frame.lookZ - -30) * -1).toBeGreaterThan(4)
    })
  })

  it('重新开始的车位仍在赛道采样附近', () => {
    const spawned = createVehicle()
    expect(spawned.x).toBe(FIELD_HOME.x)
    expect(spawned.z).toBe(FIELD_HOME.z)
    expect(courseMarkers().some((marker) => Math.abs(marker.z - spawned.z) < 8)).toBe(true)
  })
})

describe('赛道离开画面才提示', () => {
  it('正前方的赛道点算在画面内，身后的不算', () => {
    const camera = { x: 0, y: 6, z: 20 }
    const look = { x: 0, y: 5, z: -10 }
    expect(isPointInView(camera, look, { x: 0, y: 0.4, z: 0 })).toBe(true)
    expect(isPointInView(camera, look, { x: 0, y: 0.4, z: 40 })).toBe(false)
  })

  it('赛道还在前方时不放标记，转回来也继续隐藏', () => {
    const visible = { camera: { x: 0, y: 8, z: 30 }, look: { x: 0, y: 6, z: -4 } }
    const away = { camera: { x: 0, y: 50, z: -80 }, look: { x: 0, y: 49, z: -96 } }
    expect(isCourseInView(visible.camera, visible.look)).toBe(true)
    expect(courseHintLayout(visible.camera, visible.look)).toBeNull()
    expect(courseHintLayout(away.camera, away.look)).not.toBeNull()
    expect(courseHintLayout(visible.camera, visible.look)).toBeNull()
  })

  it('赛道在画面外时，提示贴边且不在中央', () => {
    const camera = { x: 0, y: 50, z: -80 }
    const look = { x: 0, y: 49, z: -96 }
    const hint = courseHintLayout(camera, look)
    expect(isCourseInView(camera, look)).toBe(false)
    expect(hint).not.toBeNull()
    const edge = Math.min(hint?.x ?? 50, 100 - (hint?.x ?? 50), hint?.y ?? 50, 100 - (hint?.y ?? 50))
    const fromCenter = Math.hypot((hint?.x ?? 50) - 50, (hint?.y ?? 50) - 50)
    expect(edge).toBeLessThan(18)
    expect(fromCenter).toBeGreaterThan(30)
    expect(HINT_COLOR.toLowerCase()).toBe('#d7dde4')
  })

  it('赛道在画面右侧外面时，提示贴右缘并朝右', () => {
    const camera = { x: 0, y: 6, z: 0 }
    const look = { x: 0, y: 6, z: -20 }
    const markers = [{ x: 50, y: 1, z: -8 }]
    expect(isPointInView(camera, look, markers[0])).toBe(false)
    const hint = courseHintLayout(camera, look, markers)
    expect(hint).not.toBeNull()
    expect(hint?.x ?? 0).toBeGreaterThan(88)
    expect(Math.hypot((hint?.x ?? 50) - 50, (hint?.y ?? 50) - 50)).toBeGreaterThan(30)
    expect(hint?.angle ?? 0).toBeGreaterThan(45)
    expect(hint?.angle ?? 180).toBeLessThan(150)
  })
})
