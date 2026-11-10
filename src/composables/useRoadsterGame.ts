import { nextTick, onMounted, onUnmounted, reactive, readonly, type ShallowRef } from 'vue'
import {
  ACESFilmicToneMapping,
  CircleGeometry,
  Material,
  Mesh,
  MeshBasicMaterial,
  SRGBColorSpace,
  Texture,
  Vector3,
  WebGLRenderer,
  type BufferGeometry,
} from 'three'
import { createCar, loadRoadster, type CarRig } from '../game/createCar'
import { createStage } from '../game/createScene'
import { type GameController, type GameHudState } from '../game/context'
import { frameFlightCamera } from '../game/flightFrame'
import { createFlightGuides } from '../game/flightGuides'
import { idleNotice, formatClimb, showMoment, tickMoment, type MomentNotice } from '../game/hudCue'
import { createThrusters, type ThrusterEmit } from '../game/thrusters'
import { createVehicle, resetVehicle, stepVehicle, type VehicleState } from '../game/vehicle'
import { useInput } from './useInput'

export function useRoadsterGame(
  stage: Readonly<ShallowRef<{ root: unknown } | null>>,
): GameController {
  const hud = reactive<GameHudState>({
    speedKmh: 0,
    altitude: 0,
    climb: '0',
    mode: 'ground',
    stuntDone: false,
    notice: '',
    noticeKind: 'none',
  })
  const input = useInput()
  let stop = () => {}

  onMounted(async () => {
    await nextTick()
    const element = resolveElement(stage.value)
    if (!element) return
    stop = mountGame(element, hud, input)
  })

  onUnmounted(() => {
    stop()
    stop = () => {}
  })

  return {
    hud: readonly(hud),
    setAccel: input.setAccel,
    setBrake: input.setBrake,
    setSteer: input.setSteer,
    setThrust: input.setThrust,
    requestFlip: input.requestFlip,
    requestReset: input.requestReset,
  }
}

function resolveElement(stage: { root: unknown } | null): HTMLElement | null {
  const root = stage?.root
  if (root instanceof HTMLElement) return root
  if (root && typeof root === 'object' && 'value' in root) {
    const value = (root as { value: unknown }).value
    return value instanceof HTMLElement ? value : null
  }
  return null
}

