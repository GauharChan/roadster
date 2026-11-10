import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { Box3, Vector3 } from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { createCar, setRoadsterTemplate } from './createCar'

describe('createCar', () => {
  it('用 Roadster 车身，车头朝前、四轮着地', async () => {
    const data = readFileSync(new URL('../../public/models/roadster.glb', import.meta.url))
    const loader = new GLTFLoader()
    const gltf = await loader.parseAsync(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength), '')
    setRoadsterTemplate(gltf.scene)
    gltf.scene.updateMatrixWorld(true)
    const size = new Box3().setFromObject(gltf.scene).getSize(new Vector3())
    expect(size.z).toBeGreaterThan(size.x)
    expect(size.y).toBeLessThan(1.4)

    const car = createCar(true)
    car.root.updateMatrixWorld(true)
    expect(car.wheels).toHaveLength(4)
    const front = car.wheels.find((wheel) => wheel.name.includes('Ft'))
    const rear = car.wheels.find((wheel) => wheel.name.includes('Bk'))
    const frontPos = new Vector3()
    const rearPos = new Vector3()
    front?.getWorldPosition(frontPos)
    rear?.getWorldPosition(rearPos)
    expect(frontPos.z).toBeGreaterThan(rearPos.z)
  })
})
