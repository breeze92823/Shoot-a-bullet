// Everything that fires: the player's gun (training shots at a plot's dummy,
// the big bullet from the Shoot Zone), the NPC shooters, and the effects that
// go with it: muzzle flashes with a flash light, tracers, impact sparks.
// The Shoot Zone shot is a short cinematic (SHOOT -> requestShot): an over-the-
// shoulder aim, the muzzle blast, then the camera rides the flaming bullet down
// the smash range (range.js) while it breaks objects, and swings out to the
// side when it gets stuck; the HUD gets each beat through ctx.cine.
import {
  AdditiveBlending,
  BackSide,
  BoxGeometry,
  CanvasTexture,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  Group,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PointLight,
  Quaternion,
  Sprite,
  SpriteMaterial,
  Vector3,
} from 'three'
import { BULLET, CHARACTER_COLORS, GUN_FX, GUN_SOUND, NPCS, PLAYER_DIMS, RIG_HEIGHT, SHOOT_ZONE as SZ, ZONES } from './config.js'
import { buildDefaultCharacter } from './avatar/character.js'
import { PlayerRig, PoseBuffer } from './avatar/rig.js'
import { makeGun } from './guns.js'
import { signSprite } from './signs.js'
import { paintSoftDot } from './textures.js'
import { gunDef, OBJECT_COUNT, zoneOf } from './game.js'
import { flight, sfx } from './audio.js'

const RIG_SCALE = PLAYER_DIMS.height / RIG_HEIGHT
const tmpV = new Vector3()
const tmpV2 = new Vector3()
const tmpQ = new Quaternion()

// --- Holding a gun ---------------------------------------------------------------------------
// Parents `gun` to the character's right arm so that, with the arm raised
// forward (the tool-hold pose), the barrel points where the arm points. Must
// run while the rig is in its bind pose. Works for player.glb's twisted bone
// frames and the procedural rig alike, as it reads the frames off the bones.
export function attachToHand(root, gun) {
  let mount = root.userData.handMount
  if (!mount) {
    const bone = root.nodes?.ArmR1
    if (!bone) return null
    root.updateMatrixWorld(true)
    const rootQ = root.getWorldQuaternion(new Quaternion())
    const boneQ = bone.getWorldQuaternion(new Quaternion())
    const inv = rootQ.clone().invert().multiply(boneQ).invert() // character space -> bone space
    const down = new Vector3(0, -1, 0).applyQuaternion(inv)
    const fwd = new Vector3(0, 0, 1).applyQuaternion(inv)
    const s = bone.getWorldScale(new Vector3()).x / Math.max(1e-6, root.parent ? root.parent.getWorldScale(new Vector3()).x : 1)
    const x = new Vector3().crossVectors(fwd, down).normalize()
    mount = root.userData.handMount = {
      bone,
      q: new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(x, fwd, down)),
      p: down.clone().multiplyScalar((2.15 * RIG_SCALE) / s).addScaledVector(fwd, (-0.35 * RIG_SCALE) / s),
      s: 1.2 / s,
    }
  }
  gun.quaternion.copy(mount.q)
  gun.position.copy(mount.p)
  gun.scale.setScalar(mount.s)
  mount.bone.add(gun)
  return gun
}

// Aim pose on top of whatever the animator wrote this frame: right arm straight
// forward, left arm across to support it. `k` 0..1 blends it in.
// `recoil` (rad) kicks both arms up after a shot.
const AIM = { ArmR1: { x: -Math.PI / 2, y: 0.12, kick: 1 }, ArmL1: { x: -1.25, y: -0.55, kick: 0.7 } }
export function applyAim(rig, k, recoil = 0) {
  if (!rig || k <= 0.001) return
  for (const b of rig.bindings) {
    const a = AIM[b.bone.name]
    if (!a) continue
    tmpQ.setFromAxisAngle(b.axisX, a.x * k - recoil * a.kick * k)
    b.bone.quaternion.premultiply(tmpQ)
    tmpQ.setFromAxisAngle(b.axisY, a.y * k)
    b.bone.quaternion.premultiply(tmpQ)
  }
}

// --- NPCs ---------------------------------------------------------------------------------------
function makeNpc(def) {
  const root = buildDefaultCharacter()
  const swap = new Map()
  const pick = { [new Color(CHARACTER_COLORS.suit).getHex()]: def.suit, [new Color(CHARACTER_COLORS.skin).getHex()]: def.skin, [new Color(CHARACTER_COLORS.hair).getHex()]: def.hair }
  root.traverse((o) => {
    if (!o.isMesh) return
    const hex = o.material.color.getHex()
    if (!swap.has(o.material)) swap.set(o.material, new MeshStandardMaterial({ color: pick[hex] ?? hex, roughness: 0.7 }))
    o.material = swap.get(o.material)
  })
  const group = new Group()
  group.add(root)
  const gun = makeGun(def.gun ?? { kind: 'pistol', body: '#2e2c2e', accent: '#2a2a30' })
  attachToHand(root, gun)
  const rig = new PlayerRig(root)
  const pose = new PoseBuffer()
  const tag = signSprite([{ text: def.name, size: 46, color: '#ffffff', outline: '#000000' }], 0.42)
  tag.position.set(0, PLAYER_DIMS.height + 0.55, 0)
  group.add(tag)
  return { group, root, rig, pose, gun, name: def.name }
}

