import { describe, expect, it } from 'vitest'
import { PerspectiveCamera, Quaternion, Vector3 } from 'three'
import { createPilot } from '../../scripts/flightPilot'
import { createVehicle, stepVehicle, type VehicleState } from './vehicle'
import { sampleRamp } from './ramp'
import {
  FIELD_HOME,
  HINT_COLOR,
  VIEW_FOV_DEG,
  courseMarkers,
  carBodyInSafeInset,
  carBodyNdc,
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
      expect(Math.min(gap, 360 - gap)).toBeLessThan(30)
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

describe('滞后上限和安全区', () => {
  const aspect = 1280 / 720

  function lagFromRest(frame: FlightFrame, car: { x: number; y: number; z: number }): number {
    const rest = frameCourseCamera(car)
    return Math.hypot(frame.cameraX - rest.cameraX, frame.cameraY - rest.cameraY, frame.cameraZ - rest.cameraZ)
  }

  function yawGap(a: number, b: number): number {
    const gap = Math.abs(a - b)
    return Math.min(gap, 360 - gap)
  }

  function poseOf(state: VehicleState) {
    return {
      x: state.x,
      y: state.y,
      z: state.z,
      qx: state.qx,
      qy: state.qy,
      qz: state.qz,
      qw: state.qw,
    }
  }

  it('单帧把超过 8 米的落后夹回目标机位，沿路不远于 20 米、不近于 8 米', () => {
    const car = { x: 2, y: 6, z: -10, qx: 0, qy: 1, qz: 0, qw: 0 }
    const rest = frameCourseCamera(car)
    const frame = followCamera({
      ...car,
      cameraX: rest.cameraX + 4,
      cameraY: rest.cameraY - 9,
      cameraZ: rest.cameraZ + 23,
      dt: 0.016,
      aspect,
    })
    expect(lagFromRest(frame, car)).toBeLessThanOrEqual(8 + 1e-6)
    expect(frame.cameraZ).toBeLessThanOrEqual(car.z + 20 + 1e-6)
    expect(frame.cameraZ).toBeGreaterThanOrEqual(car.z + 8 - 1e-6)
    expect(frame.cameraY).toBeGreaterThanOrEqual(car.y - 5.5 - 1e-6)
    expect(Math.abs(frame.cameraX - car.x)).toBeLessThanOrEqual(3.4 + 6 + 1e-6)
    expect(carBodyInSafeInset(frame, car, VIEW_FOV_DEG, aspect)).toBe(true)
  })

  it('贴得太近时仍停在车后 8 米', () => {
    const car = { x: 0, y: 0, z: 30 }
    const frame = followCamera({
      ...car,
      cameraX: 3.4,
      cameraY: 3.2,
      cameraZ: car.z + 2,
      dt: 0.016,
      snap: true,
    })
    expect(frame.cameraZ).toBeGreaterThanOrEqual(car.z + 8 - 1e-6)
    expect(lagFromRest(frame, car)).toBeLessThanOrEqual(8 + 1e-6)
  })

  it('倒车、车头调头时水平朝向仍锁在道路前方，单帧变化小于 30 度', () => {
    const car = createVehicle()
    let camera = { x: car.x + 3.4, y: car.y + 3.2, z: car.z + 12 }
    const yaws: number[] = []
    const samples = [
      { ...poseOf(car), note: 'start' },
      { x: 6, y: 0, z: 36, qx: 0, qy: 0.7, qz: 0, qw: 0.7 },
      { x: 6, y: 0, z: 48, qx: 0, qy: 0, qz: 0, qw: 1 },
      { x: -4, y: 1, z: 55, qx: 0, qy: 0, qz: 0, qw: 1 },
      { x: 0, y: 18, z: -12, qx: car.qx, qy: car.qy, qz: car.qz, qw: car.qw },
    ]
    samples.forEach((sample) => {
      const frame = followCamera({
        ...sample,
        cameraX: camera.x,
        cameraY: camera.y,
        cameraZ: camera.z,
        dt: 0.033,
        aspect,
      })
      yaws.push(cameraYaw(frame))
      expect(frame.lookZ).toBeLessThan(frame.cameraZ)
      expect(carBodyInSafeInset(frame, sample, VIEW_FOV_DEG, aspect)).toBe(true)
      camera = { x: frame.cameraX, y: frame.cameraY, z: frame.cameraZ }
    })
    yaws.slice(1).forEach((yaw, index) => {
      expect(yawGap(yaw, yaws[index] ?? yaw)).toBeLessThan(30)
    })
    yaws.forEach((yaw) => {
      expect(yawGap(yaw, yaws[0] ?? yaw)).toBeLessThan(0.05)
      expect(Math.abs(yaw)).toBeLessThan(25)
    })
    expect(yaws[0] ?? 0).toBeLessThan(0)
  })

  it('极端落后时当帧只收机位，水平朝向不变', () => {
    const car = { x: 0, y: 4, z: 10, qx: 0, qy: 1, qz: 0, qw: 0 }
    const before = followCamera({
      ...car,
      cameraX: car.x + 9.4,
      cameraY: car.y + 3.2,
      cameraZ: car.z + 8,
      dt: 0.001,
      aspect,
    })
    const held = followCamera({
      ...car,
      cameraX: before.cameraX,
      cameraY: before.cameraY,
      cameraZ: before.cameraZ,
      dt: 0.001,
      aspect,
    })
    expect(yawGap(cameraYaw(before), cameraYaw(held))).toBeLessThan(0.05)
    expect(carBodyInSafeInset(before, car, VIEW_FOV_DEG, aspect)).toBe(true)
    const rest = frameCourseCamera(car)
    const raw = Math.hypot(9.4 - rest.cameraX, 0, (car.z + 8) - rest.cameraZ)
    const used = lagFromRest(before, car)
    if (raw > 0.5) expect(used).toBeLessThan(raw - 0.05)
  })

  it('车身投影与 three.js 透视相机一致', () => {
    const state = createVehicle()
    const frame = followCamera({
      ...poseOf(state),
      cameraX: 8,
      cameraY: 7,
      cameraZ: 70,
      dt: 0.016,
      aspect,
    })
    const camera = new PerspectiveCamera(VIEW_FOV_DEG, aspect, 0.1, 500)
    camera.position.set(frame.cameraX, frame.cameraY, frame.cameraZ)
    camera.up.set(0, 1, 0)
    camera.lookAt(frame.lookX, frame.lookY, frame.lookZ)
    camera.updateProjectionMatrix()
    camera.updateMatrixWorld(true)
    const quat = new Quaternion(state.qx, state.qy, state.qz, state.qw)
    const locals = [
      [-0.93, 0, -2.25],
      [-0.93, 0, 2.39],
      [-0.93, 1.17, -2.25],
      [-0.93, 1.17, 2.39],
      [0.96, 0, -2.25],
      [0.96, 0, 2.39],
      [0.96, 1.17, -2.25],
      [0.96, 1.17, 2.39],
    ]
    const ndc = carBodyNdc(frame, state, VIEW_FOV_DEG, aspect)
    locals.forEach((local, index) => {
      const world = new Vector3(local[0], local[1], local[2]).applyQuaternion(quat).add(new Vector3(state.x, state.y, state.z))
      const projected = world.project(camera)
      expect(ndc[index]?.x).toBeCloseTo(projected.x, 4)
      expect(ndc[index]?.y).toBeCloseTo(projected.y, 4)
    })
  })

  it('高速冲坡和喷气起飞时车身留在 10% 安全区，朝向不硬切', () => {
    const state = createVehicle()
    const pilot = createPilot()
    let camera = { x: state.x + 3.4, y: 4, z: state.z + 18 }
    const dt = 1 / 60
    let elapsed = 0
    let yawPrev: number | null = null
    let maxYawGap = 0
    let maxLag = 0
    let sawFastRamp = false
    let sawThrust = false
    let maxAbsNdc = 0
    let maxRampSpeed = 0
    let landed = false
    let sawReverse = false
    let reachedRamp = false
    const summary: string[] = []

    Array.from({ length: Math.round(45 / dt) }, () => 0).forEach(() => {
      const input = pilot(state, elapsed)
      stepVehicle(state, input, dt)
      const frame = followCamera({
        ...poseOf(state),
        cameraX: camera.x,
        cameraY: camera.y,
        cameraZ: camera.z,
        dt,
        fovDeg: VIEW_FOV_DEG,
        aspect,
      })
      const yaw = cameraYaw(frame)
      if (yawPrev !== null) maxYawGap = Math.max(maxYawGap, yawGap(yaw, yawPrev))
      yawPrev = yaw
      maxLag = Math.max(maxLag, lagFromRest(frame, state))
      const ndc = carBodyNdc(frame, state, VIEW_FOV_DEG, aspect)
      ndc.forEach((corner) => {
        maxAbsNdc = Math.max(maxAbsNdc, Math.abs(corner.x), Math.abs(corner.y))
      })
      const speed = Math.hypot(state.vx, state.vy, state.vz)
      if (state.mode === 'ground' && state.vz > 2 && !reachedRamp) sawReverse = true
      if (state.mode === 'ramp' || state.mode === 'air') reachedRamp = true
      if (state.mode === 'ramp') maxRampSpeed = Math.max(maxRampSpeed, speed)
      if (state.mode === 'ramp' && speed >= 39) sawFastRamp = true
      if (state.mode === 'air' && input.thrust && state.y > 8) sawThrust = true
      if (state.mode === 'ground' && state.y <= 0.05 && elapsed > 5 && (state.event === 'land' || state.event === 'recover')) {
        landed = true
      }
      if (maxYawGap >= 30 || maxLag > 8.01 || !carBodyInSafeInset(frame, state, VIEW_FOV_DEG, aspect)) {
        summary.push(`${elapsed.toFixed(2)}s mode=${state.mode} y=${state.y.toFixed(1)} lag=${maxLag.toFixed(2)} yawΔ=${maxYawGap.toFixed(2)} ndc=${maxAbsNdc.toFixed(3)}`)
      }
      camera = { x: frame.cameraX, y: frame.cameraY, z: frame.cameraZ }
      elapsed += dt
    })

    expect(summary, summary.join('\n')).toEqual([])
    expect(sawReverse, '倒车发生在上坡之前').toBe(true)
    expect(sawFastRamp, `ramp speed ${maxRampSpeed.toFixed(1)}`).toBe(true)
    expect(sawThrust).toBe(true)
    expect(landed, `mode=${state.mode} y=${state.y.toFixed(1)} vy=${state.vy.toFixed(1)} t=${elapsed.toFixed(1)}`).toBe(true)
    expect(maxYawGap).toBeLessThan(30)
    expect(maxLag).toBeLessThanOrEqual(8 + 1e-6)
    expect(maxAbsNdc).toBeLessThanOrEqual(0.8 + 1e-4)
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
