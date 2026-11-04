// Colyseus link to Shoot-a-bullet-backend (room "world").
// The server holds ALL of a signed-in player's progress; the browser stores nothing. On join it
// answers `progress` (the saved doc), `noProgress` (new account, guest or no database: the current
// state becomes the first save) or `serverError` (the save could not be read: never overwrite it).
// From then on the whole snapshot is sent as `saveProgress` whenever it changed, at most every
// NET.saveEvery s, and when the tab hides. Guests are never saved by the server: their progress
// lives in memory for the page only.
// Never throws and never blocks play: with no server the game keeps running and keeps retrying.
import { Client } from '@colyseus/sdk'
import { DEV_MODE, NET, SERVER_URL } from './config.js'
import * as bloxity from './bloxity.js'
import { hydrate, onSave, reset, snapshot } from './game.js'

export const net = {
  room: null,
  connected: false,
  hydrated: false, // a progress/noProgress answer arrived: saving is allowed
}

// --- Identity ----------------------------------------------------------------
// Signed-in players use their Bloxity id and token (the server verifies the token); everyone else a
// guest id per page load (never saved). Dev mode (no SDK) plays as one fixed dev id so a local
// server with Mongo keeps its progress across reloads.
const GUEST = `guest-${Math.random().toString(36).slice(2, 8)}`
const DEV = DEV_MODE ? 'dev-local' : ''

function identity() {
  if (DEV) return { userId: DEV, username: 'Dev', token: '' }
  const { user, guest } = bloxity.authState
  const id = user && (user._id || user.id || user.userId || user.uid)
  if (!id) return { userId: GUEST, username: guest?.displayName || guest?.username || 'Guest', token: '' }
  return { userId: String(id), username: bloxity.displayName(), token: bloxity.getToken() }
}

export const hasServer = () => !!(SERVER_URL || bloxity.canResolveServer())
const isGuest = () => sentId.startsWith('guest-')

const send = (type, payload) => {
  try {
    net.room?.send(type, payload)
  } catch (err) {
    console.warn('[net] send failed', type, err)
  }
}

// --- Saving ------------------------------------------------------------------
let lastSaved = ''
let savedAt = 0
let sentId = '' // identity the server currently attributes saves to
let loadedId = '' // identity whose saved progress this tab has already loaded

// The play time moves every second; it is not a reason to save on its own (see the idle save below).
const keyOf = (snap) => JSON.stringify({ ...snap, playTime: 0 })

export function saveNow() {
  if (!net.connected || !net.hydrated || isGuest()) return
  const snap = snapshot()
  const key = keyOf(snap)
  if (key === lastSaved) return
  lastSaved = key
  savedAt = performance.now()
  send('saveProgress', snap)
}

// --- Connection --------------------------------------------------------------
function attach(room) {
  net.room = room
  net.connected = true
  room.onMessage('progress', (doc) => {
    net.hydrated = true
    lastSaved = ''
    // A reconnect under the same identity: this tab is newer than the save (it may hold changes
    // not sent yet), so push it rather than load over it.
    if (loadedId !== sentId) {
      loadedId = sentId
      hydrate(doc)
    }
    saveNow()
  })
  room.onMessage('noProgress', () => {
    // New account, guest or no database. A guest's play carries over to the new account; another
    // account's state does not.
    net.hydrated = true
    lastSaved = ''
    if (loadedId && loadedId !== sentId && !loadedId.startsWith('guest-')) reset()
    loadedId = sentId
    saveNow()
  })
  room.onMessage('serverError', () => {
    // The save exists but could not be read: never overwrite it.
    net.hydrated = false
    console.warn('[net] server could not read the saved progress; saving is off for this session')
  })
  room.onLeave(() => {
    if (net.room !== room) return
    net.room = null
    net.connected = false
    net.hydrated = false
    bloxity.updateRoom('')
    // Resolve again rather than rejoin the old endpoint: that is how players move off a pod being
    // replaced. Keep trying; play is unaffected meanwhile.
    setTimeout(connect, NET.rejoin * 1000)
  })
}

// The ?roomId= this page was opened with (Open Rooms Join / friend invite): tried on the first
// connect only, then normal matchmaking.
let launchRoom = bloxity.launchRoomId()
async function joinLaunchRoom(options) {
  const id = launchRoom
  launchRoom = ''
  if (!id) return null
  try {
    if (SERVER_URL) return { room: await new Client(SERVER_URL).joinById(id.split('~').pop(), options), relay: '' }
    const at = await bloxity.locateRoom(id)
    if (at) return { room: await new Client(at.endpoint).joinById(at.roomId, options), relay: at.relayRoomId }
  } catch (err) {
    console.info('[net] the invited room is gone or full; matchmaking instead', err?.message ?? err)
  }
  return null
}

// Deployed builds ask the matchmaker on every connect (a new Client per endpoint, each is pinned to
// one pod). userId lets it reuse this player's seat on retries; guest/dev ids are not Bloxity ids.
async function joinAnyRoom(options) {
  if (SERVER_URL) return { room: await new Client(SERVER_URL).joinOrCreate('world', options), relay: '' }
  const { endpoint, relayRoomId } = await bloxity.resolveServerEndpoint(/^(guest|dev)-/.test(options.userId) ? undefined : options.userId)
  return { room: await new Client(endpoint).joinOrCreate('world', options), relay: relayRoomId }
}

let connecting = false
let retryIn = NET.retry // s: backoff while the matchmaker / server can't be reached
async function connect() {
  if (!hasServer() || connecting || net.connected) return
  connecting = true
  try {
    const id = identity()
    sentId = id.userId
    const options = { ...id, pfp: bloxity.getPfp() }
    const { room, relay } = (await joinLaunchRoom(options)) ?? (await joinAnyRoom(options))
    retryIn = NET.retry
    attach(room)
    // relay~room lets an invited friend join this exact room through its pod's relay (bloxity.js locateRoom).
    bloxity.updateRoom(relay ? `${relay}~${room.roomId}` : room.roomId)
  } catch (err) {
    console.info(`[net] could not reach the server (retrying in ${retryIn}s); progress is not saved until it is reachable`, err?.message ?? err)
    setTimeout(connect, retryIn * 1000)
    retryIn = Math.min(retryIn * 2, NET.retryMax)
  } finally {
    connecting = false
  }
}

export function initNet() {
  // A change worth saving: sent at most every NET.saveEvery s.
  let timer = 0
  onSave(() => {
    if (timer) return
    const wait = Math.max(0, NET.saveEvery * 1000 - (performance.now() - savedAt))
    timer = setTimeout(() => {
      timer = 0
      saveNow()
    }, wait)
  })
  // The play time still moves on while nothing else changes: push it now and then.
  setInterval(() => {
    if (!document.hidden && net.hydrated && !isGuest()) {
      lastSaved = ''
      saveNow()
    }
  }, NET.saveIdle * 1000)

  if (!hasServer()) return console.info('[net] no server configured; progress lasts this page only')
  // The first ready call connects; later ones are sign-in / sign-out.
  bloxity.subscribeAuth((s) => {
    if (!s.ready) return
    if (!net.connected) return void connect()
    const id = identity()
    if (id.userId === sentId) return send('identify', { ...id, pfp: bloxity.getPfp() })
    saveNow() // under the old id, before switching
    net.hydrated = false
    sentId = id.userId
    send('identify', { ...id, pfp: bloxity.getPfp() })
  })
  window.addEventListener('pagehide', saveNow)
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) saveNow()
  })
}
