// The lego lobby, built procedurally from studded bricks:
//  - north: the Shoot Zone pavilion (yellow roof on lavender pillars, yellow
//    shoot pad with "SHOOT ZONE" printed on it, red/white checker floor, lamp
//    posts, bollards, warning signs) and the smash range (range.js): a long
//    table of breakable objects across themed zones
//  - north-east: the row of rebirth training plots (Wooden -> Ruby), each with
//    a training dummy on a stepped pedestal, a pad to stand on and its own decor
//  - south: the premium plots (Amethyst, Frost, Obsidian) and a row of trees
//  - west: the two-tier Gun Shop with glowing pads, floating guns and prices
//  - all round: the two-tone green baseplate, lavender paths, the perimeter
//    wall, bushes, flowers, white rocks, trees and the "???" board
// Static bricks are baked into one mesh per material; the animated parts
// (dummies, guns, gate glows, beams, lamps) stay live.
import {
  AdditiveBlending,
  BoxGeometry,
  CanvasTexture,
  Color,
  CylinderGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  SRGBColorSpace,
} from 'three'
import {
  GUN_SHOP,
  GUNS,
  ISLAND,
  PALETTE as P,
  PATHS,
  PLOT,
  SHOOT_ZONE as SZ,
  SPAWN_PAD,
  STUD,
  TRAINERS,
} from './config.js'
import { brick, checkerMat, legoMat, span } from './lego.js'
import { bush, lighten, tickKit, tree, canvasTex } from './lobbykit.js'
import { buildPlot } from './plots.js'
import { buildGunShop } from './gunshop.js'
import { bake } from './bake.js'
import { neon, solidBox } from './propkit.js'
import { signPlane, SIGN_FONT, signFontReady } from './signs.js'
import { getTopScores } from './bloxity.js'
import { leaders, onLeaders } from './leaders.js'
import { buildRange } from './range.js'
import { mulberry32 } from './textures.js'

// Warning sign: yellow diamond with a black border and a black inner diamond.
const warnTex = canvasTex(128, 128, (ctx, w) => {
  ctx.translate(w / 2, w / 2)
  ctx.rotate(Math.PI / 4)
  ctx.fillStyle = '#111'
  ctx.fillRect(-44, -44, 88, 88)
  ctx.fillStyle = '#ffd21f'
  ctx.fillRect(-36, -36, 72, 72)
  ctx.fillStyle = '#111'
  ctx.fillRect(-12, -12, 24, 24)
})

function flowers(root, x, z, rand) {
  for (let i = 0; i < 3; i++) brick(root, i % 2 ? P.flower : lighten(P.flower, 0.15), 0.6, 0.35, 0.6, x + (rand() - 0.5) * 1.6, 0.18 + i * 0.05, z + (rand() - 0.5) * 1.6, { yaw: rand() * 3 })
}
function rocks(root, x, z, rand) {
  brick(root, P.rock, 1.8, 0.8, 1.4, x, 0.35, z, { yaw: rand() * 3 })
  brick(root, P.rockDark, 1.2, 0.7, 1.0, x + 1.1, 0.5, z + 0.4, { yaw: rand() * 3 })
}

