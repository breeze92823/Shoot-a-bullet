// The Gun Shop (west), detailed after the reference and at its scale (pads
// ~2 m wide, ~3.5 m apart, one character height each): a grey studded plaza
// on a darker ledge with trim bands and an entrance step, the raised back tier
// with a plinth and a lit edge, two-step stairs with cheek walls at both ends,
// and the yellow GUN SHOP board framed in darker bricks on two lavender posts
// with bases. Each gun stands on a layered pad: navy base, darker bevel, a
// glowing studded plate (green owned, blue equipped, red locked) with a neon
// frame, a square light tube fading upward, a floor glow, and the gun itself,
// scaled to fit, tilted and turning slowly, with its name / damage / price above.
import { AdditiveBlending, Box3, BoxGeometry, CylinderGeometry, DoubleSide, Group, Mesh, MeshBasicMaterial, Vector3 } from 'three'
import { GUN_SHOP, GUNS, PALETTE as P } from './config.js'
import { brick, legoMat, span } from './lego.js'
import { solidBox } from './propkit.js'
import { signPlane, signSprite } from './signs.js'
import { makeGun } from './guns.js'
import * as K from './lobbykit.js'

const STATE_COLOR = { equipped: '#2fa8ff', owned: '#3fe06a', locked: '#ff4b5c' }
const NAVY = '#1b2433'
const PAD = 1.15 // half-width of a pad's navy base
const PAD_TOP = 0.41 // pad height above the floor it stands on

function gunLines(gun, state) {
  const lines = [
    { text: gun.name, size: 70, color: '#ffffff' },
    { text: `x${gun.mult} DAMAGE`, size: 62, color: '#ffd21f' },
  ]
  if (state === 'equipped') lines.push({ text: 'EQUIPPED', size: 62, color: '#3fb4ff' })
  else if (state === 'owned') lines.push({ text: 'OWNED', size: 62, color: '#5dff4a' })
  else lines.push({ text: `${K.fmtShort(gun.cost)} WINS`, size: 62, color: '#ff7a2a', icon: 'trophy' })
  return lines
}

