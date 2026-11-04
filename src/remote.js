// Other players in the room, drawn like the local one: the same Bloxity rig dressed with THEIR
// skin, cosmetics and proportions, the procedural animator driven by their streamed speed /
// grounded / vertical velocity, and their equipped gun raised in the aim pose with recoil on each
// shot. Poses arrive through the synced room state (see backend WorldState.PlayerState) and are
// smoothed here; looks arrive once and rebuild the model only when they change.
import { Group, Vector3 } from 'three'
import { PLAYER_DIMS } from './config.js'
import { buildDefaultCharacter, loadBaseCharacter } from './avatar/character.js'
import { applyProportions, attachEquippedAccessories } from './avatar/loader.js'
import { disposeAnimator, makeAnimator } from './avatar/animator.js'
import { applyAim, attachToHand } from './shooting.js'
import { makeGun } from './guns.js'
import { GUNS } from './config.js'
import { signSprite } from './signs.js'
import { net } from './net.js'

const SEND_EVERY = 1 / 15 // s between pose messages
const FAR = 400 // beyond this many metres a remote player is hidden
const parse = (s) => {
  try {
    return s ? JSON.parse(s) : null
  } catch {
    return null
  }
}
const lerpAngle = (a, b, t) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * t
const tmp = new Vector3()

export function createRemotePlayers(scene, particles) {
  const peers = new Map() // sessionId -> peer
  let sendClock = 0
  let lastLook = ''
  let lastRoom = null

  function makePeer(id, state) {
    const group = new Group()
    group.visible = false
    scene.add(group)
    const tag = signSprite([{ text: state.username || 'Player', size: 46, color: '#ffffff', outline: '#000000' }], 0.42)
    tag.position.set(0, PLAYER_DIMS.height + 0.55, 0)
    group.add(tag)
    const peer = { id, group, tag, name: state.username || 'Player', avatar: null, animator: null, gun: null, gunId: '', lookKey: '', gen: 0, pos: null, facing: 0, aim: 0, recoil: 0, shots: state.shots, flash: 0 }
    setAvatar(peer, buildDefaultCharacter())
    return peer
  }

  function setAvatar(peer, avatar) {
    if (peer.avatar) peer.group.remove(peer.avatar)
    disposeAnimator(peer.animator)
    peer.avatar = avatar
    peer.group.add(avatar)
    peer.gun = null
    peer.gunId = '' // re-attached on the next update
    peer.animator = makeAnimator(avatar)
  }

  async function loadLook(peer, state) {
    const gen = ++peer.gen
    const equipped = parse(state.look)
    const proportions = parse(state.prop)
    const group = await loadBaseCharacter()
    if (gen !== peer.gen) return
    if (equipped) await attachEquippedAccessories(group, equipped, { skinTextureUrl: state.skin || null })
    if (gen !== peer.gen) return
    applyProportions(group, proportions)
    setAvatar(peer, group)
  }

  function syncGun(peer, state) {
    const id = state.gun
    if (!peer.avatar || !id || id === peer.gunId) return
    peer.gunId = id
    peer.gun?.removeFromParent()
    const def = GUNS.find((g) => g.id === id) ?? GUNS[0]
    peer.gun = attachToHand(peer.avatar, makeGun(def))
  }

  function removePeer(peer) {
    peer.gen++
    disposeAnimator(peer.animator)
    scene.remove(peer.group)
  }

  return {
    // Streams the local player's pose (and look, when it changed) to the room.
    send(dt, snap) {
      if (!net.connected || !net.room) return
      if (net.room !== lastRoom) {
        lastRoom = net.room
        lastLook = '' // a fresh connection: send the look again
      }
      if (snap.look && snap.look !== lastLook) {
        lastLook = snap.look
        try {
          net.room.send('look', snap.lookMsg)
        } catch {}
      }
      sendClock += dt
      if (sendClock < SEND_EVERY) return
      sendClock = 0
      try {
        net.room.send('pose', snap.pose)
      } catch {}
    },
    update(dt, localPos) {
      const room = net.room
      const players = room?.state?.players
      const seen = new Set()
      if (players) {
        players.forEach((state, id) => {
          if (id === room.sessionId || !state.ready) return
          seen.add(id)
          let peer = peers.get(id)
          if (!peer) {
            peer = makePeer(id, state)
            peers.set(id, peer)
          }
          if (peer.name !== state.username) {
            peer.name = state.username
            peer.tag.removeFromParent()
            peer.tag = signSprite([{ text: state.username || 'Player', size: 46, color: '#ffffff', outline: '#000000' }], 0.42)
            peer.tag.position.set(0, PLAYER_DIMS.height + 0.55, 0)
            peer.group.add(peer.tag)
          }
          const lookKey = `${state.look}|${state.skin}|${state.prop}`
          if (lookKey !== peer.lookKey) {
            peer.lookKey = lookKey
            loadLook(peer, state).catch((err) => console.warn('[remote] look failed', err))
          }
          syncGun(peer, state)

          // Smooth toward the latest streamed pose.
          if (!peer.pos) {
            peer.pos = new Vector3(state.x, state.y, state.z)
            peer.facing = state.facing
          }
          const k = 1 - Math.exp(-14 * dt)
          const far = tmp.set(state.x, state.y, state.z).distanceTo(peer.pos) > 8
          if (far) peer.pos.set(state.x, state.y, state.z)
          else peer.pos.lerp(tmp, k)
          peer.facing = lerpAngle(peer.facing, state.facing, k)
          peer.aim += (state.aim - peer.aim) * (1 - Math.exp(-12 * dt))
          if (state.shots !== peer.shots) {
            peer.shots = state.shots
            peer.recoil = 0.35
            peer.flash = 0.08
          }
          peer.recoil *= Math.exp(-dt * 9)
          peer.group.position.copy(peer.pos)
          peer.group.rotation.y = peer.facing
          peer.group.visible = localPos ? Math.hypot(peer.pos.x - localPos.x, peer.pos.z - localPos.z) < FAR : true
          peer.animator?.update(dt, { grounded: state.grounded, speed: state.speed, verticalVelocity: state.vy, turn: 0 })
          applyAim(peer.animator?.rig, peer.aim, peer.recoil)
          if (peer.gun) peer.gun.visible = peer.aim > 0.02
          if (peer.flash > 0) {
            peer.flash -= dt
            if (peer.gun?.userData.muzzle && peer.group.visible) {
              peer.gun.updateWorldMatrix(true, false)
              tmp.copy(peer.gun.userData.muzzle)
              peer.gun.localToWorld(tmp)
              particles.burst(tmp.x, tmp.y, tmp.z, 6, { speed: 3, up: 0.5, colors: ['#ffd21f', '#ffffff'], size: 0.3, life: 0.2, boost: 2 })
            }
          }
        })
      }
      for (const [id, peer] of peers) {
        if (seen.has(id)) continue
        removePeer(peer)
        peers.delete(id)
      }
    },
  }
}