// --- The plan ---------------------------------------------------------------------------------
export function buildLobby(scene, { addLamp, particles } = {}) {
  const root = new Group() // baked
  const live = new Group() // animated, not baked
  scene.add(live)
  const rand = mulberry32(1337)
  const updaters = []

  // ---- Ground: checker baseplate on a lavender slab, perimeter wall ---------------------
  const { minX, maxX, minZ, maxZ } = ISLAND
  const grass = checkerMat(P.grassA, P.grassB, 15)
  span(root, null, minX, -0.25, minZ, maxX, 0, maxZ, { mat: grass, cast: false })
  span(root, P.lavender, minX, -ISLAND.depth, minZ, maxX, -0.25, maxZ, { cast: false })
  solidBox((maxX - minX) / 2, 1, (maxZ - minZ) / 2, (minX + maxX) / 2, -1, (minZ + maxZ) / 2)
  const wt = ISLAND.wallThick
  const wh = ISLAND.wallHeight
  const fence = ISLAND.fenceHeight
  span(root, P.lavender, minX, 0, maxZ - wt, maxX, wh, maxZ, { solid: false })
  span(root, P.lavender, minX, 0, minZ, minX + wt, wh, maxZ)
  span(root, P.lavender, maxX - wt, 0, minZ, maxX, wh, maxZ)
  span(root, P.lavender, minX, 0, minZ, -SZ.halfWidth, wh, minZ + wt)
  span(root, P.lavender, SZ.halfWidth, 0, minZ, maxX, wh, minZ + wt)
  // Invisible fences on top of the walls so nobody walks into the sea.
  solidBox((maxX - minX) / 2, fence / 2, wt / 2, (minX + maxX) / 2, fence / 2, maxZ - wt / 2)
  solidBox(wt / 2, fence / 2, (maxZ - minZ) / 2, minX + wt / 2, fence / 2, (minZ + maxZ) / 2)
  solidBox(wt / 2, fence / 2, (maxZ - minZ) / 2, maxX - wt / 2, fence / 2, (minZ + maxZ) / 2)
  solidBox((-SZ.halfWidth - minX) / 2, fence / 2, wt / 2, (minX - SZ.halfWidth) / 2, fence / 2, minZ + wt / 2)
  solidBox((maxX - SZ.halfWidth) / 2, fence / 2, wt / 2, (maxX + SZ.halfWidth) / 2, fence / 2, minZ + wt / 2)

  // ---- Paths and the yellow plate ---------------------------------------------------------
  PATHS.forEach(([x0, z0, x1, z1], i) => span(root, P.lavender, x0, 0, z0, x1, 0.1 + i * 0.006, z1, { cast: false }))
  span(root, P.yellow, SPAWN_PAD.x - SPAWN_PAD.w / 2, 0, SPAWN_PAD.z - SPAWN_PAD.d / 2, SPAWN_PAD.x + SPAWN_PAD.w / 2, 0.16, SPAWN_PAD.z + SPAWN_PAD.d / 2, { cast: false })

  // ---- Shoot Zone pavilion ----------------------------------------------------------------
  const W = SZ.halfWidth
  const fy = SZ.floorY
  span(root, P.pinkRed, -W, -2.2, SZ.backZ, W, fy - 0.2, SZ.frontZ, { cast: false })
  span(root, P.yellow, -W, fy - 0.2, SZ.padBackZ, W, fy, SZ.frontZ, { cast: false })
  span(root, null, -W, fy - 0.2, SZ.backZ, W, fy, SZ.padBackZ, { mat: checkerMat(P.white, P.red, 3), cast: false })
  solidBox(W, (fy + 2.2) / 2, (SZ.frontZ - SZ.backZ) / 2, 0, (fy - 2.2) / 2, (SZ.frontZ + SZ.backZ) / 2)
  // Invisible wall at the yellow band's north edge: nobody walks past it onto the checker floor / range
  // (SHOOT's fireAt z sits just inside it).
  solidBox(W, 4, 0.4, 0, fy + 4, SZ.padBackZ - 1.6 - 0.4)
  const sign = signPlane([{ text: 'SHOOT', size: 120, color: '#ffffff', outline: '#16121c' }, { text: 'ZONE', size: 120, color: '#ffffff', outline: '#16121c' }], 11)
  sign.rotation.x = -Math.PI / 2
  sign.position.set(0, fy + 0.02, (SZ.frontZ + SZ.padBackZ) / 2)
  live.add(sign)
  // Side rims along the checker floor (pink-red, waist high) keep players on the platform.
  for (const s of [-1, 1]) {
    span(root, P.pinkRed, s * W, fy - 0.2, SZ.backZ, s * (W - 0.9), fy + 0.9, SZ.padBackZ - 0.5, { solid: true })
  }
  // Roof on four lavender brick pillars.
  span(root, P.yellow, -W - 0.6, SZ.roofY - 1.5, SZ.frontZ - 29.5, W + 0.6, SZ.roofY, SZ.frontZ + 1.2)
  for (const sx of [-1, 1]) {
    for (const z of [SZ.frontZ - 0.6, SZ.frontZ - 26.5]) {
      span(root, P.lavender, sx * (W - 1.4) - 1.2, fy, z - 1.2, sx * (W - 1.4) + 1.2, SZ.roofY - 1.5, z + 1.2, { solid: true })
    }
  }
  // Frames across the lane: red then green, like the reference.
  const frame = (z, color, hw = 7, h = 8.5) => {
    span(root, color, -hw - 0.75, fy, z - 0.75, -hw + 0.75, fy + h, z + 0.75, { solid: true })
    span(root, color, hw - 0.75, fy, z - 0.75, hw + 0.75, fy + h, z + 0.75, { solid: true })
    span(root, color, -hw - 0.75, fy + h, z - 0.75, hw + 0.75, fy + h + 1.5, z + 0.75)
    span(root, lighten(color, 0.35), -hw + 0.75, fy + h, z + 0.75, hw - 0.75, fy + h + 0.4, z + 0.85, { cast: false })
  }
  frame(-31, P.red)
  frame(-42.5, '#3fd65a')
  // Lamp posts (white, lit at night), bollards, warning signs, speakers, the long table.
  const lampMat = new MeshStandardMaterial({ color: '#ffffff', emissive: '#fff1c4', emissiveIntensity: 0.35, roughness: 0.4 })
  for (const sx of [-1, 1]) {
    for (const z of [-24, -31.5, -39, -45]) {
      const x = sx * (W - 3)
      span(root, P.white, x - 0.18, fy, z - 0.18, x + 0.18, fy + 5, z + 0.18)
      const head = new Mesh(new BoxGeometry(0.9, 0.55, 1.6), lampMat)
      head.position.set(x - sx * 0.3, fy + 5.2, z)
      head.castShadow = true
      root.add(head)
      if (addLamp && z === -31.5) addLamp(x - sx * 0.3, fy + 4.6, z, lampMat)
    }
    const bx = sx * 12
    const bollard = new Mesh(new CylinderGeometry(0.55, 0.6, 1.5, 16), new MeshStandardMaterial({ color: P.white, roughness: 0.5 }))
    bollard.position.set(bx, fy + 0.75, -22.6)
    bollard.castShadow = bollard.receiveShadow = true
    root.add(bollard)
    const cap = new Mesh(new CylinderGeometry(0.58, 0.58, 0.25, 16), new MeshStandardMaterial({ color: P.red, roughness: 0.5 }))
    cap.position.set(bx, fy + 1.5, -22.6)
    root.add(cap)
    span(root, '#2a2a30', sx * 8.8 - 0.1, fy, -27.1, sx * 8.8 + 0.1, fy + 2.4, -26.9)
    const warn = new Mesh(new PlaneGeometry(1.4, 1.4), new MeshBasicMaterial({ map: warnTex, transparent: true, side: DoubleSide }))
    warn.position.set(sx * 8.8, fy + 2.9, -26.85)
    live.add(warn)
    span(root, '#1d1d22', sx * 8 - 0.5, fy, -24.5, sx * 8 + 0.5, fy + 1.6, -23.7)
  }
  span(root, P.wood, 10.4, fy, -44.5, 12.6, fy + 1.1, -23.5, { solid: true })
  span(root, P.woodDark, 10.6, fy, -44, 12.4, fy + 0.9, -24, { cast: false })
  // ---- The smash range: the table, the zones and their objects (range.js) -----------------
  const range = buildRange(scene, root, live, particles)

  // ---- Training plots ------------------------------------------------------------------------
  const plots = TRAINERS.map((def) => buildPlot(root, live, def, rand, particles))

  // ---- Gun Shop ------------------------------------------------------------------------------
  const shopPads = buildGunShop(root, live)

  // ---- Trees, bushes, flowers, rocks, the ??? board ------------------------------------------------
  for (let x = minX + 8; x < maxX - 4; x += 11) tree(root, x, maxZ - 4.2, 1)
  for (const [x, z] of [[-53, -18], [-53, -2], [-53, 14], [-53, 28], [-30, 30], [-44, 32], [21.6, -21], [85, 12], [85, 26], [-46, -6], [-45, 8], [-40, 44], [-52, 48], [26, 54], [70, 52], [78, 48]]) tree(root, x, z, 0.9 + rand() * 0.25)
  const bushes = [[-12, -6], [14, 10], [-14, 16], [20, 12], [36, 10], [56, 14], [70, 10], [70, 16], [66, 26], [-10, 26], [14, 30], [-24, 43], [24, 42.5], [60, 24], [72, 30], [44, 26], [-40, 38], [-42, -12], [-41, 18], [6, -8]]
  bushes.forEach(([x, z], i) => bush(root, x, z, 0.8 + (i % 3) * 0.15, rand() * 3))
  for (const [x, z] of [[-6, 10], [8, 8], [7, 26], [-14, 30], [18, 26], [34, 18], [52, 10], [68, 22], [72, 20], [66, 30], [30, 32], [-6, -8], [16, -6]]) flowers(root, x, z, rand)
  for (const [x, z] of [[-16, 8], [15, 4.5], [10, 31], [-36, 28], [50, 20], [72, 24], [84.5, 6], [-12, -10], [24, 22]]) rocks(root, x, z, rand)
  const board2 = buildChalkboard(root, live, -27, 46)

  // ---- Bake the static bricks --------------------------------------------------------------------
  const baked = bake(root, true)
  baked.traverse((o) => {
    if (o.isMesh) o.receiveShadow = true
  })
  scene.add(baked)

  return {
    plots,
    shopPads,
    range,
    update(dt, t, playerPos, eye) {
      tickKit(dt, t)
      range.update(dt, t, eye)
      for (const p of plots) p.update(dt, t, playerPos)
      for (const s of shopPads) s.update(dt, t)
      board2.update(t, dt)
      for (const fn of updaters) fn(dt, t)
    },
  }
}

