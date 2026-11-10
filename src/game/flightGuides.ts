import {
  ConeGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  Vector3,
} from 'three'
import {
  HINT_COLOR,
  placeEdgeHint,
  type Vec3,
} from './flightFrame'

export interface FlightGuides {
  root: Group
  hint: Mesh
  update: (camera: Vec3, look: Vec3) => void
  dispose: () => void
}

export function createFlightGuides(): FlightGuides {
  const hint = new Mesh(
    new ConeGeometry(0.16, 0.55, 4),
    new MeshBasicMaterial({
      color: HINT_COLOR,
      fog: false,
      toneMapped: false,
    }),
  )
  hint.name = 'course-hint'
  hint.visible = false
  hint.frustumCulled = false
  hint.renderOrder = 4

  const root = new Group()
  root.name = 'flight-guides'
  root.add(hint)

  const aim = new Vector3()
  const from = new Vector3(0, 1, 0)

  return {
    root,
    hint,
    update(camera, look) {
      const placed = placeEdgeHint(camera, look)
      hint.visible = placed !== null
      if (!placed) return
      hint.position.set(placed.x, placed.y, placed.z)
      const nearest = placeEdgeHint(camera, look)
      if (!nearest) return
      aim.set(nearest.x - camera.x, nearest.y - camera.y, nearest.z - camera.z)
      if (aim.lengthSq() > 1e-6) hint.quaternion.setFromUnitVectors(from, aim.normalize())
    },
    dispose() {
      hint.geometry.dispose()
      const material = hint.material
      if (!Array.isArray(material)) material.dispose()
    },
  }
}
