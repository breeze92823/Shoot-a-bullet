// One training plot, detailed after the reference shots: a slab with a
// segmented two-tone brick rim and corner blocks, an inner floor with a lighter
// walkway, a two-tier pedestal with front steps, the training dummy (stand,
// legs, torso with chest plate, cross-arms with hands, shoulder pads, head with
// the "T" emblem), the pad (raised inset, white bracket decal, glowing frame),
// and per-theme decor: pond + lilies + mushrooms + trees (Wooden), bamboo +
// emeralds (Emerald), water + coral + swaying seaweed + starfish (Sapphire),
// lanterns + crates + anvil + ingots (Iron), coins + open chest + gems
// (Golden), amber crystals + torches + crates + barrels (Amber), braziers +
// rim rubies (Ruby), crystal clusters (Amethyst), snowy pines + ice (Frost)
// and black pillars with void crystals (Obsidian). Each theme also has its own
// ambient particles (fireflies, leaves, bubbles, sparks, glitter, embers,
// sparkles, snow, void wisps).
//
// Built in plot space (front = +Z, the pad end); static bricks are moved into
// the baked root, animated parts stay in a live group placed like the plot.
import { Group, Mesh, CylinderGeometry, MeshStandardMaterial, BoxGeometry } from 'three'
import { PALETTE as P, PLOT, PLOT_THEMES } from './config.js'
import { brick, legoMat, span } from './lego.js'
import { solidBox } from './propkit.js'
import { bake } from './bake.js'
import { signSprite } from './signs.js'
import * as K from './lobbykit.js'

const HW = PLOT.w / 2
const HD = PLOT.d / 2
const PED_Y = 1.7 // top of the upper pedestal tier (the dummy's feet)
const DUMMY_Z = -3.9
const PAD_Z = 3.8
const PAD_Y = 0.62 // top of the pad inset
const SC = PLOT.scale ?? 1 // build units -> metres
const DUMMY_SCALE = 0.85 // the dummy is ~1.7 characters tall, like the reference

// A run of rim bricks between two corners, alternating the theme's two shades.
function rimRun(g, th, x0, z0, x1, z1, y0 = 0.45, y1 = 0.95) {
  const alongX = x1 - x0 > z1 - z0
  const len = alongX ? x1 - x0 : z1 - z0
  const n = Math.max(1, Math.round(len / 1.5))
  const step = len / n
  for (let i = 0; i < n; i++) {
    const c = th.rim[i % 2]
    if (alongX) span(g, c, x0 + i * step, y0, z0, x0 + (i + 1) * step, y1, z1)
    else span(g, c, x0, y0, z0 + i * step, x1, y1, z0 + (i + 1) * step)
  }
}

function buildDummy(th, theme, rand) {
  const g = new Group()
  const d = th.dummy
  brick(g, d.stand, 2.4, 0.3, 1.3, 0, 0.15, 0) // base plate
  for (const s of [-1, 1]) brick(g, d.stand, 0.55, 1.25, 0.55, s * 0.5, 0.92, 0) // legs
  brick(g, d.dark, 1.7, 0.5, 1.0, 0, 1.78, 0) // hips
  brick(g, d.body, 2.0, 1.9, 1.05, 0, 2.98, 0) // torso
  brick(g, K.lighten(d.body, 0.2), 1.3, 1.1, 0.1, 0, 3.02, 0.56) // chest plate
  brick(g, d.dark, 0.5, 0.5, 0.1, 0, 3.02, 0.62) // chest bullseye
  for (const s of [-1, 1]) {
    brick(g, d.body, 1.5, 0.8, 0.8, s * 1.75, 3.5, 0) // arm
    brick(g, d.dark, 0.95, 0.95, 0.95, s * 2.95, 3.5, 0) // hand block
    brick(g, K.lighten(d.body, 0.12), 0.95, 0.45, 1.15, s * 1.2, 4.0, 0) // shoulder pad
  }
  brick(g, d.dark, 0.7, 0.35, 0.7, 0, 4.1, 0) // neck
  brick(g, d.body, 1.7, 1.5, 1.15, 0, 5.02, 0) // head
  brick(g, d.emblem, 1.05, 0.28, 0.12, 0, 5.42, 0.62) // the "T"
  brick(g, d.emblem, 0.3, 0.8, 0.12, 0, 4.97, 0.62)
  brick(g, d.dark, 0.6, 0.3, 0.6, 0, 5.92, 0) // top knob
  if (theme === 'obsidian') {
    for (const s of [-1, 1]) {
      const horn = brick(g, '#16151c', 0.3, 1.0, 0.3, s * 0.75, 6.1, 0)
      horn.rotation.z = -s * 0.45
      K.crystal(g, s * 2.95, 3.95, 0, '#c86bff', 0.6, rand, 0.3)
    }
  } else if (theme === 'frost') {
    for (let i = 0; i < 5; i++) K.crystal(g, -0.6 + i * 0.3, 5.75, 0, '#dff8ff', 0.4 + (i % 2) * 0.25, rand, 0.22)
  } else if (theme === 'golden') {
    brick(g, '#fff07a', 1.8, 0.3, 1.25, 0, 5.85, 0)
    for (const x of [-0.7, 0, 0.7]) brick(g, '#fff07a', 0.3, 0.45, 0.3, x, 6.2, 0)
  } else if (theme === 'amethyst') {
    K.crystal(g, 0, 6.05, 0, '#ffb3f0', 0.8, rand, 0.4)
  }
  g.traverse((o) => {
    if (o.isMesh) o.castShadow = true
  })
  return bake(g, true)
}

