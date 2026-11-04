// Every tunable constant lives here; the rest of src/ holds no theme values.

// --- Identity -------------------------------------------------------------
// Game id registered on bloxity.io (My Games). CI passes VITE_GAME_SLUG from the LEGION_GAME_ID variable.
export const GAME_SLUG = import.meta.env.VITE_GAME_SLUG || 'shoot-a-bullet'
export const GAME_TITLE = 'Shoot a Bullet'

// Forces the Bloxity SDK and avatar CDN to be treated as unavailable (see .env.example).
export const DEV_MODE = import.meta.env.VITE_DEV_MODE === 'true'

// Local game server (npm start in Shoot-a-bullet-backend). Empty in deployed builds: they reach the
// backend through the Bloxity matchmaker (Legion.SDK.net.resolveEndpoint). In dev mode (no SDK) the
// default is the local server, so progress persists across reloads.
export const SERVER_URL = import.meta.env.VITE_SERVER_URL || (DEV_MODE ? 'ws://localhost:2567' : '')

// Network timing (net.js), seconds.
export const NET = {
  saveEvery: 3, // at most one saveProgress this often
  saveIdle: 30, // also save this often so the play time moves on while nothing else changes
  retry: 2, // first reconnect delay; doubles up to retryMax while the matchmaker / server is unreachable
  retryMax: 30,
  rejoin: 2, // delay before resolving a new endpoint after the room closes
}

// Bloxity's own leaderboards (trophy button). Identical to the backend's BLOXITY_BOARDS
// (src/constants.ts): the server reports the scores from the saved progress, `id` = the stat.
export const BOARDS = [
  { id: 'rebirths', label: 'Rebirths', order: 'desc', mode: 'best', format: 'compact', reset: 'none' },
  { id: 'wins', label: 'Wins', order: 'desc', mode: 'best', format: 'compact', reset: 'none' },
]

// --- World (metres: +X east, +Z south, +Y up) -------------------------------
export const GROUND_Y = 0
export const WATER = { level: -1.4, size: 1600, color: '#1ccbf2', shallow: '#8ff4ff' }
export const SPAWN = { x: 0, y: 0.05, z: 14 }
export const SPAWN_FACING = Math.PI // yaw the character faces on spawn (PI = toward -Z)

// --- Player modes (modes.js) -------------------------------------------------
// 'character' = third-person chase cam with the avatar on screen.
// 'player' = first-person, the camera is the player's eyes and the avatar is hidden.
export const MODES = ['character', 'player']
export const START_MODE = 'character'

// --- Physics (physics.js, player.js) ------------------------------------------
export const PHYSICS = {
  gravity: -22, // m/s^2 for dynamic bodies and the player
  fixedStep: 1 / 60, // s per physics tick; rendering interpolates between ticks
  maxSubSteps: 5, // a long frame never runs more ticks than this
  walkSpeed: 8, // m/s
  sprintSpeed: 14, // m/s with Shift held
  accel: 70, // m/s^2 toward the target velocity on the ground
  airAccel: 22, // m/s^2 steering while airborne
  decel: 60, // m/s^2 when no key is held
  turnSpeed: 12, // rad/s the body turns toward its heading
  jumpSpeed: 8.5, // m/s
  coyoteTime: 0.1, // s after leaving a ledge a jump still counts
  jumpBuffer: 0.12, // s a jump pressed before landing is remembered
  stepHeight: 0.45, // m autostep
  maxSlope: 50, // degrees the player can walk up
  snapToGround: 0.4, // m the controller stays glued to downward steps and slopes
  pushMass: 80, // kg the character weighs when shoving crates
  killY: -6, // sank this far: respawn
}
export const PLAYER_DIMS = { radius: 0.75, height: 1.8 } // capsule the character controller moves

// --- Look ------------------------------------------------------------------
export const RENDER = { exposure: 1.0 }
export const FOG = { near: 160, far: 620 }
// The two lighting moods lighting.js blends between (key N toggles).
export const TIME_OF_DAY = {
  transition: 2.5, // s to blend day <-> night
  day: {
    zenith: '#22c2f2',
    horizon: '#b4f0fb',
    sunColor: '#fff8ea',
    // Sun + hemi + env together keep the pale sand (#eed39c) near its own tan;
    // much more and ACES washes it (and the props) out to grey-white.
    sunIntensity: 1.9,
    sunElevation: 58, // degrees above the horizon
    sunAzimuth: -140, // degrees, 0 = from +Z (here: from the north-west, shadows fall to the south-east)
    hemiSky: '#f4fbff',
    hemiGround: '#e2e2da',
    hemiIntensity: 2.1,
    envIntensity: 0.5,
    lampIntensity: 0,
    stars: 0,
    exposure: 1.0,
  },
  night: {
    zenith: '#050b22',
    horizon: '#24345e',
    sunColor: '#9fb4ff', // the moon
    sunIntensity: 0.55,
    sunElevation: 38,
    sunAzimuth: -60,
    hemiSky: '#3a4c80',
    hemiGround: '#1a1a22',
    hemiIntensity: 0.35,
    envIntensity: 0.25,
    lampIntensity: 30,
    stars: 1,
    exposure: 1.15,
  },
}
export const LIGHT = {
  shadowRange: 40, // half-width of the sun's shadow box around the player
  lampColor: '#ffb35c',
  lampDistance: 22,
}

