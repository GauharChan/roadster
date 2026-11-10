import {
  AdditiveBlending,
  CanvasTexture,
  DoubleSide,
  Group,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  NormalBlending,
  PlaneGeometry,
  SRGBColorSpace,
  Vector3,
} from 'three'

export interface ThrusterEmit {
  x: number
  y: number
  z: number
  vx: number
  vy: number
  vz: number
}

export interface ThrusterBurst {
  x: number
  y: number
  z: number
}

interface Puff {
  mesh: Mesh
  life: number
  maxLife: number
  x: number
  y: number
  z: number
  vx: number
  vy: number
  vz: number
  width0: number
  width1: number
  length0: number
  length1: number
  stretch: boolean
}

const coarse = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches
const JET_COUNT = coarse ? 96 : 150
const SMOKE_COUNT = coarse ? 48 : 80

export interface ThrusterPool {
  root: Group
  update: (
    dt: number,
    emits: ThrusterEmit[],
    burst: ThrusterBurst | null,
    cameraPosition: Vector3,
    wash: { x: number; z: number } | null,
  ) => void
  dispose: () => void
}

export function createThrusters(): ThrusterPool {
  const root = new Group()
  root.name = 'thrusters'
  const jetGeometry = new PlaneGeometry(1, 1)
  const smokeGeometry = new PlaneGeometry(1, 1)
  const jetMap = streakTexture()
  const smokeMap = puffTexture()
  const jets = Array.from({ length: JET_COUNT }, () => createPuff(jetGeometry, jetMaterial(jetMap), true))
  const smokes = Array.from({ length: SMOKE_COUNT }, () => createPuff(smokeGeometry, smokeMaterial(smokeMap), false))
  jets.forEach((puff) => root.add(puff.mesh))
  smokes.forEach((puff) => root.add(puff.mesh))

  const direction = new Vector3()
  const toCamera = new Vector3()
  const axisX = new Vector3()
  const axisZ = new Vector3()
  const basis = new Matrix4()

  const spawn = (
    pool: Puff[],
    x: number,
    y: number,
    z: number,
    vx: number,
    vy: number,
    vz: number,
    life: number,
    width0: number,
    width1: number,
    length0: number,
    length1: number,
  ) => {
    const puff = pool.find((item) => item.life <= 0) ?? pool.reduce((older, item) => (item.life < older.life ? item : older))
    puff.life = life
    puff.maxLife = life
    puff.x = x
    puff.y = y
    puff.z = z
    puff.vx = vx
    puff.vy = vy
    puff.vz = vz
    puff.width0 = width0
    puff.width1 = width1
    puff.length0 = length0
    puff.length1 = length1
    puff.mesh.visible = true
    puff.mesh.position.set(x, y, z)
  }

  const step = (puff: Puff, dt: number, cameraPosition: Vector3) => {
    const next = puff.life - dt
    puff.life = next
    const material = puff.mesh.material
    if (!(material instanceof MeshBasicMaterial)) return
    if (next <= 0) {
      puff.mesh.visible = false
      material.opacity = 0
      return
    }

    const drag = Math.exp(-(puff.stretch ? 0.45 : 0.9) * dt)
    puff.vx *= drag
    puff.vy *= drag
    puff.vz *= drag
    if (!puff.stretch) puff.vy += 0.7 * dt
    puff.x += puff.vx * dt
    puff.y += puff.vy * dt
    puff.z += puff.vz * dt

    const age = 1 - next / puff.maxLife
    const width = puff.width0 + (puff.width1 - puff.width0) * age
    const length = puff.length0 + (puff.length1 - puff.length0) * age
    const fade = puff.stretch ? (next / puff.maxLife) ** 0.55 : (next / puff.maxLife) ** 0.8
    material.opacity = fade * (puff.stretch ? 0.92 : 0.38)

    if (!puff.stretch) {
      puff.mesh.position.set(puff.x, puff.y, puff.z)
      puff.mesh.scale.set(width, width, 1)
      puff.mesh.lookAt(cameraPosition)
      return
    }

    direction.set(puff.vx, puff.vy, puff.vz)
    const speed = direction.length()
    if (speed < 0.05) {
      puff.mesh.visible = false
      return
    }
    direction.multiplyScalar(1 / speed)
    puff.mesh.position.set(
      puff.x + direction.x * length * 0.5,
      puff.y + direction.y * length * 0.5,
      puff.z + direction.z * length * 0.5,
    )
    toCamera.subVectors(cameraPosition, puff.mesh.position)
    axisX.crossVectors(direction, toCamera)
    if (axisX.lengthSq() < 1e-6) axisX.set(1, 0, 0)
    axisX.normalize()
    axisZ.crossVectors(axisX, direction).normalize()
    basis.makeBasis(axisX, direction, axisZ)
    puff.mesh.quaternion.setFromRotationMatrix(basis)
    puff.mesh.scale.set(width, length, 1)
  }

  return {
    root,
    update(dt, emits, burst, cameraPosition, wash) {
      emits.forEach((emit) => {
        const speed = Math.hypot(emit.vx, emit.vy, emit.vz) || 1
        const sway = 0.08
        spawn(
          jets,
          emit.x,
          emit.y,
          emit.z,
          emit.vx * (1 + (Math.random() - 0.5) * sway),
          emit.vy * (1 + (Math.random() - 0.5) * sway),
          emit.vz * (1 + (Math.random() - 0.5) * sway),
          0.62,
          0.22,
          Math.min(2.2, 0.45 + speed * 0.06),
          Math.min(3.4, 0.9 + speed * 0.08),
          Math.min(8.2, 2.2 + speed * 0.22),
        )
        if (Math.random() < (coarse ? 0.28 : 0.42)) {
          spawn(
            smokes,
            emit.x,
            emit.y,
            emit.z,
            emit.vx * 0.28 + (Math.random() - 0.5) * 2.2,
            emit.vy * 0.28 + (Math.random() - 0.5) * 1.4,
            emit.vz * 0.28 + (Math.random() - 0.5) * 2.2,
            1.05,
            0.9,
            3.8,
            0.9,
            3.8,
          )
        }
      })

      if (wash) {
        spawn(
          smokes,
          wash.x + (Math.random() - 0.5) * 1.4,
          0.25,
          wash.z + (Math.random() - 0.5) * 1.4,
          (Math.random() - 0.5) * 5,
          0.4 + Math.random(),
          (Math.random() - 0.5) * 5,
          1.15,
          1.6,
          5.2,
          1.6,
          5.2,
        )
      }

      if (burst) {
        Array.from({ length: 18 }, (_, index) => {
          const angle = (index / 18) * Math.PI * 2
          const radius = 3 + Math.random() * 5
          spawn(
            smokes,
            burst.x,
            0.3,
            burst.z,
            Math.cos(angle) * radius,
            0.3 + Math.random() * 1.4,
            Math.sin(angle) * radius,
            1.4,
            2.2,
            7.5,
            2.2,
            7.5,
          )
        })
      }

      jets.forEach((puff) => step(puff, dt, cameraPosition))
      smokes.forEach((puff) => step(puff, dt, cameraPosition))
    },
    dispose() {
      jetGeometry.dispose()
      smokeGeometry.dispose()
      jetMap.dispose()
      smokeMap.dispose()
      ;[...jets, ...smokes].forEach((puff) => {
        const material = puff.mesh.material
        if (!Array.isArray(material)) material.dispose()
      })
    },
  }
}