// The three leaderboards (Wins / Rebirths / Damage): a board twice the size of the old ??? one,
// repainted from Bloxity's getTop every REFRESH_S seconds. Without the SDK the rows stay empty.
const BOARD_COLS = [
  { id: 'wins', title: 'WINS', color: '#ffd54a' },
  { id: 'rebirths', title: 'REBIRTHS', color: '#ff7ad9' },
  { id: 'damage', title: 'DAMAGE', color: '#ff6a5a' },
]
const BOARD_ROWS = 5
const BOARD_REFRESH_S = 30
function compact(n) {
  n = Number(n) || 0
  const u = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc']
  let i = 0
  while (Math.abs(n) >= 1000 && i < u.length - 1) {
    n /= 1000
    i++
  }
  return (i ? (n >= 100 ? n.toFixed(0) : n.toFixed(n >= 10 ? 1 : 2).replace(/\.?0+$/, '')) : String(Math.floor(n))) + u[i]
}
function paintBoards(canvas, data) {
  const ctx = canvas.getContext('2d')
  const W = canvas.width
  const H = canvas.height
  ctx.fillStyle = '#232a28'
  ctx.fillRect(0, 0, W, H)
  const colW = W / BOARD_COLS.length
  ctx.textBaseline = 'middle'
  ctx.lineJoin = 'round'
  BOARD_COLS.forEach((col, c) => {
    const x0 = c * colW
    if (c) {
      ctx.fillStyle = 'rgba(255,255,255,0.18)'
      ctx.fillRect(x0 - 2, 30, 4, H - 60)
    }
    ctx.textAlign = 'center'
    ctx.font = `400 84px ${SIGN_FONT}`
    ctx.lineWidth = 14
    ctx.strokeStyle = '#14101c'
    ctx.strokeText(col.title, x0 + colW / 2, 80)
    ctx.fillStyle = col.color
    ctx.fillText(col.title, x0 + colW / 2, 80)
    const rows = leaders[col.id].rows.length ? leaders[col.id].rows : data[col.id]
    for (let r = 0; r < BOARD_ROWS; r++) {
      const y = 190 + r * 105
      const row = rows?.[r]
      ctx.fillStyle = r % 2 ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.09)'
      ctx.beginPath()
      ctx.roundRect(x0 + 24, y - 42, colW - 48, 84, 18)
      ctx.fill()
      ctx.font = `400 52px ${SIGN_FONT}`
      ctx.textAlign = 'left'
      ctx.fillStyle = r === 0 ? '#ffd54a' : r === 1 ? '#d8dde6' : r === 2 ? '#e0975a' : '#9aa3a0'
      ctx.fillText(`${r + 1}`, x0 + 46, y + 2)
      if (!row) continue
      let name = String(row.name || row.displayName || row.username || 'Player')
      ctx.font = `400 46px ${SIGN_FONT}`
      ctx.fillStyle = '#ffffff'
      while (name.length > 3 && ctx.measureText(name).width > colW * 0.4) name = name.slice(0, -2) + '…'
      ctx.fillText(name, x0 + 100, y + 2)
      ctx.textAlign = 'right'
      ctx.fillStyle = col.color
      ctx.fillText(compact(row.value ?? row.score), x0 + colW - 46, y + 2)
    }
    const rank = leaders[col.id].rank
    if (rank) {
      ctx.textAlign = 'center'
      ctx.font = `400 44px ${SIGN_FONT}`
      ctx.fillStyle = '#ffffff'
      ctx.fillText(`YOU: #${rank}`, x0 + colW / 2, 190 + BOARD_ROWS * 105 + 60)
    }
    if (!rows?.length) {
      ctx.textAlign = 'center'
      ctx.font = `400 40px ${SIGN_FONT}`
      ctx.fillStyle = '#9aa3a0'
      ctx.fillText(rows ? 'NO SCORES YET' : 'OFFLINE', x0 + colW / 2, 190 + BOARD_ROWS * 105 + 10)
    }
  })
}

