import { Clock, Group, NeutralToneMapping, PCFSoftShadowMap, PerspectiveCamera, Scene, SRGBColorSpace, Vector3, WebGLRenderer } from 'three'
import { CAMERA, ECONOMY, graphicsPreset, ISLAND, RENDER, SHOOT_ZONE, TRAINERS, WATER } from './config.js'
import * as bloxity from './bloxity.js'
import { install as installInput, onKey } from './input.js'
import { installTouch } from './touch.js'
import { createPlayerBody, interpolate as interpolatePlayer, player, resetPlayer, respawn as respawnPlayer } from './player.js'
import { setCameraSensitivity, syncYawToPlayer, update as updateCamera } from './camera.js'
import { getMode, onModeChanged, toggleMode } from './modes.js'
import { bodyCount, initPhysics, stepPhysics } from './physics.js'
import { createLighting } from './lighting.js'
import { createWorld } from './world.js'
import { createPostFx } from './postfx.js'
import { setNeonBloom } from './propkit.js'
import { buildDefaultCharacter, loadBaseCharacter } from './avatar/character.js'
import { applyProportions, attachEquippedAccessories } from './avatar/loader.js'
import { disposeAnimator, makeAnimator } from './avatar/animator.js'
import { buildLobby } from './lobby.js'
import { createParticles } from './particles.js'
import { applyAim, createShooting } from './shooting.js'
import { createHud } from './hud.js'
import * as game from './game.js'
import { initNet } from './net.js'
import { installAudio, setSuspended, sfx, updateAudio } from './audio.js'

// Boot order: Bloxity SDK -> renderer -> Rapier (async wasm) -> sea + sky + lighting,
// the lego lobby, player body -> HUD, shooters -> avatar (async, swaps in when
// ready) -> loop. The SDK is optional at every step.
let lighting = null
let renderer = null
let postfx = null
let particles = null

// Settings come from the portal's settings menu (or their defaults offline).
function applySetting(key, value) {
  if (key === 'camera_sensitivity') setCameraSensitivity(value)
  else if (key === 'fullscreen') bloxity.requestFullscreen(value)
  else if (key === 'graphics_quality' && renderer) {
    const next = graphicsPreset(value)
    renderer.shadowMap.enabled = next.shadows
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, next.dpr))
    lighting?.setShadows(next)
    postfx?.configure(next)
    setNeonBloom(next.bloom)
    particles?.setBudget(next.particles)
    particles?.setBloom(next.bloom)
    postfx?.setSize(window.innerWidth, window.innerHeight)
  }
}
bloxity.onSetting(applySetting)
bloxity.init()

// --- Renderer ---------------------------------------------------------------
const preset = graphicsPreset(bloxity.settings.graphics_quality)
renderer = new WebGLRenderer({ antialias: preset.antialias, powerPreference: 'high-performance' })
renderer.outputColorSpace = SRGBColorSpace
// Neutral tone mapping keeps the lego colours as saturated as the reference (ACES greys them).
renderer.toneMapping = NeutralToneMapping
renderer.toneMappingExposure = RENDER.exposure
renderer.shadowMap.enabled = preset.shadows
renderer.shadowMap.type = PCFSoftShadowMap
renderer.setPixelRatio(Math.min(window.devicePixelRatio, preset.dpr))
document.body.appendChild(renderer.domElement)
installInput(() => bloxity.showMenu(), renderer.domElement) // Esc opens the portal menu

const scene = new Scene()
const camera = new PerspectiveCamera(CAMERA.fov, 1, CAMERA.near, CAMERA.far)
postfx = createPostFx(renderer, scene, camera)
postfx.configure(preset)
particles = createParticles(scene)
particles.setBudget(preset.particles)
particles.setBloom(preset.bloom)

function resize() {
  renderer.setSize(window.innerWidth, window.innerHeight)
  postfx.setSize(window.innerWidth, window.innerHeight)
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()
  particles.resize(window.innerHeight * renderer.getPixelRatio(), camera.fov)
}
window.addEventListener('resize', resize)
resize()

for (const key of Object.keys(bloxity.settings)) applySetting(key, bloxity.settings[key])

// --- Physics + world ---------------------------------------------------------------
bloxity.loadingStep('Starting physics')
await initPhysics()

