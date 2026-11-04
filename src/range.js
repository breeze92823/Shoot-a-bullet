// The smash range: a long wooden table running north from the Shoot Zone pad,
// across one themed platform per ZONES entry (each entered through a nested
// arch), carrying RANGE.perZone breakable objects per zone. The player's bullet
// smashes them one by one (range.smash: debris chunks, sparkles, a dust puff)
// and sticks in the first one it cannot break (range.stick: that one wobbles).
// Objects are instanced (one InstancedMesh per zone per material layer), so the
// 180 objects cost a few dozen draw calls; the platforms, walls, arches and
// decor are baked with the rest of the lobby.
import {
  AdditiveBlending,
  BoxGeometry,
  BufferAttribute,
  CircleGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  DynamicDrawUsage,
  Euler,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  OctahedronGeometry,
  PlaneGeometry,
  Quaternion,
  SphereGeometry,
  TorusGeometry,
  Vector3,
} from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { PALETTE as Pal, RANGE, SHOOT_ZONE as SZ, ZONES } from './config.js'
import { brick, checkerMat, span } from './lego.js'
import { barrel, canvasTex, crate, crystalCluster, fadeTex, lighten, pine, tree } from './lobbykit.js'
import { solidBox } from './propkit.js'
import { signSprite } from './signs.js'
import { fmt, objectNeed, objectZ, OBJECT_COUNT, zoneOf } from './game.js'
import { mulberry32 } from './textures.js'

const FY = SZ.floorY
export const TABLE_Y = FY + RANGE.tableTop // table top height (objects stand on it)
export const BULLET_Y = TABLE_Y + RANGE.bulletLift
export const END_Z = objectZ(OBJECT_COUNT - 1) - 9
// The arch in front of zone k (k >= 1): halfway between the two zones' objects.
export const gateZ = (k) => (k <= 0 ? SZ.backZ : (objectZ(k * RANGE.perZone - 1) + objectZ(k * RANGE.perZone)) / 2)
const zoneEnd = (k) => (k >= ZONES.length - 1 ? END_Z : gateZ(k + 1))

// --- Geometry helpers: coloured parts merged into one geometry -----------------------------------
const M = new Matrix4()
const Q = new Quaternion()
const E = new Euler()
const V = new Vector3()
const S = new Vector3()
function part(geo, color, { x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1 } = {}) {
  const g = geo.index ? geo.toNonIndexed() : geo.clone()
  g.applyMatrix4(M.compose(V.set(x, y, z), Q.setFromEuler(E.set(rx, ry, rz)), S.set(sx, sy, sz)))
  const c = new Color(color)
  const n = g.attributes.position.count
  const arr = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) {
    arr[i * 3] = c.r
    arr[i * 3 + 1] = c.g
    arr[i * 3 + 2] = c.b
  }
  g.setAttribute('color', new BufferAttribute(arr, 3))
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) g.deleteAttribute(k)
  return g
}
const merge = (parts) => mergeGeometries(parts)

const box = new BoxGeometry(1, 1, 1)
const cyl = (r0, r1, h, n = 24) => new CylinderGeometry(r0, r1, h, n)
const sph = new SphereGeometry(1, 20, 14)
const dome = new SphereGeometry(1, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2)

const vMat = (extra = {}) => new MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0, ...extra })

// The archery-style face on the first zone's targets: white, a cyan ring, pink dots.
const targetFace = canvasTex(256, 256, (ctx, w) => {
  const c = w / 2
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, w, w)
  ctx.lineWidth = 12
  ctx.strokeStyle = '#2fc3ff'
  ctx.beginPath()
  ctx.arc(c, c, w * 0.3, 0, Math.PI * 2)
  ctx.stroke()
  ctx.fillStyle = '#ff4fa0'
  ctx.beginPath()
  ctx.arc(c, c, w * 0.065, 0, Math.PI * 2)
  ctx.fill()
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8
    ctx.beginPath()
    ctx.arc(c + Math.cos(a) * w * 0.17, c + Math.sin(a) * w * 0.17, w * 0.035, 0, Math.PI * 2)
    ctx.fill()
  }
})

