// What the Leaderboard board shows, per stat: { rows: [{ name, value }], rank }. The server's lists
// land here (net.js `leaderboard`); each one replaces its entry. Empty offline.
export const leaders = { wins: { rows: [], rank: null }, rebirths: { rows: [], rank: null }, damage: { rows: [], rank: null } }
let listener = null
export const onLeaders = (fn) => (listener = fn)

export function setLeaders({ boards, ranks } = {}) {
  for (const stat of Object.keys(leaders)) {
    const rows = boards?.[stat]
    if (Array.isArray(rows)) leaders[stat] = { rows, rank: ranks?.[stat] ?? null }
  }
  listener?.()
}
