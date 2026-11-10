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

export function isCourseInView(
  camera: Vec3,
  look: Vec3,
  markers = courseMarkers(),
  fovDeg = VIEW_FOV_DEG,
  aspect = 16 / 9,
): boolean {
  return markers.some((marker) => isPointInView(camera, look, marker, fovDeg, aspect))
}

export interface CourseHint {
  /** 相对画面左边的百分比。贴边，不在中央。 */
  x: number
  /** 相对画面上边的百分比。 */
  y: number
  /** 箭头方向。0 朝上，顺时针为正。 */
  angle: number
}

const EDGE = 0.84

/**
 * 赛道还在视锥里时返回 null。离开后把方向投影到画面内缩边，避免落在中央。
 */
export function courseHintLayout(
  camera: Vec3,
  look: Vec3,
  markers = courseMarkers(),
  fovDeg = VIEW_FOV_DEG,
  aspect = 16 / 9,
): CourseHint | null {
  if (isCourseInView(camera, look, markers, fovDeg, aspect)) return null
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
  const right = { x: rx / rl, y: 0, z: rz / rl }
  const ux = right.y * forward.z - right.z * forward.y
  const uy = right.z * forward.x - right.x * forward.z
  const uz = right.x * forward.y - right.y * forward.x
  const ul = Math.hypot(ux, uy, uz) || 1
  const up = { x: ux / ul, y: uy / ul, z: uz / ul }
  const vx = nearest.x - camera.x
  const vy = nearest.y - camera.y
  const vz = nearest.z - camera.z
  const along = vx * forward.x + vy * forward.y + vz * forward.z
  const lateral = vx * right.x + vy * right.y + vz * right.z
  const vertical = vx * up.x + vy * up.y + vz * up.z
  const halfV = ((fovDeg * Math.PI) / 180) / 2
  const halfH = Math.atan(Math.tan(halfV) * aspect)
  let nx = 0
  let ny = -3
  if (along > 0.5) {
    nx = Math.atan2(lateral, along) / halfH
    ny = Math.atan2(vertical, along) / halfV
  } else if (Math.hypot(lateral, vertical) > 0.5) {
    const span = Math.hypot(lateral, vertical)
    nx = (lateral / span) * 3
    ny = (vertical / span) * 3
  }
  const scale = Math.max(Math.abs(nx) / EDGE, Math.abs(ny) / EDGE, 1)
  const ex = nx / scale
  const ey = ny / scale
  return {
    x: 50 + ex * 50,
    y: 50 - ey * 50,
    angle: (Math.atan2(nx, ny) * 180) / Math.PI,
  }
}

export interface PxRect {
  left: number
  top: number
  right: number
  bottom: number
}

export interface HintBox {
  width: number
  height: number
}

const HINT_GAP = 12
const BOTTOM_EDGE_Y = 50 + EDGE * 50

function intersects(a: PxRect, b: PxRect): boolean {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top
}

function hintBox(hint: CourseHint, viewport: { width: number; height: number }, size: HintBox): PxRect {
  const cx = (hint.x / 100) * viewport.width
  const cy = (hint.y / 100) * viewport.height
  return {
    left: cx - size.width / 2,
    right: cx + size.width / 2,
    top: cy - size.height / 2,
    bottom: cy + size.height / 2,
  }
}

type HudZones = { help?: PxRect | null; title?: PxRect | null; reset?: PxRect | null }

function reservedZones(zones: HudZones): PxRect[] {
  return [zones.help, zones.title, zones.reset].filter((zone): zone is PxRect => !!zone && zone.right > zone.left)
}

function overlapsReserved(
  hint: CourseHint,
  viewport: { width: number; height: number },
  zones: HudZones,
  size: HintBox,
): boolean {
  const box = hintBox(hint, viewport, size)
  return reservedZones(zones).some((zone) => intersects(box, zone))
}

