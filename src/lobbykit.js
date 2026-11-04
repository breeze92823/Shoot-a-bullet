// Shared bits for the lobby builders (lobby.js, plots.js, gunshop.js): colour
// helpers, canvas painters (light-beam fade, plot pad brackets), flat decals,
// animated water, flames, and the lego props that appear everywhere (trees,
// bushes, pines, crystals, crates, lanterns, coins...). Props are added to a
// group in its own local space; anything animated goes on a separate live list.
import {
  AdditiveBlending,
  BoxGeometry,
  CanvasTexture,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  SRGBColorSpace,
  Vector2,
} from 'three'
import { PALETTE as P } from './config.js'
import { brick, legoMat, span } from './lego.js'
import { neon } from './propkit.js'
import { paintWaterNormal, toTexture } from './textures.js'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

const H = (c) => new Color(c)
export const lighten = (c, k) => '#' + H(c).lerp(H('#ffffff'), k).getHexString()
export const darken = (c, k) => '#' + H(c).multiplyScalar(1 - k).getHexString()
export function fmtShort(n) {
  if (n >= 1e6) return `${+(n / 1e6).toFixed(1)}M`
  if (n >= 1e3) return `${+(n / 1e3).toFixed(1)}K`
  return String(n)
}

// --- Painters ------------------------------------------------------------------------
export function canvasTex(w, h, paint) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  paint(c.getContext('2d'), w, h)
  const t = new CanvasTexture(c)
  t.colorSpace = SRGBColorSpace
  return t
}
// Vertical fade (opaque at the bottom) for light beams and gate glows.
export const fadeTex = canvasTex(8, 128, (ctx, w, h) => {
  const g = ctx.createLinearGradient(0, h, 0, 0)
  g.addColorStop(0, 'rgba(255,255,255,0.95)')
  g.addColorStop(0.45, 'rgba(255,255,255,0.35)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, w, h)
})
// The plot pad: four white corner brackets and a chevron, like the reference.
export const padTex = canvasTex(256, 256, (ctx, w) => {
  ctx.strokeStyle = 'rgba(255,255,255,0.95)'
  ctx.lineWidth = 15
  ctx.lineCap = 'square'
  const a = 24
  const L = 56
  for (const [x, y, dx, dy] of [[a, a, 1, 1], [w - a, a, -1, 1], [a, w - a, 1, -1], [w - a, w - a, -1, -1]]) {
    ctx.beginPath()
    ctx.moveTo(x, y + dy * L)
    ctx.lineTo(x, y)
    ctx.lineTo(x + dx * L, y)
    ctx.stroke()
  }
  ctx.beginPath()
  ctx.moveTo(w * 0.36, w * 0.57)
  ctx.lineTo(w * 0.5, w * 0.43)
  ctx.lineTo(w * 0.64, w * 0.57)
  ctx.stroke()
})
// Soft round glow (for floor glows under floating guns).
export const glowTex = canvasTex(128, 128, (ctx, w) => {
  const g = ctx.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2)
  g.addColorStop(0, 'rgba(255,255,255,1)')
  g.addColorStop(0.4, 'rgba(255,255,255,0.45)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, w, w)
})

export function flat(tex, w, d, extra = {}) {
  const m = new Mesh(new PlaneGeometry(w, d), new MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, ...extra }))
  m.rotation.x = -Math.PI / 2
  return m
}

// --- Animated water: one ripple normal map shared by every pool, scrolled per frame -------
const ripples = paintWaterNormal()
const rippleTex = toTexture(ripples, { repeat: 0.35 })
const waterMats = new Map()
export function waterMat(color = '#3fb6ff') {
  let m = waterMats.get(color)
  if (!m) {
    m = new MeshStandardMaterial({ color, roughness: 0.12, metalness: 0.1, transparent: true, opacity: 0.85, normalMap: rippleTex, normalScale: new Vector2(0.6, 0.6), emissive: color, emissiveIntensity: 0.18 })
    waterMats.set(color, m)
  }
  return m
}
// A flat pool surface from (x0, z0) to (x1, z1) at height y (UVs in metres).
export function pool(g, x0, z0, x1, z1, y, color) {
  const geo = new PlaneGeometry(Math.abs(x1 - x0), Math.abs(z1 - z0))
  const uv = geo.attributes.uv
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * Math.abs(x1 - x0), uv.getY(i) * Math.abs(z1 - z0))
  const m = new Mesh(geo, waterMat(color))
  m.rotation.x = -Math.PI / 2
  m.position.set((x0 + x1) / 2, y, (z0 + z1) / 2)
  m.receiveShadow = true
  g.add(m)
  return m
}
export function tickKit(dt, t) {
  rippleTex.offset.set(t * 0.03, t * 0.045)
}