function createPuff(geometry: PlaneGeometry, material: MeshBasicMaterial, stretch: boolean): Puff {
  const mesh = new Mesh(geometry, material)
  mesh.visible = false
  mesh.frustumCulled = false
  mesh.renderOrder = stretch ? 3 : 2
  return {
    mesh,
    life: 0,
    maxLife: 1,
    x: 0,
    y: -40,
    z: 0,
    vx: 0,
    vy: 0,
    vz: 0,
    width0: 1,
    width1: 1,
    length0: 1,
    length1: 1,
    stretch,
  }
}

function jetMaterial(map: CanvasTexture): MeshBasicMaterial {
  return new MeshBasicMaterial({
    map,
    color: '#e9f6ff',
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: AdditiveBlending,
    toneMapped: false,
    fog: false,
    side: DoubleSide,
  })
}

function smokeMaterial(map: CanvasTexture): MeshBasicMaterial {
  return new MeshBasicMaterial({
    map,
    color: '#f3f6f8',
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: NormalBlending,
    toneMapped: false,
    side: DoubleSide,
  })
}

function streakTexture(): CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 64
  canvas.height = 256
  const context = canvas.getContext('2d')
  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  if (!context) return texture
  const image = context.createImageData(64, 256)
  for (let y = 0; y < 256; y += 1) {
    const nozzle = y / 255
    const axial = nozzle ** 0.45 * (0.2 + 0.8 * nozzle)
    for (let x = 0; x < 64; x += 1) {
      const lateral = Math.exp(-((x / 32 - 1) ** 2) * 7.5)
      const alpha = Math.round(axial * lateral * 255)
      const index = (y * 64 + x) * 4
      const blue = Math.min(255, 232 + Math.round((1 - nozzle) * 22))
      image.data[index] = 244
      image.data[index + 1] = 248
      image.data[index + 2] = blue
      image.data[index + 3] = alpha
    }
  }
  context.putImageData(image, 0, 0)
  texture.needsUpdate = true
  return texture
}

function puffTexture(): CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 128
  canvas.height = 128
  const context = canvas.getContext('2d')
  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  if (!context) return texture
  const gradient = context.createRadialGradient(64, 64, 4, 64, 64, 64)
  gradient.addColorStop(0, 'rgba(255,255,255,0.85)')
  gradient.addColorStop(0.35, 'rgba(226,236,242,0.38)')
  gradient.addColorStop(1, 'rgba(226,236,242,0)')
  context.fillStyle = gradient
  context.fillRect(0, 0, 128, 128)
  texture.needsUpdate = true
  return texture
}