// --- The objects: per kind, a list of layers { geo, mat, tint } ----------------------------------
// Built standing on y = 0, facing +Z (the shooter), about 1.5 m tall.
function kindLayers(kind) {
  switch (kind) {
    case 'target': {
      const wood = '#e8a45a'
      const body = merge([
        part(cyl(0.82, 0.82, 0.22, 40), '#f4f4f8', { y: 1.0, rx: Math.PI / 2 }),
        part(box, wood, { x: -0.35, y: 0.2, z: -0.12, sx: 0.12, sy: 0.4, sz: 0.12, rz: 0.2 }),
        part(box, wood, { x: 0.35, y: 0.2, z: -0.12, sx: 0.12, sy: 0.4, sz: 0.12, rz: -0.2 }),
        part(box, wood, { y: 0.05, sx: 1.1, sy: 0.1, sz: 0.5 }),
      ])
      const face = merge([part(new CircleGeometry(0.78, 40), '#ffffff', { y: 1.0, z: 0.112 }), part(new CircleGeometry(0.78, 40), '#ffffff', { y: 1.0, z: -0.112, ry: Math.PI })])
      return [
        { geo: body, mat: vMat({ roughness: 0.45 }) },
        { geo: face, mat: new MeshStandardMaterial({ map: targetFace, roughness: 0.45 }) },
      ]
    }
    case 'slime': {
      const goo = '#62f03a'
      const g = merge([
        part(cyl(0.64, 0.64, 0.26), '#d43ff0', { y: 0.13 }),
        part(cyl(0.66, 0.66, 0.06), '#f07aff', { y: 0.27 }),
        part(cyl(0.56, 0.6, 0.85), goo, { y: 0.72 }),
        part(dome, goo, { y: 1.14, sx: 0.56, sy: 0.42, sz: 0.56 }),
        part(sph, '#9aff6a', { x: -0.18, y: 1.32, z: 0.26, sx: 0.14, sy: 0.12, sz: 0.1 }),
        ...[0, 1.3, 2.4, 3.6, 4.8].map((a, i) => part(sph, goo, { x: Math.sin(a) * 0.57, y: 0.95 - (i % 3) * 0.16, z: Math.cos(a) * 0.57, sx: 0.11, sy: 0.22 + (i % 2) * 0.1, sz: 0.11 })),
      ])
      return [{ geo: g, mat: vMat({ roughness: 0.22, emissive: '#1f6a10', emissiveIntensity: 0.25 }) }]
    }
    case 'squishy': {
      const body = merge([part(cyl(0.6, 0.62, 0.62), '#ffffff', { y: 0.95 }), part(dome, '#ffffff', { y: 1.26, sx: 0.6, sy: 0.38, sz: 0.6 })])
      const fixed = merge([
        part(cyl(0.64, 0.66, 0.62), '#ffd21f', { y: 0.31 }),
        part(cyl(0.63, 0.63, 0.08), '#ffffff', { y: 0.82 }),
        part(cyl(0.63, 0.63, 0.08), '#ffffff', { y: 1.06 }),
        part(cyl(0.67, 0.67, 0.07), '#ffffff', { y: 0.45 }),
      ])
      return [
        { geo: body, mat: vMat({ roughness: 0.3 }), tint: true },
        { geo: fixed, mat: vMat({ roughness: 0.35 }) },
      ]
    }
    case 'cardboard': {
      const tan = '#e8b070'
      const g = merge([
        part(box, tan, { y: 0.6, sx: 1.35, sy: 1.2, sz: 1.15 }),
        part(box, '#c98f52', { y: 1.205, sx: 0.32, sy: 0.02, sz: 1.17 }),
        part(box, '#c98f52', { y: 0.95, z: 0.58, sx: 0.32, sy: 0.5, sz: 0.02 }),
        part(box, '#f5d3a0', { x: -0.36, y: 1.24, z: 0.0, sx: 0.6, sy: 0.04, sz: 1.1, rz: 0.25 }),
        part(box, '#2a2a30', { x: 0.35, y: 0.42, z: 0.58, sx: 0.36, sy: 0.24, sz: 0.02 }),
        part(box, '#ff3b3b', { x: -0.38, y: 0.42, z: 0.58, sx: 0.22, sy: 0.22, sz: 0.02 }),
      ])
      return [{ geo: g, mat: vMat({ roughness: 0.9 }) }]
    }
    case 'wood': {
      const g = merge([
        part(cyl(0.55, 0.6, 1.35, 14), '#8a5229', { y: 0.675 }),
        part(cyl(0.5, 0.5, 0.04, 14), '#f0c890', { y: 1.37 }),
        part(new TorusGeometry(0.3, 0.035, 6, 18), '#c98f52', { y: 1.395, rx: Math.PI / 2 }),
        part(new TorusGeometry(0.14, 0.03, 6, 14), '#c98f52', { y: 1.395, rx: Math.PI / 2 }),
        part(cyl(0.12, 0.14, 0.45, 8), '#7a4524', { x: 0.62, y: 0.95, rz: -1.1 }),
        part(box, '#5fbf3a', { x: 0.82, y: 1.12, sx: 0.28, sy: 0.12, sz: 0.2 }),
      ])
      return [{ geo: g, mat: vMat({ roughness: 0.85 }) }]
    }
    case 'ice': {
      const block = merge([part(box, '#bff0ff', { y: 0.7, sx: 1.3, sy: 1.4, sz: 1.05 })])
      const snow = merge([
        part(box, '#ffffff', { y: 1.44, sx: 1.34, sy: 0.12, sz: 1.09 }),
        part(box, '#ffffff', { x: 0.4, y: 1.3, z: 0.53, sx: 0.18, sy: 0.24, sz: 0.04 }),
        part(box, '#ffffff', { x: -0.3, y: 1.33, z: 0.53, sx: 0.14, sy: 0.18, sz: 0.04 }),
        part(box, '#e4f8ff', { x: -0.2, y: 0.7, z: 0.53, sx: 0.5, sy: 0.05, sz: 0.02, rz: 0.6 }),
      ])
      return [
        { geo: block, mat: vMat({ roughness: 0.06, metalness: 0.1, transparent: true, opacity: 0.82, emissive: '#3fa8ff', emissiveIntensity: 0.22 }) },
        { geo: snow, mat: vMat({ roughness: 0.8 }) },
      ]
    }
    case 'brick': {
      const parts = [part(box, '#e8e0d0', { y: 0.7, sx: 1.42, sy: 1.4, sz: 0.66 })]
      for (let row = 0; row < 5; row++) {
        const off = row % 2 ? 0.37 : 0
        for (let c = -1; c <= 1; c++) {
          const x = c * 0.74 + off - (row % 2 ? 0.37 : 0)
          const w = Math.min(0.7, 0.74 - Math.max(0, Math.abs(x) + 0.35 - 0.74))
          if (w < 0.2) continue
          parts.push(part(box, row % 2 ? '#d0482e' : '#c0402a', { x: Math.max(-0.37, Math.min(0.37, x)), y: 0.14 + row * 0.28, sx: c === 0 ? 0.7 : 0.62, sy: 0.24, sz: 0.7 }))
        }
      }
      return [{ geo: merge(parts), mat: vMat({ roughness: 0.85 }) }]
    }
    case 'steel': {
      const g = merge([
        part(cyl(0.6, 0.6, 1.4, 20), '#b8bcc8', { y: 0.7 }),
        part(cyl(0.63, 0.63, 0.12, 20), '#ffd21f', { y: 0.32 }),
        part(cyl(0.63, 0.63, 0.12, 20), '#ffd21f', { y: 1.08 }),
        part(cyl(0.62, 0.62, 0.05, 20), '#6a6e7c', { y: 1.42 }),
        part(cyl(0.1, 0.1, 0.08, 10), '#2a2a30', { x: 0.3, y: 1.47 }),
        part(box, '#2a2a30', { y: 0.7, z: 0.6, sx: 0.36, sy: 0.36, sz: 0.04, rz: Math.PI / 4 }),
        part(box, '#ffd21f', { y: 0.7, z: 0.62, sx: 0.26, sy: 0.26, sz: 0.04, rz: Math.PI / 4 }),
      ])
      return [{ geo: g, mat: vMat({ roughness: 0.32, metalness: 0.65 }) }]
    }
    case 'diamond': {
      const gem = merge([part(new OctahedronGeometry(0.62, 0), '#5ff0ff', { y: 1.05, sy: 1.25 }), part(new OctahedronGeometry(0.3, 0), '#e8ffff', { y: 1.05, x: 0.12, z: 0.18, sy: 1.25 })])
      const ped = merge([part(cyl(0.48, 0.58, 0.28, 8), '#6a2ab0', { y: 0.14 }), part(cyl(0.38, 0.48, 0.12, 8), '#b56bff', { y: 0.34 })])
      return [
        { geo: gem, mat: vMat({ roughness: 0.08, metalness: 0.2, emissive: '#2fbfff', emissiveIntensity: 0.55, flatShading: true }) },
        { geo: ped, mat: vMat({ roughness: 0.5 }) },
      ]
    }
  }
  return []
}
const SQUISHY_TINTS = ['#ff5fb0', '#2fb4ff', '#ff3b3b', '#3fe06a', '#ffd21f', '#b56bff', '#ff9a3a']