// --- Flames (unlit, additive, flicker in update) --------------------------------------------
const flameOuter = () => neon('#ff7a1f', 3.2, { transparent: true, opacity: 0.9, blending: AdditiveBlending, depthWrite: false })
const flameInner = () => neon('#ffe27a', 3.6, { transparent: true, opacity: 0.95, blending: AdditiveBlending, depthWrite: false })
let flameMats = null
export function flame(g, x, y, z, s = 1) {
  flameMats ||= { outer: flameOuter(), inner: flameInner() }
  const f = new Group()
  f.position.set(x, y, z)
  const a = new Mesh(new ConeGeometry(0.32 * s, 0.9 * s, 8), flameMats.outer)
  a.position.y = 0.45 * s
  const b = new Mesh(new ConeGeometry(0.17 * s, 0.55 * s, 8), flameMats.inner)
  b.position.y = 0.3 * s
  f.add(a, b)
  g.add(f)
  f.userData.phase = Math.random() * 10
  return f
}
export function flickerFlame(f, t) {
  const k = 1 + Math.sin(t * 17 + f.userData.phase) * 0.12 + Math.sin(t * 29 + f.userData.phase * 2) * 0.08
  f.scale.set(1 / Math.sqrt(k), k, 1 / Math.sqrt(k))
  f.rotation.y = t * 2 + f.userData.phase
}

