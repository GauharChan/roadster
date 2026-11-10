/** C 形环坡。theta = 0 在入口，车头朝 -Z；增大 theta 即贴着内侧向上开。 */
export const RAMP = {
  radius: 22,
  launchTheta: (150 * Math.PI) / 180,
  halfWidth: 8,
  entranceZ: 0,
  centerX: 0,
  deckThickness: 0.55,
} as const

export interface RampSample {
  x: number
  y: number
  z: number
  tx: number
  ty: number
  tz: number
  ux: number
  uy: number
  uz: number
}

export function sampleRamp(theta: number, lateral = 0): RampSample {
  const radius = RAMP.radius
  return {
    x: RAMP.centerX + lateral,
    y: radius * (1 - Math.cos(theta)),
    z: RAMP.entranceZ - radius * Math.sin(theta),
    tx: 0,
    ty: Math.sin(theta),
    tz: -Math.cos(theta),
    ux: 0,
    uy: Math.cos(theta),
    uz: Math.sin(theta),
  }
}
