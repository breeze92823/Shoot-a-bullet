// Procedural gun models, one builder per weapon type, built from small boxes
// and cylinders in "units" (U metres each) the way a Roblox modeller blocks a
// gun out: slide serrations, sights, ejection ports, rails, trigger guards,
// stippled grips, curved / drum / box magazines, wooden furniture, scopes with
// lenses, muzzle brakes and bipods. Barrel along +Z, top +Y, origin at the
// hand. Each gun is merged into one mesh per material (bake) so a shop full of
// guns stays cheap. `group.userData.muzzle` is the muzzle point (metres).
import { CylinderGeometry, BoxGeometry, Group, Mesh, MeshStandardMaterial, Vector3 } from 'three'
import { bake } from './bake.js'

const U = 0.016 // metres per modelling unit: a pistol is ~20 units, the Barrett ~95

const matCache = new Map()
function mat(color, metal = 0.35, rough = 0.5, emissive = null) {
  const key = `${color}|${metal}|${rough}|${emissive}`
  let m = matCache.get(key)
  if (!m) matCache.set(key, (m = new MeshStandardMaterial({ color, metalness: metal, roughness: rough, ...(emissive ? { emissive, emissiveIntensity: 0.9 } : {}) })))
  return m
}
const DARK = () => mat('#18181c', 0.5, 0.45)
const shade = (hex, k) => {
  const n = parseInt(hex.slice(1), 16)
  const c = (v) => Math.max(0, Math.min(255, Math.round(v * k)))
  return `#${((c((n >> 16) & 255) << 16) | (c((n >> 8) & 255) << 8) | c(n & 255)).toString(16).padStart(6, '0')}`
}

// Builder context: b(w, h, d, x, y, z, material, rx) boxes, c(r, len, x, y, z, material, axis) cylinders.
function kit(g) {
  return {
    b(w, h, d, x, y, z, m, rx = 0, ry = 0, rz = 0) {
      const mesh = new Mesh(new BoxGeometry(w, h, d), m)
      mesh.position.set(x, y, z)
      mesh.rotation.set(rx, ry, rz)
      g.add(mesh)
      return mesh
    },
    c(r, len, x, y, z, m, axis = 'z', seg = 12) {
      const mesh = new Mesh(new CylinderGeometry(r, r, len, seg), m)
      if (axis === 'z') mesh.rotation.x = Math.PI / 2
      if (axis === 'x') mesh.rotation.z = Math.PI / 2
      mesh.position.set(x, y, z)
      g.add(mesh)
      return mesh
    },
    // A grip hanging from (x, y, z), raked back by `rake` radians.
    grip(y, z, m, { h = 11, w = 3.2, d = 5, rake = 0.28, stipple = true, base = true } = {}) {
      const p = new Group()
      p.position.set(0, y, z)
      p.rotation.x = rake
      g.add(p)
      const k = kit(p)
      k.b(w, h, d, 0, -h / 2, 0, m)
      if (stipple) k.b(w + 0.18, h * 0.55, d * 0.7, 0, -h * 0.5, 0, mat(shade(m.color.getHexString ? '#' + m.color.getHexString() : '#333333', 0.72), 0.2, 0.85))
      if (base) k.b(w + 0.2, 1.1, d + 0.4, 0, -h - 0.3, 0.2, DARK())
      return p
    },
    guard(y, z0, z1, m) {
      this.b(0.7, 0.5, z1 - z0, 0, y, (z0 + z1) / 2, m)
      this.b(0.7, 2.6, 0.7, 0, y + 1.2, z1, m)
      this.b(0.5, 2.0, 0.6, 0, y + 1.3, z0 + (z1 - z0) * 0.35, DARK()) // trigger
    },
    // A row of rail teeth along the top.
    rail(y, z0, z1, w = 2.4) {
      this.b(w, 0.9, z1 - z0, 0, y, (z0 + z1) / 2, DARK())
      for (let z = z0 + 0.8; z < z1 - 0.4; z += 1.8) this.b(w + 0.3, 0.6, 0.8, 0, y + 0.6, z, DARK())
    },
    serrations(y, z0, n, w, h) {
      for (let i = 0; i < n; i++) this.b(w + 0.12, h, 0.4, 0, y, z0 + i * 1.0, DARK())
    },
  }
}

