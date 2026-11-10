import { describe, expect, it } from 'vitest'
import { createVehicle } from './vehicle'
import {
  FIELD_HOME,
  HINT_COLOR,
  VIEW_FOV_DEG,
  courseMarkers,
  frameFlightCamera,
  courseHintLayout,
  fitCourseHint,
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

  it('赛道在下方时，箭头沿底边放到说明右侧空档的中点', () => {
    const viewport = { width: 1000, height: 600 }
    const help = { left: 14, top: 500, right: 280, bottom: 586 }
    const title = { left: 18, top: 18, right: 260, bottom: 220 }
    const reset = { left: 900, top: 16, right: 972, bottom: 52 }
    const raw = { x: 50, y: 92, angle: 180 }
    const fitted = fitCourseHint(raw, viewport, { help, title, reset }, { width: 88, height: 20 })
    const center = fitted.x / 100 * viewport.width
    const leftLimit = help.right + 12 + 44
    const rightLimit = viewport.width - viewport.width * 0.08 - 44
    expect(fitted.y).toBeCloseTo(92, 5)
    expect(fitted.angle).toBe(180)
    expect(center).toBeCloseTo((leftLimit + rightLimit) / 2, 3)
    const box = {
      left: center - 44,
      right: center + 44,
      top: (fitted.y / 100) * viewport.height - 10,
      bottom: (fitted.y / 100) * viewport.height + 10,
    }
    expect(box.left).toBeGreaterThan(help.right)
    expect(box.right).toBeLessThan(viewport.width)
    expect(box.bottom).toBeLessThanOrEqual(viewport.height)
    expect(box.left < title.right && box.right > title.left && box.top < title.bottom).toBe(false)
    expect(box.left < reset.right && box.right > reset.left && box.top < reset.bottom).toBe(false)
  })

  it('上方标题不占底边时，中点只按说明右侧计算', () => {
    const viewport = { width: 1000, height: 600 }
    const help = { left: 14, top: 520, right: 200, bottom: 586 }
    const title = { left: 18, top: 12, right: 420, bottom: 180 }
    const fitted = fitCourseHint(
      { x: 40, y: 92, angle: 175 },
      viewport,
      { help, title },
      { width: 88, height: 20 },
    )
    const leftLimit = help.right + 12 + 44
    const rightLimit = viewport.width - viewport.width * 0.08 - 44
    expect(fitted.x / 100 * viewport.width).toBeCloseTo((leftLimit + rightLimit) / 2, 3)
    expect(fitted.y).toBeCloseTo(92, 5)
  })

  it('贴在右缘且不压说明时，不改到别的位置', () => {
    const raw = { x: 92, y: 48, angle: 90 }
    const fitted = fitCourseHint(
      raw,
      { width: 1280, height: 720 },
      { help: { left: 14, top: 640, right: 240, bottom: 706 } },
    )
    expect(fitted).toEqual(raw)
  })
})