export function buildGunShop(root, live) {
  const S = GUN_SHOP
  const L = S.ledge
  const [tz0, tz1] = S.tierZ
  const fy = S.floorY
  const ty = S.tierY

  // Ledge, floor, trim bands, entrance step.
  span(root, P.stoneDark, S.minX, 0, S.minZ, S.maxX, 0.4, S.maxZ, { cast: false })
  span(root, P.stone, S.minX + L, 0.4, S.minZ + L, S.maxX - L, fy, S.maxZ - L, { cast: false })
  solidBox((S.maxX - S.minX) / 2, 0.2, (S.maxZ - S.minZ) / 2, (S.minX + S.maxX) / 2, 0.2, (S.minZ + S.maxZ) / 2)
  solidBox((S.maxX - S.minX) / 2 - L, 0.2, (S.maxZ - S.minZ) / 2 - L, (S.minX + S.maxX) / 2, 0.6, (S.minZ + S.maxZ) / 2)
  const trim = '#80849a'
  span(root, trim, S.minX + L, fy, S.minZ + L, S.maxX - L, fy + 0.04, S.minZ + L + 0.5, { cast: false })
  span(root, trim, S.minX + L, fy, S.maxZ - L - 0.5, S.maxX - L, fy + 0.04, S.maxZ - L, { cast: false })
  span(root, trim, S.maxX - L - 0.5, fy, S.minZ + L + 0.5, S.maxX - L, fy + 0.04, S.maxZ - L - 0.5, { cast: false })
  span(root, P.stone, S.maxX, 0, 1, S.maxX + 0.8, 0.2, 7, { cast: false }) // entrance step off the west path

  // The raised back tier: plinth, lit front edge, stairs with cheek walls at both ends.
  const bandW = 3.5
  span(root, P.stone, S.minX + L, fy, tz0, S.tierX, ty, tz1, { solid: true })
  span(root, P.stoneDark, S.tierX - 0.02, fy, tz0 + bandW, S.tierX + 0.1, fy + 0.25, tz1 - bandW, { cast: false })
  span(root, '#a6aabd', S.tierX - 0.5, ty, tz0 + bandW, S.tierX, ty + 0.04, tz1 - bandW, { cast: false })
  for (const [z0, z1, outer, dir] of [[tz1 - bandW, tz1, tz1, 1], [tz0, tz0 + bandW, tz0, -1]]) {
    const steps = Math.round((ty - fy) / 0.4)
    for (let k = 1; k <= steps; k++) {
      const x1 = S.tierX + (steps + 1 - k) * 1.0
      span(root, k % 2 ? P.stone : '#868aa0', S.tierX, fy, z0, x1, fy + k * 0.4, z1, { solid: true })
      span(root, P.stoneDark, x1 - 1.0, fy, outer - dir * 0.4, x1, fy + k * 0.4 + 0.45, outer, { solid: true }) // cheek wall
    }
  }

  // GUN SHOP board on two lavender posts behind the back tier.
  const bx = S.minX + L + 0.6
  for (const z of [-1, 9]) {
    span(root, P.lavenderDark, bx - 0.6, ty, z - 0.6, bx + 0.6, ty + 0.4, z + 0.6, { solid: true })
    span(root, P.lavender, bx - 0.4, ty + 0.4, z - 0.4, bx + 0.4, ty + 4, z + 0.4, { solid: true })
  }
  const by0 = ty + 4
  const by1 = ty + 7
  const bz0 = -4.5
  const bz1 = 12.5
  span(root, P.yellow, bx - 0.3, by0, bz0, bx + 0.3, by1, bz1)
  const frame = '#f0b80c'
  span(root, frame, bx - 0.4, by1 - 0.35, bz0 - 0.15, bx + 0.4, by1 + 0.1, bz1 + 0.15)
  span(root, frame, bx - 0.4, by0 - 0.1, bz0 - 0.15, bx + 0.4, by0 + 0.35, bz1 + 0.15)
  span(root, frame, bx - 0.4, by0, bz0 - 0.15, bx + 0.4, by1, bz0 + 0.3)
  span(root, frame, bx - 0.4, by0, bz1 - 0.3, bx + 0.4, by1, bz1 + 0.15)
  const banner = signPlane([{ text: 'GUN SHOP', size: 140, color: '#ffffff', outline: '#16121c' }], 9.5)
  banner.rotation.y = Math.PI / 2
  banner.position.set(bx + 0.42, (by0 + by1) / 2, (bz0 + bz1) / 2)
  live.add(banner)

  // Pads.
  const tubeGeo = new CylinderGeometry(1.34, 1.34, 2.0, 4, 1, true)
  tubeGeo.rotateY(Math.PI / 4)
  const pads = []
  for (const gun of GUNS) {
    const x = gun.row === 0 ? S.frontX : S.backX
    const y = gun.row === 0 ? fy : ty
    const z = gun.z
    span(root, NAVY, x - PAD, y, z - PAD, x + PAD, y + 0.25, z + PAD, { cast: false })
    span(root, '#121a26', x - PAD + 0.15, y + 0.25, z - PAD + 0.15, x + PAD - 0.15, y + 0.31, z + PAD - 0.15, { cast: false })
    solidBox(PAD, PAD_TOP / 2, PAD, x, y + PAD_TOP / 2, z)
    const plateMat = legoMat('#ff4b5c', { emissive: '#ff4b5c', emissiveIntensity: 0.35 }).clone()
    brick(live, null, 1.9, 0.1, 1.9, x, y + 0.36, z, { mat: plateMat, cast: false })
    const frameMat = K.edgeMat('#ff4b5c')
    const edge = K.edgeFrame(2.0, 0.08, 0.07, frameMat)
    edge.position.set(x, y + PAD_TOP + 0.02, z)
    live.add(edge)
    const beamMat = new MeshBasicMaterial({ map: K.fadeTex, color: '#ff4b5c', transparent: true, opacity: 0.55, blending: AdditiveBlending, depthWrite: false, side: DoubleSide })
    const beam = new Mesh(tubeGeo, beamMat)
    beam.position.set(x, y + PAD_TOP + 1.0, z)
    live.add(beam)
    const floorGlowMat = new MeshBasicMaterial({ map: K.glowTex, color: '#ff4b5c', transparent: true, opacity: 0.7, blending: AdditiveBlending, depthWrite: false })
    const floorGlow = K.flat(K.glowTex, 2.1, 2.1)
    floorGlow.material = floorGlowMat
    floorGlow.position.set(x, y + PAD_TOP + 0.03, z)
    live.add(floorGlow)

    // The gun: centred on its own bounds, scaled to fit the pad, tilted like the reference.
    const model = makeGun(gun)
    const box = new Box3().setFromObject(model)
    const size = box.getSize(new Vector3())
    const centre = box.getCenter(new Vector3())
    const longGun = size.z > 0.6
    const fit = (longGun ? 1.85 : 0.95) / size.z
    const tilt = new Group()
    tilt.rotation.set(-0.18, 0, longGun ? 0.12 : 0.32)
    model.position.copy(centre).multiplyScalar(-1)
    tilt.add(model)
    tilt.scale.setScalar(fit)
    const spin = new Group()
    const hover = y + PAD_TOP + 1.15
    spin.position.set(x, hover, z)
    spin.add(tilt)
    live.add(spin)

    const label = signSprite(gunLines(gun, 'locked'), gun.row === 0 ? 1.75 : 1.9)
    label.position.set(x, y + (gun.row === 0 ? 3.0 : 3.35), z)
    live.add(label)
    let state = null
    const phase = z * 0.37
    pads.push({
      gun,
      x,
      y: y + PAD_TOP,
      z,
      contains: (px, py, pz) => Math.abs(px - x) < PAD && Math.abs(pz - z) < PAD && py > y - 0.3,
      setState(next) {
        if (next === state) return
        state = next
        const color = STATE_COLOR[next]
        plateMat.color.set(color)
        plateMat.emissive.set(color)
        frameMat.color.set(color).multiplyScalar(2.2)
        beamMat.color.set(color)
        floorGlowMat.color.set(color)
        label.setLines(gunLines(gun, next))
      },
      update(dt, t) {
        spin.rotation.y = t * 0.8 + phase
        spin.position.y = hover + Math.sin(t * 2 + phase) * 0.1
        beamMat.opacity = 0.42 + Math.sin(t * 3 + phase) * 0.08
        floorGlowMat.opacity = 0.55 + Math.sin(t * 3 + phase) * 0.15
        frameMat.opacity = 0.65 + Math.sin(t * 4 + phase) * 0.2
      },
    })
  }
  return pads
}
