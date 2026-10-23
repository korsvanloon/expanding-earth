/**
 * Carry a change made by hand to one concept moment on to the later ones.
 *
 * A reader re-lays, say, 45 Ma. Each piece's later moments were laid from its
 * old 45 Ma pose; so the turn of the sphere that takes a piece from its old to
 * its new pose at 45 Ma is applied to its pose at 90, 135 and 180 Ma too, and
 * what was laid between the moments is kept.
 *
 *     node tools/rebase-concepts.mjs .stage/concepts/concepts.json \
 *       .stage/concepts/aligned.json <store dir of placements/m*.json> \
 *       .stage/concepts/rebased.json 45
 *
 * `aligned.json` is the layout the reader started from (what the last build
 * wrote); the store directory holds the reader's edits as the page keeps them
 * (`ArtifactData list placements` with an out_dir). The result is a
 * CONCEPT_BASE for tools/build-concepts.ts.
 */
import fs from 'node:fs'

const [, , conceptsPath, alignedPath, storeDir, outPath, baseMa] = process.argv
const C = JSON.parse(fs.readFileSync(conceptsPath, 'utf8'))
const old = JSON.parse(fs.readFileSync(alignedPath, 'utf8'))
const DEG = Math.PI / 180
const dir = (lon, lat) => { const a = lon * DEG, b = lat * DEG, c = Math.cos(b); return [c * Math.cos(a), Math.sin(b), -c * Math.sin(a)] }
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const unit = (a) => { const l = Math.hypot(...a); return a.map((v) => v / l) }
const frame = (up) => { let e = cross([0, 1, 0], up); if (Math.hypot(...e) < 1e-9) e = [0, 0, -1]; e = unit(e); return { east: e, north: cross(up, e), up } }
const mul = (a, b) => [0, 1, 2].map((r) => [0, 1, 2].map((c) => a[r][0] * b[0][c] + a[r][1] * b[1][c] + a[r][2] * b[2][c]))
const T = (a) => [0, 1, 2].map((r) => [0, 1, 2].map((c) => a[c][r]))
const app = (a, v) => [0, 1, 2].map((r) => a[r][0] * v[0] + a[r][1] * v[1] + a[r][2] * v[2])
function pose(p, at) {
  const home = frame(dir(p.lon, p.lat)), there = frame(dir(at.lon, at.lat)), s = (at.spin || 0) * DEG
  const h = [0, 1, 2].map((i) => there.north[i] * Math.cos(s) + there.east[i] * Math.sin(s))
  const to = [cross(h, there.up), h, there.up], from = [home.east, home.north, home.up]
  return [0, 1, 2].map((r) => [0, 1, 2].map((c) => to[0][r] * from[0][c] + to[1][r] * from[1][c] + to[2][r] * from[2][c]))
}
function placement(p, q) {
  const home = frame(dir(p.lon, p.lat)), up = app(q, home.up), n = app(q, home.north), f = frame(up)
  return { lat: Math.asin(Math.max(-1, Math.min(1, up[1]))) / DEG, lon: Math.atan2(-up[2], up[0]) / DEG, spin: Math.atan2(dot(n, f.east), dot(n, f.north)) / DEG }
}
const full = (ma) => {
  const m = C.moments.find((x) => x.ma === ma)
  const mine = JSON.parse(fs.readFileSync(`${storeDir}/m${ma}.json`, 'utf8')).pieces
  return Object.fromEntries(C.pieces.map((p) => [p.id, mine[p.id] || m.place[p.id]]))
}
const base = Number(baseMa)
const now = full(base)
const out = { moments: { [base]: now } }
let moved = 0
for (const p of C.pieces) {
  const a = old[base][p.id], b = now[p.id]
  if (Math.abs(a.lat - b.lat) + Math.abs(a.lon - b.lon) + Math.abs((a.spin || 0) - (b.spin || 0)) > 1e-3) moved++
}
console.log(`${moved} pieces moved at ${base} Ma since it was last read`)
for (const m of C.moments.filter((x) => x.ma > base)) {
  const was = full(m.ma)
  out.moments[m.ma] = Object.fromEntries(C.pieces.map((p) => {
    const change = mul(pose(p, now[p.id]), T(pose(p, old[base][p.id])))
    return [p.id, placement(p, mul(change, pose(p, was[p.id])))]
  }))
}
fs.writeFileSync(outPath, JSON.stringify(out, null, 1))
