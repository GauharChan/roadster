import { Matrix4, Quaternion, Vector3 } from 'three'
import { RAMP, sampleRamp } from './ramp'

export type DriveMode = 'ground' | 'ramp' | 'air'
export type VehicleEvent = 'none' | 'launch' | 'land' | 'recover'

export interface ControlInput {
  throttle: number
  steer: number
  thrust: boolean
  flip: boolean
}

export interface VehicleState {
  mode: DriveMode
  x: number
  y: number
  z: number
  vx: number
  vy: number
  vz: number
  /** 0 表示车头朝 -Z。 */
  yaw: number
  qx: number
  qy: number
  qz: number
  qw: number
  /** 地面和坡道上沿车头或爬坡切线的有符号速率。 */
  speed: number
  rampTheta: number
  rampLateral: number
  rollTime: number
  rollAccum: number
  leftRamp: boolean
  didRoll: boolean
  stuntDone: boolean
  event: VehicleEvent
}

const PHYSICS = {
  gravity: 13,
  accel: 24,
  brake: 36,
  coast: 6,
  maxSpeed: 40,
  reverseMax: 9,
  steerRate: 1.8,
  rampAccel: 26,
  rampBrake: 32,
  lateralSpeed: 8,
  thrustAccel: 34,
  thrustForward: 7,
  liftOff: 12,
  detachKick: 9,
  pitchRate: 1.55,
  rollRate: 2.35,
  rollDuration: 0.8,
  levelRate: 2.3,
  airDrag: 0.16,
  landMaxSink: 20,
  uprightCos: Math.cos((25 * Math.PI) / 180),
  enterSpeed: 6,
} as const

const q = new Quaternion()
const dq = new Quaternion()
const forward = new Vector3()
const up = new Vector3()
const side = new Vector3()
const axis = new Vector3()
const worldUp = new Vector3(0, 1, 0)
const axisX = new Vector3(1, 0, 0)
const axisZ = new Vector3(0, 0, 1)
const matrix = new Matrix4()

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function writeQ(state: VehicleState, rotation: Quaternion): void {
  state.qx = rotation.x
  state.qy = rotation.y
  state.qz = rotation.z
  state.qw = rotation.w
}

function setBasis(
  state: VehicleState,
  fx: number,
  fy: number,
  fz: number,
  ux: number,
  uy: number,
  uz: number,
): void {
  forward.set(fx, fy, fz).normalize()
  up.set(ux, uy, uz).normalize()
  side.crossVectors(up, forward).normalize()
  forward.crossVectors(side, up).normalize()
  up.crossVectors(forward, side).normalize()
  matrix.set(
    side.x, up.x, forward.x, 0,
    side.y, up.y, forward.y, 0,
    side.z, up.z, forward.z, 0,
    0, 0, 0, 1,
  )
  q.setFromRotationMatrix(matrix)
  writeQ(state, q)
}

function rememberYaw(state: VehicleState, fx: number, fz: number): void {
  if (Math.hypot(fx, fz) > 0.3) state.yaw = Math.atan2(fx, -fz)
}

export function createVehicle(): VehicleState {
  const state: VehicleState = {
    mode: 'ground',
    x: RAMP.centerX,
    y: 0,
    z: 48,
    vx: 0,
    vy: 0,
    vz: 0,
    yaw: 0,
    qx: 0,
    qy: 0,
    qz: 0,
    qw: 1,
    speed: 0,
    rampTheta: 0,
    rampLateral: 0,
    rollTime: 0,
    rollAccum: 0,
    leftRamp: false,
    didRoll: false,
    stuntDone: false,
    event: 'none',
  }
  setBasis(state, 0, 0, -1, 0, 1, 0)
  return state
}

export function resetVehicle(state: VehicleState): void {
  Object.assign(state, createVehicle())
}

export function carUp(state: VehicleState): { x: number; y: number; z: number } {
  const rotation = new Quaternion(state.qx, state.qy, state.qz, state.qw)
  const vector = new Vector3(0, 1, 0).applyQuaternion(rotation)
  return { x: vector.x, y: vector.y, z: vector.z }
}

export function stepVehicle(state: VehicleState, input: ControlInput, dt: number): void {
  if (dt <= 0) return
  state.event = 'none'
  if (state.mode === 'ground') stepGround(state, input, dt)
  else if (state.mode === 'ramp') stepRamp(state, input, dt)
  else stepAir(state, input, dt)
}

