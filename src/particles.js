// One pooled, additive particle system for every effect in the game: plot
// sparkles, training motes, muzzle sparks, bullet trails, impact bursts,
// rebirth fireworks and sea glints. A single Points draw call; each particle
// has its own colour (HDR-boosted so bloom picks it up), size, life, velocity,
// gravity and drag. The pool is a ring: when it is full the oldest particle
// is recycled, so effects never allocate per frame.
import { AdditiveBlending, BufferAttribute, BufferGeometry, CanvasTexture, Color, Points, ShaderMaterial } from 'three'
import { paintSparkle, paintSoftDot } from './textures.js'

const vertex = /* glsl */ `
  attribute vec3 color;
  attribute vec2 sizeAlpha; // size (m), alpha
  attribute float sprite;   // 0 = soft dot, 1 = sparkle
  uniform float uScale;
  varying vec3 vColor;
  varying float vAlpha;
  varying float vSprite;
  void main() {
    vColor = color;
    vSprite = sprite;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    // Fade out right in front of the lens (a chase / bullet cam flies through its own trail).
    vAlpha = sizeAlpha.y * smoothstep(0.7, 2.6, -mv.z);
    gl_PointSize = sizeAlpha.x * uScale / max(0.1, -mv.z);
    gl_Position = projectionMatrix * mv;
  }`
const fragment = /* glsl */ `
  uniform sampler2D uDot;
  uniform sampler2D uSparkle;
  uniform float uBoost;
  varying vec3 vColor;
  varying float vAlpha;
  varying float vSprite;
  void main() {
    vec4 t = vSprite > 0.5 ? texture2D(uSparkle, gl_PointCoord) : texture2D(uDot, gl_PointCoord);
    float a = t.a * vAlpha;
    if (a < 0.01) discard;
    gl_FragColor = vec4(vColor * uBoost * a, a);
  }`

export function createParticles(scene, max = 2400) {
  const geo = new BufferGeometry()
  const pos = new Float32Array(max * 3)
  const col = new Float32Array(max * 3)
  const sa = new Float32Array(max * 2)
  const spr = new Float32Array(max)
  geo.setAttribute('position', new BufferAttribute(pos, 3))
  geo.setAttribute('color', new BufferAttribute(col, 3))
  geo.setAttribute('sizeAlpha', new BufferAttribute(sa, 2))
  geo.setAttribute('sprite', new BufferAttribute(spr, 1))
  const material = new ShaderMaterial({
    uniforms: {
      uDot: { value: new CanvasTexture(paintSoftDot(64)) },
      uSparkle: { value: new CanvasTexture(paintSparkle(64)) },
      uScale: { value: 400 },
      uBoost: { value: 1 },
    },
    vertexShader: vertex,
    fragmentShader: fragment,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  })
  const points = new Points(geo, material)
  points.frustumCulled = false
  points.renderOrder = 5
  scene.add(points)

  // Per-particle state (struct of arrays).
  const vel = new Float32Array(max * 3)
  const life = new Float32Array(max) // s left
  const total = new Float32Array(max)
  const size0 = new Float32Array(max)
  const grav = new Float32Array(max)
  const drag = new Float32Array(max)
  const grow = new Float32Array(max)
  const twinkle = new Float32Array(max)
  let next = 0
  let budget = 1 // graphics preset particle multiplier
  let budgetAcc = 0
  const c = new Color()

  function emit({ x, y, z, vx = 0, vy = 0, vz = 0, color = '#ffffff', size = 0.4, life: l = 1, gravity = 0, drag: d = 0, grow: gr = 0, sparkle = false, twinkle: tw = 0, boost = 1 }) {
    // Lighter presets drop a share of the particles (evenly, not the first N).
    budgetAcc += budget
    if (budgetAcc < 1) return
    budgetAcc -= 1
    const i = next
    next = (next + 1) % max
    pos[i * 3] = x
    pos[i * 3 + 1] = y
    pos[i * 3 + 2] = z
    vel[i * 3] = vx
    vel[i * 3 + 1] = vy
    vel[i * 3 + 2] = vz
    c.set(color).multiplyScalar(boost)
    col[i * 3] = c.r
    col[i * 3 + 1] = c.g
    col[i * 3 + 2] = c.b
    life[i] = total[i] = l
    size0[i] = size
    grav[i] = gravity
    drag[i] = d
    grow[i] = gr
    twinkle[i] = tw
    spr[i] = sparkle ? 1 : 0
    sa[i * 2] = size
    sa[i * 2 + 1] = 1
  }

  // A burst of n particles flying out of one point.
  function burst(x, y, z, n, { speed = 6, up = 2, color = '#ffffff', colors = null, size = 0.4, life: l = 0.8, gravity = -9, drag: d = 1.5, sparkle = true, boost = 1.6 } = {}) {
    for (let k = 0; k < n; k++) {
      const a = Math.random() * Math.PI * 2
      const e = Math.random() * 2 - 1
      const s = speed * (0.4 + Math.random() * 0.6)
      const r = Math.sqrt(1 - e * e)
      emit({
        x, y, z,
        vx: Math.cos(a) * r * s,
        vy: e * s + up,
        vz: Math.sin(a) * r * s,
        color: colors ? colors[k % colors.length] : color,
        size: size * (0.6 + Math.random() * 0.8),
        life: l * (0.6 + Math.random() * 0.6),
        gravity, drag: d, sparkle, boost,
      })
    }
  }

  let time = 0
  return {
    emit,
    burst,
    setBudget(k) {
      budget = k
    },
    setBloom(on) {
      material.uniforms.uBoost.value = on ? 1.6 : 1
    },
    resize(height, fovDeg) {
      material.uniforms.uScale.value = height / (2 * Math.tan((fovDeg * Math.PI) / 360))
    },
    update(dt) {
      time += dt
      for (let i = 0; i < max; i++) {
        if (life[i] <= 0) continue
        life[i] -= dt
        if (life[i] <= 0) {
          sa[i * 2 + 1] = 0
          continue
        }
        const k = Math.exp(-drag[i] * dt)
        vel[i * 3] *= k
        vel[i * 3 + 1] = vel[i * 3 + 1] * k + grav[i] * dt
        vel[i * 3 + 2] *= k
        pos[i * 3] += vel[i * 3] * dt
        pos[i * 3 + 1] += vel[i * 3 + 1] * dt
        pos[i * 3 + 2] += vel[i * 3 + 2] * dt
        const t = life[i] / total[i] // 1 -> 0
        const fadeIn = Math.min(1, (1 - t) * 8)
        let alpha = Math.min(fadeIn, t * 2.2)
        if (twinkle[i] > 0) alpha *= 0.55 + 0.45 * Math.sin(time * twinkle[i] + i * 1.7)
        sa[i * 2] = size0[i] * (1 + grow[i] * (1 - t))
        sa[i * 2 + 1] = Math.max(0, alpha)
      }
      geo.attributes.position.needsUpdate = true
      geo.attributes.color.needsUpdate = true
      geo.attributes.sizeAlpha.needsUpdate = true
      geo.attributes.sprite.needsUpdate = true
    },
  }
}
