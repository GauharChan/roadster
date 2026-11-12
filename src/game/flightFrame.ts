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

const CHASE_BACK = 12
const CHASE_SIDE = 3.4
const CAMERA_LIFT = 3.2
const LOOK_AHEAD = 8
const LOOK_LIFT = 1.15
const MIN_BACK = 8
const MAX_LAG = 8
const MAX_BACK = CHASE_BACK + MAX_LAG
const MAX_DROP = 5.5
const MAX_SIDE = 6
const AIM_LIFT = 0.9
/** 画面四边各留约 10%。NDC 从 -1 到 1，内侧即 ±0.8。 */
const SAFE_INSET = 0.1
const SAFE_NDC = 1 - SAFE_INSET * 2
const ROAD_YAW = Math.atan2(-CHASE_SIDE, CHASE_BACK)
const ROAD_LOOK_X = Math.sin(ROAD_YAW)
const ROAD_LOOK_Z = -Math.cos(ROAD_YAW)

/**
 * 车身主体包围盒，取自 Roadster 模型、不含轮子外扩。
 * 八个角都在安全区内，车身就在安全区内，而不是只剩一只轮子或一个角。
 */
const BODY_CORNERS: readonly Vec3[] = [
  { x: -0.93, y: 0, z: -2.25 },
  { x: -0.93, y: 0, z: 2.39 },
  { x: -0.93, y: 1.17, z: -2.25 },
  { x: -0.93, y: 1.17, z: 2.39 },
  { x: 0.96, y: 0, z: -2.25 },
  { x: 0.96, y: 0, z: 2.39 },
  { x: 0.96, y: 1.17, z: -2.25 },
  { x: 0.96, y: 1.17, z: 2.39 },
]

interface Quat {
  x: number
  y: number
  z: number
  w: number
}

/** 车头朝世界 -Z、车顶朝上。跟 createVehicle 的初始朝向一致。 */
const FACING_ROAD: Quat = { x: 0, y: 1, z: 0, w: 0 }

/**
 * 始终从道路前方跟在车后。不按远近改看向坡道还是路面，也不在这两个相反朝向之间过渡。
 * 近处赛道离开画面时，仍由离屏提示补充。
 */
export function frameCourseCamera(input: {
  x: number
  y: number
  z: number
}): FlightFrame {
  return {
    cameraX: input.x + CHASE_SIDE,
    cameraY: input.y + CAMERA_LIFT,
    cameraZ: input.z + CHASE_BACK,
    lookX: input.x,
    lookY: input.y + LOOK_LIFT,
    lookZ: input.z - LOOK_AHEAD,
  }
}

export interface FollowInput {
  x: number
  y: number
  z: number
  cameraX: number
  cameraY: number
  cameraZ: number
  dt: number
  snap?: boolean
  qx?: number
  qy?: number
  qz?: number
  qw?: number
  fovDeg?: number
  aspect?: number
}

/**
 * 机位平滑落后，但与目标机位的距离不超过 8 米，沿路最远落到车后 20 米。
 * 水平朝向锁在道路前方，不跟车头，倒车不掉头。
 * 这一帧车身若会出 10% 安全区，只把机位朝目标收近，不改水平朝向。
 */
export function followCamera(input: FollowInput): FlightFrame {
  const rest = frameCourseCamera(input)
  const blend = input.snap ? 1 : 1 - Math.exp(-3.4 * input.dt)
  const lagged = limitLag({
    cameraX: input.cameraX + (rest.cameraX - input.cameraX) * blend,
    cameraY: input.cameraY + (rest.cameraY - input.cameraY) * blend,
    cameraZ: input.cameraZ + (rest.cameraZ - input.cameraZ) * blend,
  }, rest, input)
  const pose = tightenLag(rest, lagged, input)
  const look = aimLook(pose, input)
  return { ...pose, ...look }
}

/** 车身八个角在当前镜头下的 NDC。x/y 为 -1 到 1，depth 为镜头前方距离。 */
export function carBodyNdc(
  frame: FlightFrame,
  car: { x: number; y: number; z: number; qx?: number; qy?: number; qz?: number; qw?: number },
  fovDeg = VIEW_FOV_DEG,
  aspect = 16 / 9,
): Array<{ x: number; y: number; depth: number }> {
  const quat = quatOf(car)
  return BODY_CORNERS.map((corner) => projectNdc(frame, addVec(car, rotateQuat(quat, corner)), fovDeg, aspect))
}

/** 车身八个角都落在四边 10% 以内，且在镜头前方。 */
export function carBodyInSafeInset(
  frame: FlightFrame,
  car: { x: number; y: number; z: number; qx?: number; qy?: number; qz?: number; qw?: number },
  fovDeg = VIEW_FOV_DEG,
  aspect = 16 / 9,
): boolean {
  return carBodyNdc(frame, car, fovDeg, aspect).every((ndc) => (
    ndc.depth > 0.2 && Math.abs(ndc.x) <= SAFE_NDC && Math.abs(ndc.y) <= SAFE_NDC
  ))
}

