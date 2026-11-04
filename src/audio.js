// Game sound, all synthesised at runtime (no files).
//
// One AudioContext, made on the first user gesture (browsers refuse audio before
// one). One-shots are rendered once into AudioBuffers with OfflineAudioContext
// (a few variants each, so repeats never sound identical) and played back with
// a little random pitch, a stereo pan and, for things in the world, distance
// attenuation + air absorption from the camera. Two realtime layers run on top:
// the bullet's flight roar (follows its speed) and the island ambience (sea,
// wind, birds by day), which ducks while the shot cinematic plays.
//
// Graph:  sfx ─┬───────────────────────────┐
//              └─ reverb send ─ convolver ──┤
//         ui ──────────────────────────────┼─ master ─ glue comp ─ limiter ─ out
//         amb (ducks) ─────────────────────┘
//
// The bank renders at boot (OfflineAudioContext needs no gesture), so the very first
// press already has every sound ready.
//
// Use: installAudio() once, updateAudio(dt, state) every frame, sfx.<name>(...)
// for one-shots, flight.start/speed/stop for the bullet. M or the speaker
// button toggles mute (saved).
import './audio.css'
import { AUDIO, GUN_FX, GUN_SOUND } from './config.js'

const A = { ctx: null, master: null, sfx: null, ui: null, amb: null, verbIn: null, bank: {}, voices: 0, started: false }
const listener = { x: 0, y: 0, z: 0, rx: 1, ry: 0, rz: 0 }
const last = {} // name -> ctx time it last played (rate limits)
const lastPick = {} // name -> last variant index (no immediate repeats)
const played = {} // name -> times played (debug)
// Dev console: what the engine is doing.
export const audioDebug = () => ({ state: A.ctx?.state ?? 'not started', sounds: Object.keys(A.bank).length, of: Object.keys(RECIPES).length, voices: A.voices, played: { ...played } })

// --- Mute + volume ------------------------------------------------------------------
// Nothing is stored in the browser: mute lasts this page only. `suspended` is the Bloxity ad break.
let muted = false
let suspended = false
const level = () => (muted || suspended ? 0 : AUDIO.volume * AUDIO.volume)
const muteListeners = new Set()
export const isMuted = () => muted
export function setMuted(on) {
  muted = !!on
  if (A.master) A.master.gain.setTargetAtTime(level(), A.ctx.currentTime, 0.04)
  for (const fn of muteListeners) fn(muted)
}
export const toggleMuted = () => setMuted(!muted)
// Silences everything while a Bloxity ad plays, without touching the player's own mute.
export function setSuspended(on) {
  suspended = !!on
  if (A.master) A.master.gain.setTargetAtTime(level(), A.ctx.currentTime, 0.04)
}

// --- Seeded random + noise tables -----------------------------------------------------
function rng(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const SR = 48000 // the bank's sample rate (playback resamples if the device differs)
const NOISE = {} // kind -> Float32Array
function makeNoise(sr) {
  const len = Math.floor(sr * 3)
  const r = rng(99)
  const white = new Float32Array(len)
  const pink = new Float32Array(len)
  const brown = new Float32Array(len)
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, br = 0
  for (let i = 0; i < len; i++) {
    const w = r() * 2 - 1
    white[i] = w * 0.6
    b0 = 0.99886 * b0 + w * 0.0555179
    b1 = 0.99332 * b1 + w * 0.0750759
    b2 = 0.969 * b2 + w * 0.153852
    b3 = 0.8665 * b3 + w * 0.3104856
    b4 = 0.55 * b4 + w * 0.5329522
    b5 = -0.7616 * b5 - w * 0.016898
    pink[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.12
    b6 = w * 0.115926
    br = (br + 0.02 * w) / 1.02
    brown[i] = br * 3.2
  }
  // Crossfade the ends so the realtime loops have no click at the seam.
  for (const d of [white, pink, brown]) {
    const f = 4096
    for (let i = 0; i < f; i++) d[i] = d[i] * (i / f) + d[len - f + i] * (1 - i / f)
  }
  NOISE.white = white
  NOISE.pink = pink
  NOISE.brown = brown
}

// --- Offline synthesis kit -------------------------------------------------------------
// Each recipe gets a kit bound to one OfflineAudioContext and a seeded random.
function kit(oc, R) {
  const bufs = {}
  const noiseBuf = (kind) => {
    if (!bufs[kind]) {
      const d = NOISE[kind]
      const b = oc.createBuffer(1, d.length, oc.sampleRate)
      b.copyToChannel(d, 0)
      bufs[kind] = b
    }
    return bufs[kind]
  }
  const k = {
    R,
    noise(kind = 'white', t0 = 0, dur = 1) {
      const s = oc.createBufferSource()
      s.buffer = noiseBuf(kind)
      s.loop = true
      s.start(t0, R() * 2)
      s.stop(t0 + dur)
      return s
    },
    osc(type, f0, f1 = f0, t0 = 0, dur = 0.2) {
      const o = oc.createOscillator()
      o.type = type
      o.frequency.setValueAtTime(f0, t0)
      if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t0 + dur)
      o.start(t0)
      o.stop(t0 + dur + 0.05)
      return o
    },
    filt(type, f, Q = 0.7, f1 = null, t0 = 0, dur = 0.2) {
      const b = oc.createBiquadFilter()
      b.type = type
      b.Q.value = Q
      b.frequency.setValueAtTime(f, t0)
      if (f1) b.frequency.exponentialRampToValueAtTime(f1, t0 + dur)
      return b
    },
    // 0 -> peak in `a` s, then exponential decay over `d` s.
    env(peak, t0 = 0, a = 0.002, d = 0.1) {
      const g = oc.createGain()
      g.gain.setValueAtTime(0, 0)
      g.gain.setValueAtTime(0, t0)
      g.gain.linearRampToValueAtTime(peak, t0 + a)
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + a + d)
      return g
    },
    // Soft clipper (tanh), for punch on gunshots and impacts.
    drive(amount = 2) {
      const ws = oc.createWaveShaper()
      const n = 1024
      const c = new Float32Array(n)
      for (let i = 0; i < n; i++) {
        const x = (i / (n - 1)) * 2 - 1
        c[i] = Math.tanh(x * amount) / Math.tanh(amount)
      }
      ws.curve = c
      return ws
    },
    chain(...nodes) {
      for (let i = 0; i < nodes.length - 1; i++) nodes[i].connect(nodes[i + 1])
      return nodes[nodes.length - 1]
    },
    // A struck resonant body: sine partials, each with its own level and decay.
    bell(out, t0, partials, { attack = 0.001, detune = 0 } = {}) {
      for (const [f, vol, d] of partials) k.chain(k.osc('sine', f * (1 + (R() - 0.5) * detune)), k.env(vol, t0, attack, d), out)
    },
    // n short filtered noise ticks scattered over `span` s (crumples, splinters, grit).
    crackles(out, t0, span, n, fLo, fHi, vol, decay = 0.012, Q = 2.5) {
      for (let i = 0; i < n; i++) {
        const t = t0 + R() * span
        k.chain(k.noise('white', t, decay * 4 + 0.01), k.filt('bandpass', fLo + R() * (fHi - fLo), Q), k.env(vol * (0.4 + R() * 0.6), t, 0.0005, decay * (0.6 + R() * 0.8)), out)
      }
    },
  }
  return k
}

