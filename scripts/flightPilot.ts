/** 连续流程自测用的驾驶输入。不是游戏运行时的一部分。 */

export interface PilotState {
  mode: string
  x: number
  y: number
  z: number
  yaw: number
  vy: number
  qx: number
  qy: number
  qz: number
  qw: number
  rampTheta: number
  rampLateral: number
  event: string
}

export interface PilotInput {
  throttle: number
  steer: number
  thrust: boolean
  flip: boolean
}

const IDLE: PilotInput = { throttle: 0, steer: 0, thrust: false, flip: false }

export function createPilot(): (state: PilotState, elapsed: number) => PilotInput {
  let airAt = -1
  let settled = false
  return (state, elapsed) => {
    if (settled) return IDLE
    if (state.mode === 'ground' && elapsed > 5 && (state.event === 'land' || state.event === 'recover')) {
      settled = true
      return IDLE
    }
    if (state.mode === 'air') {
      if (airAt < 0) airAt = elapsed
      return airInput(state, elapsed - airAt)
    }
    airAt = -1
    return groundInput(state, elapsed)
  }
}

function groundInput(state: PilotState, elapsed: number): PilotInput {
  if (state.mode === 'ramp') {
    const steer = clamp(-state.rampLateral / 3)
    if (state.rampTheta > 1.15 || state.y > 16) return { throttle: 1, steer, thrust: true, flip: false }
    return { throttle: 1, steer, thrust: false, flip: false }
  }
  if (elapsed < 1.05) return { throttle: 0.45, steer: -1, thrust: false, flip: false }
  if (elapsed < 1.7) return { throttle: 0, steer: clamp(-state.yaw * 2.2), thrust: false, flip: false }
  if (elapsed < 3.05) return { throttle: -1, steer: 0, thrust: false, flip: false }
  const desiredYaw = Math.atan2(-state.x, 18)
  return { throttle: 1, steer: clamp((desiredYaw - state.yaw) * 2.4), thrust: false, flip: false }
}

function airInput(state: PilotState, airTime: number): PilotInput {
  const forward = rotateVec(state, { x: 0, y: 0, z: 1 })
  const up = rotateVec(state, { x: 0, y: 1, z: 0 })
  if (airTime < 0.85) return { throttle: -0.55, steer: 1, thrust: true, flip: false }
  const pitch = clamp(-forward.y * 2.4)
  const roll = clamp(up.x * 2.6)
  const upright = up.y > 0.86 && Math.abs(forward.y) < 0.28
  const settling = state.vy < 0 && state.y < 28 && upright
  return {
    throttle: pitch,
    steer: upright ? 0 : roll,
    thrust: !settling && state.y > 4 && airTime < 4.5,
    flip: false,
  }
}

function rotateVec(
  state: PilotState,
  v: { x: number; y: number; z: number },
): { x: number; y: number; z: number } {
  const quat = { x: state.qx, y: state.qy, z: state.qz, w: state.qw }
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

function clamp(value: number): number {
  return Math.max(-1, Math.min(1, value))
}
