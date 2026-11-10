import { describe, expect, it } from 'vitest'
import { MeshBasicMaterial } from 'three'
import { HINT_COLOR } from './flightFrame'
import { createFlightGuides } from './flightGuides'

describe('离屏赛道提示', () => {
  it('看着赛道时不显示，赛道落到身后才显示，颜色是灰白', () => {
    const guides = createFlightGuides()
    guides.update({ x: 0, y: 8, z: 30 }, { x: 0, y: 6, z: -4 })
    expect(guides.hint.visible).toBe(false)
    guides.update({ x: 0, y: 50, z: -80 }, { x: 0, y: 49, z: -96 })
    expect(guides.hint.visible).toBe(true)
    expect(guides.hint.material).toBeInstanceOf(MeshBasicMaterial)
    const material = guides.hint.material
    if (material instanceof MeshBasicMaterial) expect(material.color.getHexString()).toBe(HINT_COLOR.slice(1))
    guides.dispose()
  })
})