const N = (n) => 440 * Math.pow(2, (n - 69) / 12) // MIDI note -> Hz

// --- Recipes -----------------------------------------------------------------------------
// Gunshots: a supersonic crack, the muzzle body, the low thump, an open-air tail with a
// slap echo off the pavilion, and the action cycling.
const GUNS = {
  pistol: { f: 1, crack: 0.9, body: 0.8, thump: 0.8, boom: 0, tail: 0.22, len: 1, drive: 2.2, mech: 0.35, mechAt: 0.055 },
  heavy: { f: 0.82, crack: 1, body: 1, thump: 1.1, boom: 0.4, tail: 0.32, len: 1.3, drive: 2.8, mech: 0.3, mechAt: 0.09 },
  smg: { f: 1.12, crack: 0.85, body: 0.65, thump: 0.6, boom: 0, tail: 0.18, len: 0.75, drive: 2, mech: 0.3, mechAt: 0.035 },
  rifle: { f: 1.05, crack: 1.1, body: 0.85, thump: 0.8, boom: 0.25, tail: 0.3, len: 1.1, drive: 2.6, mech: 0.28, mechAt: 0.05 },
  shotgun: { f: 0.72, crack: 0.8, body: 1.1, thump: 1.2, boom: 0.55, tail: 0.38, len: 1.4, drive: 3, mech: 0.45, mechAt: 0.32 },
  sniper: { f: 0.8, crack: 1.2, body: 1, thump: 1.2, boom: 0.7, tail: 0.5, len: 1.8, drive: 3, mech: 0.4, mechAt: 0.45 },
}
function gunshot(p) {
  return (k, out) => {
    const R = k.R
    const v = 1 + (R() - 0.5) * 0.1
    const hot = k.drive(p.drive)
    hot.connect(out)
    k.chain(k.noise('white', 0, 0.1), k.filt('highpass', 1700 * p.f * v, 0.7), k.env(p.crack, 0, 0.0006, 0.04 * p.len), hot)
    k.chain(k.noise('white', 0, 0.4), k.filt('bandpass', 620 * p.f * v, 0.9), k.env(p.body, 0, 0.001, 0.12 * p.len), hot)
    k.chain(k.osc('sine', 165 * p.f * v, 40, 0, 0.22 * p.len), k.env(p.thump, 0, 0.002, 0.15 * p.len), hot)
    if (p.boom) k.chain(k.noise('brown', 0, 1.4), k.filt('lowpass', 240, 0.7), k.env(p.boom, 0, 0.004, 0.45 * p.len), hot)
    k.chain(k.noise('pink', 0.008, 1.8), k.filt('lowpass', 1200 * p.f, 0.5), k.env(p.tail, 0.008, 0.025, 0.6 * p.len), out)
    k.chain(k.noise('white', 0.085, 0.15), k.filt('bandpass', 950 * p.f, 0.8), k.env(p.tail * 0.7, 0.085, 0.002, 0.07 * p.len), out)
    if (p.mech) {
      const t = p.mechAt
      k.chain(k.noise('white', t, 0.05), k.filt('bandpass', 3900, 3), k.env(p.mech, t, 0.0004, 0.018), out)
      k.chain(k.noise('white', t + 0.03, 0.05), k.filt('bandpass', 2500, 2.5), k.env(p.mech * 0.75, t + 0.03, 0.0004, 0.025), out)
    }
  }
}
// The Shoot Zone blast: a gunshot with a cannon's chest under it and a long tail.
// Layered under the gun's own report (sfx.bigShot), scaled by GUN_FX[class].boom.
function bigShot(k, out) {
  k.chain(k.noise('brown', 0, 1.6), k.filt('lowpass', 260, 0.7), k.drive(2.5), k.env(0.8, 0, 0.004, 0.8), out)
  k.chain(k.osc('sine', 75, 26, 0, 0.8), k.env(1, 0, 0.004, 0.6), out)
  k.chain(k.noise('brown', 0.03, 2.4), k.filt('lowpass', 380, 0.6), k.env(0.45, 0.03, 0.08, 1.5), out)
  k.chain(k.noise('white', 0.01, 0.5), k.filt('bandpass', 400, 0.5, 3000, 0.01, 0.4), k.env(0.25, 0.01, 0.05, 0.3), out) // the round tearing away
}
// Racking the slide before the big shot.
function cock(k, out) {
  k.chain(k.noise('white', 0, 0.05), k.filt('bandpass', 2300, 2), k.env(0.8, 0, 0.0005, 0.03), out)
  k.chain(k.noise('white', 0.03, 0.12), k.filt('bandpass', 1500, 1, 2600, 0.03, 0.1), k.env(0.35, 0.03, 0.02, 0.06), out)
  k.chain(k.noise('white', 0.15, 0.05), k.filt('bandpass', 3600, 3), k.env(1, 0.15, 0.0004, 0.025), out)
  k.chain(k.osc('sine', 1900, 1700, 0.15, 0.08), k.env(0.18, 0.15, 0.001, 0.06), out)
}
// A training round hitting the dummy: padded thwack.
function hit(k, out) {
  const R = k.R
  k.chain(k.noise('white', 0, 0.12), k.filt('bandpass', 1000 + R() * 300, 1.1), k.env(0.9, 0, 0.0008, 0.055), out)
  k.chain(k.osc('sine', 230, 105, 0, 0.1), k.env(0.7, 0, 0.002, 0.09), out)
  k.chain(k.noise('brown', 0, 0.2), k.filt('lowpass', 500), k.env(0.5, 0, 0.003, 0.08), out)
}
function crit(k, out) {
  hit(k, out)
  k.bell(out, 0.01, [[N(88), 0.35, 0.3], [N(88) * 2.01, 0.12, 0.18], [N(95), 0.2, 0.25]])
}