// Default (fallback) character look, used only when player.glb cannot load.
export const CHARACTER_COLORS = { skin: '#f2c79a', suit: '#2f6fd0', hair: '#4a2f1c' }

export const MATERIAL_PBR = {
  PLAYER: { roughness: 0.7, metalness: 0 },
  GROUND: { roughness: 0.95, metalness: 0 },
}

// --- Graphics presets, picked by the Bloxity graphics_quality setting ----------
export const GRAPHICS_PRESETS = {
  Low: { shadows: false, shadowMap: 512, antialias: false, dpr: 1, bloom: false, particles: 0.35 },
  Medium: { shadows: true, shadowMap: 1024, antialias: false, dpr: 1.25, bloom: false, particles: 0.6 },
  High: { shadows: true, shadowMap: 2048, antialias: true, dpr: 2, bloom: true, particles: 1 },
  Ultra: { shadows: true, shadowMap: 4096, antialias: true, dpr: 2, bloom: true, particles: 1 },
}

// Bloom (postfx.js): only HDR-bright pixels (above threshold, linear, before
// tone mapping) glow: neon rails, waterfall, VIP gate, particles. Sunlit sand
// stays under the threshold.
export const BLOOM = { strength: 0.6, radius: 0.35, threshold: 2.0 }
// Neon materials (propkit.js): k = HDR colour multiplier with bloom on; with
// bloom off they are capped at plainMax so they stay coloured, not white.
export const NEON = { k: 3.5, plainMax: 1.2 }

// Phones and tablets default to a lighter preset when the portal sends no value,
// and any preset is capped there (a phone at DPR 3 renders 9x the pixels; bloom
// is a full-screen multi-pass blur, so it stays off on phones).
export const COARSE_POINTER = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches
export const DEFAULT_GRAPHICS = COARSE_POINTER ? 'Medium' : 'High'
export const MOBILE_GRAPHICS_CAP = { dpr: 1.5, shadowMap: 1024, particles: 0.6 }

// The preset to render with on this device.
export function graphicsPreset(name) {
  const p = GRAPHICS_PRESETS[name] ?? GRAPHICS_PRESETS[DEFAULT_GRAPHICS]
  if (!COARSE_POINTER) return p
  const cap = MOBILE_GRAPHICS_CAP
  return { ...p, dpr: Math.min(p.dpr, cap.dpr), shadowMap: Math.min(p.shadowMap, cap.shadowMap), bloom: false, particles: Math.min(p.particles, cap.particles) }
}

// --- Touch controls (touch.js) --------------------------------------------------
export const TOUCH = {
  deadZone: 0.12, // fraction of the joystick radius that does nothing
  lookScale: 1.5, // touch drag pixels -> look, relative to a mouse pixel
  pinchPixelsPerNotch: 30, // finger spread change that equals one wheel notch
}

// --- Camera (camera.js) -------------------------------------------------------
export const CAMERA = {
  fov: 70,
  near: 0.1,
  far: 1200,
  startPitch: 0.36, // radians above the horizon (looking down on the player, like the reference)
  minPitch: -0.35,
  maxPitch: 1.25,
  firstPersonPitch: 1.45, // |pitch| limit looking up/down in player mode
  eyeHeight: 0.92, // eye height as a fraction of player height (player mode)
  distance: 10.5, // resting boom length, m
  minDistance: 2.5, // wheel in past this enters player mode
  maxDistance: 26,
  followLerp: 14, // 1/s: the one smoothing stage, on the point the camera follows
  targetHeight: 0.62, // look-at point as a fraction of player height (chest: the player sits mid-screen)
  lookSensitivity: 0.0026, // rad per pixel of mouse movement
  zoomStep: 0.9, // m per wheel notch
  zoomEase: 12, // 1/s the zoom glides to its target
  speedFov: 6, // degrees the FOV widens at sprint speed
  speedEase: 3, // 1/s the speed framing eases in and out
  clearEase: 6, // 1/s the boom eases back out once a wall stops blocking it
}

// --- Bloxity (bloxity.js, avatar/) -------------------------------------------------
// SDK setting keys this game listens for; registering a listener makes the control
// appear in the portal's settings menu.
export const SETTINGS = {
  graphics_quality: { def: DEFAULT_GRAPHICS, type: 'enum', values: ['Low', 'Medium', 'High', 'Ultra'] },
  camera_sensitivity: { def: '1', type: 'number', min: 0.1, max: 5 },
  show_fps: { def: 'false', type: 'bool' },
  fullscreen: { def: 'false', type: 'bool' },
}

