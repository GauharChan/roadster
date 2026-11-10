import {
  ConeGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  Vector3,
} from 'three'
import {
  FIELD_HOME,
  placeHorizonGuide,
  placeReturnCue,
  type Vec3,
} from './flightFrame'

export interface FlightGuides {
  root: Group
  horizon: Mesh
  cue: Mesh
  update: (camera: Vec3, look: Vec3, car: { x: number; z: number }, visible: boolean) => void
  dispose: () => void
}

export function createFlightGuides(): FlightGuides {
  const horizon = new Mesh(
    new PlaneGeometry(1, 1),
    new MeshBasicMaterial({
      color: '#d5deea',
      fog: false,
      toneMapped: false,
      depthWrite: false,
      transparent: true,
      opacity: 0.95,
      side: DoubleSide,
    }),
  )
  horizon.name = 'horizon-guide'
  horizon.renderOrder = 4
  horizon.frustumCulled = false

  const cue = new Mesh(
    new ConeGeometry(0.28, 0.9, 4),
    new MeshBasicMaterial({
      color: '#ff2a24',
      fog: false,
      toneMapped: false,
    }),
  )
  cue.name = 'return-cue'
  cue.renderOrder = 5
  cue.frustumCulled = false

  const root = new Group()
  root.name = 'flight-guides'
  root.add(horizon, cue)

  const aim = new Vector3()
  const from = new Vector3(0, 1, 0)

  return {
    root,
    horizon,
    cue,
    update(camera, look, car, visible) {
      horizon.visible = visible
      cue.visible = visible
      if (!visible) return
      const guide = placeHorizonGuide(camera, look)
      horizon.position.set(guide.x, guide.y, guide.z)
      horizon.lookAt(camera.x, camera.y, camera.z)
      horizon.scale.set(guide.width, 0.55, 1)
      const placed = placeReturnCue({
        camera,
        look,
        carX: car.x,
        carZ: car.z,
        homeX: FIELD_HOME.x,
        homeZ: FIELD_HOME.z,
      })
      cue.position.set(placed.x, placed.y, placed.z)
      aim.set(placed.aimX - placed.x, placed.aimY - placed.y, placed.aimZ - placed.z)
      if (aim.lengthSq() > 1e-6) cue.quaternion.setFromUnitVectors(from, aim.normalize())
    },
    dispose() {
      ;[horizon, cue].forEach((mesh) => {
        mesh.geometry.dispose()
        const material = mesh.material
        if (!Array.isArray(material)) material.dispose()
      })
    },
  }
}
