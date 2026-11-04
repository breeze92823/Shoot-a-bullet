// The HUD from the reference shots, as DOM over the canvas:
//  left: rebirth + wins counters and the Rewards / Rebirth (READY!) / Evolve / Store tiles
//  top: AUTO WINS; right: 2X WINS / 2X DAMAGE passes
//  bottom: "<n> Damage", the LEVEL bar (MAX - REBIRTH!), +100K / +1M / +10M
//  while training: 3 MINIGAMES! / GAMES / AUTO REBIRTH and the purple x2 badge
//  world-anchored "+2 Damage" / "+12 WINS" popups, a toast line and modal windows:
//  Playtime Gifts (Rewards), Rebirth and Evolve Ammo are drawn like the reference windows
//  (`.win`); Store and Games use the plain list modal (`.modal`).
// Robux purchases are not connected: those buttons say so instead of charging.
import './hud.css'
import './windows.css'
import { Vector3 } from 'three'
import { AMMO_SKIP_ROBUX, BOOSTS, ECONOMY, PLAYTIME_GIFTS, SHOP, TRAINERS } from './config.js'
import * as game from './game.js'
import * as bloxity from './bloxity.js'

const ICON = {
  trophy: `<svg viewBox="0 0 64 64"><path d="M14 8h36v6h8c0 12-6 18-13 19-2 5-6 8-9 9v8h8v6H20v-6h8v-8c-3-1-7-4-9-9-7-1-13-7-13-19h8z" fill="#2a1500"/><path d="M17 11h30v9c0 10-6 17-15 17s-15-7-15-17z" fill="#ffc21f"/><path d="M17 11h8v10c0 6 2 11 6 14-8-1-14-7-14-15z" fill="#ffe27a"/><path d="M10 17h7v4c0 3 1 6 2 8-5-2-8-6-9-12zm44 0h-7v4c0 3-1 6-2 8 5-2 8-6 9-12z" fill="#ffb10f"/><rect x="22" y="50" width="20" height="5" fill="#ffb10f"/><circle cx="32" cy="22" r="5" fill="#2f8bff"/><circle cx="30.5" cy="20.5" r="1.6" fill="#bfe1ff"/></svg>`,
  rebirth: `<svg viewBox="0 0 64 64"><circle cx="32" cy="33" r="25" fill="#1b1b24"/><path d="M32 12a21 21 0 0 1 20 14l5-2-3 14-12-7 5-2a14 14 0 0 0-15-10z" fill="#ff2e3e" stroke="#1b1b24" stroke-width="2"/><path d="M12 33a20 20 0 0 1 20-21v7a14 14 0 0 0-13 14z" fill="#ff2e3e"/><path d="M52 33a20 20 0 0 1-33 15l-4 4-2-14 14 2-4 4a14 14 0 0 0 22-11z" fill="#ffffff" stroke="#1b1b24" stroke-width="2"/><path d="M12 33h7a13 13 0 0 0 4 9l-5 5a20 20 0 0 1-6-14z" fill="#dfe8ff"/></svg>`,
  gift: `<svg viewBox="0 0 64 64"><rect x="9" y="28" width="46" height="30" rx="3" fill="#7a3df0" stroke="#1b1b24" stroke-width="3"/><rect x="6" y="21" width="52" height="11" rx="3" fill="#9b5cff" stroke="#1b1b24" stroke-width="3"/><rect x="27" y="21" width="10" height="37" fill="#2fb4ff" stroke="#1b1b24" stroke-width="2"/><path d="M32 21c-6-12-20-14-18-5 1 5 10 5 18 5zm0 0c6-12 20-14 18-5-1 5-10 5-18 5z" fill="#2fb4ff" stroke="#1b1b24" stroke-width="3"/></svg>`,
  bullet: `<svg viewBox="0 0 64 64"><path d="M24 24c0-10 4-18 8-21 4 3 8 11 8 21z" fill="#ff8a2a" stroke="#1b1b24" stroke-width="3"/><path d="M28 22c0-7 2-12 4-15" stroke="#ffc27a" stroke-width="3" fill="none"/><rect x="23" y="23" width="18" height="34" rx="2" fill="#ffc21f" stroke="#1b1b24" stroke-width="3"/><rect x="27" y="26" width="4" height="28" fill="#ffe27a"/><rect x="21" y="54" width="22" height="6" rx="1" fill="#e89a0f" stroke="#1b1b24" stroke-width="3"/></svg>`,
  basket: `<svg viewBox="0 0 64 64"><path d="M18 26c0-12 28-12 28 0" fill="none" stroke="#1b1b24" stroke-width="8"/><path d="M18 26c0-12 28-12 28 0" fill="none" stroke="#5a6a8a" stroke-width="4"/><path d="M5 25h54l-6 30H11z" fill="#ff2e4a" stroke="#1b1b24" stroke-width="3"/><path d="M5 25h54v6H5z" fill="#ff6b7f" stroke="#1b1b24" stroke-width="3"/><path d="M19 35v15M28 35v15M37 35v15M46 35v15" stroke="#b3122a" stroke-width="4"/></svg>`,
  pistol: `<svg viewBox="0 0 80 56"><path d="M4 8h66l4 4v10H34l-2 4h-6l-4 26H6l8-26H8L4 22z" fill="#1b1b24"/><path d="M8 11h60l2 2v6H8z" fill="#9aa4b4"/><path d="M8 11h60v3H8z" fill="#d6dde8"/><path d="M12 25h10l-4 23h-8z" fill="#5a6270"/><rect x="66" y="10" width="7" height="5" fill="#1b1b24"/></svg>`,
  hand: `<svg viewBox="0 0 64 64"><path d="M22 34V12a5 5 0 0 1 10 0v16l2-1a5 5 0 0 1 6 2 5 5 0 0 1 6 2 5 5 0 0 1 7 4v10c0 9-7 15-16 15h-4c-6 0-10-3-13-8l-8-12a5 5 0 0 1 8-6z" fill="#fff" stroke="#1b1b24" stroke-width="3"/></svg>`,
}
// Winged sneaker (Speed / Jump Boost), potions (Wins Boost / All In One), the Before -> After
// arrow, and an ammo cartridge in a tier's colours.
const shoe = (c, dark) =>
  `<svg viewBox="0 0 64 64"><path d="M6 46 8 23c1-4 5-5 8-3l7 6c4 4 10 6 16 7l13 3c6 1 9 5 9 10v1H6z" fill="${c}" stroke="#1b1b24" stroke-width="3" stroke-linejoin="round"/><path d="M11 40V25c1-2 3-2 4-1" stroke="rgba(255,255,255,.5)" stroke-width="3" fill="none" stroke-linecap="round"/><path d="M24 29l3-3M29 31l3-3M34 33l3-3" stroke="#fff" stroke-width="2.6" stroke-linecap="round"/><path d="M14 22c1-10 9-17 24-19-3 3-4 5-4 7 4-1 8-1 10 0-3 2-6 4-8 6 3 0 6 1 8 2-6 2-13 4-19 8z" fill="#fff" stroke="#1b1b24" stroke-width="2.6" stroke-linejoin="round"/><path d="M20 15c4-4 9-7 15-9M22 19c4-3 9-4 14-4" stroke="#9fd8ff" stroke-width="2" fill="none"/><path d="M4 46h59v4c0 3-2 6-5 6H9c-3 0-5-3-5-6z" fill="#fff" stroke="#1b1b24" stroke-width="3" stroke-linejoin="round"/><path d="M7 51h54" stroke="${dark}" stroke-width="2.4"/></svg>`