// --- Per-theme decor -------------------------------------------------------------------------------
// g = static (baked) plot space, lv = live plot space, a = animation lists.
const DECOR = {
  wood(g, lv, a, th, rand) {
    span(g, '#1f6fc8', -HW + 0.8, 0.45, 0.9, -2.9, 0.52, HD - 0.8, { cast: false }) // pond bed
    K.pool(g, -HW + 0.8, 0.9, -2.9, HD - 0.8, 0.56, '#45b8ff')
    const lily = new MeshStandardMaterial({ color: '#4fcf3a', roughness: 0.7 })
    for (const [x, z, r] of [[-3.9, 2.3, 0.32], [-3.4, 4.5, 0.26], [-4.1, 5.8, 0.3]]) {
      const pad = new Mesh(new CylinderGeometry(r, r, 0.04, 12), lily)
      pad.position.set(x, 0.59, z)
      g.add(pad)
    }
    brick(g, '#ff8fc0', 0.18, 0.14, 0.18, -3.9, 0.66, 2.3)
    const stump = new Mesh(new CylinderGeometry(0.45, 0.5, 0.6, 12), new MeshStandardMaterial({ color: P.trunk, roughness: 0.8 }))
    stump.position.set(3.9, 0.8, 2.2)
    g.add(stump)
    const ring = new Mesh(new CylinderGeometry(0.4, 0.4, 0.02, 12), new MeshStandardMaterial({ color: '#f0c48a', roughness: 0.8 }))
    ring.position.set(3.9, 1.11, 2.2)
    g.add(ring)
    const log = new Mesh(new CylinderGeometry(0.28, 0.28, 1.6, 10), new MeshStandardMaterial({ color: '#9a5a2a', roughness: 0.8 }))
    log.rotation.z = Math.PI / 2
    log.position.set(3.75, 0.8, 4.1)
    g.add(log)
    K.mushroom(g, 3.5, 0.5, 0.4)
    K.mushroom(g, -3.7, 0.5, -0.4, 0.75)
    brick(g, P.rock, 0.9, 0.5, 0.7, 4.2, 0.75, 6.1, { yaw: 0.4 })
    brick(g, P.rockDark, 0.6, 0.4, 0.5, -3.4, 0.7, 6.4, { yaw: 1.1 })
    K.tree(g, -4.0, -5.8, 0.6, 0.5, P.leaf, false)
    K.tree(g, 4.0, -5.0, 0.55, 0.5, '#aeee52', false)
    K.tree(g, 4.15, 5.7, 0.42, 0.5, P.leaf, false)
  },
  emerald(g, lv, a, th, rand) {
    const bamboo = (x, z, n) => {
      for (let i = 0; i < n; i++) {
        const sx = x + (i - (n - 1) / 2) * 0.38
        const sz = z + (rand() - 0.5) * 0.3
        const segs = 4 + Math.floor(rand() * 3)
        for (let k = 0; k < segs; k++) {
          brick(g, k % 2 ? '#8bdc4a' : '#7ccf3c', 0.26, 0.82, 0.26, sx, 0.92 + k * 0.86, sz)
          brick(g, '#4f9a2a', 0.32, 0.08, 0.32, sx, 0.5 + (k + 1) * 0.86, sz)
        }
        for (const s of [-1, 1]) {
          const leaf = brick(g, '#5fd43a', 0.9, 0.06, 0.24, sx + s * 0.45, 0.6 + segs * 0.86, sz)
          leaf.rotation.z = s * 0.5
        }
      }
    }
    for (const [x, z, n] of [[-4.2, -6.0, 3], [-4.1, -2.2, 2], [4.2, -6.2, 3], [4.1, -2.0, 2], [4.2, 3.2, 2], [-4.2, 6.0, 2]]) bamboo(x, z, n)
    K.crystalCluster(g, -4.0, 0.5, 2.6, ['#2fe07a', '#8bffb8', '#1fbf5a'], 0.8, rand)
    K.crystalCluster(g, 4.0, 0.5, 5.8, ['#1fbf5a', '#2fe07a', '#8bffb8'], 0.7, rand)
    K.tree(g, -4.0, 4.0, 0.42, 0.5, '#4fd65a', false)
  },
  sapphire(g, lv, a, th, rand) {
    span(g, '#1f5fd0', -HW + 0.8, 0.45, -0.9, HW - 0.8, 0.5, HD - 0.8, { cast: false }) // sea bed
    K.pool(g, -HW + 0.8, -0.9, HW - 0.8, HD - 0.8, 0.57, '#5cc8ff')
    K.coral(g, -3.9, 0.5, 2.4, '#ff8fc0', rand)
    K.coral(g, 3.9, 0.5, 4.9, '#ff9a6a', rand)
    K.coral(g, -3.6, 0.5, 5.9, '#ff6fa8', rand)
    K.coral(g, 3.6, 0.5, 0.3, '#ff8fc0', rand)
    for (const [x, z] of [[-4.2, 0.3], [4.3, 2.6], [-3.0, 6.3], [3.1, 6.3], [-4.3, 4.2]]) a.weeds.push(K.seaweed(lv, x, 0.5, z, rand))
    for (let i = 0; i < 5; i++) {
      const arm = brick(g, '#ffb03a', 0.5, 0.06, 0.14, 3.9 + Math.cos((i / 5) * Math.PI * 2) * 0.22, 0.53, 1.6 + Math.sin((i / 5) * Math.PI * 2) * 0.22)
      arm.rotation.y = -(i / 5) * Math.PI * 2
    }
    for (const [x, z] of [[-3.3, 1.0], [2.9, 3.0]]) brick(g, '#fff0f6', 0.3, 0.12, 0.24, x, 0.56, z, { yaw: rand() * 3 })
    brick(g, '#1a55c0', 0.9, 0.6, 0.8, -4.1, 0.8, -4.2, { yaw: 0.4 })
    brick(g, '#2a74e8', 0.7, 0.5, 0.6, 4.1, 0.75, -5.6, { yaw: 0.9 })
  },
  iron(g, lv, a, th, rand) {
    for (const [x, z] of [[-3.9, -6.4], [3.9, -6.4], [-3.9, -0.6], [3.9, -0.6], [-3.4, 6.1], [3.4, 6.1]]) a.cores.push(K.lantern(g, lv, x, 0.5, z, '#ffcf3a', 1.9))
    K.crate(g, -4.0, 0.5, 2.6, 0.9, 0.3)
    K.crate(g, -4.0, 0.5, 4.1, 0.75, -0.2)
    K.crate(g, -4.0, 1.18, 4.1, 0.5, 0.5)
    K.crate(g, 4.0, 0.5, 3.6, 0.8, 0.2)
    // Anvil.
    span(g, '#3a3c44', 3.6, 0.5, 1.0, 4.4, 0.85, 1.6)
    span(g, '#4a4c56', 3.75, 0.85, 1.1, 4.25, 1.1, 1.5)
    span(g, '#5a5c66', 3.3, 1.1, 1.0, 4.5, 1.42, 1.6)
    brick(g, '#5a5c66', 0.5, 0.2, 0.3, 3.1, 1.32, 1.3)
    for (let i = 0; i < 3; i++) brick(g, '#d8dbe6', 0.9, 0.3, 0.42, -4.0, 0.65 + i * 0.3, -3.6, { yaw: i % 2 ? 1.57 : 0, mat: legoMat('#d8dbe6', { metalness: 0.6, roughness: 0.3 }) })
    brick(g, '#f2f2f6', 1.0, 0.5, 0.8, 4.0, 0.75, -3.4, { yaw: 0.4 })
    a.fxAt = [4.0, 1.5, 1.3]
  },
  golden(g, lv, a, th, rand) {
    for (const [x, z, n] of [[-4.0, 2.2, 6], [-3.6, 5.4, 4], [4.0, 5.8, 5], [-4.1, -3.6, 7], [4.1, -4.4, 3]]) K.coins(g, x, 0.5, z, n, rand)
    for (let i = 0; i < 8; i++) K.coins(g, (rand() - 0.5) * 8.6, 0.5, -1 + rand() * 7.4, 1, rand)
    // Open treasure chest.
    const cx = 3.9
    const cz = 2.4
    span(g, '#8a4a1a', cx - 0.7, 0.5, cz - 0.5, cx + 0.7, 1.3, cz + 0.5)
    for (const dx of [-0.45, 0.45]) span(g, '#ffd21f', cx + dx - 0.08, 0.5, cz - 0.52, cx + dx + 0.08, 1.32, cz + 0.52)
    span(g, '#ffe27a', cx - 0.6, 1.3, cz - 0.4, cx + 0.6, 1.45, cz + 0.4, { mat: legoMat('#ffe27a', { emissive: '#ffb800', emissiveIntensity: 0.6 }) })
    const lid = brick(g, '#8a4a1a', 1.4, 0.18, 1.0, cx, 1.55, cz - 0.85)
    lid.rotation.x = -1.15
    K.gem(g, cx - 0.25, 1.4, cz, '#ff3b5c', 0.18)
    K.gem(g, cx + 0.25, 1.4, cz + 0.1, '#3fb4ff', 0.16)
    K.gem(g, -3.9, 0.5, -0.8, '#ff3b5c')
    K.gem(g, 3.9, 0.5, -0.6, '#3fb4ff')
    K.gem(g, 4.1, 0.5, -5.8, '#ff6fd8', 0.3)
    for (const [x, z] of [[-3.9, -6.4], [3.9, -6.4]]) a.cores.push(K.lantern(g, lv, x, 0.5, z, '#fff3a0', 1.9, '#d99a08'))
    a.fxAt = [cx, 1.6, cz]
  },
  amber(g, lv, a, th, rand) {
    const amber = ['#ffb03a', '#ffd080', '#ff8a1f']
    K.crystalCluster(g, -4.0, 0.5, -5.6, amber, 0.8, rand)
    K.crystalCluster(g, 4.0, 0.5, -5.8, amber, 0.7, rand)
    K.crystalCluster(g, -4.0, 0.5, 4.6, amber, 0.6, rand)
    K.crate(g, 4.0, 0.5, 2.4, 0.9, 0.2, '#a0602a')
    K.crate(g, 4.0, 0.5, 5.6, 0.7, -0.3, '#a0602a')
    K.barrel(g, -4.0, 0.5, 1.6)
    K.barrel(g, -3.3, 0.5, 6.2)
    for (const [x, z] of [[-3.9, -0.6], [3.9, -0.6]]) {
      span(g, '#7a4524', x - 0.16, 0.5, z - 0.16, x + 0.16, 2.1, z + 0.16)
      span(g, '#3a2414', x - 0.32, 2.1, z - 0.32, x + 0.32, 2.4, z + 0.32)
      a.flames.push(K.flame(lv, x, 2.4, z, 0.9))
    }
  },
  ruby(g, lv, a, th, rand) {
    const ruby = ['#ff3550', '#ff8a9a', '#c8102e']
    for (const [x, z] of [[-HW + 0.55, -HD + 0.55], [HW - 0.55, -HD + 0.55], [-HW + 0.55, HD - 0.55], [HW - 0.55, HD - 0.55]]) K.crystalCluster(g, x, 1.2, z, ruby, 0.6, rand)
    for (let i = 0; i < 6; i++) {
      const z = -HD + 2.5 + i * 2
      K.crystal(g, -HW + 0.4, 0.95, z, ruby[i % 3], 0.5 + rand() * 0.4, rand, 0.3)
      K.crystal(g, HW - 0.4, 0.95, z + 1, ruby[(i + 1) % 3], 0.5 + rand() * 0.4, rand, 0.3)
    }
    for (const [x, z] of [[-3.9, -6.4], [3.9, -6.4], [-3.9, -0.6], [3.9, -0.6]]) {
      span(g, '#2a1a1a', x - 0.2, 0.5, z - 0.2, x + 0.2, 1.7, z + 0.2)
      span(g, '#1a1010', x - 0.42, 1.7, z - 0.42, x + 0.42, 2.0, z + 0.42)
      a.flames.push(K.flame(lv, x, 2.0, z, 0.85))
    }
    brick(g, '#3a2020', 1.0, 0.7, 0.9, 4.0, 0.85, 5.2, { yaw: 0.3 })
    brick(g, '#3a2020', 0.7, 0.5, 0.6, -4.0, 0.75, 3.0, { yaw: 0.8 })
  },
  amethyst(g, lv, a, th, rand) {
    const cols = ['#ffb3f0', '#d89bff', '#b04dff']
    const perim = []
    for (let x = -HW + 0.8; x <= HW - 0.8; x += 2.2) perim.push([x, -HD + 0.4], [x, HD - 0.4])
    for (let z = -HD + 2.4; z <= HD - 2.4; z += 2.2) perim.push([-HW + 0.4, z], [HW - 0.4, z])
    perim.forEach(([x, z], i) => K.crystalCluster(g, x, 0.95, z, [cols[i % 3], cols[(i + 1) % 3], cols[(i + 2) % 3]], 0.45 + rand() * 0.3, rand))
    for (const [x, z] of [[-4.0, 2.4], [4.0, 5.0], [-4.0, -5.6], [4.0, -5.6]]) K.crystalCluster(g, x, 0.5, z, cols, 0.85, rand)
  },
  frost(g, lv, a, th, rand) {
    K.pool(g, -HW + 0.8, 0.8, -3.0, 4.8, 0.55, '#bff0ff')
    K.pine(g, -4.0, -5.6, 0.5, 0.85)
    K.pine(g, 4.0, -2.8, 0.5, 0.95)
    K.pine(g, 4.0, 4.9, 0.5, 0.75)
    K.pine(g, -4.0, 6.1, 0.5, 0.6)
    const ice = legoMat('#c8f2ff', { transparent: true, opacity: 0.82, roughness: 0.1, emissive: '#7fd6ff', emissiveIntensity: 0.15 })
    for (const [x, z, s] of [[3.8, 1.4, 1], [-3.9, -1.0, 0.8], [3.9, -6.2, 0.7]]) brick(g, null, 1.0 * s, 0.8 * s, 1.0 * s, x, 0.5 + 0.4 * s, z, { yaw: rand(), mat: ice })
    for (const [x, z] of [[-3.4, 0.2], [3.3, 6.2], [-4.2, -3.2]]) brick(g, '#ffffff', 0.9, 0.3, 0.7, x, 0.65, z, { yaw: rand() })
  },
  obsidian(g, lv, a, th, rand) {
    for (const [x, z] of [[-3.9, -6.4], [3.9, -6.4], [-3.9, -0.6], [3.9, -0.6]]) {
      span(g, '#16151c', x - 0.45, 0.5, z - 0.45, x + 0.45, 3.4, z + 0.45)
      span(g, '#2b2936', x - 0.6, 3.4, z - 0.6, x + 0.6, 3.75, z + 0.6)
      K.crystal(g, x, 3.75, z, '#c86bff', 0.7, rand, 0.4)
    }
    for (const [x, z] of [[-4.0, 2.4], [4.0, 4.6], [-3.8, 5.8], [4.1, 1.4]]) K.crystalCluster(g, x, 0.5, z, ['#3a3846', '#2b2936', '#4a4858'], 0.6, rand)
    span(g, '#4a4858', -HW + 0.8, 0.5, 0.7, HW - 0.8, 0.54, 1.2, { cast: false })
    a.fxAt = null
  },
}