function stepGround(state: VehicleState, input: ControlInput, dt: number): void {
  const throttle = clamp(input.throttle, -1, 1)
  if (throttle > 0) state.speed += throttle * PHYSICS.accel * dt
  else if (throttle < 0) state.speed += throttle * PHYSICS.brake * dt
  else {
    const drop = Math.min(Math.abs(state.speed), PHYSICS.coast * dt)
    state.speed -= Math.sign(state.speed) * drop
  }

  state.speed = clamp(state.speed, -PHYSICS.reverseMax, PHYSICS.maxSpeed)
  const steerScale = 0.3 + 0.7 * Math.min(Math.abs(state.speed) / 16, 1)
  const steerSign = state.speed < -0.5 ? -1 : 1
  state.yaw += input.steer * steerSign * steerScale * PHYSICS.steerRate * dt

  const fx = Math.sin(state.yaw)
  const fz = -Math.cos(state.yaw)
  state.vx = fx * state.speed
  state.vy = 0
  state.vz = fz * state.speed
  state.x += state.vx * dt
  state.y = 0
  state.z += state.vz * dt
  setBasis(state, fx, 0, fz, 0, 1, 0)

  if (canEnterRamp(state, fz)) {
    enterRamp(state)
    return
  }
  if (input.thrust || input.flip) liftOff(state, input)
}

function canEnterRamp(state: VehicleState, forwardZ: number): boolean {
  if (state.speed < PHYSICS.enterSpeed) return false
  if (forwardZ > -0.45) return false
  if (Math.abs(state.x - RAMP.centerX) > RAMP.halfWidth - 1.4) return false
  if (state.z > RAMP.entranceZ + 0.45) return false
  if (state.z < RAMP.entranceZ - 3.5) return false
  return true
}

function enterRamp(state: VehicleState): void {
  state.mode = 'ramp'
  state.rampTheta = 0.02
  state.rampLateral = clamp(state.x - RAMP.centerX, -RAMP.halfWidth + 1.7, RAMP.halfWidth - 1.7)
  state.rollTime = 0
  placeOnRamp(state)
}

function stepRamp(state: VehicleState, input: ControlInput, dt: number): void {
  let accel = -PHYSICS.gravity * Math.sin(state.rampTheta)
  const throttle = clamp(input.throttle, -1, 1)
  if (throttle > 0) accel += throttle * PHYSICS.rampAccel
  else if (throttle < 0) accel += throttle * PHYSICS.rampBrake
  else accel -= Math.sign(state.speed) * 1.2

  state.speed = clamp(state.speed + accel * dt, -PHYSICS.reverseMax, PHYSICS.maxSpeed)
  state.rampLateral = clamp(
    state.rampLateral + input.steer * PHYSICS.lateralSpeed * dt,
    -RAMP.halfWidth + 1.7,
    RAMP.halfWidth - 1.7,
  )
  state.rampTheta += (state.speed / RAMP.radius) * dt

  if (state.rampTheta >= RAMP.launchTheta || input.thrust || input.flip) {
    state.rampTheta = Math.min(state.rampTheta, RAMP.launchTheta)
    launchFromRamp(state, input)
    return
  }
  if (state.rampTheta <= 0) {
    exitRamp(state)
    return
  }
  placeOnRamp(state)
}

function placeOnRamp(state: VehicleState): void {
  const sample = sampleRamp(state.rampTheta, state.rampLateral)
  const sign = state.speed >= 0 ? 1 : -1
  const fx = sample.tx * sign
  const fy = sample.ty * sign
  const fz = sample.tz * sign
  state.x = sample.x
  state.y = sample.y
  state.z = sample.z
  state.vx = sample.tx * state.speed
  state.vy = sample.ty * state.speed
  state.vz = sample.tz * state.speed
  setBasis(state, fx, fy, fz, sample.ux, sample.uy, sample.uz)
  rememberYaw(state, fx, fz)
}

function launchFromRamp(state: VehicleState, input: ControlInput): void {
  placeOnRamp(state)
  if (input.thrust || input.flip) {
    const sample = sampleRamp(state.rampTheta, state.rampLateral)
    state.vx += sample.ux * PHYSICS.detachKick
    state.vy += sample.uy * PHYSICS.detachKick
    state.vz += sample.uz * PHYSICS.detachKick
  }
  state.mode = 'air'
  state.leftRamp = true
  state.didRoll = false
  state.rollAccum = 0
  state.event = 'launch'
  state.rollTime = input.flip ? PHYSICS.rollDuration : 0
}