// --- Zone decor (baked) ----------------------------------------------------------------------
function decorate(root, z, k, x0, z0, z1, rand) {
  const side = () => (rand() < 0.5 ? -1 : 1)
  const along = () => z1 + 4 + rand() * (z0 - z1 - 8)
  const X = () => side() * (4.5 + rand() * (RANGE.halfWidth - 6.5))
  const y = FY
  const n = Math.max(4, Math.floor((z0 - z1) / 7))
  for (let i = 0; i < n; i++) {
    const x = X()
    const zz = along()
    switch (z.kind) {
      case 'target': {
        const r = 1.2 + rand() * 0.8
        const c = new Mesh(cyl(r, r, 2.4, 20), new MeshStandardMaterial({ color: '#ffffff', roughness: 0.5 }))
        c.position.set(x, y + 1.2, zz)
        root.add(c)
        const rim = new Mesh(cyl(r * 1.03, r * 1.03, 0.35, 20), new MeshStandardMaterial({ color: '#ff6f86', roughness: 0.5 }))
        rim.position.set(x, y + 2.3, zz)
        root.add(rim)
        break
      }
      case 'slime': {
        const puddle = new Mesh(cyl(1.4 + rand() * 1.4, 1.6 + rand() * 1.4, 0.1, 18), new MeshStandardMaterial({ color: '#c8ff5a', roughness: 0.2, emissive: '#6aa010', emissiveIntensity: 0.3 }))
        puddle.scale.z = 0.5 + rand() * 0.5
        puddle.position.set(x, y + 0.05, zz)
        root.add(puddle)
        const blob = new Mesh(sph, new MeshStandardMaterial({ color: '#5fd83a', roughness: 0.25 }))
        blob.scale.set(0.9, 0.5, 0.8)
        blob.position.set(x + 2, y + 0.25, zz + 1.5)
        root.add(blob)
        brick(root, '#4f9a3a', 1.6, 0.6, 1.2, -x * 0.9, y + 0.3, zz - 3, { yaw: rand() * 3 })
        break
      }
      case 'squishy': {
        const r = 1.3 + rand() * 0.9
        const c = new Mesh(cyl(r, r * 0.9, 2.6, 22), new MeshStandardMaterial({ color: '#ffffff', roughness: 0.45 }))
        c.position.set(x, y + 1.3, zz)
        root.add(c)
        const top = new Mesh(cyl(r * 1.02, r * 1.02, 0.35, 22), new MeshStandardMaterial({ color: SQUISHY_TINTS[i % SQUISHY_TINTS.length], roughness: 0.45 }))
        top.position.set(x, y + 2.6, zz)
        root.add(top)
        brick(root, SQUISHY_TINTS[(i + 2) % SQUISHY_TINTS.length], 1.4, 1.0, 1.4, -x, y + 0.5, zz + 2, { yaw: rand() })
        break
      }
      case 'cardboard': {
        crate(root, x, y, zz, 1.6, rand() * 0.6, '#e8b070')
        crate(root, x + 1.7, y, zz + 0.4, 1.4, rand() * 0.6, '#d9a060')
        if (rand() < 0.6) crate(root, x + 0.6, y + 1.5, zz + 0.2, 1.2, rand() * 0.6, '#f0c080')
        break
      }
      case 'wood': {
        if (i % 2) tree(root, x, zz, 0.75 + rand() * 0.2, y)
        else {
          for (let l = 0; l < 3; l++) {
            const log = new Mesh(cyl(0.38, 0.38, 3, 12), new MeshStandardMaterial({ color: l % 2 ? '#8a5229' : '#7a4524', roughness: 0.85 }))
            log.rotation.z = Math.PI / 2
            log.position.set(x + (l === 2 ? 0 : (l - 0.5) * 0.8), y + 0.38 + (l === 2 ? 0.66 : 0), zz)
            root.add(log)
          }
        }
        break
      }
      case 'ice': {
        pine(root, x, zz, y, 1.2)
        brick(root, '#cfeeff', 1.5, 1.2, 1.5, -x, y + 0.6, zz + 2.5, { yaw: rand() })
        break
      }
      case 'brick': {
        brick(root, '#d0482e', 2.2, 0.7, 1.1, x, y + 0.35, zz, { yaw: rand() * 0.5 })
        brick(root, '#c0402a', 1.6, 0.7, 1.1, x + 0.3, y + 1.05, zz, { yaw: rand() * 0.5 })
        brick(root, Pal.rock, 1.6, 0.8, 1.3, -x, y + 0.4, zz + 3, { yaw: rand() * 3 })
        break
      }
      case 'steel': {
        barrel(root, x, y, zz, '#8a8e9c')
        barrel(root, x + 1, y, zz + 0.6, '#ffd21f')
        brick(root, '#2a2a30', 1.4, 1.4, 1.4, -x, y + 0.7, zz + 2, { yaw: rand() })
        break
      }
      case 'diamond': {
        crystalCluster(root, x, y, zz, ['#5ff0ff', '#b56bff', '#ff8af0'], 1.6 + rand(), rand)
        break
      }
    }
  }
}