lighting = createLighting(scene, renderer, preset)
const world = createWorld(scene) // the sea and clouds
bloxity.loadingStep('Building the lobby')
const lobby = buildLobby(scene, { addLamp: lighting.addLamp, particles })
createPlayerBody()
syncYawToPlayer()

// --- HUD + shooters ------------------------------------------------------------------
const playerGroup = new Group()
scene.add(playerGroup)

function rebirthFx() {
  const p = playerGroup.position
  for (let k = 0; k < 3; k++) particles.burst(p.x, p.y + 1 + k * 0.6, p.z, 40, { speed: 10, up: 5, colors: ['#ff2e4a', '#ffffff', '#ffd21f', '#5fd0ff'], size: 0.7, life: 1.4, gravity: -8, boost: 2 })
  hud.toast(`REBIRTH! Damage multiplier x${game.rebirthMult()}`, 3)
  sfx.rebirth()
}
function evolveFx(ammo) {
  sfx.rebirth()
  const p = playerGroup.position
  particles.burst(p.x, p.y + 1.4, p.z, 50, { speed: 8, up: 5, colors: [ammo.tip, ammo.body, '#ffffff', '#ffd21f'], size: 0.6, life: 1.2, gravity: -8, boost: 2 })
}
const hud = createHud({ camera, onRebirth: rebirthFx, onEvolve: evolveFx, onShoot: () => shooting.requestShot() })
const shooting = createShooting(scene, lobby, particles, {
  unlocked: game.trainerUnlocked,
  trainInterval: () => ECONOMY.trainInterval,
  shot: () => ({ ...game.shotResult(game.stats.damage), damage: game.stats.damage }),
  ammo: game.ammoDef,
  // SHOOT: the player steps to the firing spot behind the table, faces north and holds still.
  hold() {
    const f = SHOOT_ZONE.fireAt
    resetPlayer({ x: f.x, y: SHOOT_ZONE.floorY + 0.05, z: f.z }, Math.PI)
    player.frozen = true
    syncYawToPlayer()
  },
  release() {
    player.frozen = false
    syncYawToPlayer()
  },
})
const respawn = () => {
  if (!shooting.busy) respawnPlayer()
}

// Plot labels (UNLOCKED / locked) and Gun Shop pads follow the save.
function syncWorldToSave() {
  for (const p of lobby.plots) p.setUnlocked(game.trainerUnlocked(p.def))
  for (const s of lobby.shopPads) s.setState(game.gunState(s.gun))
}
syncWorldToSave()
game.onChange((kind) => {
  syncWorldToSave()
  if (kind === 'gun' || kind === 'all') equipGun()
})
hud.refresh()

// --- Player avatar ----------------------------------------------------------
// The Bloxity base rig (player.glb; procedural fallback if it fails), dressed
// with the signed-in player's equipped cosmetics and body proportions. It
// rebuilds on customizer edits and sign-in/out.
let avatar = null
let animator = null
let generation = 0
let avatarReady = false

function equipGun() {
  if (avatar) shooting.equip(avatar)
}

function setAvatar(next) {
  if (avatar) playerGroup.remove(avatar)
  disposeAnimator(animator)
  avatar = next
  playerGroup.add(avatar)
  shooting.equip(avatar) // reads the bind pose: before the animator moves any bone
  animator = makeAnimator(avatar)
}

setAvatar(buildDefaultCharacter()) // visible immediately; replaced once the rig loads

async function loadAvatar() {
  // The SDK fires twice per change (optimistic + confirmed); only the newest load may land.
  const mine = ++generation
  try {
    const group = await loadBaseCharacter()
    if (mine !== generation) return
    const equipped = bloxity.authState.user ? bloxity.getEquippedAvatar() : null
    await attachEquippedAccessories(group, equipped, { skinTextureUrl: bloxity.getSkinTextureUrl() })
    if (mine !== generation) return
    applyProportions(group, bloxity.authState.user ? bloxity.getProportions() : null)
    setAvatar(group)
  } finally {
    if (mine === generation) avatarReady = true
  }
}