const BUILDERS = {
  // Glock 17 / Colt 1911: slide, frame, guard, grip; the 1911 adds a hammer and wood grips.
  pistol(k, S, F, G, def) {
    k.b(3.2, 3.4, 19, 0, 5, 4.5, S) // slide
    k.serrations(5, -4.2, 5, 3.2, 2.6)
    k.b(1.2, 0.3, 3.2, 0.7, 6.75, 6, DARK()) // ejection port
    k.b(0.7, 0.9, 0.9, 0, 7.1, 13, DARK()) // front sight
    k.b(2.2, 0.9, 0.9, -0, 7.1, -3.8, DARK()) // rear sight
    k.c(0.75, 1, 0, 5.2, 14.2, DARK())
    k.b(3, 2.4, 15, 0, 2.4, 5, F) // frame
    k.b(2.6, 0.9, 5, 0, 1, 10, F) // accessory rail
    k.guard(-1.2, 2.6, 7.6, F)
    k.grip(1.4, -1.6, G, { rake: 0.27 })
    if (def.id === 'colt') {
      k.b(0.9, 1.6, 1.2, 0, 6.8, -5.4, DARK()) // hammer
    }
    return new Vector3(0, 5.2, 14.8)
  },
  // Desert Eagle: big chrome slide with a top rib, triangular nose, wide black grip.
  magnum(k, S, F, G) {
    k.b(3.8, 4.4, 24, 0, 5.6, 6, S)
    k.b(1.8, 0.9, 22, 0, 8.2, 6.5, S) // top rib
    k.serrations(5.6, -4.8, 5, 3.8, 3.2)
    k.b(1.4, 0.3, 4, 0.9, 7.85, 8, DARK())
    k.b(0.8, 1.2, 1, 0, 9.1, 16.5, DARK())
    k.b(2.4, 1.2, 1, 0, 9.1, -4.5, DARK())
    k.c(0.95, 0.6, 0, 5.8, 18.1, DARK())
    k.b(3.6, 2.8, 17, 0, 2.3, 6, S)
    k.guard(-1.4, 3, 8.6, S)
    k.b(1, 1.8, 1.3, 0, 7.4, -6.4, DARK()) // hammer
    k.grip(1.4, -2, G, { w: 3.8, d: 5.8, h: 12, rake: 0.26 })
    return new Vector3(0, 5.8, 18.6)
  },
  // UZI: boxy receiver, magazine through the grip, folded stock, cocking knob.
  uzi(k, S, F, G) {
    k.b(4.2, 5.6, 24, 0, 3.6, 5, S)
    k.b(4.4, 1, 20, 0, 6.8, 4, mat(shade('#2a2a30', 0.8), 0.4, 0.5))
    k.c(1, 5, 0, 4, 19.5, S)
    k.c(1.5, 1.4, 0, 4, 17.4, DARK())
    k.b(1.2, 1.2, 1.6, 0, 7.8, 9, DARK()) // cocking knob
    k.b(0.8, 1.8, 0.8, 0, 7.9, 15.5, DARK())
    k.b(2.2, 1.8, 0.8, 0, 7.9, -5.6, DARK())
    k.guard(-0.6, 4, 10, S)
    k.grip(1, 1.4, G, { rake: 0.08, h: 12 })
    k.b(2.6, 6, 3.4, 0, -14.6, 2.6, DARK(), 0.08) // mag below the grip
    k.b(3.6, 1.1, 15, 0, 1.4, -9, S) // folded stock arms
    k.b(4, 5.4, 1.2, 0, -1.2, -16.4, DARK()) // butt plate
    return new Vector3(0, 4, 22.2)
  },
  // MP5: slim receiver, round handguard, curved mag ahead of the guard, drum rear sight.
  mp5(k, S, F, G) {
    k.b(4, 5, 22, 0, 4, 4, S)
    k.c(2.4, 10, 0, 3.4, 19, F, 'z', 14) // handguard
    k.c(0.85, 5, 0, 4.3, 26, S)
    k.c(1.3, 1.2, 0, 4.3, 28.2, DARK())
    k.b(0.9, 3.2, 0.9, 0, 7.6, 21, DARK()) // front sight post
    k.c(1.3, 1.2, 0, 7.6, -4, DARK(), 'x') // drum rear sight
    for (let i = 0; i < 4; i++) k.b(2.6, 3.2, 3.6, 0, -0.6 - i * 2.9, 9.6 + i * 1.25, DARK(), -0.3 - i * 0.06) // curved mag
    k.guard(0.2, 1.5, 6.5, S)
    k.grip(1.6, -2.4, G, { rake: 0.25, h: 10 })
    k.b(3, 3.6, 13, 0, 3.6, -12, S) // stock
    k.b(3.6, 6.4, 1.4, 0, 2.3, -19, DARK())
    return new Vector3(0, 4.3, 28.9)
  },
  // Kriss Vector: angled lower receiver, long mag, top rail, folding stock.
  vector(k, S, F, G) {
    k.b(4.2, 5.4, 22, 0, 5, 4, S)
    k.b(4.4, 8.4, 8, 0, -0.6, 11, S, -0.62) // the slanted "Super V" block
    k.rail(8.4, -4, 14)
    k.b(3.2, 3.2, 6, 0, 4.4, 17.6, S)
    k.c(1.1, 3, 0, 4.4, 22, DARK())
    k.b(2.6, 14, 3.2, 0, -8, 4.4, DARK()) // long mag
    k.grip(1.8, -2.2, G, { rake: 0.18, h: 10 })
    k.guard(0.4, -0.8, 3.6, S)
    k.b(3, 3.6, 13, 0, 5.2, -12, DARK())
    k.b(3.6, 7, 1.4, 0, 3.6, -18.6, DARK())
    k.b(0.9, 2.2, 0.9, 0, 10.2, 12, DARK())
    k.b(2, 2.2, 1, 0, 10.2, -2.6, DARK())
    return new Vector3(0, 4.4, 23.6)
  },
  // AK-47: wooden handguard, gas tube, stock and grip; curved steel mag; front sight block.
  ak(k, S, F, G) {
    const wood = mat('#a8592a', 0.05, 0.7)
    k.b(4, 6, 26, 0, 4, 2, S)
    k.b(4.2, 1.3, 22, 0, 7.6, 1, mat('#24242a', 0.55, 0.4)) // dust cover
    k.b(1.4, 0.4, 6, 1.6, 6.4, 6, DARK()) // ejection port
    k.b(4.4, 4.2, 12, 0, 3.2, 21, wood) // lower handguard
    k.b(3, 2.6, 10, 0, 7.6, 20.4, wood) // upper (gas tube cover)
    k.c(0.9, 16, 0, 4.6, 33, S)
    k.b(1.6, 3.6, 1.8, 0, 6.6, 37.6, S) // front sight block
    k.c(1.25, 3, 0, 4.6, 42, DARK())
    k.b(2.2, 1.4, 4, 0, 8.8, 10, S) // rear sight
    for (let i = 0; i < 5; i++) k.b(2.8, 3.5, 4.4, 0, -1.6 - i * 3.1, 7.6 + i * 1.6, S, -0.28 - i * 0.07) // curved mag
    k.guard(0.4, -1, 5, S)
    k.grip(1.2, -4.6, wood, { rake: 0.32, h: 9.5, stipple: false })
    k.b(3.6, 5.2, 22, 0, 2.4, -18, wood, 0.12) // stock
    k.b(3.9, 7.2, 1.3, 0, 0.6, -29, DARK(), 0.12)
    return new Vector3(0, 4.6, 43.6)
  },
  // SCAR-L: tan upper with a full-length top rail, side rails, straight mag, folding stock.
  scar(k, S, F, G) {
    k.b(4.4, 6, 30, 0, 5, 6, S)
    k.rail(8.6, -8, 21)
    k.b(0.8, 2.4, 14, 2.5, 4.4, 14, DARK()) // side rails
    k.b(0.8, 2.4, 14, -2.5, 4.4, 14, DARK())
    k.b(4, 4, 12, 0, 1.2, 0, S) // lower receiver
    k.c(1, 10, 0, 5, 25.5, DARK())
    k.c(1.4, 3.4, 0, 5, 32, DARK())
    k.b(3, 15, 5.4, 0, -6, 4.6, DARK(), -0.12) // straight mag
    k.guard(-0.4, -4, 1, S)
    k.grip(0.4, -5.6, DARK(), { rake: 0.3, h: 9 })
    k.b(3.6, 6, 16, 0, 4, -17, S) // stock
    k.b(3.2, 2, 10, 0, 7.6, -16.5, S)
    k.b(4, 8, 1.4, 0, 3, -25, DARK())
    k.b(1, 3, 1, 0, 11, 18, DARK())
    k.b(2.2, 2.6, 1.2, 0, 11, -6, DARK())
    return new Vector3(0, 5, 34)
  },
  // AA-12: chunky body, carry handle, drum magazine, front grip.
  shotgun(k, S, F, G) {
    k.b(5.2, 7.2, 30, 0, 4, 4, S)
    k.b(2, 1.2, 14, 0, 10, 4, DARK())
    k.b(1.6, 2.4, 1.6, 0, 8.8, -2, DARK())
    k.b(1.6, 2.4, 1.6, 0, 8.8, 10, DARK())
    k.c(1.4, 12, 0, 5, 25, S)
    k.b(3.6, 3.2, 4, 0, 5, 32, DARK())
    k.c(5.6, 4.6, 0, -4, 8, DARK(), 'x', 20) // drum
    k.c(4, 4.8, 0, -4, 8, mat('#3b3b44', 0.4, 0.5), 'x', 20)
    k.b(2.6, 6.4, 3.2, 0, -1.6, 17, DARK()) // front grip
    k.guard(0.2, -4.4, 0.4, S)
    k.grip(0.6, -6.4, DARK(), { rake: 0.3, h: 9.5 })
    k.b(4.2, 7.2, 14, 0, 3.6, -17, S)
    k.b(4.6, 8.4, 1.4, 0, 3, -24.4, DARK())
    return new Vector3(0, 5, 34)
  },
  // M249: feed cover, carry handle, heat shield, box mag on the side, bipod.
  lmg(k, S, F, G) {
    k.b(5.2, 7.2, 30, 0, 4.6, 3, S)
    k.b(5.4, 1.6, 14, 0, 8.8, 0, DARK())
    k.b(1.6, 1.2, 10, 0, 12, 8, DARK())
    k.b(1.4, 2.8, 1.4, 0, 10.4, 4, DARK())
    k.b(1.4, 2.8, 1.4, 0, 10.4, 12, DARK())
    k.c(1.1, 26, 0, 4.6, 31, DARK())
    k.b(3.2, 2.2, 12, 0, 7, 23, S) // heat shield
    k.c(1.5, 3, 0, 4.6, 45.6, DARK())
    k.b(6.4, 8, 8, -4.6, -2, 4, F) // box mag
    k.b(6.6, 1, 8.4, -4.6, 2.2, 4, DARK())
    for (const s of [-1, 1]) k.b(0.7, 0.7, 12, s * 1.8, 0.2, 38, DARK(), 0.9, 0, s * 0.25) // bipod legs
    k.guard(0, -3.6, 1.2, S)
    k.grip(0.4, -5.6, DARK(), { rake: 0.3, h: 9.5 })
    k.b(4, 7, 16, 0, 3.4, -19, S)
    k.b(4.4, 8.4, 1.4, 0, 2.6, -27.6, DARK())
    return new Vector3(0, 4.6, 47)
  },
  // Barrett M82: long receiver, scope with lenses, slotted muzzle brake, bipod, cheek rest.
  sniper(k, S, F, G) {
    k.b(5, 7, 34, 0, 4.6, 4, S)
    k.rail(8.6, -10, 18)
    k.c(1.3, 40, 0, 5, 40, S)
    k.b(4.2, 3.2, 6.4, 0, 5, 62, S) // muzzle brake
    for (const z of [60.6, 63.2]) for (const s of [-1, 1]) k.b(0.5, 2, 1.2, s * 2.1, 5, z, DARK())
    const scope = mat('#141418', 0.5, 0.35)
    k.c(1.6, 26, 0, 12.2, 4, scope)
    k.c(2.5, 5, 0, 12.2, -9.6, scope)
    k.c(2.8, 6, 0, 12.2, 18.4, scope)
    k.c(1.2, 2.2, 0, 14.8, 4, scope, 'y') // turret
    k.c(2.3, 0.3, 0, 12.2, 21.5, mat('#3fb8ff', 0.2, 0.1, '#1f7fd0')) // lenses
    k.c(2.0, 0.3, 0, 12.2, -12.2, mat('#3fb8ff', 0.2, 0.1, '#1f7fd0'))
    for (const z of [-2, 10]) k.b(1.6, 3, 1.6, 0, 10, z, DARK())
    k.b(3.6, 9, 7.4, 0, -4, 9, DARK()) // mag
    k.guard(0.4, -4, 1.4, S)
    k.grip(0.8, -6, DARK(), { rake: 0.3, h: 10 })
    k.b(4.2, 7.6, 22, 0, 3.4, -22, S)
    k.b(3.4, 2.4, 12, 0, 8, -20, DARK()) // cheek rest
    k.b(4.6, 9, 1.8, 0, 2.6, -33.4, mat('#2b2b30', 0.1, 0.9))
    for (const s of [-1, 1]) k.b(0.8, 0.8, 13, s * 2.2, 0.6, 33, DARK(), 0.95, 0, s * 0.28) // bipod
    k.b(1.6, 1.2, 9, 0, 11.6, 26, DARK()) // carry handle
    return new Vector3(0, 5, 65.4)
  },
}
// Older names in config map onto the builders above.
const ALIAS = { smg: 'uzi', rifle: 'ak' }

// def: a GUNS entry ({ id, kind, body, accent }) or any { kind, body, accent }.
export function makeGun(def) {
  const inner = new Group()
  inner.scale.setScalar(U)
  const kind = BUILDERS[def.kind] ? def.kind : (ALIAS[def.kind] ?? 'pistol')
  const chrome = kind === 'magnum'
  const S = mat(def.body, chrome ? 0.9 : 0.35, chrome ? 0.2 : 0.5)
  const F = mat(def.frame ?? def.accent, 0.2, 0.6)
  const G = mat(def.accent, 0.1, 0.75)
  const muzzle = BUILDERS[kind](kit(inner), S, F, G, def).multiplyScalar(U)
  const holder = new Group()
  holder.add(inner)
  const g = bake(holder, true)
  g.userData.muzzle = muzzle
  g.userData.length = new Vector3(0, 0, 0).distanceTo(muzzle) // rough: origin to muzzle
  return g
}