// The base rig, measured from player.glb: origin at the feet, 6.4 units tall at bind pose.
export const RIG_HEIGHT = 6.4
// Bind-pose values of the rig nodes the SDK proportions drive.
export const RIG = { armOffsetX: 2, legOffsetX: 0.6, neckOffsetY: 0.6 }
// getProportions() ranges, straight from the SDK spec; clamped before they reach the scene graph.
export const PROPORTIONS = {
  height: { def: 1, min: 0.5, max: 1.6 },
  shoulderWidth: { def: 1, min: 0.5, max: 1.5 },
  armLength: { def: 1, min: 0.05, max: 3 },
  legOffsetX: { def: 1, min: -0.7, max: 5 },
  torsoScaleX: { def: 1, min: 0.3, max: 2 },
  neckHeight: { def: 1, min: 0.94, max: 1.2 },
  headScale: { def: 1, min: 0.3, max: 2.6 },
}

// Procedural animation (avatar/animator.js), ported from Clean Leaves for Loot.
// Rotations are radians in CHARACTER space: +X swings a limb backward, +Y yaws, +Z rolls.
const deg = (d) => (d * Math.PI) / 180
export const ANIM = {
  airborneDelay: 0.07, // s off the ground before the air pose (ignores a step down a ledge)
  // Walk -> run is one cycle at two depths; phase advances with distance travelled.
  locomotion: {
    minFrequency: 0.7,
    maxFrequency: 3.6,
    strideDistance: 3.8, // m per cycle
    idleSpeed: 0.6,
    walkSpeed: 2.5,
    runSpeed: 8,
    sprintSpeed: 13,
    hipSwing: { walk: deg(22), run: deg(42), sprint: deg(56) },
    kneeBend: { walk: deg(30), run: deg(58), sprint: deg(72) },
    armSwing: { walk: deg(18), run: deg(36), sprint: deg(52) },
    elbowBend: { walk: deg(14), run: deg(44), sprint: deg(70) },
    torsoTwist: { walk: deg(4), run: deg(7), sprint: deg(9) },
    torsoLean: { walk: deg(3), run: deg(10), sprint: deg(18) },
    headCounterTwist: { walk: deg(2), run: deg(4), sprint: deg(5) },
    torsoRoll: { walk: deg(2), run: deg(3), sprint: deg(3) },
    bob: { walk: 0.03, run: 0.07, sprint: 0.09 }, // m, on the avatar root
    bankAngle: deg(9),
    bankRate: 8,
  },
  idle: {
    breathFrequency: 0.35,
    breathAmount: deg(1.8),
    breathBob: 0.007,
    basePose: {
      ArmL1: { x: deg(-4), z: deg(8) },
      ArmL2: { x: deg(12) },
      ArmR1: { x: deg(-4), z: deg(-8) },
      ArmR2: { x: deg(12) },
      LegL1: { x: deg(-4) },
      LegR1: { x: deg(4) },
    },
  },
  airborne: {
    rise: {
      LegL1: { x: deg(-38) }, LegR1: { x: deg(8) }, LegL2: { x: deg(62) }, LegR2: { x: deg(40) },
      ArmL1: { x: deg(-40), z: deg(34) }, ArmR1: { x: deg(-30), z: deg(-34) },
      ArmL2: { x: deg(30) }, ArmR2: { x: deg(30) }, Spine1: { x: deg(6) },
    },
    fall: {
      LegL1: { x: deg(-14) }, LegR1: { x: deg(10) }, LegL2: { x: deg(22) }, LegR2: { x: deg(18) },
      ArmL1: { x: deg(-70), z: deg(40) }, ArmR1: { x: deg(-60), z: deg(-40) },
      ArmL2: { x: deg(20) }, ArmR2: { x: deg(20) }, Spine1: { x: deg(-4) },
    },
    velocityReference: 8, // m/s vertical speed that reads as fully rising / falling
  },
  landing: {
    duration: 0.16,
    pose: {
      LegL1: { x: deg(-34) }, LegR1: { x: deg(-34) }, LegL2: { x: deg(58) }, LegR2: { x: deg(58) },
      ArmL1: { x: deg(-18), z: deg(20) }, ArmR1: { x: deg(-18), z: deg(-20) }, Spine1: { x: deg(14) },
    },
    bobY: -0.2,
  },
  transitions: { toLocomotion: 0.14, toAirborne: 0.12, toLanding: 0.06 }, // s to blend a pose change
}

export const FONT_FAMILY = 'Fredoka'

export function clamp(n, min, max) {
  return n < min ? min : n > max ? max : n
}

// Coerce one raw SDK string against its SETTINGS entry.
export function coerceSetting(key, raw) {
  const spec = SETTINGS[key]
  if (!spec) return raw
  const value = raw === '' || raw == null ? spec.def : raw
  if (spec.type === 'bool') return value === 'true' || value === true
  if (spec.type === 'enum') return spec.values.includes(value) ? value : spec.def
  const n = Number(value)
  return clamp(Number.isFinite(n) ? n : Number(spec.def), spec.min, spec.max)
}

// =============================================================================
// Shoot a Bullet: the lego lobby (lobby.js) and the game rules (game.js)
// =============================================================================

