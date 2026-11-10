import { describe, expect, it } from 'vitest'
import { createVehicle } from './vehicle'
import {
  FIELD_HOME,
  VIEW_FOV_DEG,
  frameFlightCamera,
  placeHorizonGuide,
  placeReturnCue,
  type FlightFrame,
} from './flightFrame'

function pitchAboveHorizon(frame: FlightFrame): number {
  const dx = frame.lookX - frame.cameraX
  const dy = frame.lookY - frame.cameraY
  const dz = frame.lookZ - frame.cameraZ
  return (Math.atan2(dy, Math.hypot(dx, dz)) * 180) / Math.PI
}

function angleBetween(
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
): number {
  const al = Math.hypot(ax, ay, az) || 1
  const bl = Math.hypot(bx, by, bz) || 1
  const cos = Math.min(1, Math.max(-1, (ax * bx + ay * by + az * bz) / (al * bl)))
  return (Math.acos(cos) * 180) / Math.PI
}

function viewBasis(frame: FlightFrame) {
  const fx = frame.lookX - frame.cameraX
  const fy = frame.lookY - frame.cameraY
  const fz = frame.lookZ - frame.cameraZ
  const fl = Math.hypot(fx, fy, fz) || 1
  const forward = { x: fx / fl, y: fy / fl, z: fz / fl }
  const rx = -forward.z
  const rz = forward.x
  const rl = Math.hypot(rx, rz) || 1
  return { forward, right: { x: rx / rl, z: rz / rl } }
}

function cueOffset(frame: FlightFrame, cue: { x: number; y: number; z: number }) {
  const { forward, right } = viewBasis(frame)
  const vx = cue.x - frame.cameraX
  const vy = cue.y - frame.cameraY
  const vz = cue.z - frame.cameraZ
  const along = vx * forward.x + vy * forward.y + vz * forward.z
  return {
    angle: angleBetween(forward.x, forward.y, forward.z, vx, vy, vz),
    lateral: (cue.x - (frame.cameraX + forward.x * along)) * right.x
      + (cue.z - (frame.cameraZ + forward.z * along)) * right.z,
    above: cue.y - (frame.cameraY + forward.y * along),
  }
}

describe('高空飞行参照', () => {
  it('使用 48° 垂直视场，并且不随高度把镜头压到车下方', () => {
    expect(VIEW_FOV_DEG).toBe(48)
    ;[40, 49, 60, 200].forEach((y) => {
      const frame = frameFlightCamera({ x: 10, y, z: -30, headingX: 0, headingZ: -1 })
      expect(Math.abs(pitchAboveHorizon(frame))).toBeLessThan(16)
      expect(frame.cameraY).toBeGreaterThan(y - 1)
      expect(frame.cameraY).toBeLessThan(y + 10)
      expect((10 - frame.cameraX) * 0 + (-30 - frame.cameraZ) * -1).toBeGreaterThan(10)
      expect(Math.hypot(frame.lookX - 10, frame.lookZ + 30)).toBeLessThan(2)
    })
  })

  it('40、49、60 米时地平线参照留在视线附近，高度与镜头相同', () => {
    ;[40, 49, 60].forEach((y) => {
      const frame = frameFlightCamera({ x: 0, y, z: 12, headingX: 0, headingZ: -1 })
      const guide = placeHorizonGuide(
        { x: frame.cameraX, y: frame.cameraY, z: frame.cameraZ },
        { x: frame.lookX, y: frame.lookY, z: frame.lookZ },
      )
      const angle = angleBetween(
        frame.lookX - frame.cameraX,
        frame.lookY - frame.cameraY,
        frame.lookZ - frame.cameraZ,
        guide.x - frame.cameraX,
        guide.y - frame.cameraY,
        guide.z - frame.cameraZ,
      )
      expect(angle).toBeLessThan(18)
      expect(guide.y).toBeCloseTo(frame.cameraY, 5)
    })
  })

  it('场地在右、在左、在身后时，返回标记都在视场内并指向对应一侧', () => {
    const frame = frameFlightCamera({ x: 0, y: 49, z: 0, headingX: 0, headingZ: -1 })
    const camera = { x: frame.cameraX, y: frame.cameraY, z: frame.cameraZ }
    const look = { x: frame.lookX, y: frame.lookY, z: frame.lookZ }
    const right = placeReturnCue({ camera, look, carX: 0, carZ: 0, homeX: 40, homeZ: 0 })
    const left = placeReturnCue({ camera, look, carX: 0, carZ: 0, homeX: -40, homeZ: 0 })
    const behind = placeReturnCue({ camera, look, carX: 0, carZ: 0, homeX: 0, homeZ: 48 })
    expect(cueOffset(frame, right).angle).toBeLessThan(18)
    expect(cueOffset(frame, left).angle).toBeLessThan(18)
    expect(cueOffset(frame, behind).angle).toBeLessThan(18)
    expect(cueOffset(frame, right).lateral).toBeGreaterThan(0.4)
    expect(cueOffset(frame, left).lateral).toBeLessThan(-0.4)
    expect(cueOffset(frame, behind).above).toBeLessThan(-0.4)
    expect((right.aimX - right.x) * 40 + (right.aimZ - right.z) * 0).toBeGreaterThan(0)
    expect((left.aimX - left.x) * -40 + (left.aimZ - left.z) * 0).toBeGreaterThan(0)
  })

  it('返回标记的场地原点就是重新开始时的车位', () => {
    const spawned = createVehicle()
    expect(FIELD_HOME.x).toBe(spawned.x)
    expect(FIELD_HOME.z).toBe(spawned.z)
  })
})