// --- Lego props ---------------------------------------------------------------------------------
// Lego tree: trunk + three stacked canopy blocks. `solid` only in world space.
export function tree(root, x, z, s = 1, y = 0, leaf = P.leaf, solid = true) {
  span(root, P.trunk, x - 0.6 * s, y, z - 0.6 * s, x + 0.6 * s, y + 3.6 * s, z + 0.6 * s, { solid })
  brick(root, darken(P.trunk, 0.15), 0.4 * s, 1.4 * s, 0.4 * s, x + 0.7 * s, y + 2.6 * s, z, { yaw: 0 }).rotation.z = -0.7
  brick(root, leaf, 5.2 * s, 2.4 * s, 5.2 * s, x, y + 4.4 * s, z)
  brick(root, lighten(leaf, 0.12), 3.6 * s, 1.5 * s, 3.6 * s, x + 0.3 * s, y + 6.2 * s, z - 0.2 * s)
  brick(root, darken(leaf, 0.06), 2.4 * s, 1.6 * s, 2.4 * s, x - 1.8 * s, y + 3.6 * s, z + 1.4 * s)
  brick(root, lighten(leaf, 0.06), 2.0 * s, 1.2 * s, 2.0 * s, x + 1.9 * s, y + 4.9 * s, z - 1.5 * s)
}
export function bush(root, x, z, s = 1, rot = 0) {
  brick(root, P.bush, 2.4 * s, 1.5 * s, 2.4 * s, x, 0.75 * s, z, { yaw: rot })
  brick(root, P.bushDark, 1.8 * s, 1.2 * s, 1.8 * s, x + 1.4 * s, 0.6 * s, z + 0.8 * s, { yaw: rot + 0.3 })
}
export function pine(root, x, z, y = 0, s = 1) {
  span(root, '#7a4a2a', x - 0.3 * s, y, z - 0.3 * s, x + 0.3 * s, y + 1 * s, z + 0.3 * s)
  ;[[3, 1.1], [2.3, 1], [1.5, 0.9], [0.8, 0.7]].forEach(([w, h], i) => {
    const yy = y + (1 + i * 0.95 + h / 2) * s
    brick(root, '#1f7a4e', w * s, h * s, w * s, x, yy, z)
    brick(root, '#f4fbff', w * s * 0.94, 0.2 * s, w * s * 0.94, x, yy + h * s * 0.5, z)
    // Snow drips on two corners.
    brick(root, '#f4fbff', 0.3 * s, 0.35 * s, 0.3 * s, x + w * s * 0.42, yy + h * s * 0.25, z + w * s * 0.42)
  })
}
const crystalMats = new Map()
export function crystalMat(color) {
  let m = crystalMats.get(color)
  if (!m) crystalMats.set(color, (m = new MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.45, roughness: 0.2, metalness: 0.1, transparent: true, opacity: 0.9 })))
  return m
}
// A tilted prism crystal with a pointed tip.
export function crystal(root, x, y, z, color, h, rand, w = 0.5) {
  const g = new Group()
  g.position.set(x, y, z)
  g.rotation.set((rand() - 0.5) * 0.6, rand() * 3, (rand() - 0.5) * 0.6)
  const body = new Mesh(new CylinderGeometry(w * 0.5, w * 0.55, h, 6), crystalMat(color))
  body.position.y = h / 2
  const tip = new Mesh(new ConeGeometry(w * 0.5, w * 0.9, 6), crystalMat(lighten(color, 0.25)))
  tip.position.y = h + w * 0.45
  g.add(body, tip)
  root.add(g)
  return g
}
// A cluster: one tall crystal and a few small ones leaning out.
export function crystalCluster(root, x, y, z, colors, s, rand) {
  crystal(root, x, y, z, colors[0], 1.3 * s, rand, 0.55 * s)
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + rand()
    crystal(root, x + Math.cos(a) * 0.35 * s, y, z + Math.sin(a) * 0.35 * s, colors[(i + 1) % colors.length], (0.5 + rand() * 0.4) * s, rand, 0.35 * s)
  }
}
export function crate(root, x, y, z, s = 1, yaw = 0, color = '#e0973a') {
  brick(root, color, 0.95 * s, 0.95 * s, 0.95 * s, x, y + 0.475 * s, z, { yaw })
  brick(root, darken(color, 0.3), 1.0 * s, 0.14 * s, 1.0 * s, x, y + 0.2 * s, z, { yaw })
  brick(root, darken(color, 0.3), 1.0 * s, 0.14 * s, 1.0 * s, x, y + 0.75 * s, z, { yaw })
}
export function barrel(root, x, y, z, color = '#8a5229') {
  const m = new MeshStandardMaterial({ color, roughness: 0.7 })
  const body = new Mesh(new CylinderGeometry(0.42, 0.42, 1.1, 12), m)
  body.position.set(x, y + 0.55, z)
  const band = new MeshStandardMaterial({ color: '#3a3a40', roughness: 0.5, metalness: 0.5 })
  for (const by of [0.22, 0.88]) {
    const b = new Mesh(new CylinderGeometry(0.44, 0.44, 0.1, 12), band)
    b.position.set(x, y + by, z)
    root.add(b)
  }
  root.add(body)
}
export function coins(root, x, y, z, n, rand) {
  const m = new MeshStandardMaterial({ color: '#ffd21f', metalness: 0.7, roughness: 0.3, emissive: '#b88a00', emissiveIntensity: 0.25 })
  const geo = new CylinderGeometry(0.32, 0.32, 0.09, 14)
  for (let i = 0; i < n; i++) {
    const c = new Mesh(geo, m)
    c.position.set(x + (rand() - 0.5) * 0.12, y + 0.045 + i * 0.09, z + (rand() - 0.5) * 0.12)
    root.add(c)
  }
}
// A lantern: dark post, a cage of four bars round a glowing core, a cap. Returns the core.
export function lantern(root, live, x, y, z, glowColor = '#ffcf3a', h = 2.2, post = '#26262c') {
  span(root, post, x - 0.17, y, z - 0.17, x + 0.17, y + h, z + 0.17)
  span(root, post, x - 0.32, y + h, z - 0.32, x + 0.32, y + h + 0.1, z + 0.32)
  for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) span(root, post, x + dx * 0.25 - 0.04, y + h + 0.1, z + dz * 0.25 - 0.04, x + dx * 0.25 + 0.04, y + h + 0.6, z + dz * 0.25 + 0.04)
  span(root, post, x - 0.34, y + h + 0.6, z - 0.34, x + 0.34, y + h + 0.72, z + 0.34)
  const core = new Mesh(new CylinderGeometry(0.17, 0.17, 0.42, 8), neon(glowColor, 2.8))
  core.position.set(x, y + h + 0.35, z)
  live.add(core)
  return core
}
// Seaweed: a few stacked stalk segments in a group that sways.
export function seaweed(live, x, y, z, rand) {
  const g = new Group()
  g.position.set(x, y, z)
  const mat = legoMat('#36c97a')
  for (let k = 0; k < 4; k++) {
    const seg = brick(g, null, 0.22, 0.55, 0.22, (rand() - 0.5) * 0.1, 0.28 + k * 0.55, 0, { mat, cast: false })
    seg.rotation.z = (rand() - 0.5) * 0.3
  }
  live.add(g)
  g.userData.phase = rand() * 6
  return g
}
// Branching coral.
export function coral(root, x, y, z, color, rand) {
  brick(root, color, 0.32, 1.1, 0.32, x, y + 0.55, z)
  for (let i = 0; i < 3; i++) {
    const b = brick(root, lighten(color, 0.15), 0.24, 0.7, 0.24, x + (i - 1) * 0.3, y + 1.0 + rand() * 0.2, z + (rand() - 0.5) * 0.2)
    b.rotation.z = (i - 1) * 0.6
    brick(root, lighten(color, 0.3), 0.3, 0.3, 0.3, x + (i - 1) * 0.55, y + 1.38 + rand() * 0.2, z)
  }
}
export function mushroom(root, x, y, z, s = 1) {
  brick(root, '#f4f0e8', 0.3 * s, 0.5 * s, 0.3 * s, x, y + 0.25 * s, z)
  brick(root, '#ff3b3b', 0.9 * s, 0.35 * s, 0.9 * s, x, y + 0.62 * s, z)
  brick(root, '#ffffff', 0.18 * s, 0.06 * s, 0.18 * s, x + 0.2 * s, y + 0.81 * s, z - 0.15 * s)
  brick(root, '#ffffff', 0.14 * s, 0.06 * s, 0.14 * s, x - 0.22 * s, y + 0.81 * s, z + 0.18 * s)
}
// Gem: an octahedron-like double pyramid.
export function gem(root, x, y, z, color, s = 0.35) {
  const m = crystalMat(color)
  const top = new Mesh(new ConeGeometry(s, s * 1.1, 6), m)
  top.position.set(x, y + s * 1.25, z)
  const bot = new Mesh(new ConeGeometry(s, s * 1.4, 6), m)
  bot.rotation.x = Math.PI
  bot.position.set(x, y + s * 0.7, z)
  root.add(top, bot)
}

// Material for glowing edges that fade in/out (plot pad frames, shop pad frames).
export function edgeMat(color) {
  return new MeshBasicMaterial({ color: new Color(color).multiplyScalar(2.2), transparent: true, opacity: 0.8, blending: AdditiveBlending, depthWrite: false, side: DoubleSide })
}

// A square neon outline (four bars merged into one mesh), size m across, centred on the origin.
export function edgeFrame(size, bar, height, mat) {
  const h = size / 2 - bar / 2
  const parts = [
    new BoxGeometry(size + bar, height, bar).translate(0, 0, -h),
    new BoxGeometry(size + bar, height, bar).translate(0, 0, h),
    new BoxGeometry(bar, height, size - bar).translate(-h, 0, 0),
    new BoxGeometry(bar, height, size - bar).translate(h, 0, 0),
  ]
  return new Mesh(mergeGeometries(parts), mat)
}