// --- Effects ------------------------------------------------------------------------------------
const flashTex = new CanvasTexture(paintSoftDot(64))
// A spiky muzzle star: eight tapered rays round a hot centre.
const starTex = (() => {
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const g = c.getContext('2d')
  g.translate(64, 64)
  for (let i = 0; i < 8; i++) {
    g.rotate(Math.PI / 4)
    const L = i % 2 ? 40 : 62
    const grad = g.createLinearGradient(0, 0, L, 0)
    grad.addColorStop(0, 'rgba(255,255,255,1)')
    grad.addColorStop(1, 'rgba(255,255,255,0)')
    g.fillStyle = grad
    g.beginPath()
    g.moveTo(0, -7)
    g.lineTo(L, 0)
    g.lineTo(0, 7)
    g.fill()
  }
  const r = g.createRadialGradient(0, 0, 0, 0, 0, 24)
  r.addColorStop(0, 'rgba(255,255,255,1)')
  r.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = r
  g.fillRect(-24, -24, 48, 48)
  return new CanvasTexture(c)
})()
// Muzzle flashes: a soft core, a spiky star and a flame tongue out along the barrel.
const Z_AXIS = new Vector3(0, 0, 1)
function makeFlashPool(scene, n) {
  const tongueGeo = new ConeGeometry(1, 1, 10, 1, true)
  tongueGeo.rotateX(Math.PI / 2) // tip toward +Z
  tongueGeo.translate(0, 0, 0.5)
  const pool = []
  const add = (o) => {
    o.visible = false
    o.renderOrder = 6
    scene.add(o)
    return o
  }
  for (let i = 0; i < n; i++) {
    const core = add(new Sprite(new SpriteMaterial({ map: flashTex, color: new Color('#ffd27a').multiplyScalar(3), transparent: true, blending: AdditiveBlending, depthWrite: false, fog: false })))
    const star = add(new Sprite(new SpriteMaterial({ map: starTex, color: new Color('#ffd27a').multiplyScalar(2.5), transparent: true, blending: AdditiveBlending, depthWrite: false, fog: false })))
    const tongue = add(new Mesh(tongueGeo, new MeshBasicMaterial({ color: new Color('#ffb04a').multiplyScalar(2.2), transparent: true, blending: AdditiveBlending, depthWrite: false, side: DoubleSide, fog: false })))
    pool.push({ core, star, tongue, life: 0, total: 0.07, size: 1 })
  }
  let next = 0
  return {
    // dir: the barrel's world direction (adds the flame tongue).
    fire(pos, size = 0.9, { color = '#ffd27a', dir = null, life = 0.07 } = {}) {
      const f = pool[next]
      next = (next + 1) % n
      f.core.position.copy(pos)
      f.core.scale.setScalar(size)
      f.core.material.color.set(color).multiplyScalar(3)
      f.core.material.rotation = Math.random() * Math.PI
      f.star.position.copy(pos)
      f.star.scale.setScalar(size * 1.7)
      f.star.material.color.set(color).multiplyScalar(2.5)
      f.star.material.rotation = Math.random() * Math.PI
      f.core.visible = f.star.visible = true
      if (dir) {
        f.tongue.position.copy(pos)
        f.tongue.quaternion.setFromUnitVectors(Z_AXIS, dir)
        f.tongue.scale.set(size * 0.16, size * 0.16, size * 0.85)
        f.tongue.material.color.set(color).multiplyScalar(2.2)
        f.tongue.visible = true
      }
      f.life = f.total = life
      f.size = size
    },
    update(dt) {
      for (const f of pool) {
        if (f.life <= 0) continue
        f.life -= dt
        const k = Math.max(0, f.life / f.total)
        f.core.material.opacity = k
        f.star.material.opacity = k
        f.tongue.material.opacity = k
        f.star.scale.setScalar(f.size * (1.7 + (1 - k) * 0.6))
        if (f.life <= 0) f.core.visible = f.star.visible = f.tongue.visible = false
      }
    },
  }
}