function mountGame(
  element: HTMLElement,
  hud: GameHudState,
  input: ReturnType<typeof useInput>,
): () => void {
  const { scene, camera } = createStage()
  let car: CarRig | null = null
  let running = true
  void loadRoadster().then(() => {
    if (!running) return
    car = createCar()
    scene.add(car.root)
    const parked = createCar(true)
    parked.root.position.set(22, 0, 64)
    parked.root.rotation.y = Math.PI
    scene.add(parked.root)
  }).catch((error: unknown) => {
    console.error(error)
  })

  const thrusters = createThrusters()
  scene.add(thrusters.root)
  const guides = createFlightGuides()
  scene.add(guides.root)

  const blobMaterial = new MeshBasicMaterial({
    color: '#000000',
    transparent: true,
    opacity: 0.35,
    depthWrite: false,
  })
  const blob = new Mesh(new CircleGeometry(1.7, 24), blobMaterial)
  blob.rotation.x = -Math.PI / 2
  blob.position.y = 0.04
  scene.add(blob)

  const state = createVehicle()
  const coarse = window.matchMedia('(pointer: coarse)').matches
  const renderer = new WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, coarse ? 1.25 : 1.75))
  renderer.outputColorSpace = SRGBColorSpace
  renderer.toneMapping = ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.12
  renderer.domElement.className = 'view'
  renderer.domElement.setAttribute('aria-hidden', 'true')
  element.appendChild(renderer.domElement)

  const heading = new Vector3(0, 0, -1)
  const desired = new Vector3()
  const look = new Vector3(state.x, 1.2, state.z)
  const lookTarget = new Vector3()
  const scratch = new Vector3()
  let notice: MomentNotice = idleNotice()
  let snapCamera = false
  const nozzle = new Vector3()
  const up = new Vector3()
  const side = new Vector3()
  let last = performance.now()

  const resize = () => {
    const width = element.clientWidth
    const height = element.clientHeight
    if (width === 0 || height === 0) return
    camera.aspect = width / height
    camera.updateProjectionMatrix()
    renderer.setSize(width, height, false)
  }
  resize()
  const observer = new ResizeObserver(resize)
  observer.observe(element)

  const onVisibility = () => {
    if (document.hidden) {
      running = false
      return
    }
    running = true
    last = performance.now()
    requestAnimationFrame(frame)
  }
  document.addEventListener('visibilitychange', onVisibility)

  const frame = (now: number) => {
    if (!running) return
    const dt = Math.min(0.033, (now - last) / 1000)
    last = now
    const command = input.sample()
    if (command.reset) {
      resetVehicle(state)
      heading.set(0, 0, -1)
      notice = showMoment('reset')
      snapCamera = true
    } else {
      stepVehicle(state, command, dt)
      if (state.event === 'land') notice = showMoment('land')
      else if (state.event === 'recover') notice = showMoment('recover')
    }
    notice = tickMoment(notice, dt)

    if (car) {
      car.root.position.set(state.x, state.y, state.z)
      car.root.quaternion.set(state.qx, state.qy, state.qz, state.qw)
      car.wheels.forEach((wheel) => {
        const axle = typeof wheel.userData.axle === 'number' ? wheel.userData.axle : 0
        const previous = typeof wheel.userData.roll === 'number' ? wheel.userData.roll : 0
        const roll = (previous + (state.speed * dt) / 0.36) % (Math.PI * 2)
        wheel.userData.roll = roll
        wheel.rotation.x = axle + roll
      })
    }
    const emitting = !command.reset && (command.thrust || state.rollTime > 0)
    if (car?.belly) car.belly.intensity = emitting ? 900 : 0

    const emits: ThrusterEmit[] = []
    const rig = car
    if (emitting && rig) {
      scratch.set(0, 0, 1).applyQuaternion(rig.root.quaternion)
      up.set(0, 1, 0).applyQuaternion(rig.root.quaternion)
      rig.nozzles.forEach(([x, y, z], index) => {
        const belly = index >= 2
        const back = belly ? 5 : 18
        const down = belly ? 24 : 9
        nozzle.set(x, y, z).applyQuaternion(rig.root.quaternion).add(rig.root.position)
        emits.push({
          x: nozzle.x,
          y: nozzle.y,
          z: nozzle.z,
          vx: -scratch.x * back - up.x * down + state.vx * 0.12,
          vy: -scratch.y * back - up.y * down + state.vy * 0.12,
          vz: -scratch.z * back - up.z * down + state.vz * 0.12,
        })
      })
      if (state.rollTime > 0) {
        side.crossVectors(up, scratch)
        if (side.lengthSq() > 1e-4) side.normalize()
        ;[-1.15, 1.15].forEach((offset) => {
          emits.push({
            x: state.x + side.x * offset,
            y: state.y + up.y * 0.35 + 0.15,
            z: state.z + side.z * offset,
            vx: side.x * offset * 16 - up.x * 8,
            vy: side.y * offset * 16 - up.y * 8,
            vz: side.z * offset * 16 - up.z * 8,
          })
        })
      }
    }
    const burst = state.event === 'land' || state.event === 'recover'
      ? { x: state.x, y: 0.4, z: state.z }
      : null
    const wash = emitting && state.y < 3.2 ? { x: state.x, z: state.z } : null
    thrusters.update(dt, emits, burst, camera.position, wash)
    blob.position.x = state.x
    blob.position.z = state.z
    const shadow = Math.max(0, 0.42 - state.y / 28)
    blobMaterial.opacity = shadow
    blob.visible = shadow > 0.03
    const shadowScale = 1 + Math.min(state.y, 10) * 0.12
    blob.scale.setScalar(shadowScale)
    updateCamera(camera, state, heading, desired, look, lookTarget, scratch, dt, snapCamera)
    snapCamera = false
    guides.update(
      camera.position,
      look,
      { x: state.x, z: state.z },
      state.mode === 'air',
    )
    publishHud(hud, state, notice)
    renderer.render(scene, camera)
    requestAnimationFrame(frame)
  }

  camera.position.set(8, 6, 66)
  requestAnimationFrame(frame)

  return () => {
    running = false
    document.removeEventListener('visibilitychange', onVisibility)
    observer.disconnect()
    thrusters.root.removeFromParent()
    thrusters.dispose()
    guides.root.removeFromParent()
    guides.dispose()
    disposeScene(scene)
    renderer.dispose()
    renderer.domElement.remove()
  }
}