const potion = (fill) =>
  `<svg viewBox="0 0 64 64"><defs><linearGradient id="pg-rb" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff4a4a"/><stop offset=".25" stop-color="#ffd21f"/><stop offset=".5" stop-color="#4fe04a"/><stop offset=".75" stop-color="#2fc3ff"/><stop offset="1" stop-color="#c84dff"/></linearGradient></defs><rect x="25" y="3" width="14" height="9" rx="3" fill="#c98a4a" stroke="#1b1b24" stroke-width="2.6"/><path d="M27 12h10v9c9 3 15 11 15 20 0 12-9 20-20 20S12 53 12 41c0-9 6-17 15-20z" fill="rgba(235,248,255,.85)" stroke="#1b1b24" stroke-width="3" stroke-linejoin="round"/><path d="M15.5 37c3-2 8-3 16-1s13 1 17-1c.5 1.5.5 3 .5 6 0 10-8 17-18 17S14 51 14 41c0-1.5.5-3 1.5-4z" fill="${fill}"/><path d="M20 30c2-3 5-5 7-6" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round"/><circle cx="22" cy="45" r="2.6" fill="rgba(255,255,255,.75)"/><circle cx="38" cy="50" r="1.8" fill="rgba(255,255,255,.6)"/></svg>`
const GIFT_ICON = {
  trophy: ICON.trophy,
  wingBlue: shoe('#2f8bff', '#1f5fd0'),
  wingRed: shoe('#ff3346', '#c81a2a'),
  potionGold: potion('#ffd23a'),
  potionRainbow: potion('url(#pg-rb)'),
}
const ARROW = `<svg class="ba-arrow" viewBox="0 0 48 28"><path d="M3 9h24V3l18 11-18 11v-6H3z" fill="#8fe0ff" stroke="#1b1b24" stroke-width="3" stroke-linejoin="round"/><path d="M6 12h22" stroke="#e2f8ff" stroke-width="2"/></svg>`
const ammoIcon = (a) =>
  `<svg viewBox="0 0 40 112"><path d="M20 3C10 12 5 27 5 44v8h30v-8c0-17-5-32-15-41z" fill="${a.tip}" stroke="#1b1b24" stroke-width="3" stroke-linejoin="round"/><rect x="5" y="50" width="30" height="46" rx="2" fill="${a.body}" stroke="#1b1b24" stroke-width="3"/><rect x="3" y="94" width="34" height="13" rx="2" fill="${a.body}" stroke="#1b1b24" stroke-width="3"/><path d="M11 45c0-14 3-25 7-34" stroke="rgba(255,255,255,.45)" stroke-width="3.6" fill="none" stroke-linecap="round"/><rect x="9" y="53" width="4.5" height="40" fill="rgba(255,255,255,.35)"/><rect x="27" y="52" width="5" height="42" fill="rgba(0,0,0,.16)"/><path d="M16.5 70l7 7m0-7l-7 7" stroke="rgba(0,0,0,.18)" stroke-width="1.6"/></svg>`