// Smashes, one recipe per ZONES kind.
const SMASH = {
  target(k, out) {
    const v = 1 + (k.R() - 0.5) * 0.12
    k.chain(k.noise('white', 0, 0.12), k.filt('bandpass', 2300 * v, 0.8), k.env(0.8, 0, 0.0006, 0.06), out)
    k.bell(out, 0, [[480 * v, 0.55, 0.1], [1180 * v, 0.3, 0.06]])
    k.chain(k.osc('sine', 190 * v, 85, 0, 0.1), k.env(0.7, 0, 0.002, 0.08), out)
    k.crackles(out, 0.02, 0.14, 7, 2500, 6000, 0.35)
  },
  slime(k, out) {
    const R = k.R
    k.chain(k.noise('white', 0, 0.35), k.filt('lowpass', 2600, 2.5, 280, 0, 0.2), k.env(1, 0, 0.003, 0.2), out)
    k.chain(k.osc('sine', 150, 55, 0, 0.14), k.env(0.8, 0, 0.003, 0.12), out)
    for (let i = 0; i < 6; i++) {
      const t = 0.03 + R() * 0.28
      const f = 280 + R() * 650
      k.chain(k.osc('sine', f, f * 1.7, t, 0.04), k.env(0.22, t, 0.002, 0.045), out)
    }
  },
  squishy(k, out) {
    const R = k.R
    const f0 = 950 + R() * 300
    const o = k.osc('sine', f0, f0 * 0.48, 0, 0.16)
    const lfo = k.osc('sine', 26 + R() * 8, 26, 0, 0.2)
    const depth = k.env(60, 0, 0.01, 0.15)
    k.chain(lfo, depth)
    depth.connect(o.frequency)
    k.chain(o, k.env(0.42, 0, 0.004, 0.16), out)
    k.chain(k.noise('white', 0, 0.06), k.filt('bandpass', 1600, 1.4), k.env(0.6, 0, 0.0006, 0.03), out)
    k.chain(k.osc('sine', 210, 75, 0, 0.12), k.env(0.8, 0, 0.002, 0.11), out)
  },
  cardboard(k, out) {
    k.chain(k.osc('sine', 125, 62, 0, 0.16), k.env(0.9, 0, 0.002, 0.14), out)
    k.chain(k.noise('brown', 0, 0.3), k.filt('lowpass', 950), k.env(0.9, 0, 0.002, 0.12), out)
    k.chain(k.noise('white', 0, 0.1), k.filt('bandpass', 700, 0.8), k.env(0.5, 0, 0.001, 0.05), out)
    k.crackles(out, 0.01, 0.28, 12, 1400, 4200, 0.35, 0.014)
  },
  wood(k, out) {
    const v = 1 + (k.R() - 0.5) * 0.15
    k.chain(k.noise('white', 0, 0.06), k.filt('highpass', 1900, 0.7), k.env(1, 0, 0.0004, 0.02), out)
    k.bell(out, 0, [[185 * v, 0.6, 0.17], [430 * v, 0.5, 0.11], [870 * v, 0.32, 0.07], [1520 * v, 0.2, 0.05]], { detune: 0.04 })
    k.crackles(out, 0.015, 0.22, 9, 1800, 6000, 0.4, 0.01)
  },
  ice(k, out) {
    const R = k.R
    k.chain(k.noise('white', 0, 0.15), k.filt('highpass', 3200, 0.7), k.env(0.9, 0, 0.0005, 0.08), out)
    k.chain(k.osc('sine', 320, 150, 0, 0.07), k.env(0.45, 0, 0.002, 0.06), out)
    for (let i = 0; i < 16; i++) {
      const t = R() * 0.36
      const f = 2400 + R() * 4800
      k.chain(k.osc('sine', f, f * (0.97 + R() * 0.06), t, 0.12), k.env(0.12 + R() * 0.16, t, 0.0008, 0.035 + R() * 0.09), out)
    }
  },
  brick(k, out) {
    k.chain(k.osc('sine', 95, 44, 0, 0.22), k.env(1, 0, 0.002, 0.2), out)
    k.chain(k.noise('brown', 0, 0.4), k.filt('lowpass', 700), k.env(0.85, 0, 0.003, 0.24), out)
    k.crackles(out, 0.01, 0.38, 20, 700, 2600, 0.32, 0.016, 1.6)
  },
  steel(k, out) {
    const v = 1 + (k.R() - 0.5) * 0.1
    k.chain(k.noise('white', 0, 0.06), k.filt('highpass', 1500), k.env(0.9, 0, 0.0004, 0.03), out)
    k.bell(out, 0, [[338 * v, 0.5, 0.9], [812 * v, 0.42, 0.6], [1404 * v, 0.32, 0.45], [2207 * v, 0.22, 0.3], [3115 * v, 0.14, 0.2]], { detune: 0.01 })
    k.chain(k.osc('sine', 140, 70, 0, 0.12), k.env(0.6, 0, 0.002, 0.1), out)
  },
  diamond(k, out) {
    const R = k.R
    const root = [N(84), N(86), N(88), N(91)][Math.floor(R() * 4)]
    k.bell(out, 0, [[root, 0.4, 0.7], [root * 1.5, 0.25, 0.5], [root * 2, 0.22, 0.4], [root * 3.01, 0.1, 0.25]])
    k.chain(k.noise('white', 0, 0.08), k.filt('highpass', 5000), k.env(0.5, 0, 0.0005, 0.05), out)
    for (let i = 0; i < 8; i++) {
      const t = R() * 0.3
      k.chain(k.osc('sine', 3500 + R() * 4000), k.env(0.1, t, 0.001, 0.06), out)
    }
  },
}
// The bullet stopping dead inside something.
function impact(k, out) {
  k.chain(k.osc('sine', 95, 38, 0, 0.35), k.env(1, 0, 0.002, 0.32), out)
  k.chain(k.noise('brown', 0, 0.5), k.filt('lowpass', 600), k.env(0.9, 0, 0.003, 0.22), out)
  k.chain(k.noise('white', 0, 0.08), k.filt('bandpass', 1800, 1), k.env(0.6, 0, 0.0005, 0.04), out)
  k.bell(out, 0.005, [[610, 0.25, 0.45], [1490, 0.15, 0.3]])
}
// The round punching through an object: a hard supersonic snap, a mid "thwack" of the
// material giving way and a short body thump, driven for punch. Layered under every smash.
function impactHit(k, out) {
  const R = k.R
  const v = 1 + (R() - 0.5) * 0.12
  const hot = k.drive(2.6)
  hot.connect(out)
  k.chain(k.noise('white', 0, 0.03), k.filt('highpass', 2600 * v, 0.7), k.env(1, 0, 0.0003, 0.006), hot)
  k.chain(k.noise('white', 0.001, 0.12), k.filt('bandpass', 850 * v, 1.2), k.env(0.85, 0.001, 0.0008, 0.032), hot)
  k.chain(k.osc('sine', 150 * v, 46, 0, 0.12), k.env(0.9, 0, 0.0015, 0.085), hot)
  k.chain(k.noise('brown', 0, 0.2), k.filt('lowpass', 420), k.env(0.6, 0, 0.002, 0.07), hot)
  k.crackles(out, 0.008, 0.09, 5, 2800, 7000, 0.25, 0.006)
}
// Hit marker: a crisp, dry tick (UI bus) for each damage number.
function hitmark(k, out) {
  k.chain(k.osc('triangle', 2900, 2500, 0, 0.03), k.filt('highpass', 1200), k.env(0.7, 0, 0.0004, 0.028), out)
  k.chain(k.noise('white', 0, 0.02), k.filt('highpass', 6500), k.env(0.45, 0, 0.0002, 0.005), out)
  k.chain(k.osc('sine', 5200, 4800, 0, 0.02), k.env(0.12, 0, 0.0004, 0.015), out)
}
// A bullet zipping past the ear: a falling noise sweep with a thin whistle (Doppler).
function whizz(k, out) {
  k.chain(k.noise('white', 0, 0.8), k.filt('bandpass', 5200, 2.2, 650, 0, 0.55), k.env(0.9, 0, 0.16, 0.38), out)
  k.chain(k.osc('sine', 2300, 620, 0.04, 0.5), k.filt('bandpass', 1400, 0.8), k.env(0.25, 0.04, 0.12, 0.32), out)
  k.chain(k.noise('pink', 0.05, 0.6), k.filt('lowpass', 900, 0.7, 240, 0.05, 0.5), k.env(0.5, 0.05, 0.1, 0.4), out)
}
// The open range answering the big shot: the report slapping back off the far walls,
// each echo later, darker and quieter, over a low rolling rumble.
function rangeEcho(k, out) {
  const R = k.R
  for (const [t, f, vol, d] of [[0.17, 1500, 0.65, 0.16], [0.38, 1100, 0.45, 0.22], [0.66, 800, 0.3, 0.3], [1.05, 600, 0.18, 0.4]]) {
    const tt = t + (R() - 0.5) * 0.03
    k.chain(k.noise('pink', tt, d * 4), k.filt('bandpass', f, 0.8), k.env(vol, tt, 0.006, d), out)
    k.chain(k.noise('brown', tt, d * 4), k.filt('lowpass', 260), k.env(vol * 0.7, tt, 0.01, d * 1.4), out)
  }
  k.chain(k.noise('brown', 0.1, 2.2), k.filt('lowpass', 140, 0.6), k.env(0.5, 0.1, 0.35, 1.3), out)
}
// Cinematic sub drop: felt more than heard (the shot, zone breaks, the final hit).
function subDrop(k, out) {
  k.chain(k.osc('sine', 68, 27, 0, 1.0), k.drive(1.6), k.env(1, 0, 0.004, 0.85), out)
  k.chain(k.noise('brown', 0, 0.8), k.filt('lowpass', 110, 0.7), k.env(0.55, 0, 0.004, 0.45), out)
}
// The bullet burying itself: a heavy thunk, grit and chips rattling down, and the round
// humming as it shudders in place (matches range.stick's wobble).
function embed(k, out) {
  const R = k.R
  const hot = k.drive(2.4)
  hot.connect(out)
  k.chain(k.osc('sine', 82, 30, 0, 0.45), k.env(1, 0, 0.002, 0.4), hot)
  k.chain(k.noise('brown', 0, 0.6), k.filt('lowpass', 520), k.env(0.9, 0, 0.002, 0.3), hot)
  k.chain(k.noise('white', 0, 0.06), k.filt('bandpass', 1600, 1), k.env(0.7, 0, 0.0004, 0.03), hot)
  // Rubble: bits bouncing, thinning out.
  for (let i = 0; i < 26; i++) {
    const t = 0.05 + Math.pow(R(), 1.7) * 1.1
    const f = 900 + R() * 3800
    k.chain(k.noise('white', t, 0.04), k.filt('bandpass', f, 3), k.env(0.32 * (1 - t / 1.3), t, 0.0005, 0.01 + R() * 0.02), out)
  }
  // The shudder: a low hum with a fast wobble, dying away.
  const o = k.osc('triangle', 190, 160, 0.02, 1.3)
  const lfo = k.osc('sine', 22, 14, 0.02, 1.3)
  const depth = k.env(28, 0.02, 0.01, 1.0)
  k.chain(lfo, depth)
  depth.connect(o.frequency)
  k.chain(o, k.filt('lowpass', 900), k.env(0.32, 0.02, 0.01, 1.05), out)
}
// Coin pickup: a two-note bell ding (pitched per smash by playback rate).
function coin(k, out) {
  k.bell(out, 0, [[N(83), 0.5, 0.06], [N(83) * 2.76, 0.12, 0.04]])
  k.bell(out, 0.065, [[N(88), 0.6, 0.32], [N(88) * 2.76, 0.14, 0.12], [N(88) * 2, 0.12, 0.2]])
}
// Cash register: metallic burst + bell.
function chaChing(k, out) {
  k.chain(k.noise('white', 0, 0.12), k.filt('bandpass', 5200, 1.2), k.env(0.5, 0, 0.0005, 0.07), out)
  k.bell(out, 0.0, [[N(84), 0.3, 0.08]])
  k.chain(k.noise('white', 0.1, 0.2), k.filt('bandpass', 6500, 1.5), k.env(0.35, 0.1, 0.001, 0.12), out)
  k.bell(out, 0.1, [[N(91), 0.55, 0.5], [N(91) * 2.76, 0.14, 0.2], [N(96), 0.3, 0.45]])
}
// New zone: a swish and a bright three-note arpeggio.
function stinger(k, out) {
  k.chain(k.noise('pink', 0, 0.4), k.filt('bandpass', 400, 1.2, 5000, 0, 0.25), k.env(0.5, 0, 0.18, 0.15), out)
  ;[N(84), N(88), N(91), N(96)].forEach((f, i) => k.bell(out, 0.06 + i * 0.055, [[f, 0.4, 0.25], [f * 2, 0.1, 0.12]]))
}
// The win jingle: brassy arpeggio up into a held major chord, with sparkles.
function fanfare(k, out) {
  const R = k.R
  const brass = (f, t, d, vol) => {
    const g = k.env(vol, t, 0.02, d)
    const lp = k.filt('lowpass', 900, 1, 3200, t, 0.08)
    k.chain(k.osc('sawtooth', f, f, t, d + 0.1), lp, g, out)
    k.chain(k.osc('sawtooth', f * 1.004, f * 1.004, t, d + 0.1), lp)
  }
  ;[N(67), N(72), N(76), N(79)].forEach((f, i) => brass(f, i * 0.085, 0.16, 0.22))
  for (const f of [N(72), N(76), N(79), N(84)]) brass(f, 0.36, 0.95, 0.17)
  for (let i = 0; i < 14; i++) {
    const t = 0.36 + R() * 1.1
    const f = N(96 + Math.floor(R() * 12))
    k.bell(out, t, [[f, 0.08 + R() * 0.08, 0.15]])
  }
}
// No wins: a soft "aww" pair.
function aww(k, out) {
  for (const [f, t] of [[N(67), 0], [N(63), 0.16]]) k.chain(k.osc('triangle', f, f * 0.97, t, 0.3), k.filt('lowpass', 1400), k.env(0.35, t, 0.01, 0.28), out)
}
function whoosh(k, out) {
  k.chain(k.noise('pink', 0, 0.7), k.filt('bandpass', 300, 1.1, 2600, 0, 0.28), k.env(0.9, 0, 0.2, 0.3), out)
}
// The white flash back to the lobby: a rising swell cut short.
function swell(k, out) {
  const g = k.env(0.8, 0, 0.32, 0.05)
  k.chain(k.noise('pink', 0, 0.45), k.filt('lowpass', 300, 0.8, 7000, 0, 0.35), g, out)
  k.chain(k.osc('sine', 220, 880, 0, 0.35), k.env(0.18, 0, 0.3, 0.06), out)
}
function click(k, out) {
  k.chain(k.osc('sine', 1500, 760, 0, 0.03), k.env(0.6, 0, 0.001, 0.03), out)
  k.chain(k.noise('white', 0, 0.02), k.filt('highpass', 3500), k.env(0.3, 0, 0.0005, 0.008), out)
}
function deny(k, out) {
  for (const [f, t] of [[230, 0], [170, 0.09]]) k.chain(k.osc('square', f, f, t, 0.08), k.filt('lowpass', 1300), k.env(0.3, t, 0.003, 0.08), out)
}
function rebirth(k, out) {
  const R = k.R
  k.chain(k.osc('sawtooth', 110, 880, 0, 0.7), k.filt('lowpass', 500, 2, 4000, 0, 0.7), k.env(0.3, 0, 0.5, 0.25), out)
  k.chain(k.noise('pink', 0, 0.8), k.filt('bandpass', 300, 1, 6000, 0, 0.7), k.env(0.3, 0, 0.6, 0.15), out)
  for (const f of [N(72), N(76), N(79), N(84)]) k.bell(out, 0.7, [[f, 0.25, 0.9], [f * 2, 0.06, 0.5]])
  for (let i = 0; i < 10; i++) k.bell(out, 0.7 + R() * 0.8, [[N(96 + Math.floor(R() * 10)), 0.08, 0.15]])
}
// Footstep on studded plastic.
function step(k, out) {
  const v = 1 + (k.R() - 0.5) * 0.2
  k.chain(k.noise('white', 0, 0.06), k.filt('bandpass', 1500 * v, 1.3), k.env(0.7, 0, 0.0008, 0.028), out)
  k.chain(k.osc('sine', 165 * v, 110, 0, 0.04), k.env(0.5, 0, 0.001, 0.035), out)
}
function jump(k, out) {
  k.chain(k.noise('pink', 0, 0.25), k.filt('bandpass', 450, 1, 1500, 0, 0.15), k.env(0.5, 0, 0.03, 0.12), out)
}
function land(k, out) {
  k.chain(k.osc('sine', 125, 52, 0, 0.12), k.env(1, 0, 0.002, 0.11), out)
  k.chain(k.noise('brown', 0, 0.2), k.filt('lowpass', 650), k.env(0.7, 0, 0.002, 0.07), out)
  k.chain(k.noise('white', 0, 0.05), k.filt('bandpass', 1400, 1.2), k.env(0.35, 0, 0.0008, 0.03), out)
}
// A pop of the bullet's fire.
function crackle(k, out) {
  const R = k.R
  k.chain(k.noise('white', 0, 0.04), k.filt('bandpass', 1800 + R() * 3500, 2.5), k.env(1, 0, 0.0004, 0.006 + R() * 0.014), out)
}
// A spent brass casing hitting the floor, and a plastic shotgun shell.
function shell(k, out) {
  const v = 1 + (k.R() - 0.5) * 0.2
  k.bell(out, 0, [[3900 * v, 0.5, 0.06], [6150 * v, 0.32, 0.045], [8300 * v, 0.2, 0.03], [2350 * v, 0.15, 0.05]], { detune: 0.05 })
  k.chain(k.noise('white', 0, 0.03), k.filt('highpass', 5000), k.env(0.4, 0, 0.0004, 0.008), out)
}
function shellPlastic(k, out) {
  k.chain(k.osc('sine', 620, 300, 0, 0.04), k.env(0.7, 0, 0.001, 0.035), out)
  k.chain(k.noise('white', 0, 0.04), k.filt('bandpass', 1300, 1.5), k.env(0.5, 0, 0.0005, 0.02), out)
}
// A songbird phrase: a few fast FM chirps.
function bird(k, out) {
  const R = k.R
  const n = 2 + Math.floor(R() * 4)
  const base = 2400 + R() * 1600
  for (let i = 0; i < n; i++) {
    const t = i * (0.07 + R() * 0.05)
    const f = base * (0.9 + R() * 0.3)
    const o = k.osc('sine', f, f * (1.2 + R() * 0.5), t, 0.05)
    const lfo = k.osc('sine', 60 + R() * 40, 60, t, 0.06)
    const d = k.env(f * 0.08, t, 0.001, 0.05)
    k.chain(lfo, d)
    d.connect(o.frequency)
    k.chain(o, k.env(0.35, t, 0.004, 0.045), out)
  }
}