function limitLag(
  pose: { cameraX: number; cameraY: number; cameraZ: number },
  rest: FlightFrame,
  car: { x: number; y: number; z: number },
): { cameraX: number; cameraY: number; cameraZ: number } {
  let cameraX = pose.cameraX
  let cameraY = pose.cameraY
  let cameraZ = pose.cameraZ
  if (cameraZ < car.z + MIN_BACK) cameraZ = car.z + MIN_BACK
  if (cameraZ > car.z + MAX_BACK) cameraZ = car.z + MAX_BACK
  if (cameraY < car.y - MAX_DROP) cameraY = car.y - MAX_DROP
  if (cameraX < car.x - MAX_SIDE) cameraX = car.x - MAX_SIDE
  if (cameraX > car.x + CHASE_SIDE + MAX_SIDE) cameraX = car.x + CHASE_SIDE + MAX_SIDE
  const dx = cameraX - rest.cameraX
  const dy = cameraY - rest.cameraY
  const dz = cameraZ - rest.cameraZ
  const dist = Math.hypot(dx, dy, dz)
  if (dist > MAX_LAG) {
    const scale = MAX_LAG / dist
    cameraX = rest.cameraX + dx * scale
    cameraY = rest.cameraY + dy * scale
    cameraZ = rest.cameraZ + dz * scale
  }
  return { cameraX, cameraY, cameraZ }
}

function tightenLag(
  rest: FlightFrame,
  lagged: { cameraX: number; cameraY: number; cameraZ: number },
  input: FollowInput,
): { cameraX: number; cameraY: number; cameraZ: number } {
  const fov = input.fovDeg ?? VIEW_FOV_DEG
  const aspect = input.aspect ?? 16 / 9
  const at = (scale: number) => ({
    cameraX: rest.cameraX + (lagged.cameraX - rest.cameraX) * scale,
    cameraY: rest.cameraY + (lagged.cameraY - rest.cameraY) * scale,
    cameraZ: rest.cameraZ + (lagged.cameraZ - rest.cameraZ) * scale,
  })
  const fits = (scale: number) => {
    const pose = at(scale)
    return carBodyInSafeInset({ ...pose, ...aimLook(pose, input) }, input, fov, aspect)
  }
  const scale = Array.from({ length: 25 }, (_, index) => 1 - index / 24).find((value) => fits(value)) ?? 0
  return at(scale)
}

/** 俯仰看向车身，水平分量始终是道路前方，不随本帧收紧而改。 */
function aimLook(
  pose: { cameraX: number; cameraY: number; cameraZ: number },
  car: { x: number; y: number; z: number },
): { lookX: number; lookY: number; lookZ: number } {
  const along = (car.x - pose.cameraX) * ROAD_LOOK_X + (car.z - pose.cameraZ) * ROAD_LOOK_Z
  const depth = Math.max(along, 6)
  return {
    lookX: pose.cameraX + ROAD_LOOK_X * depth,
    lookY: car.y + AIM_LIFT,
    lookZ: pose.cameraZ + ROAD_LOOK_Z * depth,
  }
}

function projectNdc(
  frame: FlightFrame,
  point: Vec3,
  fovDeg: number,
  aspect: number,
): { x: number; y: number; depth: number } {
  const fx = frame.lookX - frame.cameraX
  const fy = frame.lookY - frame.cameraY
  const fz = frame.lookZ - frame.cameraZ
  const fl = Math.hypot(fx, fy, fz) || 1
  const forward = { x: fx / fl, y: fy / fl, z: fz / fl }
  const up = { x: 0, y: 1, z: 0 }
  let right = cross(forward, up)
  let span = Math.hypot(right.x, right.y, right.z)
  if (span < 1e-6) {
    right = { x: 1, y: 0, z: 0 }
    span = 1
  }
  right = { x: right.x / span, y: right.y / span, z: right.z / span }
  const camUp = cross({ x: -forward.x, y: -forward.y, z: -forward.z }, right)
  const vx = point.x - frame.cameraX
  const vy = point.y - frame.cameraY
  const vz = point.z - frame.cameraZ
  const depth = vx * forward.x + vy * forward.y + vz * forward.z
  const cx = vx * right.x + vy * right.y + vz * right.z
  const cy = vx * camUp.x + vy * camUp.y + vz * camUp.z
  const half = Math.tan((fovDeg * Math.PI) / 360)
  const denom = depth * half || 1e-6
  return { x: cx / (denom * aspect), y: cy / denom, depth }
}

function quatOf(input: { qx?: number; qy?: number; qz?: number; qw?: number }): Quat {
  if (input.qw === undefined) return FACING_ROAD
  return { x: input.qx ?? 0, y: input.qy ?? 0, z: input.qz ?? 0, w: input.qw }
}

function rotateQuat(quat: Quat, v: Vec3): Vec3 {
  const ix = quat.w * v.x + quat.y * v.z - quat.z * v.y
  const iy = quat.w * v.y + quat.z * v.x - quat.x * v.z
  const iz = quat.w * v.z + quat.x * v.y - quat.y * v.x
  const iw = -quat.x * v.x - quat.y * v.y - quat.z * v.z
  return {
    x: ix * quat.w + iw * -quat.x + iy * -quat.z - iz * -quat.y,
    y: iy * quat.w + iw * -quat.y + iz * -quat.x - ix * -quat.z,
    z: iz * quat.w + iw * -quat.z + ix * -quat.y - iy * -quat.x,
  }
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  }
}

function addVec(a: { x: number; y: number; z: number }, b: Vec3): Vec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z }
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