// --- Lego look (lego.js) -----------------------------------------------------------
export const STUD = 0.5 // m between studs; every lego surface tiles at this pitch
export const CHECKER = 7.5 // m per square of the two-tone green baseplate (15 studs)
export const PALETTE = {
  grassA: '#8fe254',
  grassB: '#73cd3f',
  lavender: '#f1e6fb', // paths, perimeter wall, pavilion pillars
  lavenderDark: '#d4c6ef',
  yellow: '#ffdc1f',
  red: '#ff4b5c',
  pinkRed: '#ff6f86',
  white: '#f7f7fb',
  stone: '#8f93a6', // gun shop floor
  stoneDark: '#7a7e92',
  wood: '#b0703c',
  woodDark: '#8a5229',
  trunk: '#c6743a',
  leaf: '#a4e646',
  leafDark: '#94d93a',
  bush: '#69d64a',
  bushDark: '#58c43c',
  flower: '#ff9dcc',
  rock: '#e9e9f0',
  rockDark: '#d4d4de',
}

// --- Island layout (metres: +X east, +Z south; north = -Z is the Shoot Zone) ----------
export const ISLAND = { minX: -60, maxX: 88, minZ: -24, maxZ: 62, depth: 3, wallHeight: 1.5, wallThick: 1.5, fenceHeight: 4 }
// Paths: [x0, z0, x1, z1] axis-aligned lavender strips on the grass.
export const PATHS = [
  [-3, -12, 3, 40], // main north-south path, spawn -> Shoot Zone / Frost
  [-20, 1, 3, 7], // west to the Gun Shop
  [3, -4, 82, 2], // east, along the front of the rebirth plots
  [-30, 33, 82, 39], // south, in front of the premium plots
  [76, 2, 82, 33], // east side, joins the two
]
export const SPAWN_PAD = { x: -11, z: 4, w: 5, d: 4 } // the yellow plate on the west path

// --- Shoot Zone pavilion + range (north) -------------------------------------------------
export const SHOOT_ZONE = {
  halfWidth: 20,
  frontZ: -12, // south edge of the pavilion platform
  padBackZ: -21, // the yellow shoot pad runs frontZ..padBackZ
  backZ: -46, // north end of the red/white checker floor
  floorY: 0.4, // platform top
  roofY: 11.5,
  fireAt: { x: -0.45, z: -21.6 }, // where SHOOT puts the player (gun hand over the table), facing north
}

// --- The smash range (range.js): one long wooden table running north from the Shoot
// Zone pad, carrying ZONES.length x RANGE.perZone objects. The bullet smashes every
// object whose `need` its Damage reaches and sticks in the first one it cannot break.
export const RANGE = {
  halfWidth: 14, // each zone's platform either side of the table
  tableHalf: 1.6, // half the table top's width
  tableTop: 1.0, // table top above the Shoot Zone floor (under the gun: the bullet leaves the barrel over it)
  tableStartZ: -23.6,
  firstZ: -26, // the first object
  spacing: 2.4, // m between objects
  zoneGap: 7, // extra m at each zone gate
  perZone: 20,
  bulletLift: 0.75, // bullet height above the table top (mid-object)
}
// Object i (0-based along the table) breaks when Damage >= need(i) and pays wins(i):
//   need(i) = needBase * needGrowth^i,  wins(i) = winsBase * winsGrowth^i  (x rebirth multiplier)
// Tuned so 53.1K Damage smashes 89 objects for about 3.2K Wins.
export const SMASH = { needBase: 5, needGrowth: 1.11, winsBase: 0.89, winsGrowth: 1.063 }
// The flight: bullet speed (m/s) slows from `speed` toward `minSpeed` near its stop.
// aimTime = s of aiming before the trigger; then the bullet leaves the barrel in slow
// motion for exitTime s (starting at exitSpeed m/s) before it accelerates and the cam cuts to it.
// Hit-stop (game feel): breaking into a new zone freezes the shot for gateStop s, the final
// impact for stuckStop s; time runs at stopScale meanwhile (effects and the HUD keep moving).
export const BULLET = { speed: 46, minSpeed: 16, aimTime: 0.6, exitTime: 1.0, exitSpeed: 2.5, stuckTime: 2.6, returnTime: 0.8, gateStop: 0.09, stuckStop: 0.16, stopScale: 0.08 }