// name -> [seconds, recipe, variants]
const RECIPES = {
  click: [0.08, click, 2],
  deny: [0.25, deny, 1],
  cock: [0.3, cock, 1],
  bigShot: [3.2, bigShot, 2],
  impact: [0.6, impact, 2],
  coin: [0.5, coin, 1],
  stinger: [0.55, stinger, 1],
  fanfare: [1.7, fanfare, 1],
  aww: [0.55, aww, 1],
  whoosh: [0.6, whoosh, 2],
  swell: [0.45, swell, 1],
  chaChing: [0.7, chaChing, 1],
  rebirth: [1.8, rebirth, 1],
  hit: [0.25, hit, 3],
  crit: [0.4, crit, 2],
  step: [0.08, step, 4],
  jump: [0.3, jump, 2],
  land: [0.25, land, 2],
  crackle: [0.05, crackle, 6],
  shell: [0.15, shell, 4],
  shellPlastic: [0.08, shellPlastic, 2],
  bird: [0.6, bird, 5],
  impactHit: [0.22, impactHit, 5],
  hitmark: [0.06, hitmark, 2],
  whizz: [0.9, whizz, 2],
  rangeEcho: [2.4, rangeEcho, 2],
  subDrop: [1.1, subDrop, 1],
  embed: [1.5, embed, 2],
  ...Object.fromEntries(Object.entries(GUNS).map(([k, p]) => [`gun_${k}`, [0.4 + 1.1 * p.len, gunshot(p), 3]])),
  ...Object.fromEntries(Object.entries(SMASH).map(([k, fn]) => [`smash_${k}`, [k === 'steel' || k === 'diamond' ? 1.1 : 0.55, fn, 4]])),
}
// Render order: what the player hears first.
const FIRST = ['click', 'cock', 'bigShot', 'rangeEcho', 'subDrop', 'whoosh', 'whizz', 'impactHit', 'hitmark', 'embed', 'shell', 'gun_pistol', 'gun_heavy', 'gun_smg', 'gun_rifle', 'gun_shotgun', 'gun_sniper', 'hit', 'crit', 'step', 'coin', 'stinger', 'smash_target', 'smash_slime']