// --- Ambient particles per theme (plot-space spawn, then toWorld) ------------------------------------
const FX = {
  fireflies: (r) => ({ p: [(r() - 0.5) * 9, 1 + r() * 3, (r() - 0.5) * 13], o: { vx: (r() - 0.5) * 0.6, vy: (r() - 0.5) * 0.4, vz: (r() - 0.5) * 0.6, color: '#d8ff6a', size: 0.25, life: 2.2, sparkle: true, twinkle: 7, boost: 1.8 } }),
  leaves: (r) => ({ p: [(r() - 0.5) * 9, 4 + r() * 2, (r() - 0.5) * 13], o: { vx: (r() - 0.5) * 0.5, vy: -0.6, vz: (r() - 0.5) * 0.5, color: '#7dff8a', size: 0.3, life: 4, sparkle: true, twinkle: 4, boost: 1.4 } }),
  bubbles: (r) => ({ p: [(r() - 0.5) * 9, 0.6, 0.3 + r() * 6.2], o: { vy: 0.9 + r() * 0.6, vx: (r() - 0.5) * 0.2, color: '#e8fbff', size: 0.22 + r() * 0.15, life: 1.8, boost: 1.2 } }),
  glitter: (r) => ({ p: [(r() - 0.5) * 9, 0.7 + r() * 1.5, (r() - 0.5) * 13], o: { vy: 0.3, color: '#ffe27a', size: 0.3, life: 1.2, sparkle: true, twinkle: 12, boost: 1.8 } }),
  sparkle: (r) => ({ p: [(r() - 0.5) * 10.4, 1 + r() * 2, (r() - 0.5) * 14.4], o: { vy: 0.4, color: r() < 0.5 ? '#ffb3f0' : '#d89bff', size: 0.32, life: 1.6, sparkle: true, twinkle: 9, boost: 1.8 } }),
  snow: (r) => ({ p: [(r() - 0.5) * 12, 8 + r() * 2, (r() - 0.5) * 16], o: { vx: (r() - 0.5) * 0.3, vy: -1.2, vz: (r() - 0.5) * 0.3, color: '#ffffff', size: 0.24, life: 6, boost: 1.1 } }),
  void: (r) => ({ p: [(r() < 0.5 ? -3.9 : 3.9), 4.3, r() < 0.5 ? -6.4 : -0.6], o: { vx: (r() - 0.5) * 0.3, vy: 0.8, vz: (r() - 0.5) * 0.3, color: '#b04dff', size: 0.4, life: 1.6, grow: 0.8, boost: 1.6 } }),
}