// Zones along the table (original themes). `kind` = the object built by range.js;
// colours: floor/alt (checker), wall (side walls), gate/gateIn (the nested arch),
// banner = how the zone name is drawn by the HUD ({ fill, outline } or per-letter `letters`).
export const ZONES = [
  { id: 'targets', name: 'TARGETS', kind: 'target', floor: '#ffffff', alt: '#ff6f86', wall: '#ff6f86', gate: '#ff4b5c', gateIn: '#ffffff', debris: ['#ffffff', '#2fc3ff', '#ff5fa8'], banner: { fill: '#ffffff', outline: '#e8264e' } },
  { id: 'slime', name: 'SLIME', kind: 'slime', floor: '#7ee04a', alt: '#5fca36', wall: '#3fae2a', gate: '#9aa0b4', gateIn: '#ff7fd0', debris: ['#7dff3a', '#4fe02a', '#d43ff0', '#c8ff9a'], banner: { fill: '#8dff3a', outline: '#1f5a12', font: 'slime' } },
  { id: 'squishy', name: 'SQUISHY', kind: 'squishy', floor: '#fff1b8', alt: '#ffe48a', wall: '#ffb8d8', gate: '#a86a3a', gateIn: '#ff5a5a', debris: ['#ff6fb8', '#2fb4ff', '#ff3b3b', '#3fe06a', '#ffd21f', '#b56bff'], banner: { letters: ['#ff4fa8', '#2fa8ff', '#ffd21f', '#3fd65a', '#ff5a3a', '#b56bff', '#ff4fa8', '#2fa8ff'], outline: '#ffffff', ink: '#2a1a3a' } },
  { id: 'cardboard', name: 'CARDBOARD', kind: 'cardboard', floor: '#f0c890', alt: '#e4b77a', wall: '#3f6fe0', gate: '#8a5a32', gateIn: '#ff4b4b', debris: ['#e8b070', '#d0965a', '#f5d3a0', '#2a2a30'], banner: { fill: '#e8b070', outline: '#4a2a10', font: 'western' } },
  { id: 'wood', name: 'WOOD', kind: 'wood', floor: '#7cd84a', alt: '#68c43c', wall: '#8a5229', gate: '#6a3a1a', gateIn: '#ffb03a', debris: ['#b0703c', '#8a5229', '#e8b070', '#5fbf3a'], banner: { fill: '#c98040', outline: '#3a1a08', font: 'western' } },
  { id: 'ice', name: 'ICE', kind: 'ice', floor: '#eaf8ff', alt: '#cfeeff', wall: '#9fe0ff', gate: '#5ab8e8', gateIn: '#ffffff', debris: ['#bff0ff', '#ffffff', '#7fd8ff'], banner: { fill: '#bff0ff', outline: '#1a4a8a' } },
  { id: 'brick', name: 'BRICK', kind: 'brick', floor: '#c9c9d2', alt: '#b6b6c2', wall: '#d0482e', gate: '#7a7e92', gateIn: '#ff8a3a', debris: ['#d0482e', '#b03a24', '#e8e0d0', '#8a2a1a'], banner: { fill: '#ff5a3a', outline: '#4a0a00' } },
  { id: 'steel', name: 'STEEL', kind: 'steel', floor: '#6a6e7c', alt: '#5a5e6c', wall: '#ffd21f', gate: '#2a2a30', gateIn: '#ffd21f', debris: ['#c8ccd8', '#8a8e9c', '#ffd21f', '#2a2a30'], banner: { fill: '#dfe4ee', outline: '#22252e' } },
  { id: 'diamond', name: 'DIAMOND', kind: 'diamond', floor: '#5a2a9a', alt: '#4a1f84', wall: '#b56bff', gate: '#2fe0ff', gateIn: '#ff5fe0', debris: ['#5ff0ff', '#ffffff', '#b56bff', '#ff8af0'], banner: { letters: ['#5ff0ff', '#9af6ff', '#ffffff', '#c8a0ff', '#5ff0ff', '#9af6ff', '#ffffff'], outline: '#1a0a4a', ink: '#1a0a4a' } },
]

// --- Training plots: stand on a plot's pad to gain its damage every second -------------
// `robux` = premium plot (shown locked, store not connected).
// `at` = [x, z] centre, `face` = yaw of the plot's front (0 = faces +Z / south).
export const PLOT = { w: 11, d: 15, scale: 0.6 } // plot footprint in build units (front = pad end); scale = units -> metres (6.6 x 9 m, like the reference)
export const TRAINERS = [
  { id: 'wooden', name: 'WOODEN', mult: 1, rebirths: 0, color: '#d9782c', top: '#f0954a', title: '#ff9d3b', theme: 'wood', at: [27, -9.5], face: 0 },
  { id: 'emerald', name: 'EMERALD', mult: 2, rebirths: 1, color: '#16a24a', top: '#2ccc5e', title: '#39e36a', theme: 'emerald', at: [35, -9.5], face: 0 },
  { id: 'sapphire', name: 'SAPPHIRE', mult: 4, rebirths: 3, color: '#1f6ae0', top: '#36a2ff', title: '#47a6ff', theme: 'sapphire', at: [43, -9.5], face: 0 },
  { id: 'iron', name: 'IRON', mult: 8, rebirths: 5, color: '#a4a7b4', top: '#e4e4ec', title: '#f2f2f8', theme: 'iron', at: [51, -9.5], face: 0 },
  { id: 'golden', name: 'GOLDEN', mult: 15, rebirths: 8, color: '#f0b70c', top: '#ffe02a', title: '#ffd21f', theme: 'golden', at: [59, -9.5], face: 0 },
  { id: 'amber', name: 'AMBER', mult: 30, rebirths: 11, color: '#f0620c', top: '#ff9a2a', title: '#ff8a1f', theme: 'amber', at: [67, -9.5], face: 0 },
  { id: 'ruby', name: 'RUBY', mult: 60, rebirths: 14, color: '#d0102e', top: '#ff2e4a', title: '#ff3550', theme: 'ruby', at: [75, -9.5], face: 0 },
  { id: 'amethyst', name: 'AMETHYST', mult: 100, rebirths: 17, color: '#8a2be2', top: '#b04dff', title: '#c86bff', theme: 'amethyst', at: [8, 44.5], face: Math.PI },
  { id: 'frost', name: 'FROST', mult: 250, rebirths: 20, color: '#3fb9ea', top: '#c8f2ff', title: '#dff8ff', theme: 'frost', at: [0, 44.5], face: Math.PI },
  { id: 'obsidian', name: 'OBSIDIAN', mult: 500, rebirths: 25, color: '#1d1c26', top: '#34323f', title: '#ffffff', theme: 'obsidian', at: [-8, 44.5], face: Math.PI },
]