function buildChalkboard(root, live, x, z) {
  // Twice the old board: frame 11.2 x 7.2 m on 4.4 m posts.
  span(root, P.woodDark, x - 5.2, 0, z - 0.5, x - 4.2, 4.4, z + 0.5)
  span(root, P.woodDark, x + 4.2, 0, z - 0.5, x + 5.2, 4.4, z + 0.5)
  span(root, P.wood, x - 5.6, 3.2, z - 0.6, x + 5.6, 10.4, z + 0.6)
  span(root, '#232a28', x - 4.8, 3.9, z - 0.72, x + 4.8, 9.7, z + 0.72, { cast: false })
  const canvas = document.createElement('canvas')
  canvas.width = 1920
  canvas.height = 1152
  const tex = new CanvasTexture(canvas)
  tex.colorSpace = SRGBColorSpace
  tex.anisotropy = 8
  const data = {}
  const draw = () => {
    paintBoards(canvas, data)
    tex.needsUpdate = true
  }
  draw()
  signFontReady.then(draw)
  onLeaders(draw)
  const face = new Mesh(new PlaneGeometry(9.6, 5.76), new MeshBasicMaterial({ map: tex, side: DoubleSide, fog: false }))
  face.position.set(x, 6.8, z - 0.78)
  face.rotation.y = Math.PI
  live.add(face)
  const title = signPlane([{ text: 'LEADERBOARDS', size: 110, color: '#ffffff', outline: '#232a28' }], 7)
  title.position.set(x, 11.4, z - 0.4)
  title.rotation.y = Math.PI
  live.add(title)
  let age = BOARD_REFRESH_S
  let busy = false
  async function refresh() {
    busy = true
    const lists = await Promise.all(BOARD_COLS.map((c) => getTopScores(c.id, BOARD_ROWS)))
    BOARD_COLS.forEach((c, i) => (data[c.id] = lists[i]))
    busy = false
    draw()
  }
  return {
    update(t, dt = 0.016) {
      age += dt
      if (age >= BOARD_REFRESH_S && !busy) {
        age = 0
        refresh()
      }
    },
  }
}

export { STUD }
