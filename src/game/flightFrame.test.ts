import { describe, expect, it } from 'vitest'
import { createVehicle } from './vehicle'
import { sampleRamp } from './ramp'
import {
  FIELD_HOME,
  HINT_COLOR,
  VIEW_FOV_DEG,
  courseMarkers,
  followCamera,
  frameCourseCamera,
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

function viewFrom(frame: FlightFrame): { camera: { x: number; y: number; z: number }; look: { x: number; y: number; z: number } } {
  return {
    camera: { x: frame.cameraX, y: frame.cameraY, z: frame.cameraZ },
    look: { x: frame.lookX, y: frame.lookY, z: frame.lookZ },
  }
}

function cameraYaw(frame: FlightFrame): number {
  return Math.atan2(frame.lookX - frame.cameraX, -(frame.lookZ - frame.cameraZ)) * 180 / Math.PI
}

describe('一条跟随镜头', () => {
  it('40、49、60 米仍看向前方，视线不随高度仰起', () => {
    expect(VIEW_FOV_DEG).toBe(48)
    ;[40, 49, 60, 200].forEach((y) => {
      const frame = frameCourseCamera({ x: 10, y, z: -30 })
      const seen = viewFrom(frame)
      expect(Math.abs(pitchAboveHorizon(frame))).toBeLessThan(14)
      expect(frame.lookY).toBeLessThan(frame.cameraY)
      expect(frame.cameraY).toBeGreaterThan(y)
      expect(frame.cameraY).toBeLessThan(y + 8)
      expect(frame.lookZ).toBeLessThan(frame.cameraZ)
      expect(isPointInView(seen.camera, seen.look, { x: 10, y: y + 0.6, z: -30 })).toBe(true)
    })
  })

  it('地上转向后车留在画面里，视线不换边', () => {
    const frame = frameCourseCamera({ x: 10, y: 0, z: 36 })
    const seen = viewFrom(frame)
    expect(frame.lookZ).toBeLessThan(frame.cameraZ)
    expect(frame.cameraX).toBeGreaterThan(10)
    expect(isPointInView(seen.camera, seen.look, { x: 10, y: 0.8, z: 36 })).toBe(true)
  })

  it('同一位置重复取景不会把镜头拧到另一边', () => {
    const parked = frameCourseCamera({ x: 1, y: 0, z: 50 })
    const again = frameCourseCamera({ x: 1, y: 0, z: 50 })
    const seen = viewFrom(parked)
    expect(again).toEqual(parked)
    expect(parked.cameraZ).toBeGreaterThan(50)
    expect(parked.lookZ).toBeLessThan(50)
    expect(isPointInView(seen.camera, seen.look, { x: 1, y: 0.8, z: 50 })).toBe(true)
  })

  it('坡顶和下降到约 57 米用的是同一条朝向', () => {
    const crown = frameCourseCamera({ x: 0, y: 23, z: -22 })
    const descent = frameCourseCamera({ x: 0, y: 57, z: 43 })
    const gap = Math.abs(cameraYaw(crown) - cameraYaw(descent))
    expect(Math.min(gap, 360 - gap)).toBeLessThan(20)
    expect(cameraYaw(crown)).toBeCloseTo(cameraYaw(frameCourseCamera({ x: 0, y: 0, z: 48 })), 5)
    expect(isPointInView(viewFrom(crown).camera, viewFrom(crown).look, { x: 0, y: 23.8, z: -22 })).toBe(true)
    expect(isPointInView(viewFrom(descent).camera, viewFrom(descent).look, { x: 0, y: 57.8, z: 43 })).toBe(true)
  })

  it('车突然升高后仍留在画面里，镜头不翻到反方向', () => {
    let camera = { x: 3.4, y: 3.2, z: 60 }
    const steps = [
      { x: 0, y: 0, z: 48 },
      { x: 2, y: 8, z: 20 },
      { x: 0, y: 23, z: -22 },
      { x: 0, y: 40, z: -8 },
      { x: 0, y: 50, z: 16 },
      { x: 4, y: 57, z: 43 },
      { x: 0, y: 0, z: 30 },
    ]
    const yaws: number[] = []
    steps.forEach((step) => {
      const frame = followCamera({ ...step, cameraX: camera.x, cameraY: camera.y, cameraZ: camera.z, dt: 0.033 })
      const seen = viewFrom(frame)
      expect(isPointInView(seen.camera, seen.look, { x: step.x, y: step.y + 0.9, z: step.z })).toBe(true)
      yaws.push(cameraYaw(frame))
      camera = { x: frame.cameraX, y: frame.cameraY, z: frame.cameraZ }
    })
    yaws.slice(1).forEach((yaw, index) => {
      const gap = Math.abs(yaw - (yaws[index] ?? yaw))
      expect(Math.min(gap, 360 - gap)).toBeLessThan(50)
    })
  })

  it('沿坡行驶时镜头不改到相反方向', () => {
    const here = sampleRamp(0.45, 0)
    const further = sampleRamp(1.4, 0)
    const low = frameCourseCamera({ x: here.x, y: here.y, z: here.z })
    const high = frameCourseCamera({ x: further.x, y: further.y, z: further.z })
    const gap = Math.abs(cameraYaw(low) - cameraYaw(high))
    expect(Math.min(gap, 360 - gap)).toBeLessThan(20)
    expect(isPointInView(viewFrom(low).camera, viewFrom(low).look, { x: here.x, y: here.y + 0.7, z: here.z })).toBe(true)
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

  it('贴底前就会压住说明时，第一帧就放到说明右侧', () => {
    const viewport = { width: 1280, height: 720 }
    const help = { left: 14, top: 639.828125, right: 172.671875, bottom: 706 }
    const size = { width: 88, height: 20 }
    const area = (box: { left: number; right: number; top: number; bottom: number }) => {
      const w = Math.min(box.right, help.right) - Math.max(box.left, help.left)
      const h = Math.min(box.bottom, help.bottom) - Math.max(box.top, help.top)
      return w > 0 && h > 0 ? w * h : 0
    }
    const boxOf = (hint: { x: number; y: number }) => {
      const cx = hint.x / 100 * viewport.width
      const cy = hint.y / 100 * viewport.height
      return { left: cx - size.width / 2, right: cx + size.width / 2, top: cy - size.height / 2, bottom: cy + size.height / 2 }
    }
    const samples = [
      { x: 8, y: 86.43689986866855, angle: -130.94 },
      { x: 8, y: 88, angle: -132.5 },
      { x: 8, y: 92, angle: -132.8 },
      { x: 8, y: 89, angle: -133.1 },
      { x: 7.999999999999993, y: 84.98211689903641, angle: -129.79 },
      { x: 8, y: 81.45342711317, angle: -126.83 },
    ]
    const fitted = samples.map((raw) => fitCourseHint(raw, viewport, { help }, size))
    fitted.forEach((hint) => {
      expect(area(boxOf(hint))).toBe(0)
    })
    expect(fitted[0]?.x).toBeCloseTo(8, 1)
    expect(fitted[0]?.y).toBeCloseTo(86.4369, 2)
    expect(fitted[1]?.y).toBeCloseTo(92, 5)
    expect(fitted[1]?.x).toBeCloseTo(53.2137, 2)
    expect(fitted[2]?.x).toBeCloseTo(fitted[1]?.x ?? 0, 5)
    expect(fitted[4]?.x).toBeCloseTo(8, 1)
    expect(fitted[4]?.y).toBeCloseTo(84.9821, 2)
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