// Plot looks (plots.js), keyed by TRAINERS[i].theme. rim = border bricks (two shades),
// floor / inner = the walkway round the pad and the rest of the inside, ped = the two
// pedestal tiers, dummy = training dummy colours, pad = the pad inset, fx = ambient effect.
export const PLOT_THEMES = {
  wood: { rim: ['#e8862f', '#d06f1f'], base: '#b8601a', floor: '#f4a85a', inner: '#e0903f', ped: ['#f6a24a', '#e07f2a'], dummy: { body: '#f39a3c', dark: '#cf6f1c', emblem: '#ffd59a', stand: '#9a5a2a' }, pad: '#b86424', fx: 'fireflies' },
  emerald: { rim: ['#26b85a', '#159842'], base: '#0f7a34', floor: '#46d978', inner: '#1f9a4c', ped: ['#45e07c', '#22b356'], dummy: { body: '#3fe07a', dark: '#1a9a48', emblem: '#d2ffe0', stand: '#e08a3a' }, pad: '#0f6a30', fx: 'leaves' },
  sapphire: { rim: ['#3a96ff', '#1f6ae0'], base: '#1450c0', floor: '#8ad8ff', inner: '#2a74e8', ped: ['#2563e0', '#f0943a'], dummy: { body: '#2f8cff', dark: '#1a55c0', emblem: '#c6ebff', stand: '#f0943a' }, pad: '#1240a8', fx: 'bubbles' },
  iron: { rim: ['#ececf2', '#cfd1dc'], base: '#a9acb8', floor: '#9497a6', inner: '#73768a', ped: ['#e0e2ea', '#bcbec9'], dummy: { body: '#f6f6fa', dark: '#cfd1dc', emblem: '#ff9a3a', stand: '#f0943a' }, pad: '#55586a', fx: 'sparks' },
  golden: { rim: ['#ffd726', '#f2b90c'], base: '#d9a00a', floor: '#ffe67a', inner: '#f8cc2a', ped: ['#ffd726', '#eaa90c'], dummy: { body: '#ffd21f', dark: '#e0a00c', emblem: '#fff3b8', stand: '#e8620c' }, pad: '#e8620c', fx: 'glitter' },
  amber: { rim: ['#ff8f24', '#ea660e'], base: '#c4500a', floor: '#ffb452', inner: '#f47e1e', ped: ['#ff9d30', '#d6580c'], dummy: { body: '#ff9d30', dark: '#d6580c', emblem: '#ffe3a8', stand: '#7a4524' }, pad: '#c04a0a', fx: 'embers' },
  ruby: { rim: ['#ea2440', '#b8102c'], base: '#8a0a1e', floor: '#ff5266', inner: '#b0142c', ped: ['#ff3550', '#c8102e'], dummy: { body: '#ff3550', dark: '#b8102c', emblem: '#ffb8c2', stand: '#3a2020' }, pad: '#7a0a1a', fx: 'embers' },
  amethyst: { rim: ['#a448ff', '#7f26de'], base: '#5e14b0', floor: '#cc92ff', inner: '#8e32e6', ped: ['#b456ff', '#8a2be2'], dummy: { body: '#b456ff', dark: '#7a22d8', emblem: '#ffd0ff', stand: '#ff9adf' }, pad: '#5a1aa0', fx: 'sparkle' },
  frost: { rim: ['#f0fcff', '#a8e8ff'], base: '#6fc8f0', floor: '#e4f9ff', inner: '#9fe0ff', ped: ['#c8f2ff', '#86d8ff'], dummy: { body: '#62d2ff', dark: '#2fa8e0', emblem: '#ffffff', stand: '#c8f2ff' }, pad: '#5ab8e8', fx: 'snow' },
  obsidian: { rim: ['#6e6c7c', '#4e4c5c'], base: '#2e2c38', floor: '#33313e', inner: '#1f1e28', ped: ['#3a3846', '#22212b'], dummy: { body: '#2e2c3a', dark: '#16151c', emblem: '#c86bff', stand: '#16151c' }, pad: '#121118', fx: 'void' },
}