async function renderOne(seconds, recipe, seed) {
  const sr = SR
  const oc = new OfflineAudioContext(1, Math.ceil(sr * seconds), sr)
  recipe(kit(oc, rng(seed)), oc.destination)
  const buf = await oc.startRendering()
  // Normalise so recipes only shape timbre; play() decides loudness.
  const d = buf.getChannelData(0)
  let peak = 0
  for (let i = 0; i < d.length; i++) peak = Math.max(peak, Math.abs(d[i]))
  if (peak > 0) {
    const g = 0.9 / peak
    for (let i = 0; i < d.length; i++) d[i] *= g
  }
  // 3 ms fade at the end: never a click if a decay is still above zero.
  const f = Math.min(d.length, Math.floor(sr * 0.003))
  for (let i = 0; i < f; i++) d[d.length - 1 - i] *= i / f
  return buf
}
async function renderBank() {
  const names = [...FIRST, ...Object.keys(RECIPES).filter((n) => !FIRST.includes(n))]
  let seed = 1
  for (const name of names) {
    const [sec, fn, variants] = RECIPES[name]
    const list = []
    for (let v = 0; v < variants; v++) {
      try {
        list.push(await renderOne(sec, fn, seed++ * 7919))
      } catch {
        // A render that fails just leaves that sound out.
      }
    }
    if (list.length) A.bank[name] = list
  }
}

