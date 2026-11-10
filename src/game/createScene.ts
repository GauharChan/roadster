import {
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  FogExp2,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PerspectiveCamera,
  RepeatWrapping,
  Scene,
  SRGBColorSpace,
  Vector3,
  BoxGeometry,
  CylinderGeometry,
  SphereGeometry,
  AmbientLight,
  DirectionalLight,
  HemisphereLight,
  SpotLight,
  Points,
  PointsMaterial,
  Object3D,
} from 'three'
import { VIEW_FOV_DEG } from './flightFrame'
import { RAMP, sampleRamp } from './ramp'

export interface Stage {
  scene: Scene
  camera: PerspectiveCamera
}

const SEGMENTS = 56

export function createStage(): Stage {
  const scene = new Scene()
  scene.background = new Color('#07080c')
  scene.fog = new FogExp2('#07080c', 0.0085)

  const camera = new PerspectiveCamera(VIEW_FOV_DEG, 1, 0.1, 500)
  camera.position.set(8, 7, 64)

  scene.add(createGround())
  scene.add(createMarkings())
  scene.add(createRamp())
  scene.add(createLamps())
  scene.add(createTruck())
  scene.add(createStars())
  addLights(scene)

  return { scene, camera }
}

function createGround(): Mesh {
  const geometry = new BoxGeometry(460, 1, 460)
  const material = new MeshStandardMaterial({
    color: '#1a1d24',
    map: grainTexture('#1a1d24', 18, 24, 24),
    roughness: 0.94,
    metalness: 0.04,
  })
  const mesh = new Mesh(geometry, material)
  mesh.position.y = -0.5
  return mesh
}

function createMarkings(): Group {
  const group = new Group()
  const paint = new MeshBasicMaterial({ color: '#f3f1ec', toneMapped: false })
  const edge = new BoxGeometry(0.14, 0.02, 78)
  ;[-3.4, 3.4].forEach((x) => {
    const line = new Mesh(edge, paint)
    line.position.set(x, 0.02, 42)
    group.add(line)
  })

  const dash = new BoxGeometry(0.12, 0.02, 2.1)
  Array.from({ length: 15 }, (_, index) => {
    const mark = new Mesh(dash, paint)
    mark.position.set(0, 0.02, 8 + index * 4.6)
    group.add(mark)
  })

  const cross = new Mesh(new BoxGeometry(46, 0.02, 0.12), paint)
  cross.position.set(0, 0.02, 28)
  group.add(cross)
  return group
}

function createRamp(): Group {
  const group = new Group()
  const concrete = new MeshStandardMaterial({
    color: '#c8c4b8',
    map: grainTexture('#c8c4b8', 22, 1, 1),
    roughness: 0.88,
    metalness: 0.02,
  })
  const deck = new Mesh(slabGeometry(), concrete)
  group.add(deck)

  const stripe = new Mesh(
    ribbonGeometry(-0.14, 0.14, 0.04),
    new MeshBasicMaterial({ color: '#f4f2ec', toneMapped: false }),
  )
  group.add(stripe)

  const edgeMaterial = new MeshBasicMaterial({ color: '#ff2a24', toneMapped: false })
  const edge = RAMP.halfWidth
  group.add(new Mesh(ribbonGeometry(edge - 0.42, edge, 0.06), edgeMaterial))
  group.add(new Mesh(ribbonGeometry(-edge, -edge + 0.42, 0.06), edgeMaterial))

  addTruss(group)
  return group
}

