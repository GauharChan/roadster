/** 场景相机的垂直视场。飞行取景按它留出地平线，不随高度收紧。 */
export const VIEW_FOV_DEG = 48

/** 手动重置后的车位，也是空中返回标记指向的场地。 */
export const FIELD_HOME = { x: 0, z: 48 } as const

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

export interface HorizonGuide extends Vec3 {
  width: number
}

export interface ReturnCue extends Vec3 {
  aimX: number
  aimY: number
  aimZ: number
}

const CHASE_DISTANCE = 16
const CHASE_SIDE = 14
const CAMERA_LIFT = 6
const LOOK_LIFT = 1.15
const HORIZON_REACH = 42
const CUE_DISTANCE = 8
const CUE_LATERAL = 1.55
const CUE_VERTICAL = 1.35

/**
 * 空中机位与车高保持固定关系，注视车身。
 * 视线俯仰不随高度变大，因此 40 米以上地平线仍在画面里。这里不限制车能飞多高。
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
    cameraX: input.x - forwardX * CHASE_DISTANCE + rightX * CHASE_SIDE,
    cameraY: input.y + CAMERA_LIFT,
    cameraZ: input.z - forwardZ * CHASE_DISTANCE + rightZ * CHASE_SIDE,
    lookX: input.x,
    lookY: input.y + LOOK_LIFT,
    lookZ: input.z,
  }
}

/** 镜头高度上的水平参照，用来在黑背景里看出地平线。 */
export function placeHorizonGuide(camera: Vec3, look: Vec3): HorizonGuide {
  const dx = look.x - camera.x
  const dz = look.z - camera.z
  const length = Math.hypot(dx, dz) || 1
  return {
    x: camera.x + (dx / length) * HORIZON_REACH,
    y: camera.y,
    z: camera.z + (dz / length) * HORIZON_REACH,
    width: 78,
  }
}

/** 始终放在视场内的场地方向标。正侧、反侧和身后用不同偏移，箭头指向场地。 */
export function placeReturnCue(input: {
  camera: Vec3
  look: Vec3
  carX: number
  carZ: number
  homeX: number
  homeZ: number
}): ReturnCue {
  const fx = input.look.x - input.camera.x
  const fy = input.look.y - input.camera.y
  const fz = input.look.z - input.camera.z
  const fl = Math.hypot(fx, fy, fz) || 1
  const forward = { x: fx / fl, y: fy / fl, z: fz / fl }
  const rightX = -forward.z
  const rightZ = forward.x
  const rightLength = Math.hypot(rightX, rightZ) || 1
  const right = { x: rightX / rightLength, z: rightZ / rightLength }
  const homeX = input.homeX - input.carX
  const homeZ = input.homeZ - input.carZ
  const homeLength = Math.hypot(homeX, homeZ) || 1
  const home = { x: homeX / homeLength, z: homeZ / homeLength }
  const aheadLength = Math.hypot(forward.x, forward.z) || 1
  const ahead = (home.x * forward.x + home.z * forward.z) / aheadLength
  const side = home.x * right.x + home.z * right.z
  const angle = Math.atan2(side, ahead)
  const x = input.camera.x + forward.x * CUE_DISTANCE + right.x * Math.sin(angle) * CUE_LATERAL
  const y = input.camera.y + forward.y * CUE_DISTANCE + Math.cos(angle) * CUE_VERTICAL
  const z = input.camera.z + forward.z * CUE_DISTANCE + right.z * Math.sin(angle) * CUE_LATERAL
  return {
    x,
    y,
    z,
    aimX: x + home.x * 5,
    aimY: y,
    aimZ: z + home.z * 5,
  }
}