// Spent casings: kicked out of the ejection port to the right, spinning, bouncing on the
// floor with a tink (onTink), then fading.
function makeShellPool(scene, n) {
  const geo = new CylinderGeometry(1, 1, 1, 8)
  geo.rotateZ(Math.PI / 2) // length along X
  const mats = new Map()
  const mat = (c) => {
    if (!mats.has(c)) mats.set(c, new MeshStandardMaterial({ color: c, metalness: c === '#d02a2a' ? 0.1 : 0.85, roughness: 0.3 }))
    return mats.get(c)
  }
  const pool = []
  for (let i = 0; i < n; i++) {
    const m = new Mesh(geo, mat('#e8b23a'))
    m.visible = false
    m.castShadow = true
    scene.add(m)
    pool.push({ m, v: new Vector3(), w: new Vector3(), life: 0, floor: 0, size: 1, tinks: 0, plastic: false, onTink: null })
  }
  let next = 0
  return {
    eject(at, right, up, fwd, size, color, floor, onTink) {
      const s = pool[next]
      next = (next + 1) % n
      s.m.material = mat(color)
      s.m.position.copy(at)
      s.m.rotation.set(Math.random(), Math.random() * 6, Math.random())
      s.size = size
      s.m.scale.set(0.06 * size, 0.017 * size, 0.017 * size)
      s.v.copy(right).multiplyScalar(1.6 + Math.random() * 1.4).addScaledVector(up, 2.2 + Math.random() * 1.2).addScaledVector(fwd, -0.4 - Math.random() * 0.6)
      s.w.set((Math.random() - 0.5) * 30, (Math.random() - 0.5) * 30, (Math.random() - 0.5) * 30)
      s.life = 2.6
      s.floor = floor
      s.tinks = 0
      s.plastic = color === '#d02a2a'
      s.onTink = onTink
      s.m.visible = true
    },
    update(dt) {
      for (const s of pool) {
        if (s.life <= 0) continue
        s.life -= dt
        s.v.y -= 14 * dt
        s.m.position.addScaledVector(s.v, dt)
        s.m.rotation.x += s.w.x * dt
        s.m.rotation.y += s.w.y * dt
        s.m.rotation.z += s.w.z * dt
        const r = 0.017 * s.size
        if (s.m.position.y < s.floor + r && s.v.y < 0) {
          s.m.position.y = s.floor + r
          if (s.tinks < 3 && -s.v.y > 0.5) {
            s.onTink?.(s.m.position, Math.min(1, -s.v.y / 4), s.plastic)
            s.tinks++
          }
          s.v.y *= -0.38
          s.v.x *= 0.55
          s.v.z *= 0.55
          s.w.multiplyScalar(0.5)
        }
        const k = Math.min(1, s.life / 0.4)
        s.m.scale.set(0.06 * s.size * k, 0.017 * s.size * k, 0.017 * s.size * k)
        if (s.life <= 0) s.m.visible = false
      }
    },
  }
}

function makeTracerPool(scene, n) {
  const geo = new BoxGeometry(0.06, 0.06, 1)
  geo.translate(0, 0, 0.5)
  const pool = []
  for (let i = 0; i < n; i++) {
    const m = new Mesh(geo, new MeshBasicMaterial({ color: new Color('#ffe08a').multiplyScalar(2.5), transparent: true, blending: AdditiveBlending, depthWrite: false }))
    m.visible = false
    scene.add(m)
    pool.push({ m, life: 0 })
  }
  let next = 0
  return {
    fire(from, to) {
      const t = pool[next]
      next = (next + 1) % n
      t.m.position.copy(from)
      t.m.lookAt(to)
      t.m.scale.set(1, 1, from.distanceTo(to))
      t.m.visible = true
      t.life = 0.09
    },
    update(dt) {
      for (const t of pool) {
        if (t.life <= 0) continue
        t.life -= dt
        t.m.material.opacity = Math.max(0, t.life / 0.09)
        if (t.life <= 0) t.m.visible = false
      }
    },
  }
}


// The big bullet: brass case, golden nose, a white outline hull (it reads on any
// background, like the reference), a two-layer flame cone behind it, a halo and a light.
// `ammo` (config AMMO tier, from Evolve) tints the nose and case; none = classic brass.
function makeBigBullet(ammo) {
  const g = new Group()
  const r = 0.34
  const len = r * 3.4
  const brass = new MeshStandardMaterial({ color: ammo?.body ?? '#f5c23a', metalness: 0.75, roughness: 0.28, emissive: ammo?.body ?? '#c86a10', emissiveIntensity: ammo ? 0.22 : 0.3 })
  const nose = new MeshStandardMaterial({ color: ammo?.tip ?? '#ffd84a', metalness: 0.7, roughness: 0.3, emissive: ammo?.tip ?? '#d08a10', emissiveIntensity: ammo ? 0.22 : 0.3 })
  const rim = new MeshStandardMaterial({ color: '#c88a1a', metalness: 0.8, roughness: 0.3 })
  const outline = new MeshBasicMaterial({ color: '#ffffff', side: BackSide, transparent: true, opacity: 0.95, fog: false })
  const body = new CylinderGeometry(r, r, len, 20)
  body.rotateX(Math.PI / 2)
  const tip = new CylinderGeometry(r * 0.12, r, r * 2.2, 20)
  tip.rotateX(-Math.PI / 2)
  tip.translate(0, 0, -len / 2 - r * 1.1)
  const base = new CylinderGeometry(r * 1.06, r * 1.06, r * 0.3, 20)
  base.rotateX(Math.PI / 2)
  base.translate(0, 0, len / 2)
  g.add(new Mesh(body, brass), new Mesh(tip, nose), new Mesh(base, rim))
  for (const geo of [body, tip, base]) {
    const o = new Mesh(geo, outline)
    o.scale.setScalar(1.09)
    g.add(o)
  }
  // Flame: open cones whose wide end sits at the bullet's base, tapering to a point behind it.
  const flameGeo = new ConeGeometry(1, 1, 18, 1, true)
  flameGeo.rotateX(Math.PI / 2) // tip toward +Z (behind the bullet)
  flameGeo.translate(0, 0, 0.5)
  const flames = [
    { color: new Color('#ff4a12').multiplyScalar(1.15), r: r * 1.45, l: 3.6, o: 0.5 },
    { color: new Color('#ffc23a').multiplyScalar(1.3), r: r * 0.9, l: 2.2, o: 0.6 },
  ].map((f) => {
    const m = new Mesh(flameGeo, new MeshBasicMaterial({ color: f.color, transparent: true, opacity: f.o, blending: AdditiveBlending, depthWrite: false, side: DoubleSide, fog: false }))
    m.position.z = len / 2 + 0.05
    m.userData = f
    g.add(m)
    return m
  })
  const halo = new Sprite(new SpriteMaterial({ map: flashTex, color: new Color('#ff9a2a').multiplyScalar(1.3), transparent: true, opacity: 0.4, blending: AdditiveBlending, depthWrite: false, fog: false }))
  halo.scale.setScalar(2.2)
  halo.position.z = len * 0.9
  g.add(halo)
  // The light sits behind the bullet so it lights the table and objects, not its own case.
  const light = new PointLight('#ffa040', 28, 16, 2)
  light.position.set(0, 0, 2.4)
  g.add(light)
  g.userData = { flames, halo, light }
  return g
}