// --- Gun Shop (west): walk onto a pad to buy (with Wins) or equip a gun -----------------
// `mult` multiplies all training. `row` 0 = front floor, 1 = raised back tier.
export const GUN_SHOP = { minX: -37, maxX: -20, minZ: -8, maxZ: 16, ledge: 1, floorY: 0.8, tierX: -29.5, tierY: 2.0, tierZ: [-7, 15], frontX: -24, backX: -32.6 }
export const GUNS = [
  { id: 'glock', name: 'Glock 17', mult: 1, cost: 0, kind: 'pistol', body: '#b89b6a', accent: '#2a2a30', row: 0, z: 11.2 },
  { id: 'colt', name: 'Colt 1911', mult: 2, cost: 20, kind: 'pistol', body: '#2e2c2e', accent: '#7a4524', frame: '#2e2c2e', row: 0, z: 7.6 },
  { id: 'deagle', name: 'Desert Eagle', mult: 3, cost: 600, kind: 'magnum', body: '#e3e3ea', accent: '#2a2a30', row: 0, z: 4 },
  { id: 'uzi', name: 'UZI', mult: 4, cost: 1500, kind: 'uzi', body: '#2a2a30', accent: '#45454f', row: 0, z: 0.4 },
  { id: 'mp5', name: 'MP5', mult: 5, cost: 6000, kind: 'mp5', body: '#2a2a30', accent: '#7a4524', frame: '#22222a', row: 0, z: -3.2 },
  { id: 'kriss', name: 'Kriss Vector', mult: 6, cost: 25e3, kind: 'vector', body: '#4a1f24', accent: '#2a2a30', row: 1, z: 12.6 },
  { id: 'ak47', name: 'AK-47', mult: 8, cost: 75e3, kind: 'ak', body: '#2a2a30', accent: '#b0602a', row: 1, z: 9.1 },
  { id: 'scar', name: 'SCAR-L', mult: 10, cost: 25e4, kind: 'scar', body: '#b88a55', accent: '#2a2a30', row: 1, z: 5.6 },
  { id: 'aa12', name: 'AA-12', mult: 12, cost: 8e5, kind: 'shotgun', body: '#2a2a30', accent: '#3b3b44', row: 1, z: 2.1 },
  { id: 'm249', name: 'M249', mult: 15, cost: 2e6, kind: 'lmg', body: '#3d3f33', accent: '#2a2a30', frame: '#4a5a30', row: 1, z: -1.4 },
  { id: 'barrett', name: 'Barrett M82', mult: 20, cost: 5e6, kind: 'sniper', body: '#3a3c44', accent: '#2a2a30', row: 1, z: -4.9 },
]

// --- Rules (game.js) -----------------------------------------------------------------
export const ECONOMY = {
  baseRate: 1, // damage per training shot on the 1x plot with the x1 gun (Wooden + Colt 1911 = +2)
  trainInterval: 1, // s between training shots at the dummy
  rebirthBonus: 1, // each rebirth adds this to the training multiplier (1 + rebirths)
  levels: [0, 20, 80, 200, 500, 1000, 2000, 3500, 5500, 8000], // the damage curve from LEVEL 1 to the max level (stretched over more levels after rebirths)
  levelScale: 3, // each rebirth multiplies the level thresholds by this
  maxLevel: 10, // max LEVEL before the first rebirth (rebirth there)
  maxLevelPerRebirth: 10, // each rebirth raises the max LEVEL by this (Rebirth window: Max Lvl 10 -> 20)
}

// --- Playtime Gifts (the Rewards tile) -------------------------------------------------
// One card per gift, ready after `at` minutes of play this visit (they reset each visit).
// kind 'wins' pays `amount` Wins; kind 'boost' runs `boosts` for `minutes`.
// card = card colour (hud.css .gc-<card>), icon = hud.js icon name.
export const PLAYTIME_GIFTS = [
  { id: 'wins100', title: 'Wins', kind: 'wins', amount: 100, at: 1, card: 'gold', icon: 'trophy' },
  { id: 'speed', title: 'Speed Boost', kind: 'boost', boosts: ['speed'], minutes: 2, at: 2, card: 'magenta', icon: 'wingBlue' },
  { id: 'wins250', title: 'Wins', kind: 'wins', amount: 250, at: 4, card: 'gold', icon: 'trophy' },
  { id: 'jump', title: 'Jump Boost', kind: 'boost', boosts: ['jump'], minutes: 2, at: 6, card: 'sky', icon: 'wingRed' },
  { id: 'wins500', title: 'Wins', kind: 'wins', amount: 500, at: 8, card: 'gold', icon: 'trophy' },
  { id: 'winsBoost', title: 'Wins Boost', kind: 'boost', boosts: ['wins'], minutes: 5, at: 12, card: 'gold', icon: 'potionGold' },
  { id: 'wins1k', title: 'Wins', kind: 'wins', amount: 1000, at: 20, card: 'gold', icon: 'trophy' },
  { id: 'allInOne', title: 'All In One', kind: 'boost', boosts: ['speed', 'jump', 'wins', 'damage'], minutes: 10, at: 30, card: 'rainbow', icon: 'potionRainbow' },
]
// What an active boost multiplies: walk/sprint speed, jump height, Wins per shot, Damage per training shot.
export const BOOSTS = { speed: 2, jump: 2, wins: 2, damage: 2 }

