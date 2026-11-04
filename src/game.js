// The game rules and the saved progress: Damage (trained on the plots), Wins
// (earned by shooting a bullet down the range), Rebirths (reset Damage for a
// bigger multiplier and a higher max level), the guns owned / equipped and the
// evolved ammo (Wins multiplier). Saved to localStorage. Playtime Gifts and the boosts
// they give are per visit and not saved.
import { AMMO, BOOSTS, ECONOMY, GUNS, PLAYTIME_GIFTS, RANGE, SMASH, TRAINERS, ZONES } from './config.js'

const DEFAULTS = { damage: 0, wins: 0, rebirths: 0, gun: 'glock', owned: ['glock'], ammo: AMMO[0].id, playTime: 0 }

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(ECONOMY.saveKey) || 'null')
    if (raw && typeof raw === 'object') {
      const s = { ...DEFAULTS, ...raw }
      for (const k of ['damage', 'wins', 'rebirths', 'playTime']) if (!Number.isFinite(s[k]) || s[k] < 0) s[k] = 0
      if (!Array.isArray(s.owned)) s.owned = ['glock']
      if (!s.owned.includes('glock')) s.owned.push('glock')
      if (!GUNS.some((g) => g.id === s.gun) || !s.owned.includes(s.gun)) s.gun = 'glock'
      if (!AMMO.some((a) => a.id === s.ammo)) s.ammo = AMMO[0].id
      delete s.claimed // the old Rewards chest counter
      return s
    }
  } catch {
    // A broken save starts fresh.
  }
  return { ...DEFAULTS, owned: [...DEFAULTS.owned] }
}

export const stats = load()
const listeners = new Set()
let saveTimer = 0

function save() {
  try {
    localStorage.setItem(ECONOMY.saveKey, JSON.stringify(stats))
  } catch {
    // Private mode / quota: progress lives for this session only.
  }
}