let signedIn = null
bloxity.subscribeAuth((s) => {
  const now = !!s.user
  if (now !== signedIn) {
    signedIn = now
    loadAvatar() // also runs once at start to swap in the real rig
  }
})
bloxity.onAvatarChanged(loadAvatar)
bloxity.onProportionsChanged(() => applyProportions(avatar, bloxity.getProportions()))
bloxity.onRespawnRequest(respawn)

// Ad breaks (required): freeze the game and silence it until the break ends.
let adBreak = false
bloxity.onAdBreak((on) => {
  adBreak = on
  setSuspended(on)
})

// The game server holds all progress (net.js): it loads on join and every change is saved there.
initNet()

// --- Modes + keys --------------------------------------------------------------
onModeChanged((mode) => {
  playerGroup.visible = mode !== 'player' // first person: you are the camera
})
onKey('KeyV', toggleMode)
onKey('KeyN', () => lighting.toggleDayNight())
onKey('KeyR', respawn)
for (const k of ['KeyF', 'KeyE', 'Enter']) onKey(k, () => shooting.requestShot())
installAudio({ onKey })
installTouch({ mode: toggleMode, day: () => lighting.toggleDayNight(), respawn })

// --- Game callbacks used by the shooters --------------------------------------------
const shootCtx = {
  player,
  onDamage(def) {
    const crit = Math.random() < 0.15
    const amount = game.trainRate(def) * (crit ? 2 : 1) * hud.tapMult()
    game.addDamage(amount)
    return { amount, crit }
  },
  onWins(wins) {
    game.addWins(wins)
    const p = player.renderPosition
    hud.winsPopup({ x: p.x, y: p.y + 2.6, z: p.z }, wins)
  },
  cine: hud.cine,
  onLocked(def) {
    sfx.deny()
    hud.toast(def.robux ? `${def.name} costs ${def.robux} R$ (store not connected)` : `Need ${def.rebirths} Rebirths for ${def.name}!`)
  },
  popupAt(pos, gained) {
    if (gained === 0) hud.missPopup(pos)
    else hud.damagePopup(pos, gained.amount, gained.crit)
  },
}

// --- Ambient effects: plot sparkles, Gun Shop motes, training motes, sea glints ----------
let fxClock = 0
let seaClock = 0
const plotColors = Object.fromEntries(TRAINERS.map((t) => [t.id, t.top]))
const padColor = { equipped: '#2fa8ff', owned: '#3fe06a', locked: '#ff4b5c' }
function ambient(dt, p, training) {
  fxClock += dt
  seaClock += dt
  if (fxClock > 0.12) {
    fxClock = 0
    for (const plot of lobby.plots) {
      const d = plot.dummyPos
      if (Math.abs(d.x - p.x) > 80 || Math.abs(d.z - p.z) > 80) continue
      const a = Math.random() * Math.PI * 2
      particles.emit({ x: d.x + Math.cos(a) * 1.4, y: d.y - 1 + Math.random() * 2, z: d.z + Math.sin(a) * 1.4, vy: 0.5 + Math.random() * 0.5, color: plotColors[plot.def.id], size: 0.5, life: 1.6, sparkle: true, twinkle: 9, boost: 1.4 })
    }
    for (const s of lobby.shopPads) {
      if (Math.abs(s.x - p.x) > 60 || Math.abs(s.z - p.z) > 60) continue
      particles.emit({ x: s.x + (Math.random() - 0.5) * 1.6, y: s.y + 0.2, z: s.z + (Math.random() - 0.5) * 1.6, vy: 1 + Math.random(), color: padColor[game.gunState(s.gun)], size: 0.22, life: 1.4, boost: 1.4 })
    }
    if (training) {
      const a = Math.random() * Math.PI * 2
      particles.emit({ x: p.x + Math.cos(a) * 1.1, y: p.y + 0.2, z: p.z + Math.sin(a) * 1.1, vy: 1.6, color: plotColors[training.def.id], size: 0.35, life: 1.1, sparkle: true, boost: 1.6 })
    }
  }
  // Sun glints on the sea, outside the island.
  while (seaClock > 0.03) {
    seaClock -= 0.03
    const x = p.x + (Math.random() - 0.5) * 220
    const z = p.z + (Math.random() - 0.5) * 220
    const onLand = x > ISLAND.minX - 1 && x < ISLAND.maxX + 1 && z > ISLAND.minZ - 1 && z < ISLAND.maxZ + 1
    const onPier = Math.abs(x) < SHOOT_ZONE.halfWidth + 1 && z < ISLAND.minZ
    if (onLand || onPier) continue
    particles.emit({ x, y: WATER.level + 0.08, z, color: '#ffffff', size: 0.9 + Math.random() * 0.8, life: 0.9, sparkle: true, twinkle: 14, boost: 1.2 })
  }
}