// --- Store: things bought with Wins instead of Robux ---------------------------------
// kind 'boost' runs BOOSTS[boost] for `minutes` (stacks onto the time left, per visit);
// kind 'perk' is a permanent unlock (saved as `perks`).
// Auto Wins: every `every` s the perk pays `share` of what a Shoot Zone bullet pays right now.
export const AUTO_WINS = { every: 30, share: 0.25 }
export const SHOP = [
  { id: 'wins2x', label: '2X WINS', sub: 'Double every Win for 10 min', kind: 'boost', boost: 'wins', minutes: 10, cost: 25e3, color: 'gold' },
  { id: 'damage2x', label: '2X DAMAGE', sub: 'Double every training shot for 10 min', kind: 'boost', boost: 'damage', minutes: 10, cost: 25e3, color: 'rainbow' },
  { id: 'autowins', label: 'AUTO WINS', sub: 'Earn Wins on your own, even while you are away', kind: 'perk', cost: 25e6, color: 'gold' },
  { id: 'autorebirth', label: 'AUTO REBIRTH', sub: 'Rebirth automatically at MAX', kind: 'perk', cost: 50e6, color: 'pink' },
]

// --- Evolve Ammo: each tier multiplies the Wins a Shoot Zone bullet pays ---------------
// The first tier is what you start with. tip / body = bullet colours (window icon + the
// flying bullet). cost = Wins to evolve INTO that tier.
export const AMMO = [
  { id: 'basic', name: 'Basic Ammo', wins: 1, cost: 0, tip: '#e8b23a', body: '#d99a22' },
  { id: 'fire', name: 'Fire Ammo', wins: 1.25, cost: 250, tip: '#ff4a12', body: '#ff5f1f' },
  { id: 'ice', name: 'Ice Ammo', wins: 1.5, cost: 1000, tip: '#9a8f2c', body: '#a99d36' },
  { id: 'toxic', name: 'Toxic Ammo', wins: 2, cost: 5000, tip: '#3fd61f', body: '#5fe83a' },
  { id: 'volt', name: 'Volt Ammo', wins: 3, cost: 25e3, tip: '#ffe01f', body: '#2fb8ff' },
  { id: 'shadow', name: 'Shadow Ammo', wins: 5, cost: 15e4, tip: '#3a2a5a', body: '#6a4aa8' },
  { id: 'plasma', name: 'Plasma Ammo', wins: 8, cost: 1e6, tip: '#ff3df0', body: '#b83dff' },
  { id: 'galaxy', name: 'Galaxy Ammo', wins: 12, cost: 1e7, tip: '#1a2a8a', body: '#3a6bff' },
]
export const NEW_WORLD_AT = Date.UTC(2026, 10, 7, 12, 0, 0) // the ??? board counts down to this
// Shooters standing on the Shoot Zone pad: none; remote players fill it when online.
export const NPCS = []

// --- Sound (audio.js): everything is synthesised at runtime, no files -----------------
export const AUDIO = {
  volume: 0.85, // master, 0..1 (perceptual: squared before use)
  bus: { sfx: 1, ui: 0.55, amb: 0.32 }, // bus levels
  reverb: { seconds: 1.6, decay: 1.1, preDelay: 0.012, send: 0.22 }, // open-air slap + tail
  hearing: { ref: 8, max: 90, rolloff: 1.15 }, // m: full volume inside ref, silent past max
  maxVoices: 96, // low-priority sounds (NPC shots, crackle, birds) stop at 60% of this
  duckInCine: 0.35, // ambience level while the shot cinematic plays
  stepEvery: 1.9, // m walked per footstep (half an animator stride)
}
// Which gunshot each gun kind (GUNS[i].kind, guns.js) fires.
export const GUN_SOUND = { pistol: 'pistol', magnum: 'heavy', uzi: 'smg', mp5: 'smg', vector: 'smg', smg: 'smg', ak: 'rifle', rifle: 'rifle', scar: 'rifle', lmg: 'rifle', shotgun: 'shotgun', sniper: 'sniper' }
// How each gun class (GUN_SOUND values) looks and feels when it fires: muzzle flash size
// and colour, arm recoil (rad), camera shake, smoke puffs, ejected casing size / colour,
// and how much cannon boom the Shoot Zone blast adds under the gun's own report.
export const GUN_FX = {
  pistol: { flash: 1, flashColor: '#ffd27a', recoil: 0.35, shake: 0.35, smoke: 1, shell: 1, shellColor: '#e8b23a', boom: 0.55, rack: 1 },
  heavy: { flash: 1.4, flashColor: '#ffc06a', recoil: 0.6, shake: 0.55, smoke: 1.4, shell: 1.2, shellColor: '#d9a030', boom: 0.8, rack: 0.9 },
  smg: { flash: 0.9, flashColor: '#ffe08a', recoil: 0.22, shake: 0.3, smoke: 0.8, shell: 0.9, shellColor: '#e8b23a', boom: 0.5, rack: 1.15 },
  rifle: { flash: 1.3, flashColor: '#ffcf6a', recoil: 0.4, shake: 0.5, smoke: 1.2, shell: 1.35, shellColor: '#e0a828', boom: 0.8, rack: 0.95 },
  shotgun: { flash: 1.8, flashColor: '#ffb04a', recoil: 0.75, shake: 0.7, smoke: 2, shell: 1.6, shellColor: '#d02a2a', boom: 1, rack: 0.8 },
  sniper: { flash: 2, flashColor: '#ffc85a', recoil: 0.7, shake: 0.8, smoke: 1.8, shell: 1.8, shellColor: '#d9a030', boom: 1.1, rack: 0.75 },
}