// --- The build -------------------------------------------------------------------------------
export function buildRange(scene, root, live, particles) {
  const rand = mulberry32(4242)
  const HW = RANGE.halfWidth
  const TH = RANGE.tableHalf

  // Platforms, walls and arches per zone (zone 0 starts at the pavilion's back edge).
  const gates = []
  ZONES.forEach((z, k) => {
    const z0 = gateZ(k)
    const z1 = zoneEnd(k)
    span(root, Pal.lavender, -HW, -2.2, z1, HW, FY - 0.2, z0, { cast: false })
    span(root, null, -HW + 0.8, FY - 0.2, z1, HW - 0.8, FY, z0, { mat: checkerMat(z.floor, z.alt, 4), cast: false })
    solidBox(HW, (FY + 2.2) / 2, (z0 - z1) / 2, 0, (FY - 2.2) / 2, (z0 + z1) / 2)
    for (const s of [-1, 1]) span(root, z.wall, s * HW - 0.8, FY - 0.2, z1, s * HW, FY + 1.2, z0, { solid: true })
    decorate(root, z, k, 0, z0, z1, rand)
    if (k === 0) return
    // Nested arch: outer frame in `gate`, inner in `gateIn` just behind it.
    const frame = (zz, color, hw, h, t) => {
      span(root, color, -hw - t, FY, zz - t / 2, -hw, FY + h, zz + t / 2, { solid: true })
      span(root, color, hw, FY, zz - t / 2, hw + t, FY + h, zz + t / 2, { solid: true })
      span(root, color, -hw - t, FY + h, zz - t / 2, hw + t, FY + h + t, zz + t / 2)
    }
    frame(z0, z.gate, 6.5, 9, 1.4)
    frame(z0 - 1.6, z.gateIn, 5, 7.4, 1.0)
    const glowMat = new MeshBasicMaterial({ map: fadeTex, color: z.gateIn, transparent: true, opacity: 0.12, blending: AdditiveBlending, depthWrite: false, side: DoubleSide })
    const glow = new Mesh(new PlaneGeometry(10, 7.4), glowMat)
    glow.position.set(0, FY + 3.7, z0 - 1.6)
    live.add(glow)
    const b = z.banner
    const label = signSprite([{ text: z.name, size: 92, color: b.fill ?? b.letters[0], outline: b.outline === '#ffffff' ? b.ink : b.outline }, { text: `${fmt(objectNeed(k * RANGE.perZone))} DAMAGE`, size: 54, color: '#ffffff', icon: 'lock' }], 3.6)
    label.position.set(0, FY + 13.4, z0)
    live.add(label)
    gates.push({ k, z: z0, glowMat, flash: 0 })
  })
  // End wall.
  span(root, Pal.lavender, -HW, FY - 0.2, END_Z - 1.6, HW, FY + 6, END_Z, { solid: true })
  const endSign = signSprite([{ text: 'THE END!', size: 90, color: '#ffe23a' }, { text: 'you smashed everything', size: 44, color: '#ffffff' }], 3)
  endSign.position.set(0, FY + 9, END_Z)
  live.add(endSign)

  // The table: an orange plank on dark legs, from the pad to the end wall.
  const t0 = RANGE.tableStartZ
  const t1 = END_Z + 0.4
  span(root, '#ee8a3a', -TH, TABLE_Y - 0.42, t1, TH, TABLE_Y, t0)
  span(root, '#c86a24', -TH - 0.08, TABLE_Y - 0.62, t1, TH + 0.08, TABLE_Y - 0.4, t0, { cast: false })
  solidBox(TH, 0.31, (t0 - t1) / 2, 0, TABLE_Y - 0.31, (t0 + t1) / 2)
  for (let z = t0 - 0.6; z > t1; z -= 7.5) {
    for (const s of [-1, 1]) span(root, '#b8601a', s * (TH - 0.25) - 0.25, FY, z - 0.25, s * (TH - 0.25) + 0.25, TABLE_Y - 0.6, z + 0.25)
  }

  // --- Objects: instanced per zone and layer ---
  const per = RANGE.perZone
  const zones = ZONES.map((z, k) => {
    const layers = kindLayers(z.kind).map((L) => {
      const m = new InstancedMesh(L.geo, L.mat, per)
      m.instanceMatrix.setUsage(DynamicDrawUsage)
      m.castShadow = true
      m.receiveShadow = true
      if (L.tint) for (let j = 0; j < per; j++) m.setColorAt(j, new Color(SQUISHY_TINTS[Math.floor(rand() * SQUISHY_TINTS.length)]))
      scene.add(m)
      return m
    })
    return { def: z, layers, k }
  })
  const objs = []
  for (let i = 0; i < OBJECT_COUNT; i++) {
    const k = zoneOf(i)
    const kind = ZONES[k].kind
    const yaw = kind === 'cardboard' ? (rand() - 0.5) * 0.5 : kind === 'wood' || kind === 'diamond' ? rand() * Math.PI * 2 : kind === 'brick' ? (rand() - 0.5) * 0.15 : 0
    objs.push({ i, k, j: i % per, x: 0, z: objectZ(i), yaw, s: 0.95 + rand() * 0.1, hidden: false, pop: 1, wob: 0, wobT: 0, dirty: true })
  }
  const active = new Set(objs)
  function writeMatrix(o) {
    let sc = o.s
    let rx = 0
    let rz = 0
    let y = TABLE_Y
    if (o.hidden) sc = 0
    else if (o.pop < 1) {
      const u = o.pop
      sc *= u < 0.6 ? (u / 0.6) * 1.15 : 1.15 - ((u - 0.6) / 0.4) * 0.15
    }
    if (o.wob > 0) {
      rz = Math.sin(o.wobT * 34) * 0.12 * o.wob
      rx = -Math.abs(Math.sin(o.wobT * 21)) * 0.08 * o.wob
      y += Math.abs(Math.sin(o.wobT * 28)) * 0.05 * o.wob
    }
    M.compose(V.set(o.x, y, o.z), Q.setFromEuler(E.set(rx, o.yaw, rz)), S.set(sc, sc * (o.wob > 0 ? 1 - 0.06 * o.wob * Math.sin(o.wobT * 40) : 1), sc))
    for (const m of zones[o.k].layers) {
      m.setMatrixAt(o.j, M)
      m.instanceMatrix.needsUpdate = true
    }
  }

  // --- Debris: pooled instanced chunks, ballistic with a bounce on the table / floor ---
  const DEBRIS = 420
  const debris = new InstancedMesh(new BoxGeometry(1, 1, 1), new MeshStandardMaterial({ roughness: 0.6 }), DEBRIS)
  debris.instanceMatrix.setUsage(DynamicDrawUsage)
  debris.castShadow = true
  debris.frustumCulled = false
  const white = new Color('#ffffff')
  for (let i = 0; i < DEBRIS; i++) {
    debris.setMatrixAt(i, M.makeScale(0, 0, 0))
    debris.setColorAt(i, white)
  }
  scene.add(debris)
  const dState = Array.from({ length: DEBRIS }, () => ({ life: 0, total: 1, p: new Vector3(), v: new Vector3(), q: new Quaternion(), w: new Vector3(), s: 0.2 }))
  let dNext = 0
  let debrisAlive = 0
  const tmpC = new Color()
  const tmpQ2 = new Quaternion()
  function chunk(x, y, z, vx, vy, vz, size, color, life = 1.6) {
    const d = dState[dNext]
    debris.setColorAt(dNext, tmpC.set(color))
    debris.instanceColor.needsUpdate = true
    dNext = (dNext + 1) % DEBRIS
    if (d.life <= 0) debrisAlive++
    d.life = d.total = life * (0.7 + Math.random() * 0.6)
    d.p.set(x, y, z)
    d.v.set(vx, vy, vz)
    d.q.setFromEuler(E.set(Math.random() * 6, Math.random() * 6, Math.random() * 6))
    d.w.set((Math.random() - 0.5) * 18, (Math.random() - 0.5) * 18, (Math.random() - 0.5) * 18)
    d.s = size
  }

  function flashGate(k) {
    const g = gates.find((g) => g.k === k)
    if (g) g.flash = 1
  }

  return {
    gates,
    zones,
    tableY: TABLE_Y,
    bulletY: BULLET_Y,
    endZ: END_Z,
    objectZ,
    flashGate,
    // The bullet broke object i, travelling at `speed` m/s (debris is thrown forward).
    smash(i, speed = 30, intensity = 1) {
      const o = objs[i]
      if (!o || o.hidden) return
      o.hidden = true
      o.wob = 0
      active.add(o)
      const cols = ZONES[o.k].debris
      const cy = TABLE_Y + 0.75
      const n = Math.round(14 * intensity)
      const fwd = Math.min(16, 4 + speed * 0.22)
      for (let c = 0; c < n; c++) {
        // Thrown up and out to the sides (never straight back into the bullet cam).
        const side = c % 2 ? 1 : -1
        const big = c < 3
        chunk(o.x + side * (0.2 + Math.random() * 0.5), cy + (Math.random() - 0.3) * 0.9, o.z - Math.random() * 0.6, side * (3.5 + Math.random() * 9), 4 + Math.random() * 9, -fwd * (0.3 + Math.random() * 0.7), big ? 0.26 + Math.random() * 0.16 : 0.1 + Math.random() * 0.14, cols[c % cols.length])
      }
      particles.burst(o.x, cy, o.z - 0.3, Math.round(16 * intensity), { speed: 9, up: 2.5, colors: [...cols, '#ffffff'], size: 0.4, life: 0.6, gravity: -6, drag: 2, boost: 1.35 })
      // Dust puff + a white pop flash.
      for (let c = 0; c < 4; c++) particles.emit({ x: o.x + (Math.random() - 0.5) * 1.4, y: cy + (Math.random() - 0.5), z: o.z - 0.5, vx: (Math.random() - 0.5) * 5, vy: Math.random() * 2, vz: -2 - Math.random() * 5, color: lighten(cols[0], 0.5), size: 0.9 + Math.random() * 0.5, life: 0.4, drag: 3, grow: 1.2, boost: 0.55 })
      particles.emit({ x: o.x, y: cy, z: o.z - 0.2, color: '#ffffff', size: 1.6, life: 0.08, boost: 1.1 })
    },
    // The bullet is stuck in object i: it shudders until reset.
    stick(i, amount = 1) {
      const o = objs[i]
      if (!o) return
      o.wob = Math.max(o.wob, amount)
      o.wobT = 0
      active.add(o)
      const cols = ZONES[o.k].debris
      for (let c = 0; c < 8; c++) chunk(o.x + (Math.random() - 0.5) * 0.6, TABLE_Y + 0.85, o.z + 0.6, (Math.random() - 0.5) * 6, 2 + Math.random() * 5, 2 + Math.random() * 5, 0.1 + Math.random() * 0.14, cols[c % cols.length], 1.2)
    },
    // A light knock (NPC training shots on the first target).
    knock(i) {
      const o = objs[i]
      if (!o || o.hidden) return
      o.wob = Math.max(o.wob, 0.35)
      o.wobT = 0
      active.add(o)
    },
    objectPos(i, out) {
      const o = objs[Math.min(i, objs.length - 1)]
      return out.set(o.x, TABLE_Y + RANGE.bulletLift, o.z)
    },
    // Everything smashed pops back in, a few at a time from the front.
    resetAll() {
      for (const o of objs) {
        if (o.wob) active.add(o)
        o.wob = 0
        if (o.hidden) {
          o.hidden = false
          o.pop = -Math.min(1.2, (RANGE.firstZ - o.z) / 220) // stagger by distance
          active.add(o)
        }
      }
    },
    update(dt, t, eye = null) {
      for (const o of active) {
        if (o.pop < 1) o.pop = Math.min(1, o.pop + dt * 3.2)
        if (o.wob > 0) {
          o.wobT += dt
          if (o.wob < 0.9) o.wob = Math.max(0, o.wob - dt * 1.4)
        }
        if (o.pop < 0) {
          // waiting for its turn to pop back in: stay hidden
          const h = o.hidden
          o.hidden = true
          writeMatrix(o)
          o.hidden = h
          continue
        }
        writeMatrix(o)
        if (o.pop >= 1 && o.wob <= 0 && !o.dirty) active.delete(o)
        o.dirty = false
      }
      for (const g of gates) {
        g.flash = Math.max(0, g.flash - dt * 1.2)
        g.glowMat.opacity = 0.1 + 0.05 * Math.sin(t * 2 + g.z * 0.1) + g.flash * 0.9
      }
      if (debrisAlive > 0) {
        let alive = 0
        for (let i = 0; i < DEBRIS; i++) {
          const d = dState[i]
          if (d.life <= 0) continue
          d.life -= dt
          if (d.life <= 0) {
            debris.setMatrixAt(i, M.makeScale(0, 0, 0))
            continue
          }
          alive++
          d.v.y -= 22 * dt
          d.p.addScaledVector(d.v, dt)
          const ground = Math.abs(d.p.x) < TH + 0.1 && d.p.z < RANGE.tableStartZ ? TABLE_Y : FY
          if (d.p.y - d.s / 2 < ground && d.v.y < 0) {
            d.p.y = ground + d.s / 2
            d.v.y *= -0.35
            d.v.x *= 0.6
            d.v.z *= 0.6
            d.w.multiplyScalar(0.6)
          }
          tmpQ2.setFromEuler(E.set(d.w.x * dt, d.w.y * dt, d.w.z * dt))
          d.q.multiply(tmpQ2)
          let k = Math.min(1, (d.life / d.total) * 4)
          if (eye) k *= Math.min(1, Math.max(0, d.p.distanceTo(eye) - 0.8) / 1.5) // shrink away right in front of the lens
          M.compose(d.p, d.q, S.setScalar(d.s * k))
          debris.setMatrixAt(i, M)
        }
        debrisAlive = alive
        debris.instanceMatrix.needsUpdate = true
      }
    },
  }
}