function exitRamp(state: VehicleState): void {
  const sample = sampleRamp(0, state.rampLateral)
  state.vx = sample.tx * state.speed
  state.vy = 0
  state.vz = sample.tz * state.speed
  state.x = sample.x
  state.y = 0
  state.z = sample.z + 0.6
  state.mode = 'ground'
  state.rampTheta = 0
  rememberYaw(state, state.vx, state.vz)
  const fx = Math.sin(state.yaw)
  const fz = -Math.cos(state.yaw)
  state.speed = state.vx * fx + state.vz * fz
  state.vx = fx * state.speed
  state.vz = fz * state.speed
  setBasis(state, fx, 0, fz, 0, 1, 0)
}

function liftOff(state: VehicleState, input: ControlInput): void {
  state.mode = 'air'
  state.vy = Math.max(state.vy, PHYSICS.liftOff)
  state.leftRamp = false
  state.didRoll = false
  state.rollAccum = 0
  state.rollTime = input.flip ? PHYSICS.rollDuration : 0
  state.event = 'launch'
}

function stepAir(state: VehicleState, input: ControlInput, dt: number): void {
  q.set(state.qx, state.qy, state.qz, state.qw)
  if (input.flip && state.rollTime <= 0) state.rollTime = PHYSICS.rollDuration

  if (state.rollTime > 0) {
    const step = Math.min(dt, state.rollTime)
    dq.setFromAxisAngle(axisZ, (Math.PI * 2 * step) / PHYSICS.rollDuration)
    q.multiply(dq)
    state.rollTime = Math.max(0, state.rollTime - dt)
    if (state.rollTime === 0) state.didRoll = true
  } else {
    const pitch = -clamp(input.throttle, -1, 1) * PHYSICS.pitchRate * dt
    const roll = -clamp(input.steer, -1, 1) * PHYSICS.rollRate * dt
    if (pitch !== 0) {
      dq.setFromAxisAngle(axisX, pitch)
      q.multiply(dq)
    }
    if (roll !== 0) {
      dq.setFromAxisAngle(axisZ, roll)
      q.multiply(dq)
      state.rollAccum += Math.abs(roll)
      if (state.rollAccum >= Math.PI * 1.7) state.didRoll = true
    }
    if (input.thrust) assistLevel(dt)
  }

  q.normalize()
  forward.set(0, 0, 1).applyQuaternion(q)
  up.set(0, 1, 0).applyQuaternion(q)
  rememberYaw(state, forward.x, forward.z)

  state.vy -= PHYSICS.gravity * dt
  if (input.thrust) {
    const lift = PHYSICS.thrustAccel * dt
    const push = PHYSICS.thrustForward * dt
    state.vx += up.x * lift + forward.x * push
    state.vy += up.y * lift + forward.y * push
    state.vz += up.z * lift + forward.z * push
  }
  const drag = Math.exp(-PHYSICS.airDrag * dt)
  state.vx *= drag
  state.vy *= drag
  state.vz *= drag
  state.x += state.vx * dt
  state.y += state.vy * dt
  state.z += state.vz * dt
  state.speed = state.vx * forward.x + state.vy * forward.y + state.vz * forward.z

  const lowest = state.y + Math.min(0, up.y) * 0.95
  if (lowest <= 0 && state.vy < 0) {
    land(state, up.y)
    return
  }
  writeQ(state, q)
}

function assistLevel(dt: number): void {
  up.set(0, 1, 0).applyQuaternion(q)
  axis.crossVectors(up, worldUp)
  const sin = axis.length()
  const cos = clamp(up.dot(worldUp), -1, 1)
  const angle = Math.atan2(sin, cos)
  if (angle < 0.02 || sin < 1e-5) return
  axis.multiplyScalar(1 / sin)
  dq.setFromAxisAngle(axis, Math.min(angle, PHYSICS.levelRate * dt))
  q.premultiply(dq)
}

function land(state: VehicleState, upY: number): void {
  const clean = upY >= PHYSICS.uprightCos && state.vy >= -PHYSICS.landMaxSink
  if (clean && state.leftRamp && state.didRoll) state.stuntDone = true
  state.event = clean ? 'land' : 'recover'
  state.leftRamp = false
  state.didRoll = false
  state.rollAccum = 0
  state.rollTime = 0
  state.mode = 'ground'
  state.y = 0
  state.vy = 0

  forward.set(0, 0, 1).applyQuaternion(q)
  if (Math.hypot(forward.x, forward.z) > 0.25) state.yaw = Math.atan2(forward.x, -forward.z)
  const fx = Math.sin(state.yaw)
  const fz = -Math.cos(state.yaw)
  const along = state.vx * fx + state.vz * fz
  state.speed = clamp(along * (clean ? 0.85 : 0.3), -PHYSICS.reverseMax, PHYSICS.maxSpeed)
  state.vx = fx * state.speed
  state.vz = fz * state.speed
  setBasis(state, fx, 0, fz, 0, 1, 0)
}
