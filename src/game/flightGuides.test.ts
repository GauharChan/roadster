import { describe, expect, it } from 'vitest'
import { frameFlightCamera, placeHorizonGuide } from './flightFrame'
import { createFlightGuides } from './flightGuides'

describe('飞行参照物体', () => {
  it('飞行时把地平线放在镜头高度，落地后藏起', () => {
    const guides = createFlightGuides()
    const frame = frameFlightCamera({ x: 0, y: 49, z: 0, headingX: 0, headingZ: -1 })
    const camera = { x: frame.cameraX, y: frame.cameraY, z: frame.cameraZ }
    const look = { x: frame.lookX, y: frame.lookY, z: frame.lookZ }
    guides.update(camera, look, { x: 0, z: 0 }, true)
    const guide = placeHorizonGuide(camera, look)
    expect(guides.horizon.visible).toBe(true)
    expect(guides.horizon.position.y).toBeCloseTo(guide.y, 5)
    expect(guides.horizon.position.x).toBeCloseTo(guide.x, 5)
    expect(guides.horizon.position.z).toBeCloseTo(guide.z, 5)
    expect(guides.cue.visible).toBe(true)
    guides.update(camera, look, { x: 0, z: 0 }, false)
    expect(guides.horizon.visible).toBe(false)
    expect(guides.cue.visible).toBe(false)
    guides.dispose()
  })
})