// --- Realtime ---------------------------------------------------------------------------------
function impulse(ctx) {
  const R = AUDIO.reverb
  const sr = ctx.sampleRate
  const len = Math.floor(sr * R.seconds)
  const buf = ctx.createBuffer(2, len, sr)
  const r = rng(7)
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c)
    const pre = Math.floor(sr * R.preDelay)
    // Early reflections: the pavilion, the walls, the table.
    for (const [ms, g] of [[11, 0.5], [23, 0.35], [37, 0.3], [58, 0.22], [83, 0.16]]) {
      const i = pre + Math.floor(sr * (ms / 1000) * (c ? 1.06 : 0.95))
      if (i < len) d[i] += g * (r() < 0.5 ? -1 : 1)
    }
    let lp = 0
    for (let i = pre; i < len; i++) {
      const t = (i - pre) / sr
      const k = Math.min(0.94, 0.2 + t * 0.9)
      lp += (1 - k) * (r() * 2 - 1 - lp)
      d[i] += lp * Math.exp((-6.9 * t) / R.decay) * 0.55
    }
  }
  return buf
}

function loopSource(kind) {
  const ctx = A.ctx
  const d = NOISE[kind]
  const b = ctx.createBuffer(1, d.length, SR)
  b.copyToChannel(d, 0)
  const s = ctx.createBufferSource()
  s.buffer = b
  s.loop = true
  return s
}

// Island ambience: sea swell (brown noise, slow LFO), foam hiss, light wind.
const amb = { built: false }
function buildAmbience() {
  const ctx = A.ctx
  const sea = loopSource('brown')
  const seaLp = ctx.createBiquadFilter()
  seaLp.type = 'lowpass'
  seaLp.frequency.value = 420
  const seaG = ctx.createGain()
  seaG.gain.value = 0.55
  const swell = ctx.createOscillator()
  swell.frequency.value = 0.085
  const swellDepth = ctx.createGain()
  swellDepth.gain.value = 0.35
  swell.connect(swellDepth).connect(seaG.gain)
  sea.connect(seaLp).connect(seaG).connect(A.amb)
  const foam = loopSource('pink')
  const foamHp = ctx.createBiquadFilter()
  foamHp.type = 'highpass'
  foamHp.frequency.value = 1600
  const foamLp = ctx.createBiquadFilter()
  foamLp.type = 'lowpass'
  foamLp.frequency.value = 5500
  const foamG = ctx.createGain()
  foamG.gain.value = 0.07
  const foamLfo = ctx.createOscillator()
  foamLfo.frequency.value = 0.085
  const foamDepth = ctx.createGain()
  foamDepth.gain.value = 0.06
  foamLfo.connect(foamDepth).connect(foamG.gain)
  foam.connect(foamHp).connect(foamLp).connect(foamG).connect(A.amb)
  const wind = loopSource('pink')
  const windBp = ctx.createBiquadFilter()
  windBp.type = 'bandpass'
  windBp.frequency.value = 520
  windBp.Q.value = 0.6
  const windG = ctx.createGain()
  windG.gain.value = 0.08
  wind.connect(windBp).connect(windG).connect(A.amb)
  for (const s of [sea, swell, foam, foamLfo, wind]) s.start()
  amb.built = true
}

// The bullet's flight: a rushing air band that rises with speed, a fire roar under it,
// and random crackle pops (from updateAudio).
const fl = { on: false, speed: 0, nodes: null, crackT: 0 }
export const flight = {
  start() {
    if (!A.started || fl.on) return
    const ctx = A.ctx
    const t = ctx.currentTime
    const air = loopSource('white')
    const bp = ctx.createBiquadFilter()
    bp.type = 'bandpass'
    bp.Q.value = 0.9
    bp.frequency.value = 900
    const airG = ctx.createGain()
    airG.gain.setValueAtTime(0, t)
    airG.gain.linearRampToValueAtTime(0.45, t + 0.08)
    const roar = loopSource('brown')
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = 380
    const roarG = ctx.createGain()
    roarG.gain.setValueAtTime(0, t)
    roarG.gain.linearRampToValueAtTime(0.9, t + 0.1)
    air.connect(bp).connect(airG).connect(A.sfx)
    roar.connect(lp).connect(roarG).connect(A.sfx)
    air.start()
    roar.start()
    fl.nodes = { air, roar, bp, airG, roarG, lp }
    fl.on = true
  },
  // s: 0..1 of top speed.
  speed(s) {
    fl.speed = s
    if (!fl.on) return
    const t = A.ctx.currentTime
    const n = fl.nodes
    n.bp.frequency.setTargetAtTime(500 + 2600 * s, t, 0.05)
    n.airG.gain.setTargetAtTime(0.18 + 0.4 * s, t, 0.05)
    n.roarG.gain.setTargetAtTime(0.45 + 0.5 * s, t, 0.05)
    n.lp.frequency.setTargetAtTime(260 + 300 * s, t, 0.05)
  },
  stop(fade = 0.12) {
    if (!fl.on) return
    fl.on = false
    const n = fl.nodes
    const t = A.ctx.currentTime
    for (const g of [n.airG, n.roarG]) {
      g.gain.cancelScheduledValues(t)
      g.gain.setTargetAtTime(0, t, fade / 3)
    }
    n.air.stop(t + fade * 2)
    n.roar.stop(t + fade * 2)
    fl.nodes = null
  },
}