function onSideEdge(hint: CourseHint): boolean {
  return hint.x <= 50 - EDGE * 50 + 1.5 || hint.x >= 50 + EDGE * 50 - 1.5
}

/**
 * 左右贴边一旦压到说明，就不能再往下挤。
 * 那一帧直接改放底边空档，避免先停在左下角。
 */
function shouldSitOnBottom(
  hint: CourseHint,
  viewport: { width: number; height: number },
  zones: HudZones,
  size: HintBox,
): boolean {
  if (hint.y >= BOTTOM_EDGE_Y - 1.5) return true
  return hint.y >= 50 && onSideEdge(hint) && overlapsReserved(hint, viewport, zones, size)
}

/** 赛道在下方时，沿底边放到说明右侧空档的中点，并避开标题和重置。 */
export function fitCourseHint(
  hint: CourseHint,
  viewport: { width: number; height: number },
  zones: HudZones,
  size: HintBox = { width: 88, height: 20 },
): CourseHint {
  if (shouldSitOnBottom(hint, viewport, zones, size)) return placeOnBottom(hint, viewport, zones, size)
  return slideIfCovering(hint, viewport, zones, size)
}

function placeOnBottom(
  hint: CourseHint,
  viewport: { width: number; height: number },
  zones: HudZones,
  size: HintBox,
): CourseHint {
  const rightInset = viewport.width * (1 - EDGE) / 2
  let leftLimit = zones.help && zones.help.right > zones.help.left
    ? zones.help.right + HINT_GAP + size.width / 2
    : rightInset + size.width / 2
  let rightLimit = viewport.width - rightInset - size.width / 2
  const bottomTop = (BOTTOM_EDGE_Y / 100) * viewport.height - size.height / 2
  const bottomBottom = (BOTTOM_EDGE_Y / 100) * viewport.height + size.height / 2
  const crossesBottom = (zone: PxRect | null | undefined) => !!zone
    && zone.bottom > bottomTop
    && zone.top < bottomBottom
  if (crossesBottom(zones.title)) leftLimit = Math.max(leftLimit, zones.title!.right + HINT_GAP + size.width / 2)
  if (crossesBottom(zones.reset)) rightLimit = Math.min(rightLimit, zones.reset!.left - HINT_GAP - size.width / 2)
  const center = leftLimit <= rightLimit ? (leftLimit + rightLimit) / 2 : rightLimit
  const x = Math.min(viewport.width - size.width / 2, Math.max(size.width / 2, center)) / viewport.width * 100
  return { ...hint, x, y: BOTTOM_EDGE_Y }
}

function slideIfCovering(
  hint: CourseHint,
  viewport: { width: number; height: number },
  zones: HudZones,
  size: HintBox,
): CourseHint {
  const zonesList = reservedZones(zones)
  let next = hint
  const onRight = hint.x >= 50 + EDGE * 50 - 1.5
  const onLeft = hint.x <= 50 - EDGE * 50 + 1.5
  const onTop = hint.y <= 50 - EDGE * 50 + 1.5
  for (let step = 0; step < 12; step += 1) {
    const box = hintBox(next, viewport, size)
    const hit = zonesList.find((zone) => intersects(box, zone))
    if (!hit) return next
    if (onTop) next = { ...next, x: Math.min(50 + EDGE * 50, next.x + 4) }
    else if (onLeft || onRight) {
      const hintCy = (box.top + box.bottom) / 2
      const zoneCy = (hit.top + hit.bottom) / 2
      next = hintCy >= zoneCy
        ? { ...next, y: Math.min(BOTTOM_EDGE_Y, next.y + 4) }
        : { ...next, y: Math.max(50 - EDGE * 50, next.y - 4) }
    } else return placeOnBottom(next, viewport, zones, size)
  }
  if (next.y >= 50 && overlapsReserved(next, viewport, zones, size)) {
    return placeOnBottom(next, viewport, zones, size)
  }
  return next
}
