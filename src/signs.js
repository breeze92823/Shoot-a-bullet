// Outlined game-sign text (canvas) for world labels: plot titles, gun prices,
// gate milestones, name tags. Lines can carry a padlock or trophy icon and a
// pill background, like the reference's "🔒 1 REBIRTHS" / "🏆 600 WINS" lines.
// Sprites repaint once the display font has loaded.
import { CanvasTexture, DoubleSide, Mesh, MeshBasicMaterial, PlaneGeometry, SRGBColorSpace, Sprite, SpriteMaterial } from 'three'

export const SIGN_FONT = '"Lilita One", Fredoka, "Arial Black", sans-serif'
export const signFontReady = document.fonts?.load
  ? Promise.all([document.fonts.load(`400 64px "Lilita One"`), document.fonts.load('700 64px Fredoka')]).catch(() => null)
  : Promise.resolve()

function drawLock(ctx, x, y, s) {
  ctx.save()
  ctx.lineWidth = s * 0.16
  ctx.strokeStyle = '#2a1a00'
  ctx.beginPath()
  ctx.arc(x + s * 0.5, y + s * 0.38, s * 0.24, Math.PI, 0)
  ctx.stroke()
  ctx.strokeStyle = '#ffd54a'
  ctx.lineWidth = s * 0.08
  ctx.stroke()
  ctx.fillStyle = '#ffc21f'
  ctx.strokeStyle = '#2a1a00'
  ctx.lineWidth = s * 0.07
  ctx.beginPath()
  ctx.roundRect(x + s * 0.14, y + s * 0.38, s * 0.72, s * 0.56, s * 0.1)
  ctx.fill()
  ctx.stroke()
  ctx.restore()
}
function drawTrophy(ctx, x, y, s) {
  ctx.save()
  ctx.fillStyle = '#ffc21f'
  ctx.strokeStyle = '#3a2000'
  ctx.lineWidth = s * 0.07
  ctx.beginPath()
  ctx.moveTo(x + s * 0.18, y + s * 0.1)
  ctx.lineTo(x + s * 0.82, y + s * 0.1)
  ctx.quadraticCurveTo(x + s * 0.8, y + s * 0.6, x + s * 0.5, y + s * 0.62)
  ctx.quadraticCurveTo(x + s * 0.2, y + s * 0.6, x + s * 0.18, y + s * 0.1)
  ctx.fill()
  ctx.stroke()
  ctx.fillRect(x + s * 0.42, y + s * 0.6, s * 0.16, s * 0.18)
  ctx.beginPath()
  ctx.roundRect(x + s * 0.26, y + s * 0.76, s * 0.48, s * 0.16, s * 0.04)
  ctx.fill()
  ctx.stroke()
  ctx.strokeStyle = '#ffc21f'
  ctx.lineWidth = s * 0.08
  ctx.beginPath()
  ctx.arc(x + s * 0.16, y + s * 0.26, s * 0.12, Math.PI * 0.5, Math.PI * 1.5)
  ctx.arc(x + s * 0.84, y + s * 0.26, s * 0.12, Math.PI * 1.5, Math.PI * 0.5)
  ctx.stroke()
  ctx.restore()
}

// lines: [{ text, color, size (px), outline, icon: 'lock' | 'trophy', pill: css colour }]
export function paintSign(canvas, lines, { pad = 18, gap = 0.08 } = {}) {
  const ctx = canvas.getContext('2d')
  const metrics = lines.map((l) => {
    ctx.font = `400 ${l.size}px ${SIGN_FONT}`
    const icon = l.icon ? l.size * 0.95 : 0
    return { w: ctx.measureText(l.text).width + icon + (l.pill ? l.size * 0.5 : 0), h: l.size * (1 + gap) }
  })
  const width = Math.ceil(Math.max(...metrics.map((m) => m.w)) + pad * 2 + 16)
  const height = Math.ceil(metrics.reduce((a, m) => a + m.h, 0) + pad * 2)
  canvas.width = width
  canvas.height = height
  let y = pad
  lines.forEach((l, i) => {
    const m = metrics[i]
    ctx.font = `400 ${l.size}px ${SIGN_FONT}`
    ctx.textBaseline = 'middle'
    ctx.textAlign = 'left'
    ctx.lineJoin = 'round'
    const icon = l.icon ? l.size * 0.95 : 0
    const x0 = (width - m.w) / 2
    const cy = y + m.h / 2
    if (l.pill) {
      ctx.fillStyle = l.pill
      ctx.strokeStyle = 'rgba(0,0,0,0.55)'
      ctx.lineWidth = l.size * 0.08
      ctx.beginPath()
      ctx.roundRect(x0, cy - l.size * 0.52, m.w, l.size * 1.04, l.size * 0.5)
      ctx.fill()
      ctx.stroke()
    }
    const tx = x0 + (l.pill ? l.size * 0.25 : 0)
    if (l.icon === 'lock') drawLock(ctx, tx, cy - l.size * 0.5, l.size * 0.9)
    if (l.icon === 'trophy') drawTrophy(ctx, tx, cy - l.size * 0.5, l.size * 0.9)
    ctx.lineWidth = Math.max(4, l.size * 0.2)
    ctx.strokeStyle = l.outline ?? '#14101c'
    ctx.strokeText(l.text, tx + icon, cy + l.size * 0.04)
    ctx.fillStyle = l.color ?? '#ffffff'
    ctx.fillText(l.text, tx + icon, cy + l.size * 0.04)
    y += m.h
  })
}

// A camera-facing sign `height` metres tall. Returns the sprite with .setLines(lines).
export function signSprite(lines, height, { depthTest = true } = {}) {
  const canvas = document.createElement('canvas')
  const tex = new CanvasTexture(canvas)
  tex.colorSpace = SRGBColorSpace
  const sprite = new Sprite(new SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest, fog: false }))
  let current = lines
  const draw = () => {
    paintSign(canvas, current)
    tex.dispose()
    tex.needsUpdate = true
    sprite.scale.set((height * canvas.width) / canvas.height, height, 1)
  }
  draw()
  signFontReady.then(draw)
  sprite.setLines = (next) => {
    current = next
    draw()
  }
  sprite.renderOrder = 10
  return sprite
}

// A flat sign (fixed in the world, e.g. text printed on the floor or a banner face).
export function signPlane(lines, width) {
  const canvas = document.createElement('canvas')
  const tex = new CanvasTexture(canvas)
  tex.colorSpace = SRGBColorSpace
  tex.anisotropy = 8
  const mesh = new Mesh(new PlaneGeometry(1, 1), new MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, side: DoubleSide, polygonOffset: true, polygonOffsetFactor: -2 }))
  const draw = () => {
    paintSign(canvas, lines, { pad: 4 })
    tex.dispose()
    tex.needsUpdate = true
    mesh.scale.set(width, (width * canvas.height) / canvas.width, 1)
  }
  draw()
  signFontReady.then(draw)
  return mesh
}