function slabGeometry(): BufferGeometry {
  const positions: number[] = []
  const normals: number[] = []
  const uvs: number[] = []
  const indices: number[] = []
  const frames = Array.from({ length: SEGMENTS + 1 }, (_, index) => {
    const theta = (RAMP.launchTheta * index) / SEGMENTS
    return {
      left: sampleRamp(theta, -RAMP.halfWidth),
      right: sampleRamp(theta, RAMP.halfWidth),
      v: index / 6,
    }
  })

  const push = (
    x: number,
    y: number,
    z: number,
    nx: number,
    ny: number,
    nz: number,
    u: number,
    v: number,
  ) => {
    positions.push(x, y, z)
    normals.push(nx, ny, nz)
    uvs.push(u, v)
  }

  frames.forEach((frame) => {
    ;[frame.left, frame.right].forEach((point, side) => {
      push(point.x, point.y, point.z, point.ux, point.uy, point.uz, side, frame.v)
    })
  })
  const topCount = frames.length * 2
  frames.forEach((frame) => {
    ;[frame.left, frame.right].forEach((point, side) => {
      push(
        point.x - point.ux * RAMP.deckThickness,
        point.y - point.uy * RAMP.deckThickness,
        point.z - point.uz * RAMP.deckThickness,
        -point.ux,
        -point.uy,
        -point.uz,
        side,
        frame.v,
      )
    })
  })

  const stitch = (offset: number, flip: boolean) => {
    Array.from({ length: SEGMENTS }, (_, index) => {
      const a = offset + index * 2
      const b = a + 1
      const c = a + 2
      const d = a + 3
      if (flip) indices.push(a, c, b, b, c, d)
      else indices.push(a, b, c, b, d, c)
    })
  }
  stitch(0, false)
  stitch(topCount, true)

  const skirt = (lateral: number, outward: number) => {
    const base = positions.length / 3
    frames.forEach((frame, index) => {
      const point = lateral > 0 ? frame.right : frame.left
      const v = index / SEGMENTS
      push(point.x, point.y, point.z, outward, 0, 0, 0, v)
      push(
        point.x - point.ux * RAMP.deckThickness,
        point.y - point.uy * RAMP.deckThickness,
        point.z - point.uz * RAMP.deckThickness,
        outward,
        0,
        0,
        1,
        v,
      )
    })
    Array.from({ length: SEGMENTS }, (_, index) => {
      const a = base + index * 2
      const b = a + 1
      const c = a + 2
      const d = a + 3
      if (outward > 0) indices.push(a, c, b, c, d, b)
      else indices.push(a, b, c, b, d, c)
    })
  }
  skirt(RAMP.halfWidth, 1)
  skirt(-RAMP.halfWidth, -1)

  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3))
  geometry.setAttribute('normal', new BufferAttribute(new Float32Array(normals), 3))
  geometry.setAttribute('uv', new BufferAttribute(new Float32Array(uvs), 2))
  geometry.setIndex(indices)
  return geometry
}

function ribbonGeometry(lateralA: number, lateralB: number, lift: number): BufferGeometry {
  const positions: number[] = []
  const normals: number[] = []
  const uvs: number[] = []
  const indices: number[] = []
  Array.from({ length: SEGMENTS + 1 }, (_, index) => {
    const theta = (RAMP.launchTheta * index) / SEGMENTS
    const v = (index / SEGMENTS) * 8
    ;[sampleRamp(theta, lateralA), sampleRamp(theta, lateralB)].forEach((point, side) => {
      positions.push(point.x + point.ux * lift, point.y + point.uy * lift, point.z + point.uz * lift)
      normals.push(point.ux, point.uy, point.uz)
      uvs.push(side, v)
    })
  })
  Array.from({ length: SEGMENTS }, (_, index) => {
    const a = index * 2
    indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
  })
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3))
  geometry.setAttribute('normal', new BufferAttribute(new Float32Array(normals), 3))
  geometry.setAttribute('uv', new BufferAttribute(new Float32Array(uvs), 2))
  geometry.setIndex(indices)
  return geometry
}

function addTruss(group: Group): void {
  const material = new MeshStandardMaterial({ color: '#aeb6c0', metalness: 0.72, roughness: 0.34 })
  const beamGeo = new BoxGeometry(1, 1, 1)
  const stations = Array.from({ length: 12 }, (_, index) => {
    const theta = (RAMP.launchTheta * (index + 0.5)) / 12
    return sampleRamp(theta, RAMP.halfWidth)
  })

  const place = (from: Vector3, to: Vector3, thickness: number) => {
    const direction = to.clone().sub(from)
    const length = direction.length()
    if (length < 0.05) return
    const mesh = new Mesh(beamGeo, material)
    mesh.position.copy(from).addScaledVector(direction, 0.5)
    mesh.scale.set(thickness, thickness, length)
    mesh.quaternion.setFromUnitVectors(new Vector3(0, 0, 1), direction.normalize())
    group.add(mesh)
  }

  stations.forEach((point, index) => {
    const edge = new Vector3(point.x, point.y, point.z)
    const foot = new Vector3(point.x + 2.4, 0, point.z)
    const rib = new Vector3(
      point.x - point.ux * 2.4,
      point.y - point.uy * 2.4,
      point.z - point.uz * 2.4,
    )
    place(edge, foot, 0.16)
    place(edge, rib, 0.12)
    const next = stations[index + 1]
    if (!next) return
    const nextEdge = new Vector3(next.x, next.y, next.z)
    place(edge, nextEdge, 0.1)
    place(foot, new Vector3(next.x + 2.4, 0, next.z), 0.1)
    if (index % 2 === 0) place(edge, new Vector3(next.x + 2.4, 0, next.z), 0.08)
  })
}

