import {
  ConeGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
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

  return {
    root,
    hint,
    update(camera, look) {
      const placed = placeEdgeHint(camera, look)
      hint.visible = placed !== null
      if (!placed) return
      hint.position.set(placed.x, placed.y, placed.z)
      hint.lookAt(camera.x, camera.y, camera.z)
      const fx = look.x - camera.x
      const fy = look.y - camera.y
      const fz = look.z - camera.z
      const fl = Math.hypot(fx, fy, fz) || 1
      const forwardY = fy / fl
      const rx = -fz
      const rz = fx
      const rl = Math.hypot(rx, rz) || 1
      const vx = placed.x - camera.x
      const vy = placed.y - camera.y
      const vz = placed.z - camera.z
      const along = (vx * fx + vy * fy + vz * fz) / fl
      const lateral = (vx * rx + vz * rz) / rl
      const vertical = vy - forwardY * along
      hint.rotateZ(Math.atan2(lateral, vertical))
    },
    dispose() {
      hint.geometry.dispose()
      const material = hint.material
      if (!Array.isArray(material)) material.dispose()
    },
  }
}
