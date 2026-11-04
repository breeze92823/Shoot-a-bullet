import { Group, IcosahedronGeometry, Mesh, MeshLambertMaterial, MeshPhysicalMaterial, PlaneGeometry, Vector2 } from 'three'
import { WATER } from './config.js'
import { mulberry32, paintWaterNormal, toTexture } from './textures.js'
import { bake } from './bake.js'

// The sea around the lobby and the puffy cartoon clouds on the horizon. The
// sea uses one ripple normal map twice (normalMap + clearcoatNormalMap) at two
// scales, scrolled in different directions each frame, so it glitters.

function makeClouds() {
  const rand = mulberry32(2024)
  const geo = new IcosahedronGeometry(1, 3)
  const mat = new MeshLambertMaterial({ color: '#ffffff', emissive: '#e4f6ff', emissiveIntensity: 0.7, fog: false })
  const group = new Group()
  for (let i = 0; i < 34; i++) {
    // A ring all round the horizon.
    const ang = (i / 34) * Math.PI * 2 + rand() * 0.3
    const dist = 300 + rand() * 130
    const cloud = new Group()
    const puffs = 5 + Math.floor(rand() * 4)
    const len = 22 + rand() * 26
    for (let p = 0; p < puffs; p++) {
      const t = p / (puffs - 1) - 0.5
      const r = (1 - Math.abs(t) * 1.1) * (9 + rand() * 6)
      const puff = new Mesh(geo, mat)
      puff.scale.set(r, r * 0.82, r)
      puff.position.set(t * len, r * 0.25 + rand() * 3, (rand() - 0.5) * 8)
      cloud.add(puff)
    }
    const flat = new Mesh(geo, mat) // flat underside
    flat.scale.set(len * 0.62, 4, 9)
    cloud.add(flat)
    cloud.position.set(Math.cos(ang) * dist, 6 + rand() * 30, Math.sin(ang) * dist - 120)
    cloud.lookAt(0, cloud.position.y, 0)
    group.add(cloud)
  }
  return group
}

// The sea around the land and the clouds in the sky.
export function createWorld(scene) {
  // Sea: physical material, two scrolling ripple layers, slightly see-through.
  const ripples = paintWaterNormal()
  const normalA = toTexture(ripples, { repeat: WATER.size / 14 })
  const normalB = toTexture(ripples, { repeat: WATER.size / 37 })
  const sea = new Mesh(
    new PlaneGeometry(WATER.size, WATER.size),
    new MeshPhysicalMaterial({
      color: WATER.color,
      roughness: 0.3,
      metalness: 0,
      normalMap: normalA,
      normalScale: new Vector2(0.3, 0.3),
      clearcoat: 1,
      clearcoatRoughness: 0.08,
      clearcoatNormalMap: normalB,
      clearcoatNormalScale: new Vector2(0.5, 0.5),
      transparent: true,
      opacity: 0.94,
    }),
  )
  sea.rotation.x = -Math.PI / 2
  sea.position.y = WATER.level
  sea.receiveShadow = true
  scene.add(sea, bake(makeClouds())) // ~270 puffs merged into one draw call

  return {
    setSeaColor: (color) => sea.material.color.set(color),
    update(dt, elapsed) {
      // One ripple tile is 14 m (A) / 37 m (B); v runs toward -Z.
      normalA.offset.set(elapsed * 0.012, elapsed * 0.02)
      normalB.offset.set(-elapsed * 0.008, elapsed * 0.005)
    },
  }
}
