// Lego look: every surface in the lobby is a studded plate. Studs are painted
// into small per-colour canvases (4 x 4 studs each) and tiled in world units, so
// a brick of any size shows studs at the same STUD pitch on all its faces, the
// way the reference's Roblox "studs" surface does.
//
//  - legoMat(color)      cached MeshStandardMaterial with the stud texture
//  - legoGeo(w, h, d)    cached BoxGeometry whose UVs are in stud tiles
//  - brick(...)          adds one studded box (optionally solid for the player)
//  - checkerMat(a, b, n) a two-colour checker of studs (the baseplate, the
//                        red/white Shoot Zone floor)
import { BoxGeometry, CanvasTexture, Color, Mesh, MeshStandardMaterial, RepeatWrapping, SRGBColorSpace } from 'three'
import { STUD } from './config.js'
import { solidBox } from './propkit.js'

const PER_TILE = 4 // studs per texture tile edge
const PX = 64 // canvas pixels per stud

const tmp = new Color()
function shade(hex, k, a = 1) {
  tmp.set(hex)
  const r = Math.min(255, Math.round(tmp.r * 255 * k))
  const g = Math.min(255, Math.round(tmp.g * 255 * k))
  const b = Math.min(255, Math.round(tmp.b * 255 * k))
  return a === 1 ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},${a})`
}

// One stud in an s x s cell at (x, y), drawn the way the reference's studs read
// from a distance: a rounded square whose top-left edge catches the light and
// whose bottom-right edge is in shade (the little L / corner marks), on a
// barely-visible plate seam.
function paintStud(ctx, x, y, s, base) {
  ctx.fillStyle = base
  ctx.fillRect(x, y, s, s)
  ctx.strokeStyle = shade(base, 0.97)
  ctx.lineWidth = Math.max(1, s * 0.02)
  ctx.strokeRect(x + 0.5, y + 0.5, s - 1, s - 1)
  const m = s * 0.2
  const w = s - m * 2
  const r = s * 0.12
  const lw = Math.max(1.5, s * 0.07)
  const x0 = x + m
  const y0 = y + m
  ctx.lineCap = 'round'
  ctx.lineWidth = lw
  ctx.strokeStyle = shade(base, 1.16)
  ctx.beginPath()
  ctx.moveTo(x0, y0 + w - r)
  ctx.lineTo(x0, y0 + r)
  ctx.quadraticCurveTo(x0, y0, x0 + r, y0)
  ctx.lineTo(x0 + w - r, y0)
  ctx.stroke()
  ctx.strokeStyle = shade(base, 0.9)
  ctx.beginPath()
  ctx.moveTo(x0 + w, y0 + r)
  ctx.lineTo(x0 + w, y0 + w - r)
  ctx.quadraticCurveTo(x0 + w, y0 + w, x0 + w - r, y0 + w)
  ctx.lineTo(x0 + r, y0 + w)
  ctx.stroke()
}

function studCanvas(colors, perTile, px, checkStuds) {
  const c = document.createElement('canvas')
  c.width = c.height = perTile * px
  const ctx = c.getContext('2d')
  for (let j = 0; j < perTile; j++) {
    for (let i = 0; i < perTile; i++) {
      const pick = checkStuds ? (Math.floor(i / checkStuds) + Math.floor(j / checkStuds)) % 2 : 0
      paintStud(ctx, i * px, j * px, px, colors[pick])
    }
  }
  return c
}

function texture(c) {
  const t = new CanvasTexture(c)
  t.wrapS = t.wrapT = RepeatWrapping
  t.colorSpace = SRGBColorSpace
  t.anisotropy = 8
  return t
}

const mats = new Map()
// `extra`: material options (emissive, transparent...). Cached by colour + options.
export function legoMat(color, extra = null) {
  const key = color + (extra ? JSON.stringify(extra) : '')
  let m = mats.get(key)
  if (!m) {
    const texKey = `tex:${color}`
    let tex = mats.get(texKey)
    if (!tex) mats.set(texKey, (tex = texture(studCanvas([color], PER_TILE, PX, 0))))
    m = new MeshStandardMaterial({ map: tex, roughness: 0.78, metalness: 0, ...extra })
    mats.set(key, m)
  }
  return m
}

// A checker of `squareStuds` x `squareStuds` stud squares in two colours. Its UVs
// must be in units of (2 * squareStuds) studs: use checkerRepeat().
export function checkerMat(a, b, squareStuds) {
  const key = `check:${a}:${b}:${squareStuds}`
  let m = mats.get(key)
  if (!m) {
    const per = squareStuds * 2
    const px = Math.max(16, Math.min(PX, Math.floor(1024 / per)))
    m = new MeshStandardMaterial({ map: texture(studCanvas([a, b], per, px, squareStuds)), roughness: 0.82, metalness: 0 })
    m.userData.tileMetres = per * STUD
    mats.set(key, m)
  }
  return m
}

// Rescales a geometry's 0..1 face UVs so one texture tile spans `tile` metres.
// BoxGeometry faces come in the order +x, -x, +y, -y, +z, -z (4 vertices each).
function boxUVs(geo, w, h, d, tile) {
  const uv = geo.attributes.uv
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]]
  for (let f = 0; f < 6; f++) {
    const [du, dv] = dims[f]
    for (let v = 0; v < 4; v++) {
      const i = f * 4 + v
      uv.setXY(i, (uv.getX(i) * du) / tile, (uv.getY(i) * dv) / tile)
    }
  }
  uv.needsUpdate = true
  return geo
}

const geos = new Map()
export function legoGeo(w, h, d, tile = STUD * PER_TILE) {
  const key = `${w.toFixed(3)}|${h.toFixed(3)}|${d.toFixed(3)}|${tile}`
  let g = geos.get(key)
  if (!g) geos.set(key, (g = boxUVs(new BoxGeometry(w, h, d), w, h, d, tile)))
  return g
}

// One studded box centred at (x, y, z). `solid` adds a fixed collider; `yaw` turns it.
export function brick(parent, color, w, h, d, x, y, z, { solid = false, yaw = 0, cast = true, receive = true, mat = null } = {}) {
  const material = mat ?? legoMat(color)
  const tile = material.userData.tileMetres ?? STUD * PER_TILE
  const m = new Mesh(legoGeo(w, h, d, tile), material)
  m.position.set(x, y, z)
  m.rotation.y = yaw
  m.castShadow = cast
  m.receiveShadow = receive
  parent.add(m)
  if (solid) solidBox(w / 2, h / 2, d / 2, x, y, z, yaw)
  return m
}

// A box spanning [x0, x1] x [y0, y1] x [z0, z1] (handier for floors and walls).
export function span(parent, color, x0, y0, z0, x1, y1, z1, opts) {
  return brick(parent, color, Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0), (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, opts)
}