// --- Gun Shop pads: walk on to buy or equip -----------------------------------------------
let onPad = null
function shopPads() {
  const p = player.renderPosition
  const pad = lobby.shopPads.find((s) => s.contains(p.x, p.y, p.z)) ?? null
  if (pad && pad !== onPad) {
    const before = game.stats.wins
    const r = game.buyOrEquip(pad.gun.id)
    if (r.msg) hud.toast(r.msg)
    if (r.ok) game.stats.wins < before ? sfx.buy() : sfx.click()
    else if (r.msg) sfx.deny()
    if (r.ok) particles.burst(pad.x, pad.y + 2, pad.z, 30, { speed: 6, up: 3, colors: ['#2fa8ff', '#ffffff', '#ffd21f'], size: 0.5, life: 0.9, boost: 2 })
  }
  onPad = pad
}

// --- Loop -------------------------------------------------------------------
const clock = new Clock()
let shownLoading = true
let readySince = 0
const focus = new Vector3()

renderer.setAnimationLoop(() => {
  if (adBreak) {
    clock.getDelta() // no catch-up jump when the break ends
    return
  }
  const dt = Math.min(clock.getDelta(), 0.1) // clamp huge frames (tab switch, breakpoint)
  const elapsed = clock.elapsedTime
  game.tick(dt)
  player.speedMult = game.boostMult('speed')
  player.jumpMult = game.boostMult('jump')

  stepPhysics(dt) // runs the player controller + world at the fixed rate, interpolates bodies
  interpolatePlayer()

  const p = player.renderPosition
  playerGroup.position.set(p.x, p.y, p.z)
  playerGroup.rotation.y = player.facing
  animator?.update(dt, {
    grounded: player.grounded,
    speed: Math.hypot(player.velocity.x, player.velocity.z),
    verticalVelocity: player.velocity.y,
    turn: 0,
  })

  // Aim pose first: shooting.update reads the muzzle off the posed arm, so the bullet,
  // tracers and flashes leave the gun where it is drawn (last frame's aim level).
  applyAim(animator?.rig, shooting.aimLevel(), shooting.recoil())
  const st = shooting.update(dt, elapsed, shootCtx)
  shopPads()

  updateCamera(camera, dt)
  const bulletFocus = shooting.applyCamera(camera, dt, player)
  playerGroup.visible = getMode() !== 'player' || st.cine // first person still shows the body in the aim shot
  focus.copy(bulletFocus ?? playerGroup.position)

  lobby.update(dt, elapsed, p, st.cine ? camera.position : null)
  world.update(dt, elapsed)
  ambient(dt, p, st.training ? st.plot : null)
  particles.update(dt)
  lighting.update(dt, focus)
  hud.update(dt, { ...st, playerPos: p })
  updateAudio(dt, { camera, player, cine: st.cine, night: lighting.isNight() })
  postfx.render()

  // Loading ends once the scene has drawn and the avatar has had its chance (max ~5 s).
  if (shownLoading) {
    readySince += dt
    if (avatarReady || readySince > 5) {
      shownLoading = false
      bloxity.notifyFirstFrame()
    }
  }
})

window.addEventListener('beforeunload', bloxity.teardown)

// Dev-only console hook, e.g. __game.teleport(30, 0.6, -6, Math.PI) (Wooden pad),
// __game.stats.set({ damage: 43200, wins: 47 }) (the reference screenshots).
if (import.meta.env.DEV) {
  const teleport = (x, y, z, facing = player.facing) => {
    resetPlayer({ x, y, z }, facing)
    syncYawToPlayer()
  }
  window.__game = { player, scene, renderer, camera, postfx, lobby, particles, bodies: bodyCount, toggleMode, teleport, stats: { get: () => game.stats, set: game.setStats }, playtime: game.devAddPlayTime }
}
