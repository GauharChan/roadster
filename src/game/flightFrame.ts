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

const CHASE_BACK = 20
const CHASE_SIDE = 6.2
const CAMERA_LIFT = 5
const LOOK_AHEAD = 14
const LOOK_LIFT = -2.2
const ROAD_Z_MIN = -6
const ROAD_Z_MAX = 88

export type CourseMode = 'ground' | 'ramp' | 'air'

interface CoursePoint {
  x: number
  y: number
  z: number
  fx: number
  fy: number
  fz: number
  theta: number | null
}

/**
 * 机位跟着车，朝向只认赛道和坡道，不读车头、速度或横滚。
 * 倒车不会把镜头拧去看车尾。离坡后放平视线，让地面留在画面下方。
 */
export function frameCourseCamera(input: {
  x: number
  y: number
  z: number
  mode: CourseMode
}): FlightFrame {
  const course = courseReference(input.x, input.y, input.z, input.mode)
  const flat = horizontalForward(course)
  const rightX = -flat.z
  const rightZ = flat.x
  const back = input.mode === 'air'
    ? CHASE_BACK
    : input.mode === 'ramp'
      ? 9
      : 12 + Math.min(input.y, 42) * 0.28
  const side = input.mode === 'air' ? CHASE_SIDE : 3.4
  const cameraX = input.x - flat.x * back + rightX * side
  const cameraZ = input.z - flat.z * back + rightZ * side
  const raised = Math.max(1.8, input.y * 0.38 + 3.5 + Math.min(input.y, 36) * 0.12)
  const cameraY = input.mode === 'air'
    ? input.y + CAMERA_LIFT
    : input.mode === 'ramp'
      ? Math.max(raised, input.y + 2.4)
      : raised
  const ahead = courseAhead(course, input.mode === 'ramp' ? 7 : input.mode === 'air' ? 18 : 16)
  const lookAhead = input.mode === 'air' ? LOOK_AHEAD : 8
  const rampRise = Math.max(0, ahead.y - input.y)
  const lookY = input.mode === 'air'
    ? input.y + LOOK_LIFT
    : input.mode === 'ramp'
      ? input.y + 1.15 + Math.min(1.8, rampRise * 0.5)
      : input.y + 1.15
  const camera = { x: cameraX, y: cameraY, z: cameraZ }
  const car = { x: input.x, y: input.y + 0.85, z: input.z }
  const pulled = pullTowardCourse(
    camera,
    {
      x: input.x + flat.x * lookAhead,
      y: lookY,
      z: input.z + flat.z * lookAhead,
    },
    car,
    ahead,
  )
  return {
    cameraX,
    cameraY,
    cameraZ,
    lookX: pulled.x,
    lookY,
    lookZ: pulled.z,
  }
}

function courseReference(x: number, y: number, z: number, mode: CourseMode): CoursePoint {
  const roadZ = Math.min(ROAD_Z_MAX, Math.max(ROAD_Z_MIN, z))
  const road: CoursePoint = {
    x: 0,
    y: 0.35,
    z: roadZ,
    fx: 0,
    fy: 0,
    fz: z < ROAD_Z_MIN ? 1 : -1,
    theta: null,
  }
  const ramp = nearestRamp(x, y, z)
  const rampNear = ramp.dist2 < 12 * 12 && z <= RAMP.entranceZ + 4
  if (mode === 'ramp' || (mode === 'ground' && rampNear && y > 1.2)) return ramp.point
  if (mode === 'air' && ramp.dist2 + 40 < roadDistance2(x, y, z, road)) return ramp.point
  return road
}

function roadDistance2(x: number, y: number, z: number, road: CoursePoint): number {
  return (road.x - x) ** 2 + (road.y - y) ** 2 + (road.z - z) ** 2
}

function nearestRamp(x: number, y: number, z: number): { point: CoursePoint; dist2: number } {
  const samples = Array.from({ length: 33 }, (_, index) => (RAMP.launchTheta * index) / 32)
  return samples.reduce((best, theta) => {
    const sample = sampleRamp(theta, 0)
    const dist2 = (sample.x - x) ** 2 + (sample.y - y) ** 2 + (sample.z - z) ** 2
    if (dist2 >= best.dist2) return best
    return {
      dist2,
      point: {
        x: sample.x,
        y: sample.y,
        z: sample.z,
        fx: sample.tx,
        fy: sample.ty,
        fz: sample.tz,
        theta,
      },
    }
  }, { dist2: Infinity, point: {
    x: 0, y: 0, z: 0, fx: 0, fy: 0, fz: -1, theta: 0,
  } })
}

function horizontalForward(course: CoursePoint): { x: number; z: number } {
  const span = Math.hypot(course.fx, course.fz)
  if (span < 0.35) {
    const returning = course.theta !== null && course.theta > Math.PI / 2
    return { x: 0, z: returning ? 1 : -1 }
  }
  return { x: course.fx / span, z: course.fz / span }
}

function courseAhead(course: CoursePoint, distance: number): Vec3 {
  if (course.theta === null) {
    return {
      x: course.x + course.fx * distance,
      y: course.y,
      z: course.z + course.fz * distance,
    }
  }
  const theta = Math.min(RAMP.launchTheta, course.theta + distance / RAMP.radius)
  if (theta > course.theta + 0.04) {
    const sample = sampleRamp(theta, 0)
    return { x: sample.x, y: sample.y, z: sample.z }
  }
  const flat = horizontalForward(course)
  return {
    x: course.x + flat.x * distance,
    y: course.y,
    z: course.z + flat.z * distance,
  }
}

function pullTowardCourse(
  camera: Vec3,
  look: Vec3,
  car: Vec3,
  course: Vec3,
): { x: number; z: number } {
  const steps = Array.from({ length: 9 }, (_, index) => index / 8)
  const choice = steps.reduce((best, step) => {
    const x = look.x + (course.x - look.x) * step
    const z = look.z + (course.z - look.z) * step
    const candidate = { x, y: look.y, z }
    if (!isPointInView(camera, candidate, car)) return best
    const courseIn = isPointInView(camera, candidate, course)
    const score = (courseIn ? 2 : 0) + (1 - step)
    if (score <= best.score) return best
    return { score, x, z }
  }, { score: -1, x: look.x, z: look.z })
  return { x: choice.x, z: choice.z }
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