// --- Playback ---------------------------------------------------------------------------------
const H = AUDIO.hearing
// opts: vol, rate, pan, at ({x,y,z} world point: distance + pan from the camera), verb (send),
// bus ('sfx' | 'ui'), gap (s: skip if this name played more recently), when (s from now).
function play(name, { vol = 1, rate = 1, pan = 0, at = null, verb = AUDIO.reverb.send, bus = 'sfx', gap = 0, when = 0, low = false } = {}) {
  if (!A.started || muted) return
  const list = A.bank[name]
  if (!list) return
  const ctx = A.ctx
  const now = ctx.currentTime
  if (gap && last[name] && now - last[name] < gap) return
  if (A.voices >= AUDIO.maxVoices || (low && A.voices >= AUDIO.maxVoices * 0.6)) return
  let g = vol
  let p = pan
  let cutoff = 0
  if (at) {
    const dx = at.x - listener.x
    const dy = at.y - listener.y
    const dz = at.z - listener.z
    const d = Math.hypot(dx, dy, dz)
    if (d > H.max) return
    g *= d <= H.ref ? 1 : Math.pow(H.ref / d, H.rolloff) * (1 - d / H.max)
    if (d > 0.01) p = Math.max(-1, Math.min(1, ((dx * listener.rx + dy * listener.ry + dz * listener.rz) / d) * 0.85))
    if (d > H.ref) cutoff = 18000 / (1 + (d - H.ref) / 18)
    verb *= 1 + Math.min(1.5, d / 30) // far sounds are mostly room
  }
  if (g < 0.004) return
  last[name] = now
  played[name] = (played[name] ?? 0) + 1
  let i = Math.floor(Math.random() * list.length)
  if (list.length > 1 && i === lastPick[name]) i = (i + 1) % list.length
  lastPick[name] = i
  const src = ctx.createBufferSource()
  src.buffer = list[i]
  src.playbackRate.value = rate
  let node = src
  if (cutoff) {
    const f = ctx.createBiquadFilter()
    f.type = 'lowpass'
    f.frequency.value = cutoff
    node.connect(f)
    node = f
  }
  const gn = ctx.createGain()
  gn.gain.value = g
  node.connect(gn)
  node = gn
  if (ctx.createStereoPanner && p) {
    const pn = ctx.createStereoPanner()
    pn.pan.value = p
    node.connect(pn)
    node = pn
  }
  node.connect(bus === 'ui' ? A.ui : A.sfx)
  if (verb > 0 && bus !== 'ui') {
    const s = ctx.createGain()
    s.gain.value = Math.min(1, verb)
    node.connect(s)
    s.connect(A.verbIn)
  }
  A.voices++
  src.onended = () => {
    A.voices--
    src.disconnect()
  }
  src.start(now + when)
}
const jit = (k) => 1 + (Math.random() - 0.5) * k

// Coins climb a major pentatonic run, 10 steps then round again.
const PENTA = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21]

export const sfx = {
  // A gunshot. kind = GUNS[i].kind; at = world point (omit for the player's own gun).
  // A gunshot. kind = GUNS[i].kind; at = world point (omit for the player's own gun);
  // low = can be dropped when busy (other players).
  gun(kind, at = null, { vol = 1, low = false } = {}) {
    play(`gun_${GUN_SOUND[kind] ?? 'pistol'}`, { vol: (at ? 0.9 : 0.7) * vol, rate: jit(0.08), at, pan: at ? 0 : 0.12, gap: 0.02, low })
  },
  hit(at, critical = false, vol = 1, low = false) {
    play(critical ? 'crit' : 'hit', { vol: 0.55 * vol, rate: jit(0.12), at, verb: 0.12, gap: 0.03, low })
  },
  // Racking the gun before the Shoot Zone shot (heavier guns rack slower and lower).
  cock(kind) {
    play('cock', { vol: 0.55, pan: 0.15, verb: 0.08, rate: GUN_FX[GUN_SOUND[kind] ?? 'pistol']?.rack ?? 1 })
  },
  // The Shoot Zone shot: the gun's own report, louder and roomier, with a cannon boom
  // under it sized to the gun, and the round tearing away.
  bigShot(kind) {
    const c = GUN_SOUND[kind] ?? 'pistol'
    play(`gun_${c}`, { vol: 1, rate: 0.95, verb: 0.42 })
    play('bigShot', { vol: 0.8 * (GUN_FX[c]?.boom ?? 0.6), verb: 0.4 })
    play('subDrop', { vol: 0.55 })
    play('rangeEcho', { vol: 0.42 * (0.7 + 0.3 * (GUN_FX[c]?.boom ?? 0.6)), verb: 0.3, when: 0.03 })
    play('whoosh', { vol: 0.35, rate: 0.62, when: 0.06 })
  },
  // The bullet cam cuts in: the round zips past.
  whizz() {
    play('whizz', { vol: 0.5, rate: jit(0.08), pan: -0.25, verb: 0.1 })
  },
  // A casing bouncing on the floor.
  shell(at, vol = 1, plastic = false) {
    play(plastic ? 'shellPlastic' : 'shell', { vol: 0.35 * vol, rate: jit(0.15), at, verb: 0.05, gap: 0.015, low: true })
  },
  // A smash during the flight (the camera rides the bullet, so it is close and centred).
  // big = the first object of a zone (it hits harder).
  smash(kind, count, big = false) {
    const pan = (Math.random() - 0.5) * 0.5
    play(`smash_${kind}`, { vol: big ? 0.95 : 0.8, rate: jit(0.14) * (big ? 0.9 : 1), pan, verb: 0.18, gap: 0.018 })
    play('impactHit', { vol: big ? 0.9 : 0.55, rate: jit(0.1) * (big ? 0.82 : 1), pan, verb: 0.08, gap: 0.02 })
    play('hitmark', { vol: 0.2, rate: 1 + Math.min(0.35, count * 0.004), bus: 'ui', gap: 0.035 })
    const semis = PENTA[(count - 1) % PENTA.length]
    play('coin', { vol: 0.22, rate: Math.pow(2, semis / 12) * 0.9, bus: 'ui', gap: 0.03 })
  },
  zone() {
    play('stinger', { vol: 0.45, bus: 'ui' })
    play('whoosh', { vol: 0.55, rate: jit(0.15) })
    play('subDrop', { vol: 0.35, rate: 1.15 })
  },
  stuck(kind, wins) {
    play('impact', { vol: 0.85, verb: 0.35 })
    play('embed', { vol: 0.95, verb: 0.25 })
    play('subDrop', { vol: 0.6, rate: 0.9 })
    if (kind) play(`smash_${kind}`, { vol: 0.5, rate: 0.7 })
    if (wins > 0) {
      play('fanfare', { vol: 0.55, bus: 'ui', when: 0.25 })
      for (let i = 0; i < 6; i++) play('coin', { vol: 0.18, rate: Math.pow(2, PENTA[(i * 3) % PENTA.length] / 12), bus: 'ui', when: 0.45 + i * 0.09 })
    } else play('aww', { vol: 0.5, bus: 'ui', when: 0.2 })
  },
  back() {
    play('swell', { vol: 0.55, verb: 0.1 })
  },
  credit() {
    play('chaChing', { vol: 0.5, bus: 'ui' })
  },
  click(pan = 0) {
    play('click', { vol: 0.5, pan, rate: jit(0.1), bus: 'ui', gap: 0.03 })
  },
  deny() {
    play('deny', { vol: 0.5, bus: 'ui', gap: 0.2 })
  },
  buy() {
    play('chaChing', { vol: 0.55, bus: 'ui' })
  },
  rebirth() {
    play('rebirth', { vol: 0.6, bus: 'ui' })
  },
  step(vol = 1) {
    play('step', { vol: 0.32 * vol, rate: jit(0.12), verb: 0.05, gap: 0.08 })
  },
  jump() {
    play('jump', { vol: 0.3, rate: jit(0.1), verb: 0.05 })
  },
  land(k) {
    play('land', { vol: Math.min(0.9, 0.25 + k * 0.6), rate: jit(0.1), verb: 0.08 })
  },
}