function plotLines(def, unlocked) {
  const lines = [
    { text: def.name, size: 92, color: def.title },
    { text: `${def.mult}x DAMAGE / SEC`, size: 58, color: '#ffffff' },
  ]
  if (def.robux) lines.push({ text: `${def.robux} R$ - NO REBIRTH NEEDED`, size: 36, color: '#ffffff', icon: 'lock', pill: '#e0263a' })
  else if (unlocked) lines.push({ text: 'UNLOCKED', size: 58, color: '#5dff4a' })
  else lines.push({ text: `${def.rebirths} REBIRTHS`, size: 54, color: '#ff3b4e', icon: 'lock' })
  return lines
}

export function buildPlot(root, live, def, rand, particles) {
  const th = PLOT_THEMES[def.theme]
  const local = new Group()
  const lv = new Group()
  const anim = { flames: [], weeds: [], cores: [], fxAt: null }

  // Slab, segmented rim, corner blocks.
  span(local, th.base, -HW, 0, -HD, HW, 0.45, HD, { cast: false })
  rimRun(local, th, -HW, -HD, HW, -HD + 0.8)
  rimRun(local, th, -HW, HD - 0.8, HW, HD)
  rimRun(local, th, -HW, -HD + 0.8, -HW + 0.8, HD - 0.8)
  rimRun(local, th, HW - 0.8, -HD + 0.8, HW, HD - 0.8)
  for (const [x, z] of [[-HW, -HD], [HW - 1.1, -HD], [-HW, HD - 1.1], [HW - 1.1, HD - 1.1]]) {
    span(local, th.rim[1], x, 0.45, z, x + 1.1, 1.1, z + 1.1)
    span(local, K.lighten(th.rim[0], 0.15), x + 0.1, 1.1, z + 0.1, x + 1.0, 1.2, z + 1.0)
  }
  // Inner floor + walkway from the pad to the pedestal.
  span(local, th.inner, -HW + 0.8, 0.45, -HD + 0.8, HW - 0.8, 0.5, HD - 0.8, { cast: false })
  if (def.theme !== 'sapphire') span(local, th.floor, -2.8, 0.5, -1.0, 2.8, 0.53, HD - 0.8, { cast: false })
  // Two-tier pedestal with front steps and trim.
  span(local, th.ped[1], -3.0, 0.5, -HD + 0.8, 3.0, 1.1, -1.0)
  span(local, th.ped[0], -2.2, 1.1, -HD + 1.5, 2.2, PED_Y, -2.0)
  span(local, K.darken(th.ped[1], 0.12), -3.05, 0.5, -1.05, 3.05, 0.62, -0.95, { cast: false })
  span(local, th.ped[0], -1.3, 0.5, -1.0, 1.3, 0.8, -0.4)
  span(local, th.ped[1], -0.9, 1.1, -2.0, 0.9, 1.4, -1.5)
  DECOR[def.theme]?.(local, lv, anim, th, rand)
  // The pad: raised inset with the bracket decal and a glowing frame.
  span(local, K.darken(th.pad, 0.25), -2.55, 0.5, PAD_Z - 2.55, 2.55, PAD_Y - 0.04, PAD_Z + 2.55, { cast: false })
  span(local, th.pad, -2.35, PAD_Y - 0.04, PAD_Z - 2.35, 2.35, PAD_Y, PAD_Z + 2.35, { cast: false })
  const decal = K.flat(K.padTex, 4.6, 4.6)
  decal.position.set(0, PAD_Y + 0.01, PAD_Z)
  lv.add(decal)
  const frameMat = K.edgeMat(def.top)
  const edge = K.edgeFrame(4.9, 0.14, 0.08, frameMat)
  edge.position.set(0, PAD_Y + 0.02, PAD_Z)
  lv.add(edge)

  // Place it; re-parent the static bricks into the baked root.
  const [px, pz] = def.at
  local.position.set(px, 0, pz)
  local.rotation.y = def.face
  local.scale.setScalar(SC)
  local.updateMatrixWorld(true)
  const moved = []
  local.traverse((o) => {
    if (o.isMesh) moved.push(o)
  })
  for (const m of moved) {
    m.updateMatrixWorld()
    m.matrixWorld.decompose(m.position, m.quaternion, m.scale)
    root.add(m)
  }
  solidBox(HW * SC, (PAD_Y * SC) / 2, HD * SC, px, (PAD_Y * SC) / 2, pz) // walkable slab up to the pad top (the rim is a small step)
  const cos = Math.cos(def.face)
  const sin = Math.sin(def.face)
  const toWorld = (x, y, z) => ({ x: px + (x * cos + z * sin) * SC, y: y * SC, z: pz + (-x * sin + z * cos) * SC })

  lv.position.copy(local.position)
  lv.rotation.y = def.face
  lv.scale.setScalar(SC)
  live.add(lv)
  const dummy = buildDummy(th, def.theme, rand)
  dummy.position.set(0, PED_Y, DUMMY_Z)
  dummy.scale.setScalar(DUMMY_SCALE)
  lv.add(dummy)
  const label = signSprite(plotLines(def, false), def.robux ? 4.8 : 5.4)
  label.position.set(0, 11.6, DUMMY_Z)
  lv.add(label)
  const glowMat = K.edgeMat(def.top)
  glowMat.map = K.fadeTex
  glowMat.opacity = 0
  const glow = new Mesh(new CylinderGeometry(2.6, 2.6, 1.6, 32, 1, true), glowMat)
  glow.position.set(0, PAD_Y + 0.8, PAD_Z)
  lv.add(glow)

  const pad = toWorld(0, PAD_Y, PAD_Z)
  const dummyWorld = toWorld(0, PED_Y + 3.2 * DUMMY_SCALE, DUMMY_Z)
  const fxWorld = anim.fxAt ? toWorld(...anim.fxAt) : null
  const flameWorld = anim.flames.map((f) => toWorld(f.position.x, f.position.y + 0.6, f.position.z))
  const fx = FX[th.fx]
  let shake = 0
  let fxClock = Math.random()
  let sparkClock = 0
  let lastUnlocked = null
  return {
    def,
    pad,
    dummyPos: dummyWorld,
    face: def.face,
    active: false,
    contains(x, z) {
      const dx = x - pad.x
      const dz = z - pad.z
      const lx = dx * cos - dz * sin
      const lz = dx * sin + dz * cos
      return Math.abs(lx) < 2.5 * SC && Math.abs(lz) < 2.5 * SC
    },
    hit() {
      shake = 1
    },
    setUnlocked(unlocked) {
      if (unlocked === lastUnlocked) return
      lastUnlocked = unlocked
      label.setLines(plotLines(def, unlocked))
    },
    update(dt, t, playerPos) {
      shake = Math.max(0, shake - dt * 5)
      dummy.rotation.z = Math.sin(t * 40) * 0.07 * shake
      dummy.position.z = DUMMY_Z - shake * 0.2
      glowMat.opacity += ((this.active ? 0.32 + Math.sin(t * 6) * 0.08 : 0) - glowMat.opacity) * Math.min(1, dt * 6)
      frameMat.opacity = this.active ? 0.75 + Math.sin(t * 8) * 0.25 : 0.35 + Math.sin(t * 2 + px) * 0.1
      label.position.y = 11.6 + Math.sin(t * 1.4 + px) * 0.15
      const near = playerPos && Math.abs(playerPos.x - px) < 75 && Math.abs(playerPos.z - pz) < 75
      if (!near) return
      for (const f of anim.flames) K.flickerFlame(f, t)
      for (const w of anim.weeds) w.rotation.z = Math.sin(t * 1.6 + w.userData.phase) * 0.22
      for (const c of anim.cores) c.scale.setScalar(1 + Math.sin(t * 9 + c.position.x * 3) * 0.06)
      if (!particles) return
      fxClock -= dt
      while (fxClock <= 0) {
        fxClock += th.fx === 'snow' ? 0.05 : 0.09
        if (fx) {
          const s = fx(Math.random)
          const w = toWorld(s.p[0], s.p[1], s.p[2])
          particles.emit({ x: w.x, y: w.y, z: w.z, ...s.o })
        }
        for (const p of flameWorld) {
          if (Math.random() < 0.5) particles.emit({ x: p.x + (Math.random() - 0.5) * 0.2, y: p.y, z: p.z + (Math.random() - 0.5) * 0.2, vx: (Math.random() - 0.5) * 0.4, vy: 1.4 + Math.random(), vz: (Math.random() - 0.5) * 0.4, color: Math.random() < 0.5 ? '#ffb347' : '#ff6a1f', size: 0.2, life: 1.1, gravity: 0.3, boost: 2 })
        }
      }
      if (fxWorld && th.fx === 'sparks') {
        sparkClock -= dt
        if (sparkClock <= 0) {
          sparkClock = 1.2 + Math.random() * 1.5
          particles.burst(fxWorld.x, fxWorld.y, fxWorld.z, 12, { speed: 4, up: 2.5, colors: ['#ffcf3a', '#ff8a2a', '#ffffff'], size: 0.22, life: 0.6, gravity: -14, boost: 2 })
        }
      }
      if (fxWorld && th.fx === 'glitter' && Math.random() < dt * 6) particles.emit({ x: fxWorld.x + (Math.random() - 0.5) * 0.8, y: fxWorld.y, z: fxWorld.z + (Math.random() - 0.5) * 0.5, vy: 1.2, color: '#ffe27a', size: 0.3, life: 1, sparkle: true, boost: 2 })
    },
  }
}
