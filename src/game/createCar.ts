import {
  Color,
  Group,
  Mesh,
  PointLight,
  SpotLight,
  type Material,
  type Object3D,
} from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'

export interface CarRig {
  root: Group
  wheels: Object3D[]
  nozzles: Array<[number, number, number]>
  belly: PointLight | null
}

const PAINT = new Color('#e6e9f0')
const PAINT_GLOW = new Color('#2c3342')

let template: Group | null = null

export function setRoadsterTemplate(scene: Group): void {
  tuneMaterials(scene)
  template = scene
}

export function loadRoadster(): Promise<void> {
  if (template) return Promise.resolve()
  const loader = new GLTFLoader()
  return new Promise((resolve, reject) => {
    loader.load(
      '/models/roadster.glb',
      (gltf) => {
        setRoadsterTemplate(gltf.scene)
        resolve()
      },
      undefined,
      reject,
    )
  })
}

export function createCar(parked = false): CarRig {
  if (!template) throw new Error('Roadster 模型还没载入')
  const root = new Group()
  root.name = parked ? 'parked-car' : 'player-car'
  const model = template.clone(true)
  root.add(model)

  const wheels: Object3D[] = []
  model.traverse((obj) => {
    if (!/^TRDEF-Wheel(Ft|Bk)[LR]$/.test(obj.name)) return
    obj.userData.axle = obj.rotation.x
    wheels.push(obj)
  })

  let belly: PointLight | null = null
  if (!parked) {
    belly = new PointLight('#b7e4ff', 0, 18, 2)
    belly.position.set(0, 0.2, -0.35)
    root.add(belly)
    ;[-0.55, 0.55].forEach((x) => {
      const beam = new SpotLight('#f3f7ff', 900, 36, 0.42, 0.65, 2)
      beam.position.set(x, 0.55, 1.85)
      const target = new Group()
      target.position.set(x * 0.2, 0.35, 12)
      root.add(beam, target)
      beam.target = target
    })
  }

  return {
    root,
    wheels,
    belly,
    nozzles: [
      [-0.62, 0.38, -2.05],
      [0.62, 0.38, -2.05],
      [-0.42, 0.08, -0.15],
      [0.42, 0.08, -0.15],
    ],
  }
}

function tuneMaterials(scene: Group): void {
  scene.traverse((obj) => {
    if (!(obj instanceof Mesh)) return
    const materials = Array.isArray(obj.material) ? obj.material : [obj.material]
    materials.forEach((material) => paintSilver(material))
  })
}

function paintSilver(material: Material): void {
  if (!('color' in material) || !material.color || material.userData.silver) return
  const named = material.name.replaceAll(' ', '_').toLowerCase()
  if (!named.includes('car_main_paint')) return
  const surface = material as Material & {
    color: Color
    emissive?: Color
    emissiveIntensity?: number
    metalness?: number
    roughness?: number
  }
  surface.color.copy(PAINT)
  if (surface.emissive) surface.emissive.copy(PAINT_GLOW)
  surface.emissiveIntensity = 0.45
  surface.metalness = 0.78
  surface.roughness = 0.26
  material.userData.silver = true
}