// fn(kind) runs on every change: 'damage', 'wins', 'rebirth', 'gun', 'ammo', 'gift', 'boost', 'all'.
export function onChange(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
function changed(kind) {
  for (const fn of listeners) fn(kind)
}

// Called every frame: play time, the Playtime Gifts clock, boost timers and a debounced save.
let readyShown = 0
export function tick(dt) {
  stats.playTime += dt
  session.time += dt
  let ended = false
  for (const k in boosts) {
    if (boosts[k] > 0) {
      boosts[k] = Math.max(0, boosts[k] - dt)
      if (boosts[k] === 0) ended = true
    }
  }
  if (ended) changed('boost')
  const ready = giftsReady()
  if (ready !== readyShown) {
    readyShown = ready
    changed('gift')
  }
  saveTimer -= dt
  if (saveTimer <= 0) {
    saveTimer = 2
    save()
  }
}
window.addEventListener('beforeunload', save)

// --- Numbers ------------------------------------------------------------------------
const SUFFIX = ['', 'K', 'M', 'B', 'T', 'Qd', 'Qn', 'Sx']
export function fmt(n) {
  n = Math.floor(n)
  if (n < 1000) return String(n)
  let i = 0
  let v = n
  while (v >= 1000 && i < SUFFIX.length - 1) {
    v /= 1000
    i++
  }
  const s = v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(1) : v.toFixed(2)
  return s.replace(/\.?0+$/, '') + SUFFIX[i]
}

// --- Guns -----------------------------------------------------------------------------
export const gunDef = (id = stats.gun) => GUNS.find((g) => g.id === id) ?? GUNS[0]
export const gunState = (g) => (stats.gun === g.id ? 'equipped' : stats.owned.includes(g.id) ? 'owned' : 'locked')

// Walking onto a Gun Shop pad: equip it if owned, buy it if affordable.
export function buyOrEquip(id) {
  const g = gunDef(id)
  if (stats.gun === g.id) return { ok: false, quiet: true }
  if (!stats.owned.includes(g.id)) {
    if (stats.wins < g.cost) return { ok: false, msg: `Need ${fmt(g.cost)} Wins for the ${g.name}!` }
    stats.wins -= g.cost
    stats.owned.push(g.id)
    changed('wins')
  }
  stats.gun = g.id
  changed('gun')
  return { ok: true, msg: `Equipped ${g.name} (x${g.mult} Damage)!` }
}

// --- Training ---------------------------------------------------------------------------
export const rebirthMult = () => 1 + stats.rebirths * ECONOMY.rebirthBonus
export const trainerUnlocked = (t) => !t.robux && stats.rebirths >= (t.rebirths ?? 0)
export const trainRate = (t) => ECONOMY.baseRate * t.mult * gunDef().mult * rebirthMult() * boostMult('damage')
export function bestTrainer() {
  let best = TRAINERS[0]
  for (const t of TRAINERS) if (trainerUnlocked(t) && t.mult > best.mult) best = t
  return best
}

export function addDamage(n) {
  stats.damage += n
  changed('damage')
}

// --- Levels + rebirth ---------------------------------------------------------------------
// The max LEVEL grows by ECONOMY.maxLevelPerRebirth per rebirth. The ECONOMY.levels damage
// curve is stretched over all those levels and scaled by levelScale^rebirths, so the damage
// needed to rebirth is the same as with 10 levels; there are just more steps on the way.
export const maxLevel = (r = stats.rebirths) => ECONOMY.maxLevel + r * ECONOMY.maxLevelPerRebirth
function levelNeed(n, r) {
  const L = ECONOMY.levels
  const t = ((n - 1) / (maxLevel(r) - 1)) * (L.length - 1)
  const i = Math.min(L.length - 2, Math.floor(t))
  return (L[i] + (L[i + 1] - L[i]) * (t - i)) * Math.pow(ECONOMY.levelScale, r)
}
export function levelInfo() {
  const r = stats.rebirths
  const top = maxLevel(r)
  let level = 1
  while (level < top && stats.damage >= levelNeed(level + 1, r)) level++
  const max = level >= top
  const from = levelNeed(level, r)
  const to = max ? from : levelNeed(level + 1, r)
  return { level, maxLevel: top, max, progress: max ? 1 : (stats.damage - from) / (to - from), next: to }
}
export const canRebirth = () => levelInfo().max

export function rebirth() {
  if (!canRebirth()) return false
  stats.rebirths += 1
  stats.damage = 0
  changed('rebirth')
  save()
  return true
}

// --- Shooting: the smash range ---------------------------------------------------------------
export const OBJECT_COUNT = ZONES.length * RANGE.perZone
export const zoneOf = (i) => Math.min(ZONES.length - 1, Math.floor(i / RANGE.perZone))
// Damage needed to break object i, and the Wins it pays (before the rebirth multiplier).
export const objectNeed = (i) => SMASH.needBase * Math.pow(SMASH.needGrowth, i)
export const objectWins = (i) => SMASH.winsBase * Math.pow(SMASH.winsGrowth, i)
// Where object i sits on the table (z, metres; the table runs north = -Z).
export const objectZ = (i) => RANGE.firstZ - i * RANGE.spacing - zoneOf(i) * RANGE.zoneGap

// What a bullet with `damage` does: `smashed` objects broken, `stuckIn` the index it
// stops in (OBJECT_COUNT = it broke them all), and the running Wins after each smash
// (`running[k]` = Wins after k + 1 objects, already x the rebirth multiplier).
export function shotResult(damage) {
  const mult = rebirthMult() * winsMult()
  const running = []
  let total = 0
  let smashed = 0
  while (smashed < OBJECT_COUNT && damage >= objectNeed(smashed)) {
    total += objectWins(smashed) * mult
    running.push(Math.round(total))
    smashed++
  }
  return { smashed, stuckIn: smashed, wins: Math.round(total), running }
}

export function addWins(n) {
  stats.wins += n
  changed('wins')
}

// --- Evolve Ammo: AMMO tiers multiply the Wins a bullet pays ----------------------------------
export const ammoIndex = () => Math.max(0, AMMO.findIndex((a) => a.id === stats.ammo))
export const ammoDef = () => AMMO[ammoIndex()]
export const nextAmmo = () => AMMO[ammoIndex() + 1] ?? null
// Everything a Shoot Zone bullet's Wins are multiplied by besides rebirths.
export const winsMult = () => ammoDef().wins * boostMult('wins')
export function evolveAmmo() {
  const n = nextAmmo()
  if (!n) return { ok: false, msg: 'Your ammo is fully evolved!' }
  if (stats.wins < n.cost) return { ok: false, msg: `Need ${fmt(n.cost)} Wins to evolve!` }
  stats.wins -= n.cost
  stats.ammo = n.id
  changed('ammo')
  save()
  return { ok: true, msg: `Evolved to ${n.name}! x${n.wins} Wins` }
}

// --- Playtime Gifts + boosts (per visit) -------------------------------------------------------
const session = { time: 0, claimed: new Set() }
// Seconds left on each boost (BOOSTS keys); claiming a boost again adds to its time.
export const boosts = Object.fromEntries(Object.keys(BOOSTS).map((k) => [k, 0]))
export const boostMult = (k) => (boosts[k] > 0 ? BOOSTS[k] : 1)
export const giftState = (g) => (session.claimed.has(g.id) ? 'claimed' : session.time >= g.at * 60 ? 'ready' : 'waiting')
export const giftIn = (g) => Math.max(0, g.at * 60 - session.time)
export const giftsReady = () => PLAYTIME_GIFTS.reduce((n, g) => n + (giftState(g) === 'ready' ? 1 : 0), 0)
// Returns a toast line, or null if the gift is not ready.
export function claimGift(id) {
  const g = PLAYTIME_GIFTS.find((x) => x.id === id)
  if (!g || giftState(g) !== 'ready') return null
  session.claimed.add(g.id)
  readyShown = giftsReady()
  if (g.kind === 'wins') {
    stats.wins += g.amount
    changed('wins')
    save()
    return `+${fmt(g.amount)} Wins!`
  }
  for (const k of g.boosts) boosts[k] += g.minutes * 60
  changed('boost')
  return `${g.title}: 2x for ${g.minutes} min!`
}

// Dev console: __game.playtime(775) adds this visit's play time (Playtime Gifts).
export function devAddPlayTime(sec) {
  session.time += sec
}

// Dev console: __game.stats.set({ damage: 43200, wins: 47 }) recreates the reference shots.
export function setStats(patch) {
  Object.assign(stats, patch)
  changed('all')
  save()
}