// Thin additive streaks the bullet cam rushes past (speed lines).
function makeStreaks(scene, n) {
  const geo = new BoxGeometry(0.035, 0.035, 1)
  geo.translate(0, 0, 0.5)
  const pool = []
  for (let i = 0; i < n; i++) {
    const m = new Mesh(geo, new MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false, fog: false }))
    m.visible = false
    scene.add(m)
    pool.push({ m, life: 0 })
  }
  let next = 0
  return {
    spawn(x, y, z, len) {
      const s = pool[next]
      next = (next + 1) % n
      s.m.position.set(x, y, z)
      s.m.scale.set(1, 1, len)
      s.m.visible = true
      s.life = 0.35
    },
    update(dt) {
      for (const s of pool) {
        if (s.life <= 0) continue
        s.life -= dt
        s.m.material.opacity = Math.max(0, Math.min(0.55, s.life * 2.5))
        if (s.life <= 0) s.m.visible = false
      }
    },
  }
}

const smooth = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u))

// --- The system -------------------------------------------------------------------------------------
export function createShooting(scene, lobby, particles, hooks) {
  const range = lobby.range
  const flashes = makeFlashPool(scene, 10)
  const tracers = makeTracerPool(scene, 24)
  const streaks = makeStreaks(scene, 28)
  const shells = makeShellPool(scene, 36)
  const flashLight = new PointLight('#ffc46b', 0, 12, 2)
  scene.add(flashLight)
  let flashLevel = 0

  function muzzle(gun, out) {
    gun.updateWorldMatrix(true, false)
    return out.copy(gun.userData.muzzle).applyMatrix4(gun.matrixWorld)
  }
  // The gun's world frame: barrel direction (+Z of the gun), its up, and its right.
  const bDir = new Vector3()
  const bUp = new Vector3()
  const bRight = new Vector3()
  const gunOrigin = new Vector3()
  const port = new Vector3()
  function barrel(gun) {
    gun.updateWorldMatrix(true, false)
    bDir.set(0, 0, 1).transformDirection(gun.matrixWorld)
    bUp.set(0, 1, 0).transformDirection(gun.matrixWorld)
    bRight.crossVectors(bDir, bUp).normalize()
    gunOrigin.setFromMatrixPosition(gun.matrixWorld)
  }
  const fxOf = (kind) => GUN_FX[GUN_SOUND[kind] ?? 'pistol'] ?? GUN_FX.pistol
  const tink = (at, k, plastic) => sfx.shell(at, k, plastic)
  // Everything at the muzzle when `gun` (a GUNS kind) fires: flash star + flame tongue,
  // flash light, smoke, and a casing out of the ejection port. k scales it (the big shot).
  function muzzleFx(gun, kind, from, floorY, k = 1) {
    const p = fxOf(kind)
    barrel(gun)
    // The flash stays near real size even for the big shot: the camera is a metre away.
    const kf = Math.min(k, 0.9)
    flashes.fire(from, 0.42 * p.flash * kf, { color: p.flashColor, dir: bDir, life: 0.05 + 0.03 * k })
    flashLight.color.set(p.flashColor)
    flashLight.position.copy(from)
    flashLevel = Math.max(flashLevel, Math.min(1.3, p.flash * kf))
    const puffs = Math.round(3 * p.smoke * k)
    for (let i = 0; i < puffs; i++) {
      const sp = 0.15 + Math.random() * 0.45 // puffs hang at the muzzle and rise, they don't chase the round
      particles.emit({ x: from.x + bDir.x * 0.06, y: from.y + bDir.y * 0.06, z: from.z + bDir.z * 0.06, vx: bDir.x * sp + (Math.random() - 0.5) * 0.25, vy: bDir.y * sp + 0.3 + Math.random() * 0.3, vz: bDir.z * sp + (Math.random() - 0.5) * 0.25, color: '#cfcfd8', size: (0.1 + Math.random() * 0.1) * p.smoke * Math.sqrt(k), life: 0.9 + Math.random() * 0.6, drag: 2.2, grow: 2.2, boost: 0.2 })
    }
    port.lerpVectors(gunOrigin, from, 0.4).addScaledVector(bUp, 0.03)
    shells.eject(port, bRight, bUp, bDir, p.shell * (k > 1 ? 1.25 : 1), p.shellColor, floorY, tink)
    return p
  }
  function shotFx(from, to, sparkColor = '#ffd35a') {
    tracers.fire(from, to)
    particles.burst(to.x, to.y, to.z, 7, { speed: 5, up: 1.5, colors: [sparkColor, '#ffffff', '#ffb347'], size: 0.35, life: 0.45, gravity: -12, boost: 1.8 })
  }

  // NPC shooters: four on the Shoot Zone pad (at the first target), three training on plots.
  const plotById = Object.fromEntries(lobby.plots.map((p) => [p.def.id, p]))
  const npcDefs = [
    ...NPCS.map((n) => ({ ...n, aim: 'board' })),
    { name: 'Kai_2010', suit: '#1b1b1f', skin: '#f2c79a', hair: '#4a2f1c', aim: 'iron', gun: { kind: 'smg', body: '#2a2a30', accent: '#45454f' } },
    { name: 'SunnyBlox', suit: '#7ec8ff', skin: '#ffd9b3', hair: '#ffe07a', aim: 'golden', gun: { kind: 'rifle', body: '#2a2a30', accent: '#b0602a' } },
    { name: 'GoldRush', suit: '#3a3324', skin: '#c98d5e', hair: '#d9a520', aim: 'amber', gun: { kind: 'sniper', body: '#3a3c44', accent: '#2a2a30' } },
  ]
  const firstTarget = range.objectPos(0, new Vector3())
  firstTarget.y = range.tableY + 1.0
  const npcs = npcDefs.map((def) => {
    const n = makeNpc(def)
    let target
    if (def.aim === 'board') {
      n.group.position.set(def.x, SZ.floorY, def.z)
      target = firstTarget
    } else {
      const p = plotById[def.aim]
      n.group.position.set(p.pad.x + 0.5, p.pad.y, p.pad.z)
      target = new Vector3(p.dummyPos.x, p.dummyPos.y, p.dummyPos.z)
      n.plot = p
    }
    n.group.rotation.y = Math.atan2(target.x - n.group.position.x, target.z - n.group.position.z)
    n.target = target
    n.timer = Math.random() * 1.5
    n.board = def.aim === 'board'
    n.kind = def.gun?.kind ?? 'pistol'
    scene.add(n.group)
    return n
  })

  // --- The player's shot: aim -> fly -> stuck -> back ---
  const seq = {
    phase: 'idle', // 'aim' | 'fly' | 'stuck' | 'back'
    t: 0,
    want: false,
    result: null,
    bullet: null,
    fired: false,
    pos: new Vector3(),
    from: new Vector3(),
    startZ: 0,
    stopZ: 0,
    vmax: 0,
    v: 0,
    next: 0,
    zone: -1,
    shake: 0,
    exitT: 0, // s since the trigger (the slow-motion exit from the barrel)
    kind: 'pistol',
    anchor: new Vector3(), // the gun's grip the aim camera frames (frozen at the trigger)
  }
  const cam = { w: 0, pos: new Vector3(), look: new Vector3(), q: new Quaternion() }
  const lookM = new Matrix4()
  const flyPos = new Vector3()
  const flyLook = new Vector3()

  const train = { plot: null, timer: 0, aim: 0, gun: null, recoil: 0 }
  const aimPos = new Vector3()
  const aimLook = new Vector3()
  const nearPos = new Vector3()
  const nearLook = new Vector3()
  let inZoneNow = false

  function fireBullet(ctx) {
    const from = muzzle(train.gun, new Vector3())
    seq.from.copy(from)
    seq.pos.copy(from)
    seq.startZ = from.z
    const r = seq.result
    seq.stopZ = r.smashed >= OBJECT_COUNT ? range.endZ + 1.2 : range.objectZ(r.stuckIn) + 0.62
    seq.vmax = Math.max(BULLET.speed, (seq.startZ - seq.stopZ) / 7)
    seq.v = BULLET.exitSpeed
    seq.next = 0
    seq.zone = -1
    seq.fired = true
    seq.exitT = 0
    const b = makeBigBullet(hooks.ammo?.())
    b.position.copy(from)
    b.scale.setScalar(0.22)
    scene.add(b)
    seq.bullet = b
    // The blast, sized to the gun: flash, smoke, casing, recoil, shake, sparks and its report.
    const p = muzzleFx(train.gun, seq.kind, from, SZ.floorY, 2.2)
    train.recoil = p.recoil * 0.55 // a short kick: more would swing the arm across the aim camera
    seq.shake = p.shake
    particles.burst(from.x, from.y, from.z, Math.round(14 + 10 * p.flash), { speed: 5, up: 1, colors: [p.flashColor, '#ff8a2a', '#ffffff'], size: 0.3, life: 0.5, gravity: -3, boost: 2 })
    sfx.bigShot(seq.kind)
    flight.start()
    ctx.cine?.fired?.()
  }

  function flyStep(dt, ctx) {
    const b = seq.bullet
    const r = seq.result
    const d = seq.pos.z - seq.stopZ
    seq.v = BULLET.minSpeed + (seq.vmax - BULLET.minSpeed) * Math.min(1, d / 30)
    // Leaving the barrel in slow motion, then kicking up to full speed.
    seq.exitT += dt
    if (seq.exitT < BULLET.exitTime) {
      const u = seq.exitT / BULLET.exitTime
      seq.v = Math.min(seq.v, BULLET.exitSpeed + (seq.vmax - BULLET.exitSpeed) * u * u * u)
    }
    const step = Math.min(d, seq.v * dt)
    seq.pos.z -= step
    const travelled = seq.startZ - seq.pos.z
    const k = smooth(Math.min(1, travelled / 7))
    seq.pos.x = seq.from.x + (0 - seq.from.x) * k
    seq.pos.y = seq.from.y + (range.bulletY - seq.from.y) * k
    b.position.copy(seq.pos)
    flight.speed(Math.min(1, seq.v / Math.max(1, seq.vmax)))
    b.scale.setScalar(0.22 + 0.78 * k)
    b.rotation.z += dt * 14
    // Smashes.
    while (seq.next < r.smashed && seq.pos.z <= range.objectZ(seq.next) + 0.65) {
      const i = seq.next
      range.smash(i, seq.v)
      const z = zoneOf(i)
      if (z !== seq.zone) {
        seq.zone = z
        range.flashGate(z)
        ctx.cine?.zone?.(ZONES[z], z)
        sfx.zone()
      }
      sfx.smash(ZONES[z].kind, i + 1)
      ctx.cine?.smash?.(i + 1, r.running[i])
      seq.shake = Math.min(1, seq.shake + 0.22)
      seq.next++
    }
    // Trail: fire + sparkles + speed streaks.
    const p = seq.pos
    // Heat: the fire builds with speed, so the bullet is a clean brass round leaving the barrel.
    const heat = Math.min(1, Math.max(0, (seq.v - BULLET.exitSpeed) / 25))
    const n = Math.round(Math.min(9, 2 + Math.round(step / 0.25)) * heat)
    const s = b.scale.x
    for (let i = 0; i < n; i++) {
      const back = Math.random() * step
      particles.emit({ x: p.x + (Math.random() - 0.5) * 0.35 * s, y: p.y + (Math.random() - 0.5) * 0.35 * s, z: p.z + 1.1 * s + back, vx: (Math.random() - 0.5) * 1.2, vy: Math.random() * 1.2, vz: 2 + Math.random() * 3, color: i % 3 === 0 ? '#ff4a1a' : i % 3 === 1 ? '#ff9a2a' : '#ffd84a', size: (0.5 + Math.random() * 0.45) * s, life: 0.3 + Math.random() * 0.2, drag: 2.5, grow: 1.1, boost: 1.25 })
    }
    if (Math.random() < 0.5 * heat) {
      const a = Math.random() * Math.PI * 2
      const rr = 1.0 + Math.random() * 1.8
      particles.emit({ x: p.x + Math.cos(a) * rr, y: p.y + Math.sin(a) * rr, z: p.z + Math.random() * 2, color: '#ffffff', size: 0.35 + Math.random() * 0.4, life: 0.5, sparkle: true, twinkle: 18, boost: 1.3 })
    }
    if (seq.phase === 'fly') {
      for (let i = 0; i < 2; i++) {
        const a = Math.random() * Math.PI * 2
        const rr = 1.3 + Math.random() * 3.2
        streaks.spawn(p.x + Math.cos(a) * rr, p.y + Math.sin(a) * rr * 0.7, p.z - 6 - Math.random() * 22, 2 + Math.random() * 4)
      }
    }
    const fl = b.userData.flames
    for (const f of fl) {
      const u = f.userData
      const flick = 0.85 + Math.random() * 0.3
      f.scale.set(u.r * flick * Math.max(0.05, heat), u.r * flick * Math.max(0.05, heat), u.l * (0.6 + 0.4 * Math.min(1, seq.v / 30)) * flick * Math.max(0.05, heat))
      f.visible = heat > 0.03
    }
    b.userData.halo.material.rotation += dt * 3
    b.userData.halo.material.opacity = 0.4 * heat
    b.userData.light.intensity = 28 * (0.12 + 0.88 * heat)
    if (seq.pos.z <= seq.stopZ + 1e-3) {
      // Stuck (or out of objects: into the end wall).
      seq.phase = 'stuck'
      seq.t = 0
      const all = r.smashed >= OBJECT_COUNT
      const zi = zoneOf(Math.min(r.stuckIn, OBJECT_COUNT - 1))
      if (!all) range.stick(r.stuckIn)
      seq.shake = 1
      particles.burst(p.x, p.y, p.z - 0.3, 40, { speed: 10, up: 3, colors: ['#ffd35a', '#ff8a2a', '#ffffff', ...ZONES[zi].debris], size: 0.6, life: 0.9, gravity: -8, boost: 2 })
      ctx.cine?.stuck?.(ZONES[zi], r.wins, all)
      flight.stop()
      sfx.stuck(all ? null : ZONES[zi].kind, r.wins)
      for (const f of fl) f.visible = false
    }
  }

  function endShot(ctx) {
    if (seq.bullet) {
      scene.remove(seq.bullet)
      seq.bullet.traverse((o) => {
        o.material?.dispose?.()
        o.geometry?.dispose?.()
      })
      seq.bullet = null
    }
    range.resetAll()
    seq.phase = 'idle'
    seq.fired = false
    cam.w = 0
    hooks.release?.()
    flight.stop()
    if (seq.result.wins > 0) {
      ctx.onWins(seq.result.wins)
      sfx.credit()
    }
    ctx.cine?.end?.(seq.result)
  }

  return {
    // The player's gun model, rebuilt on avatar or gun change.
    equip(avatarRoot) {
      if (train.gun) train.gun.removeFromParent()
      train.gun = attachToHand(avatarRoot, makeGun(gunDef()))
      if (train.gun) train.gun.visible = false
    },
    playerGun: () => train.gun,
    aimLevel: () => train.aim,
    recoil: () => train.recoil,
    // SHOOT (button / key): starts the shot if the player stands in the Shoot Zone.
    requestShot() {
      if (seq.phase !== 'idle' || !inZoneNow) return false
      seq.want = true
      return true
    },
    get busy() {
      return seq.phase !== 'idle'
    },

    // Per frame, before the avatar animator's pose is final (applyAim runs after it).
    update(dt, t, ctx) {
      const { player, onDamage, onLocked, popupAt } = ctx
      const pos = player.renderPosition
      // --- Training on a plot pad.
      let plot = null
      for (const p of lobby.plots) {
        p.active = false
        if (Math.abs(pos.y - p.pad.y) < 1.2 && p.contains(pos.x, pos.z)) plot = p
      }
      if (plot !== train.plot) {
        train.plot = plot
        train.timer = 0.35
        if (plot && !hooks.unlocked(plot.def)) onLocked(plot.def)
      }
      const training = plot && hooks.unlocked(plot.def)
      if (plot) plot.active = training
      // --- The Shoot Zone pad.
      const inZone = pos.z <= SZ.frontZ + 0.2 && pos.z >= SZ.padBackZ - 1 && Math.abs(pos.x) <= SZ.halfWidth && pos.y > SZ.floorY - 0.3
      inZoneNow = inZone
      const moving = Math.hypot(player.velocity.x, player.velocity.z) > 0.5

      if (seq.want && seq.phase === 'idle') {
        seq.want = false
        seq.phase = 'aim'
        seq.t = 0
        seq.fired = false
        seq.result = hooks.shot()
        hooks.hold?.() // snaps the player to the firing spot, facing north, and freezes them
        train.aim = 1
        seq.kind = gunDef().kind
        ctx.cine?.begin?.(seq.result)
        sfx.cock(seq.kind)
      }
      const cine = seq.phase !== 'idle'

      const wantAim = cine ? (seq.phase === 'back' ? 0 : 1) : (training || inZone) && !moving ? 1 : 0
      train.aim += (wantAim - train.aim) * Math.min(1, dt * 10)
      if (train.gun) train.gun.visible = train.aim > 0.3

      if (training && !moving && !cine) {
        // Face the dummy and shoot it every trainInterval.
        const d = plot.dummyPos
        player.facing = Math.atan2(d.x - pos.x, d.z - pos.z)
        train.timer -= dt
        if (train.timer <= 0 && train.gun && train.aim > 0.8) {
          train.timer += hooks.trainInterval()
          const from = muzzle(train.gun, tmpV)
          const to = tmpV2.set(d.x + (Math.random() - 0.5) * 1.2, d.y + (Math.random() - 0.5) * 1.6, d.z)
          const kind = gunDef().kind
          const fx = muzzleFx(train.gun, kind, from, pos.y)
          train.recoil = Math.max(train.recoil, fx.recoil * 0.6)
          shotFx(from, to, plot.def.top)
          sfx.gun(kind)
          plot.hit()
          const gained = onDamage(plot.def)
          sfx.hit(to, gained?.crit)
          popupAt(to, gained)
        }
      } else if (inZone && !moving && !cine) {
        player.facing = Math.PI
      }

      // --- The shot sequence.
      if (seq.phase !== 'idle') {
        seq.t += dt
        if (seq.phase === 'aim') {
          player.facing = Math.PI
          if (!seq.fired) {
            if (train.gun) seq.anchor.setFromMatrixPosition(train.gun.matrixWorld) // the aim camera frames the gun from its grip
            if (seq.t >= BULLET.aimTime && train.gun) fireBullet(ctx)
          }
          if (seq.fired) flyStep(dt, ctx)
          if (seq.fired && seq.exitT >= BULLET.exitTime && seq.phase === 'aim') {
            seq.phase = 'fly'
            ctx.cine?.flying?.()
          }
        } else if (seq.phase === 'fly') {
          flyStep(dt, ctx)
        } else if (seq.phase === 'stuck') {
          const b = seq.bullet
          if (b) {
            b.userData.light.intensity = 28 * Math.max(0.25, 1 - seq.t)
            b.userData.halo.material.opacity = 0.4 * Math.max(0.2, 1 - seq.t)
            if (Math.random() < 0.4) particles.emit({ x: b.position.x + (Math.random() - 0.5), y: b.position.y + Math.random(), z: b.position.z + 0.6, vy: 1.5, color: '#9a9aa6', size: 0.9, life: 0.8, drag: 1, grow: 1.4, boost: 0.6 })
          }
          if (seq.t >= BULLET.stuckTime) {
            seq.phase = 'back'
            seq.t = 0
            ctx.cine?.leaving?.()
            sfx.back()
          }
        } else if (seq.phase === 'back') {
          // The HUD flashes white; the camera cuts back under the flash.
          if (seq.t >= BULLET.returnTime * 0.4) endShot(ctx)
        }
      }

      // --- NPCs: idle breathing + aim, shots at their targets.
      for (const n of npcs) {
        n.pose.reset()
        n.recoil = (n.recoil ?? 0) * Math.exp(-dt * 10)
        n.pose.set('ArmR1', -Math.PI / 2 - n.recoil, 0.12, 0)
        n.pose.set('ArmL1', -1.25 - n.recoil * 0.7, -0.55, 0)
        n.pose.set('Spine1', Math.sin(t * 2 + n.timer) * 0.015, 0, 0)
        n.rig.applyPose(n.pose)
        n.timer -= dt
        if (n.timer <= 0) {
          n.timer = 0.6 + Math.random() * 1.1
          const from = muzzle(n.gun, tmpV)
          const to = tmpV2.copy(n.target).add({ x: (Math.random() - 0.5) * 1.2, y: (Math.random() - 0.5) * 1.2, z: 0.2 })
          const fx = muzzleFx(n.gun, n.kind, from, n.group.position.y, 0.8)
          n.recoil = fx.recoil * 0.6
          shotFx(from, to, n.plot ? n.plot.def.top : '#ff4fa0')
          sfx.gun(n.kind, from, { vol: 0.8, low: true })
          sfx.hit(to, false, 0.6, true)
          if (n.plot) n.plot.hit()
          else range.knock(0)
        }
      }

      flashLevel = Math.max(0, flashLevel - dt * 12)
      flashLight.intensity = flashLevel * 25
      flashes.update(dt)
      tracers.update(dt)
      streaks.update(dt)
      shells.update(dt)
      train.recoil *= Math.exp(-dt * 9)
      seq.shake = Math.max(0, seq.shake - dt * 2.6)

      return { training: !!training, plot, inZone, canShoot: inZone && seq.phase === 'idle', cine: seq.phase !== 'idle', phase: seq.phase }
    },

    // After the chase camera: the shot's cinematic camera, blended in over the chase cam.
    applyCamera(camera, dt, player) {
      const ph = seq.phase
      if (ph === 'idle' || ph === 'back') {
        cam.w = 0
        return null
      }
      let fov = 70
      if (ph === 'aim') {
        // Behind the gun, just over the right shoulder, looking down the table; after the
        // trigger it follows the slow bullet out of the barrel and glides into the bullet cam.
        const a = seq.anchor
        aimPos.set(a.x + 0.14, a.y + 0.44, a.z + 0.78) // above and behind the hand: the gun sits low in frame, long barrels reach ahead
        aimLook.set(firstTarget.x, aimPos.y - 0.5, firstTarget.z) // a little below level: gun at the bottom, target above it
        fov = 62
        cam.w = smooth(Math.min(1, seq.t / 0.4))
        cam.pos.copy(aimPos)
        cam.look.copy(aimLook)
        if (seq.fired) {
          // Bullet time: swing in close beside the slow round (3/4 rear, left) so its shape is
          // seen leaving the barrel, then pull back into the bullet cam as it speeds up.
          const b = seq.pos
          const u = Math.min(1, seq.exitT / BULLET.exitTime)
          const g1 = smooth(Math.min(1, Math.max(0, (u - 0.06) / 0.38)))
          const g2 = smooth(Math.min(1, Math.max(0, (u - 0.58) / 0.42)))
          nearPos.set(b.x - 0.7, b.y + 0.24, b.z + 1.15)
          nearLook.set(b.x + 0.12, b.y - 0.04, b.z - 2.5)
          flyPos.set(b.x - 1.25, b.y + 0.95, b.z + 4.3)
          flyLook.set(b.x + 0.9, b.y - 0.35, b.z - 14)
          cam.pos.lerpVectors(aimPos, nearPos, g1).lerp(flyPos, g2)
          cam.look.lerpVectors(aimLook, nearLook, g1).lerp(flyLook, g2)
          fov = 62 + (50 - 62) * g1 + (76 - 50) * g2
        }
      } else {
        const b = seq.pos
        flyPos.set(b.x - 1.25, b.y + 0.95, b.z + 4.3)
        flyLook.set(b.x + 0.9, b.y - 0.35, b.z - 14)
        fov = 76
        if (ph === 'fly') {
          cam.pos.copy(flyPos)
          cam.look.copy(flyLook)
        } else {
          // Swing out to the side of the stuck bullet.
          const u = smooth(Math.min(1, seq.t / 0.7))
          const a = 1.0 + seq.t * 0.12
          const sx = b.x + Math.sin(a) * 4.6
          const sy = b.y + 1.15
          const sz = b.z + Math.cos(a) * 4.6
          cam.pos.set(flyPos.x + (sx - flyPos.x) * u, flyPos.y + (sy - flyPos.y) * u, flyPos.z + (sz - flyPos.z) * u)
          cam.look.set(flyLook.x + (b.x - flyLook.x) * u, flyLook.y + (b.y + 0.1 - flyLook.y) * u, flyLook.z + (b.z - 0.4 - flyLook.z) * u)
          fov = 76 + (58 - 76) * u
        }
        cam.w = 1
      }
      lookM.lookAt(cam.pos, cam.look, camera.up)
      cam.q.setFromRotationMatrix(lookM)
      const w = cam.w
      camera.position.lerp(cam.pos, w)
      camera.quaternion.slerp(cam.q, w)
      if (seq.shake > 0.001) {
        const k = seq.shake * seq.shake * 0.14
        camera.position.x += (Math.random() - 0.5) * k
        camera.position.y += (Math.random() - 0.5) * k
      }
      const f = camera.fov + (fov - camera.fov) * w
      if (Math.abs(camera.fov - f) > 0.01) {
        camera.fov = f
        camera.updateProjectionMatrix()
      }
      camera.updateMatrixWorld()
      return ph === 'aim' ? null : seq.pos // the shadow / sky focus while the cam rides the bullet
    },
  }
}
