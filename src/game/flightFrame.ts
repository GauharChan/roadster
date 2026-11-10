import { RAMP, sampleRamp } from './ramp'

/** 场景相机的垂直视场。镜头保持世界朝上，不随车身翻滚。 */
export const VIEW_FOV_DEG = 48

/** 手动重置后的车位。方向提示指向赛道，而不是一块常驻标记。 */
export const FIELD_HOME = { x: 0, z: 48 } as const

/** 离开画面时的弱提示。灰白，不是红色。 */
export const HINT_COLOR = '#d7dde4'

export interface FlightFrame {
  cameraX: number
  cameraY: number
  cameraZ: number
  lookX: number
  lookY: number
  lookZ: number
}

export interface Vec3 {
  x: number
  y: number
  z: number
}

const CHASE_BACK = 8
const CHASE_SIDE = 3.2
const CAMERA_LIFT = 2.6
const LOOK_AHEAD = 6
const LOOK_LIFT = 1.1

/**
 * 从侧后方看向前方，车和将要开过的赛道留在同一画面里。
 * 高度只改变机位高低，不把视线仰出地平线，也不限制飞多高。
 */
export function frameFlightCamera(input: {
  x: number
  y: number
  z: number
  headingX: number
  headingZ: number
}): FlightFrame {
  const length = Math.hypot(input.headingX, input.headingZ) || 1
  const forwardX = input.headingX / length
  const forwardZ = input.headingZ / length
  const rightX = -forwardZ
  const rightZ = forwardX
  return {
    cameraX: input.x - forwardX * CHASE_BACK + rightX * CHASE_SIDE,
    cameraY: input.y + CAMERA_LIFT,
    cameraZ: input.z - forwardZ * CHASE_BACK + rightZ * CHASE_SIDE,
    lookX: input.x + forwardX * LOOK_AHEAD,
    lookY: input.y + LOOK_LIFT,
    lookZ: input.z + forwardZ * LOOK_AHEAD,
  }
}

/** 路面中线和环坡中线，供灯带与“赛道是否还在画面里”共用。 */
export function courseMarkers(): Vec3[] {
  const road = Array.from({ length: 16 }, (_, index) => ({
    x: 0,
    y: 0.35,
    z: 84 - index * 6,
  }))
  const ramp = Array.from({ length: 18 }, (_, index) => {
    const sample = sampleRamp((RAMP.launchTheta * index) / 17, 0)
    return {
      x: sample.x,
      y: sample.y + 0.45,
      z: sample.z,
    }
  })
  return [...road, ...ramp]
}

export function isPointInView(
  camera: Vec3,
  look: Vec3,
  point: Vec3,
  fovDeg = VIEW_FOV_DEG,
  aspect = 16 / 9,
): boolean {
  const fx = look.x - camera.x
  const fy = look.y - camera.y
  const fz = look.z - camera.z
  const fl = Math.hypot(fx, fy, fz) || 1
  const forward = { x: fx / fl, y: fy / fl, z: fz / fl }
  const rx = -forward.z
  const rz = forward.x
  const rl = Math.hypot(rx, rz) || 1
  const right = { x: rx / rl, y: 0, z: rz / rl }
  const ux = right.y * forward.z - right.z * forward.y
  const uy = right.z * forward.x - right.x * forward.z
  const uz = right.x * forward.y - right.y * forward.x
  const ul = Math.hypot(ux, uy, uz) || 1
  const vx = point.x - camera.x
  const vy = point.y - camera.y
  const vz = point.z - camera.z
  const along = vx * forward.x + vy * forward.y + vz * forward.z
  if (along <= 0.4) return false
  const lateral = Math.abs(vx * right.x + vz * right.z)
  const vertical = Math.abs(vx * (ux / ul) + vy * (uy / ul) + vz * (uz / ul))
  const halfV = ((fovDeg * Math.PI) / 180) / 2
  const halfH = Math.atan(Math.tan(halfV) * aspect)
  return Math.atan2(lateral, along) < halfH * 0.9 && Math.atan2(vertical, along) < halfV * 0.9
}

export function isCourseInView(camera: Vec3, look: Vec3, markers = courseMarkers()): boolean {
  return markers.some((marker) => isPointInView(camera, look, marker))
}

/** 赛道还在画面里时不给标记。离开后才在视线边缘给一个灰白方向。 */
export function placeEdgeHint(camera: Vec3, look: Vec3, markers = courseMarkers()): Vec3 | null {
  if (isCourseInView(camera, look, markers)) return null
  const nearest = markers.reduce((best, marker) => {
    const bestD = (best.x - camera.x) ** 2 + (best.y - camera.y) ** 2 + (best.z - camera.z) ** 2
    const nextD = (marker.x - camera.x) ** 2 + (marker.y - camera.y) ** 2 + (marker.z - camera.z) ** 2
    return nextD < bestD ? marker : best
  })
  const fx = look.x - camera.x
  const fy = look.y - camera.y
  const fz = look.z - camera.z
  const fl = Math.hypot(fx, fy, fz) || 1
  const forward = { x: fx / fl, y: fy / fl, z: fz / fl }
  const rx = -forward.z
  const rz = forward.x
  const rl = Math.hypot(rx, rz) || 1
  const right = { x: rx / rl, z: rz / rl }
  const toX = nearest.x - camera.x
  const toZ = nearest.z - camera.z
  const side = toX * right.x + toZ * right.z
  const ahead = toX * forward.x + toZ * forward.z
  const angle = Math.atan2(side, ahead)
  const distance = 7
  return {
    x: camera.x + forward.x * distance + right.x * Math.sin(angle) * 2.1,
    y: camera.y + forward.y * distance + Math.cos(angle) * 1.15,
    z: camera.z + forward.z * distance + right.z * Math.sin(angle) * 2.1,
  }
}