const BOOST_NAME = { speed: 'Speed', jump: 'Jump', wins: 'Wins', damage: 'Damage' }
const BOOST_ICON = { speed: GIFT_ICON.wingBlue, jump: GIFT_ICON.wingRed, wins: GIFT_ICON.potionGold, damage: ICON.pistol }
const mmss = (t) => {
  t = Math.ceil(t)
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`
}
const shopItem = (id) => SHOP.find((x) => x.id === id)
const NOT_CONNECTED = 'Robux purchases are not connected yet'

function el(tag, cls, html = '') {
  const e = document.createElement(tag)
  if (cls) e.className = cls
  e.innerHTML = html
  return e
}

export function createHud({ camera, onRebirth, onShoot, onEvolve }) {
  const root = el('div', 'hud')
  root.innerHTML = `
    <div class="hud-left">
      <div class="stat" data-k="rebirths">${ICON.rebirth}<span>0</span></div>
      <div class="stat" data-k="wins">${ICON.trophy}<span>0</span></div>
      <div class="tiles">
        <button class="tile lego purple" data-act="gifts">${ICON.gift}<span>Rewards</span><i class="badge">1</i></button>
        <button class="tile lego pink" data-act="rebirth">${ICON.rebirth}<span>Rebirth</span><b class="ready ol">READY!</b></button>
        <button class="tile lego orange" data-act="evolve">${ICON.bullet}<span>Evolve</span></button>
      </div>
    </div>
    <button class="auto-wins lego gold" data-act="shop:autowins">${ICON.trophy}<span>AUTO WINS<small>${game.fmt(shopItem('autowins').cost)} Wins</small></span></button>
    <div class="hud-right">
      <button class="pass lego gold" data-act="shop:wins2x">2X WINS</button>
      <div class="price">${game.fmt(shopItem('wins2x').cost)} WINS</div>
      <button class="pass lego rainbow" data-act="shop:damage2x">2X DAMAGE</button>
      <div class="price">${game.fmt(shopItem('damage2x').cost)} WINS</div>
      <div class="boost-list"></div>
    </div>
    <div class="popups"></div>
    <button class="click-badge" data-act="tapx2">${ICON.hand}<b class="ol">x2</b></button>
    <div class="hud-bottom">
      <button class="shoot-btn lego green" data-act="shoot"><span>SHOOT</span></button>
      <div class="damage">${ICON.pistol}<span>0 Damage</span></div>
      <div class="level lego orange"><div class="fill"></div><span class="lv">LEVEL 1</span><span class="rt"></span></div>
    </div>
    <div class="toast ol"></div>
    <div class="cine">
      <div class="bar top"></div><div class="bar bot"></div>
      <div class="cine-top"><div class="cine-wins">${ICON.trophy}<span>+0 WINS</span></div><div class="cine-count">0 / 0 SMASHED</div></div>
      <div class="dmg-layer"></div>
      <div class="cine-banner"></div>
      <div class="cine-stuck"><div class="stuck-line"></div><div class="stuck-wins">${ICON.trophy}<span></span></div></div>
      <div class="cine-flash"></div>
    </div>
    <div class="modal-back"><div class="win"><div class="win-head lego"><i class="win-icon"></i><span class="win-title"></span><button class="win-x lego red" data-act="close" aria-label="Close"><span>X</span></button></div><div class="win-body"></div></div><div class="modal lego"><div class="modal-head"><span class="ol modal-title"></span><button class="modal-close lego red" data-act="close">X</button></div><div class="modal-body"></div></div></div>`
  document.body.appendChild(root)
  const $ = (s) => root.querySelector(s)
  const stat = { rebirths: $('[data-k="rebirths"]'), wins: $('[data-k="wins"]') }
  const tiles = { rewards: $('[data-act="gifts"]'), rebirth: $('[data-act="rebirth"]') }
  const damageEl = $('.damage span')
  const level = $('.level')
  const toastEl = $('.toast')
  const back = $('.modal-back')
  const popLayer = $('.popups')
  const badge = $('.click-badge')
  const cineEl = $('.cine')
  const cineWins = $('.cine-wins')
  const cineCount = $('.cine-count')
  const cineBanner = $('.cine-banner')
  const cineStuck = $('.cine-stuck')
  const cineFlash = $('.cine-flash')

  // --- Toast ---
  let toastTimer = 0
  function toast(text, seconds = 2.2) {
    toastEl.textContent = text
    toastEl.classList.add('show')
    toastTimer = seconds
  }

  // --- Counters ---
  let shown = { wins: -1, rebirths: -1 }
  function bump(k) {
    stat[k].classList.remove('bump')
    void stat[k].offsetWidth
    stat[k].classList.add('bump')
  }
  function refresh(kind) {
    const s = game.stats
    for (const k of ['wins', 'rebirths']) {
      if (shown[k] !== s[k]) {
        if (shown[k] >= 0) bump(k)
        shown[k] = s[k]
        stat[k].querySelector('span').textContent = game.fmt(s[k])
      }
    }
    damageEl.textContent = `${game.fmt(s.damage)} Damage`
    const L = game.levelInfo()
    $('.lv').textContent = `LEVEL ${L.level}`
    $('.rt').textContent = L.max ? 'MAX - REBIRTH!' : `${game.fmt(s.damage)} / ${game.fmt(L.next)}`
    level.classList.toggle('notmax', !L.max)
    $('.level .fill').style.width = `${Math.round(L.progress * 100)}%`
    tiles.rebirth.classList.toggle('is-ready', L.max)
    $('.auto-wins small').textContent = game.hasPerk('autowins') ? 'ACTIVE' : `${game.fmt(shopItem('autowins').cost)} Wins`
    const r = game.giftsReady()
    tiles.rewards.classList.toggle('has-badge', r > 0)
    tiles.rewards.querySelector('.badge').textContent = String(r)
    if (openName === 'gifts') updateGifts()
    else if (openName === 'rebirth' || (openName && kind !== 'damage')) renderModal(openName)
  }
  game.onChange(refresh)

  // --- Modals ---
  let openName = null
  const body = $('.modal-body')
  function row(title, sub, btn, cls, act, disabled = false) {
    return `<div class="row"><div class="grow ol">${title}<small>${sub}</small></div>${btn ? `<button class="lego ${cls} ol" data-act="${act}" ${disabled ? 'disabled' : ''}>${btn}</button>` : ''}</div>`
  }
  function renderModal(name) {
    const s = game.stats
    let title = ''
    let html = ''
    if (WINDOWS[name]) return renderWindow(name)
    if (name === 'store') {
      title = 'Store'
      html = [
        ...SHOP.map((it) => {
          const owned = it.kind === 'perk' && game.hasPerk(it.id)
          return row(it.label, it.sub, owned ? 'OWNED' : `${game.fmt(it.cost)} Wins`, it.color === 'rainbow' ? 'gold' : it.color, `shop:${it.id}`, owned || s.wins < it.cost)
        }),
        ...[
          ...TRAINERS.filter((t) => t.robux).map((t) => [`${t.name} plot`, `${t.mult}x Damage / sec, no rebirth needed`, `${t.robux} R$`]),
        ].map(([a, b, c]) => row(a, b, c, 'gold', 'robux')),
      ].join('')
    } else if (name === 'games') {
      title = '3 Minigames!'
      html = ['Obby Rush', 'Target Frenzy', 'Bullet Dodge'].map((g) => row(g, 'Coming soon!', 'SOON', 'purple', 'soon')).join('')
    }
    $('.modal-title').textContent = title
    body.innerHTML = html
  }
  // --- The reference windows: Playtime Gifts, Rebirth, Evolve Ammo ---------------------
  const WINDOWS = {
    gifts: { title: 'Playtime Gifts', icon: ICON.gift, head: 'lime' },
    rebirth: { title: 'Rebirth', icon: ICON.rebirth, head: 'pink' },
    evolve: { title: 'Evolve Ammo', icon: ICON.bullet, head: 'pink' },
  }
  const win = $('.win')
  const winBody = $('.win-body')
  const winHead = $('.win-head')
  function renderWindow(name) {
    const w = WINDOWS[name]
    win.className = `win win-${name}`
    winHead.className = `win-head lego ${w.head}`
    $('.win-icon').innerHTML = w.icon
    $('.win-title').textContent = w.title
    if (name === 'gifts') {
      winBody.innerHTML = `<div class="gift-grid">${PLAYTIME_GIFTS.map(
        (g) => `<button class="gift lego gc-${g.card}" data-act="gift:${g.id}">
          <span class="g-title${g.title.length > 6 ? ' long' : ''}">${g.title}</span>
          <span class="g-icon">${GIFT_ICON[g.icon]}</span>
          <span class="g-val ${g.kind}">${g.kind === 'wins' ? game.fmt(g.amount) : `${BOOSTS[g.boosts[0]]}x (${g.minutes} min)`}</span>
          <span class="g-btn lego"></span>
        </button>`,
      ).join('')}</div>`
      updateGifts()
    } else if (name === 'rebirth') {
      const L = game.levelInfo()
      const now = game.rebirthMult()
      const fill = L.max ? 1 : Math.min(1, (L.level - 1 + L.progress) / (L.maxLevel - 1))
      winBody.innerHTML = `
        <div class="ba ba-labels"><span>Before:</span><i></i><span>After</span></div>
        <div class="ba"><div class="ba-box lego yellow">x${now} Damage</div>${ARROW}<div class="ba-box lego yellow">x${now + ECONOMY.rebirthBonus} Damage</div></div>
        <div class="ba"><div class="ba-box lego lime">Max Lvl ${L.maxLevel}</div>${ARROW}<div class="ba-box lime lego">Max Lvl ${game.maxLevel(game.stats.rebirths + 1)}</div></div>
        <div class="rb-warn">Rebirthing resets your Damage!</div>
        <div class="rb-bar lego${L.max ? ' full' : ''}"><div class="rb-fill" style="width:${(fill * 100).toFixed(1)}%"></div><span>Lvl ${L.level}/${L.maxLevel}</span></div>
        <div class="w-btns"><button class="w-cta lego green${L.max ? '' : ' off'}" data-act="do-rebirth">Rebirth</button></div>`
    } else if (name === 'evolve') {
      const cur = game.ammoDef()
      const next = game.nextAmmo()
      const card = (a, cls) => `<div class="ammo-card ${cls}"><div class="ammo-in lego">${a ? ammoIcon(a) : '<b class="ammo-max">MAX!</b>'}<span>${a ? a.name : 'Fully Evolved'}</span></div></div>`
      const mult = (a) => (a ? `<span class="ammo-mult">${ICON.trophy}x${a.wins} Wins</span>` : '<span></span>')
      const afford = next && game.stats.wins >= next.cost
      winBody.innerHTML = `
        <div class="ba ba-labels ev"><span>Before</span><i></i><span>After</span></div>
        <div class="ba ev">${card(cur, 'ac-slate')}${ARROW}${card(next, 'ac-red')}</div>
        <div class="ba ev mults">${mult(cur)}<i></i>${mult(next)}</div>
        <div class="ev-cost">${next ? `${ICON.trophy}<span>Costs ${game.fmt(next.cost)} Wins</span>` : '<span>Your ammo is fully evolved!</span>'}</div>
        <div class="w-btns"><button class="w-cta lego green${afford ? '' : ' off'}" data-act="evolve-ammo">EVOLVE</button><button class="w-cta skip lego" data-act="robux">SKIP ${AMMO_SKIP_ROBUX} R$</button></div>`
    }
  }
  // Each gift card's button: Claim! (ready), the countdown (waiting) or Claimed.
  function updateGifts() {
    for (const g of PLAYTIME_GIFTS) {
      const card = winBody.querySelector(`[data-act="gift:${g.id}"]`)
      if (!card) continue
      const st = game.giftState(g)
      const text = st === 'ready' ? 'Claim!' : st === 'claimed' ? 'Claimed' : mmss(game.giftIn(g))
      const btn = card.querySelector('.g-btn')
      if (btn.textContent !== text) btn.textContent = text
      if (card.dataset.st !== st) {
        card.dataset.st = st
        btn.className = `g-btn lego ${st === 'ready' ? 'green' : st === 'claimed' ? 'grey' : 'hot'}`
      }
    }
  }

  function open(name) {
    openName = name
    back.classList.toggle('is-win', !!WINDOWS[name])
    renderModal(name)
    back.classList.add('open')
  }
  function close() {
    openName = null
    back.classList.remove('open')
  }

  root.addEventListener('pointerdown', (e) => {
    const b = e.target.closest('[data-act]')
    if (e.target === back) return close()
    if (!b || b.disabled) return
    e.preventDefault()
    e.stopPropagation()
    const act = b.dataset.act
    if (act === 'close') close()
    else if (act === 'shoot') onShoot?.()
    else if (act === 'tapx2') {
      tapTime = 10
      badgeLeft = 0
      badgeWait = 4 + Math.random() * 6
      toast('x2 Damage for 10 seconds!')
    } else if (act === 'robux') toast(NOT_CONNECTED)
    else if (act.startsWith('shop:')) {
      const r = game.buyShop(act.slice(5))
      if (r.msg) toast(r.msg)
    }
    else if (act === 'soon') toast('Minigames are coming soon!')
    else if (act.startsWith('gift:')) {
      const g = PLAYTIME_GIFTS.find((x) => x.id === act.slice(5))
      const st = game.giftState(g)
      if (st === 'ready') {
        const msg = game.claimGift(g.id)
        if (msg) toast(msg)
        replay(b, 'claimed-pop')
      } else if (st === 'waiting') toast(`Ready in ${mmss(game.giftIn(g))}!`)
    } else if (act === 'do-rebirth') {
      const L = game.levelInfo()
      if (!L.max) toast(`Reach Lvl ${L.maxLevel} to Rebirth!`)
      else if (game.rebirth()) {
        close()
        onRebirth?.()
      }
    } else if (act === 'evolve-ammo') {
      const r = game.evolveAmmo()
      if (r.msg) toast(r.msg)
      if (r.ok) onEvolve?.(game.ammoDef())
    } else open(act)
  })
  // Pointer events on the HUD must never reach the canvas (no pointer lock / camera drag).
  for (const ev of ['pointerdown', 'pointerup', 'wheel']) root.addEventListener(ev, (e) => e.target !== root && e.stopPropagation())

  // --- Layout: keep out of Boxity's toolbar + chat rectangles -------------------------------
  bloxity.onReservedAreas((areas) => {
    let leftTop = 12
    let topY = 4
    const cx = window.innerWidth / 2
    for (const a of areas) {
      if (a.left < 260) leftTop = Math.max(leftTop, a.top + a.height + 8)
      if (a.id !== 'chat' && a.left < cx + 130 && a.left + a.width > cx - 130) topY = Math.max(topY, a.top + a.height + 6)
    }
    root.style.setProperty('--left-top', `${leftTop}px`)
    root.style.setProperty('--top-y', `${topY}px`)
  })

  // Short (landscape phone) screens: the training row moves up under AUTO WINS so it
  // never covers the player standing mid-screen.

  // --- World-anchored popups ---------------------------------------------------------------
  const pops = []
  const v = new Vector3()
  function project(p) {
    v.set(p.x, p.y, p.z).project(camera)
    return { x: (v.x * 0.5 + 0.5) * window.innerWidth, y: (-v.y * 0.5 + 0.5) * window.innerHeight, behind: v.z > 1 }
  }
  function popup(world, html, cls, life = 1.3, scale = 1) {
    const e = el('div', `popup ${cls}`, html)
    popLayer.appendChild(e)
    pops.push({ e, p: new Vector3(world.x, world.y, world.z), t: 0, life, dx: (Math.random() - 0.5) * 120, scale })
    if (pops.length > 40) pops.shift().e.remove()
  }

  // --- Shot cinematic overlay -----------------------------------------------------------------
  // Restarts a CSS animation on `e` by toggling class `cls`.
  function replay(e, cls) {
    e.classList.remove(cls)
    void e.offsetWidth
    e.classList.add(cls)
  }
  const esc = (t) => t.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c])
  // A zone name drawn its own way (config ZONES[i].banner): one colour + outline, or per-letter colours.
  function zoneName(z, suffix = '!') {
    const b = z.banner
    const text = z.name + suffix
    const font = b.font ? ` f-${b.font}` : ''
    if (b.letters) {
      const letters = [...text].map((ch, i) => `<i style="color:${b.letters[i % b.letters.length]}">${esc(ch)}</i>`).join('')
      return `<span class="zn lettered${font}" style="--ol:${b.outline};--ink2:${b.ink}">${letters}</span>`
    }
    return `<span class="zn${font}" style="color:${b.fill};--ol:${b.outline};--ink2:${b.outline}">${esc(text)}</span>`
  }
  let cineTotal = 0
  // Damage numbers: one per object the bullet goes through (the HP it tore through), and a
  // red one on the object it sticks in ("NEED <hp>"). Pooled elements, spawned at the
  // object's screen point, then flung out in screen space (the camera outruns world anchors).
  const dmgLayer = $('.dmg-layer')
  const cineTopEl = $('.cine-top')
  const dmgs = Array.from({ length: 28 }, () => {
    const e = el('div', 'dmg', '<b></b><small></small>')
    dmgLayer.appendChild(e)
    return { e, b: e.firstChild, sm: e.lastChild, t: 0, life: 0, x: 0, y: 0, vx: 0, vy: 0, g: 0, scale: 1, rot: 0 }
  })
  let dmgNext = 0
  let dmgSide = 1
  const zoneColor = (z) => z?.banner?.fill ?? z?.banner?.letters?.[0] ?? '#ffd21f'
  function spawnDmg(world, amount, { zone, big = false, blocked = false, need = 0, index = 0 } = {}) {
    const s = project(world)
    if (s.behind) return
    const d = dmgs[dmgNext]
    dmgNext = (dmgNext + 1) % dmgs.length
    const W = window.innerWidth
    const H = window.innerHeight
    const k = Math.min(W, H * 1.6) / 1000 // px speeds follow the screen size
    d.b.textContent = game.fmt(amount)
    d.sm.textContent = blocked ? `NEED ${game.fmt(need)}` : ''
    d.e.className = `dmg${big ? ' big' : ''}${blocked ? ' blocked' : ''}`
    d.e.style.setProperty('--c', zoneColor(zone))
    d.t = 0
    dmgSide = -dmgSide
    if (blocked) {
      d.life = 2.3
      d.x = W * 0.5
      // Just under the SMASHED counter (its place depends on the screen; one layout read, once).
      d.e.style.opacity = '0'
      d.y = cineTopEl.getBoundingClientRect().bottom + 6 + d.e.offsetHeight / 2
      d.vx = 0
      d.vy = -8 * k
      d.g = 0
      d.rot = 0
      d.scale = 1
    } else {
      d.life = big ? 1.05 : 0.75
      d.x = Math.max(40, Math.min(W - 40, s.x + dmgSide * W * (0.03 + Math.random() * 0.07)))
      d.y = Math.max(H * 0.3, Math.min(H - 40, s.y + 10 * k))
      d.vx = dmgSide * (0.26 + Math.random() * 0.3) * Math.max(W, 700) // out to the sides, clear of the zone banner
      d.vy = -(170 + Math.random() * 170) * k
      d.g = 1100 * k
      d.rot = dmgSide * (4 + Math.random() * 8)
      d.scale = (big ? 1.15 : 0.82) + Math.min(0.45, index / 300) // later objects hit harder: bigger numbers
    }
  }
  function updateDmg(dt) {
    for (const d of dmgs) {
      if (d.life <= 0) continue
      d.t += dt
      const u = d.t / d.life
      if (u >= 1) {
        d.life = 0
        d.e.style.opacity = '0'
        continue
      }
      d.vy += d.g * dt
      d.x += d.vx * dt
      d.y += d.vy * dt
      d.vx *= Math.exp(-dt * 2.5)
      const pop = u < 0.08 ? 0.35 + (u / 0.08) * 1.15 : u < 0.18 ? 1.5 - ((u - 0.08) / 0.1) * 0.5 : 1
      d.e.style.opacity = String(u < 0.65 ? 1 : 1 - (u - 0.65) / 0.35)
      d.e.style.transform = `translate3d(${d.x}px, ${d.y}px, 0) translate(-50%, -50%) rotate(${d.rot * u}deg) scale(${pop * d.scale})`
    }
  }
  function clearDmg() {
    for (const d of dmgs) {
      d.life = 0
      d.e.style.opacity = '0'
    }
  }
  // The wins counter's bump on every smash: Web Animations, so no forced layout per smash.
  const cineWinsSpan = cineWins.querySelector('span')
  const BUMP = [{ transform: 'scale(1)' }, { transform: 'scale(1.14)', offset: 0.4 }, { transform: 'scale(1)' }]
  let bumpAnim = null
  // The zone fonts are only fetched on first use: ask for them now so the first banner is right.
  document.fonts?.load?.('400 64px Creepster').catch(() => {})
  document.fonts?.load?.('400 64px Rye').catch(() => {})
  const cine = {
    begin(result) {
      root.classList.add('cine-on')
      document.body.classList.add('in-cine')
      cineEl.className = 'cine on'
      cineTotal = game.OBJECT_COUNT
      cineWins.querySelector('span').textContent = '+0 WINS'
      cineCount.textContent = `0 / ${cineTotal} SMASHED`
      cineBanner.innerHTML = ''
      cineStuck.querySelector('.stuck-line').innerHTML = ''
      clearDmg()
    },
    flying() {
      cineEl.classList.add('flying')
    },
    smash(count, wins) {
      cineEl.classList.add('counting')
      cineWinsSpan.textContent = `+${game.fmt(wins)} ${wins === 1 ? 'WIN' : 'WINS'}`
      cineCount.textContent = `${count} / ${cineTotal} SMASHED`
      if (cineWinsSpan.animate) {
        bumpAnim?.cancel()
        bumpAnim = cineWinsSpan.animate(BUMP, { duration: 220, easing: 'ease-out' })
      }
    },
    hit: spawnDmg,
    zone(z) {
      cineBanner.innerHTML = zoneName(z)
      replay(cineBanner, 'pop')
    },
    stuck(z, wins, all) {
      cineEl.classList.add('stuck')
      cineBanner.classList.remove('pop')
      cineStuck.querySelector('.stuck-line').innerHTML = all ? `<span class="zn" style="color:#ffe23a;--ol:#8a3a00;--ink2:#3a1500">SMASHED EVERYTHING!</span>` : `<span class="stuck-in">STUCK IN</span> ${zoneName(z)}`
      cineStuck.querySelector('.stuck-wins span').textContent = `+${game.fmt(wins)} ${wins === 1 ? 'WIN' : 'WINS'}!`
      cineStuck.classList.toggle('none', wins <= 0)
      replay(cineStuck, 'pop')
    },
    leaving() {
      replay(cineFlash, 'go')
    },
    end() {
      root.classList.remove('cine-on')
      document.body.classList.remove('in-cine')
      cineEl.className = 'cine'
      replay(cineFlash, 'go')
      clearDmg()
    },
  }

  const boostList = $('.boost-list')
  let boostHtml = ''
  let uiClock = 0

  // Player-anchored badge position.
  const badgeAt = new Vector3()
  let shownTraining = false
  let shownShoot = false
  const TAP_BOOST_SECONDS = 10
  const badgeOff = { x: 0, y: 0 }
  let badgeLeft = 0
  let badgeWait = 3
  let badgeShown = false
  let tapTime = 0

  return {
    toast,
    // Damage multiplier from tapping the x2 badge.
    tapMult: () => (tapTime > 0 ? 2 : 1),
    refresh,
    open,
    cine,
    damagePopup(world, amount, crit) {
      popup(world, `${ICON.pistol}<span>+${game.fmt(amount)} Damage</span>`, crit ? 'crit' : '', 1.3, crit ? 1.45 : 0.75 + Math.random() * 0.5)
    },
    winsPopup(world, amount) {
      popup(world, `<span>+${game.fmt(amount)} ${amount === 1 ? 'WIN' : 'WINS'}</span>`, 'wins', 2.2, 1.5)
    },
    missPopup(world) {
      popup(world, '<span>Too weak! Train more</span>', 'miss', 1.8, 1)
    },
    // Per frame: popups follow their world point, rise and fade; status classes.
    update(dt, { training, playerPos, canShoot }) {
      if (game.hasPerk('autorebirth') && game.canRebirth() && game.rebirth()) {
        toast('Auto Rebirth!')
        onRebirth?.()
      }
      if (training !== shownTraining) {
        shownTraining = training
        root.classList.toggle('training', training)
      }
      if (canShoot !== shownShoot) {
        shownShoot = canShoot
        root.classList.toggle('can-shoot', canShoot)
      }
      for (let i = pops.length - 1; i >= 0; i--) {
        const p = pops[i]
        p.t += dt
        const u = p.t / p.life
        if (u >= 1) {
          p.e.remove()
          pops.splice(i, 1)
          continue
        }
        const s = project(p.p)
        if (s.behind) {
          p.e.style.opacity = '0'
          continue
        }
        const pop = u < 0.12 ? 0.6 + (u / 0.12) * 0.6 : 1.2 - Math.min(0.2, (u - 0.12) * 0.6)
        p.e.style.opacity = String(u < 0.7 ? 1 : 1 - (u - 0.7) / 0.3)
        p.e.style.transform = `translate(${s.x + p.dx * u}px, ${s.y - 30 - u * 110}px) translate(-50%, -50%) scale(${pop * p.scale})`
      }
      updateDmg(dt)
      if (tapTime > 0) tapTime = Math.max(0, tapTime - dt)
      // The x2 badge only shows up now and then, at a random spot near the player; tapping it
      // doubles the Damage gained from training for TAP_BOOST_SECONDS.
      if (!training) {
        badgeLeft = 0
        badgeWait = 3
      } else if (badgeLeft > 0) {
        badgeLeft -= dt
        if (badgeLeft <= 0) badgeWait = 4 + Math.random() * 6
      } else if ((badgeWait -= dt) <= 0) {
        const a = Math.random() * Math.PI * 2
        const r = Math.min(160, window.innerWidth * 0.2) * (0.6 + Math.random() * 0.4)
        badgeOff.x = Math.cos(a) * r
        badgeOff.y = Math.sin(a) * r * 0.7 - 40
        badgeLeft = 5
      }
      const showBadge = training && badgeLeft > 0
      if (showBadge !== badgeShown) {
        badgeShown = showBadge
        badge.classList.toggle('show', showBadge)
      }
      if (showBadge) {
        badgeAt.set(playerPos.x, playerPos.y + 1.2, playerPos.z)
        const s = project(badgeAt)
        badge.style.transform = `translate(${s.x + badgeOff.x}px, ${s.y + badgeOff.y}px) translate(-50%, -50%)`
      }
      if (toastTimer > 0) {
        toastTimer -= dt
        if (toastTimer <= 0) toastEl.classList.remove('show')
      }
      // Four times a second: the gift countdowns and the active boost chips.
      uiClock += dt
      if (uiClock > 0.25) {
        uiClock = 0
        if (openName === 'gifts') updateGifts()
        let html = ''
        for (const k in game.boosts) {
          const t = game.boosts[k]
          if (t > 0) html += `<div class="boost-chip">${BOOST_ICON[k]}<span>${BOOSTS[k]}x ${BOOST_NAME[k]}</span><b>${mmss(t)}</b></div>`
        }
        if (html !== boostHtml) boostList.innerHTML = boostHtml = html
      }
    },
  }
}