function updateCamera(
  camera: { position: Vector3; lookAt: (target: Vector3) => void },
  state: VehicleState,
  heading: Vector3,
  desired: Vector3,
  look: Vector3,
  lookTarget: Vector3,
  scratch: Vector3,
  dt: number,
  snap: boolean,
): void {
  const planar = Math.hypot(state.vx, state.vz)
  if (planar > 6) {
    scratch.set(state.vx / planar, 0, state.vz / planar)
    heading.lerp(scratch, 1 - Math.exp(-2.4 * dt)).normalize()
  }
  if (state.mode === 'air') {
    const frame = frameFlightCamera({
      x: state.x,
      y: state.y,
      z: state.z,
      headingX: heading.x,
      headingZ: heading.z,
    })
    desired.set(frame.cameraX, frame.cameraY, frame.cameraZ)
    lookTarget.set(frame.lookX, frame.lookY, frame.lookZ)
  } else {
    const distance = 12 + Math.min(state.y, 42) * 0.28
    const side = 3.4
    desired.set(
      state.x - heading.x * distance - heading.z * side,
      Math.max(1.8, state.y * 0.38 + 3.5 + Math.min(state.y, 36) * 0.12),
      state.z - heading.z * distance + heading.x * side,
    )
    lookTarget.set(state.x, state.y + 1.15, state.z)
  }
  const blend = snap ? 1 : 1 - Math.exp(-3.4 * dt)
  camera.position.lerp(desired, blend)
  look.lerp(lookTarget, blend)
  camera.lookAt(look)
}

function publishHud(hud: GameHudState, state: VehicleState, notice: MomentNotice): void {
  const metersPerSecond = state.mode === 'air'
    ? Math.hypot(state.vx, state.vy, state.vz)
    : Math.abs(state.speed)
  const speedKmh = Math.round(metersPerSecond * 3.6)
  const altitude = Math.max(0, Math.round(state.y))
  const climb = formatClimb(state.vy)
  if (hud.speedKmh !== speedKmh) hud.speedKmh = speedKmh
  if (hud.altitude !== altitude) hud.altitude = altitude
  if (hud.climb !== climb) hud.climb = climb
  if (hud.mode !== state.mode) hud.mode = state.mode
  if (hud.stuntDone !== state.stuntDone) hud.stuntDone = state.stuntDone
  if (hud.notice !== notice.text) hud.notice = notice.text
  if (hud.noticeKind !== notice.kind) hud.noticeKind = notice.kind
}

function disposeScene(scene: { traverse: (callback: (object: object) => void) => void }): void {
  const geometries = new Set<BufferGeometry>()
  const materials = new Set<Material>()
  scene.traverse((object) => {
    if (!(object instanceof Mesh) && !('geometry' in object)) return
    const geometry = (object as Mesh).geometry
    if (geometry) geometries.add(geometry)
    const material = (object as Mesh).material
    if (Array.isArray(material)) material.forEach((entry) => materials.add(entry))
    else if (material) materials.add(material)
  })
  geometries.forEach((geometry) => geometry.dispose())
  materials.forEach((material) => {
    const mapped = material as Material & { map?: Texture | null }
    mapped.map?.dispose()
    material.dispose()
  })
}