// --- Install + per frame ------------------------------------------------------------------------
function start() {
  if (A.started) return
  const Ctx = window.AudioContext || window.webkitAudioContext
  if (!Ctx) return
  let ctx
  try {
    ctx = new Ctx({ latencyHint: 'interactive' })
  } catch {
    return
  }
  A.ctx = ctx
  if (!NOISE.white) makeNoise(SR)
  const glue = ctx.createDynamicsCompressor()
  glue.threshold.value = -18
  glue.ratio.value = 3.5
  glue.attack.value = 0.004
  glue.release.value = 0.18
  const limit = ctx.createDynamicsCompressor()
  limit.threshold.value = -2
  limit.ratio.value = 20
  limit.attack.value = 0.001
  limit.release.value = 0.08
  A.master = ctx.createGain()
  A.master.gain.value = level()
  A.master.connect(glue).connect(limit).connect(ctx.destination)
  A.sfx = ctx.createGain()
  A.sfx.gain.value = AUDIO.bus.sfx
  A.ui = ctx.createGain()
  A.ui.gain.value = AUDIO.bus.ui
  A.amb = ctx.createGain()
  A.amb.gain.value = 0
  for (const b of [A.sfx, A.ui, A.amb]) b.connect(A.master)
  const verb = ctx.createConvolver()
  verb.buffer = impulse(ctx)
  A.verbIn = ctx.createGain()
  A.verbIn.connect(verb).connect(A.master)
  // iOS: a sound must start inside the unlocking gesture.
  const s = ctx.createBufferSource()
  s.buffer = ctx.createBuffer(1, 1, ctx.sampleRate)
  s.connect(ctx.destination)
  s.start()
  ctx.resume?.()
  A.started = true
  buildAmbience()
  A.amb.gain.setTargetAtTime(AUDIO.bus.amb, ctx.currentTime, 1.5) // fade the island in
}

// Presses on any HUD / touch / window button get a click.
function onPress(e) {
  if (e.button > 0) return
  const b = e.target.closest?.('button, [role="button"]')
  if (!b || b.disabled || b.classList.contains('snd-btn')) return
  sfx.click(Math.max(-0.5, Math.min(0.5, (e.clientX / window.innerWidth - 0.5) * 1.2)))
}

function speakerIcon(off) {
  return `<svg viewBox="0 0 24 24"><path d="M3 9h4l5-4v14l-5-4H3z" fill="#fff" stroke="#15121c" stroke-width="1.6" stroke-linejoin="round"/>${
    off
      ? '<path d="M16 9l5 6M21 9l-5 6" stroke="#ff4b5c" stroke-width="2.6" stroke-linecap="round"/>'
      : '<path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 6a9 9 0 0 1 0 12" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/>'
  }</svg>`
}

export function installAudio({ onKey } = {}) {
  // Render every sound now, before any gesture, so nothing is missing on the first press.
  if (window.OfflineAudioContext || window.webkitOfflineAudioContext) {
    makeNoise(SR)
    renderBank()
  }
  const unlock = () => {
    start()
    if (A.ctx?.state === 'suspended') A.ctx.resume?.()
  }
  for (const ev of ['pointerdown', 'keydown', 'touchend']) window.addEventListener(ev, unlock, { capture: true, passive: true })
  window.addEventListener('pointerdown', onPress, { capture: true, passive: true })
  document.addEventListener('visibilitychange', () => {
    if (!A.ctx) return
    if (document.hidden) A.ctx.suspend?.()
    else A.ctx.resume?.()
  })
  // The speaker button (top right, clear of Boxity's toolbar at the top left).
  const btn = document.createElement('button')
  btn.className = 'snd-btn'
  btn.setAttribute('aria-label', 'Sound on / off')
  const paint = () => {
    btn.innerHTML = speakerIcon(muted)
    btn.classList.toggle('off', muted)
  }
  paint()
  muteListeners.add(paint)
  btn.addEventListener('pointerdown', (e) => {
    e.preventDefault()
    e.stopPropagation()
    unlock()
    toggleMuted()
    if (!muted) setTimeout(() => sfx.click(0.4), 30)
  })
  document.body.appendChild(btn)
  onKey?.('KeyM', toggleMuted)
}

// Per frame. state: { camera, player, cine, night }
const prev = { grounded: true, vy: 0, init: false }
let stepAcc = 0
let birdT = 4
export function updateAudio(dt, { camera, player, cine = false, night = false }) {
  if (!A.started) return
  const e = camera.matrixWorld.elements
  listener.x = e[12]
  listener.y = e[13]
  listener.z = e[14]
  listener.rx = e[0]
  listener.ry = e[1]
  listener.rz = e[2]
  const t = A.ctx.currentTime
  A.amb.gain.setTargetAtTime(AUDIO.bus.amb * (cine ? AUDIO.duckInCine : 1), t, 0.25)

  // Footsteps, jump, landing.
  if (player) {
    const v = player.velocity
    const speed = Math.hypot(v.x, v.z)
    if (!prev.init) {
      prev.init = true
      prev.grounded = player.grounded
    }
    if (player.grounded && speed > 1.2 && !player.frozen) {
      stepAcc += speed * dt
      if (stepAcc >= AUDIO.stepEvery) {
        stepAcc -= AUDIO.stepEvery
        sfx.step(Math.min(1.2, 0.6 + speed / 14))
      }
    } else if (player.grounded) stepAcc = AUDIO.stepEvery * 0.7 // first step lands soon after starting to walk
    if (prev.grounded && !player.grounded && v.y > 3) sfx.jump()
    if (!prev.grounded && player.grounded && prev.vy < -3) sfx.land(Math.min(1, -prev.vy / 18))
    prev.grounded = player.grounded
    prev.vy = v.y
  }

  // Fire crackle on the flying bullet.
  if (fl.on) {
    fl.crackT -= dt
    if (fl.crackT <= 0) {
      fl.crackT = 0.02 + Math.random() * 0.07
      play('crackle', { vol: 0.12 + 0.2 * Math.random() * (0.4 + fl.speed), rate: jit(0.4), pan: (Math.random() - 0.5) * 0.6, verb: 0, low: true })
    }
  }

  // Birds by day, somewhere around the listener.
  if (!night && !cine) {
    birdT -= dt
    if (birdT <= 0) {
      birdT = 5 + Math.random() * 9
      const a = Math.random() * Math.PI * 2
      const r = 14 + Math.random() * 30
      play('bird', { vol: 0.35, rate: jit(0.15), low: true, at: { x: listener.x + Math.cos(a) * r, y: listener.y + 6, z: listener.z + Math.sin(a) * r }, verb: 0.3 })
    }
  }
}