function createLamps(): Group {
  const group = new Group()
  const glow = new MeshBasicMaterial({ color: '#ff2a24', toneMapped: false })
  const bulb = new SphereGeometry(0.18, 10, 8)
  Array.from({ length: 16 }, (_, index) => {
    const lamp = new Mesh(bulb, glow)
    lamp.position.set(15.5, 0.28, 8 + index * 3.1)
    group.add(lamp)
  })
  return group
}

function createTruck(): Group {
  const group = new Group()
  const body = new MeshStandardMaterial({ color: '#d9dde4', roughness: 0.55, metalness: 0.35 })
  const shade = new MeshStandardMaterial({ color: '#8d939c', roughness: 0.6, metalness: 0.2 })
  const trailer = new Mesh(new BoxGeometry(2.8, 3.6, 12), body)
  trailer.position.set(0, 1.8, 0)
  const cab = new Mesh(new BoxGeometry(2.7, 2.8, 2.6), shade)
  cab.position.set(0, 1.4, 7.1)
  const rubber = new MeshStandardMaterial({ color: '#15171b', roughness: 0.9 })
  const wheel = new CylinderGeometry(0.45, 0.45, 0.4, 12)
  group.add(trailer, cab)
  ;[-4.2, -1.2, 5.8, 7.2].forEach((z) => {
    ;[-1.15, 1.15].forEach((x) => {
      const mesh = new Mesh(wheel, rubber)
      mesh.rotation.z = Math.PI / 2
      mesh.position.set(x, 0.45, z)
      group.add(mesh)
    })
  })
  group.position.set(-26, 0, 20)
  group.rotation.y = Math.PI / 2
  return group
}

function createStars(): Points {
  const positions = Array.from({ length: 80 }, () => {
    const angle = Math.random() * Math.PI * 2
    const radius = 80 + Math.random() * 140
    const y = 30 + Math.random() * 80
    return [Math.cos(angle) * radius, y, Math.sin(angle) * radius]
  }).flat()
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3))
  const material = new PointsMaterial({
    color: '#c5ceda',
    size: 0.45,
    sizeAttenuation: true,
    toneMapped: false,
  })
  return new Points(geometry, material)
}

function addLights(scene: Scene): void {
  scene.add(new AmbientLight('#b7c3d4', 0.22))
  scene.add(new HemisphereLight('#8ea0b8', '#1a140f', 0.4))
  const moon = new DirectionalLight('#d5e2f5', 1.35)
  moon.position.set(40, 70, 24)
  scene.add(moon)

  const aim = (light: SpotLight, x: number, y: number, z: number) => {
    const target = new Object3D()
    target.position.set(x, y, z)
    scene.add(light, target)
    light.target = target
  }

  const mouth = new SpotLight('#f7f4ee', 2800, 80, 0.55, 0.45, 2)
  mouth.position.set(-6, 10, 26)
  aim(mouth, 0, 8, -6)

  const crown = new SpotLight('#f2f6ff', 2200, 90, 0.5, 0.5, 2)
  crown.position.set(28, 26, -18)
  aim(crown, 2, 18, -8)
}

function grainTexture(hex: string, amount: number, repeatX: number, repeatY: number): CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 128
  canvas.height = 128
  const context = canvas.getContext('2d')
  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  texture.wrapS = RepeatWrapping
  texture.wrapT = RepeatWrapping
  texture.repeat.set(repeatX, repeatY)
  if (!context) return texture
  context.fillStyle = hex
  context.fillRect(0, 0, 128, 128)
  const image = context.getImageData(0, 0, 128, 128)
  for (let index = 0; index < image.data.length; index += 4) {
    const noise = (Math.random() - 0.5) * amount
    image.data[index] = clampByte((image.data[index] ?? 0) + noise)
    image.data[index + 1] = clampByte((image.data[index + 1] ?? 0) + noise)
    image.data[index + 2] = clampByte((image.data[index + 2] ?? 0) + noise)
  }
  context.putImageData(image, 0, 0)
  texture.needsUpdate = true
  return texture
}

function clampByte(value: number): number {
  return Math.max(0, Math.min(255, value))
}
