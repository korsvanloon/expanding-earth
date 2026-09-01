import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { loadRaster } from './tools/lib/raster.js'
import { readGrid } from './tools/lib/grid.js'
import { fractureZones, lineaments, lineamentAt } from './tools/lib/structure.js'
import { traceFlowLines } from './tools/lib/flowlines.js'
import { R0_KM } from './shared/model.js'
const NODATA=255
const ageFull = loadRaster(resolve('public/textures/age-map.png'))
const ageMa = new Float32Array(ageFull.width*ageFull.height)
for (let i=0;i<ageMa.length;i++) ageMa[i]=ageFull.data[i]===NODATA?NaN:(ageFull.data[i]/255)*280
const grid = readGrid(readFileSync('data-src/vgg.grid'))
const sharp = lineaments(grid, R0_KM, 60, 25)
const fz = fractureZones(sharp, ageMa, ageFull.width, ageFull.height, R0_KM)
const q=(a:number[],p:number)=>{const s=[...a].sort((x,y)=>x-y);return s[Math.floor(p*s.length)]??0}
// thresholds on the detected value
const vals: number[] = []
for (let i=0;i<fz.ridgeness.length;i++) if (fz.ridgeness[i]>0) vals.push(fz.ridgeness[i])
console.log(`${vals.length} cells survive the thinning; value quartiles ${q(vals,0.25).toFixed(3)} / ${q(vals,0.5).toFixed(3)} / ${q(vals,0.75).toFixed(3)}, p95 ${q(vals,0.95).toFixed(3)}`)

const traced = traceFlowLines(ageMa, ageFull.width, ageFull.height, { seedSpacingKm: 250 })
const cut = (p: number) => q(vals, p)
const buckets = new Map<string, number[]>()
for (const t of traced.tracks) for (let i=1;i<t.points.length;i++){
  const a=t.points[i-1], b=t.points[i]
  let hx=b.x-a.x,hy=b.y-a.y,hz=b.z-a.z
  const hl=Math.hypot(hx,hy,hz); if(hl<1e-9) continue
  hx/=hl;hy/=hl;hz/=hl
  const l=Math.hypot(b.x,b.y,b.z)||1
  const u=Math.atan2(-b.z/l,b.x/l)/(2*Math.PI)+0.5, v=Math.acos(Math.min(1,Math.max(-1,b.y/l)))/Math.PI
  const col=Math.min(fz.width-1,Math.floor(u*fz.width)%fz.width), row=Math.min(fz.height-1,Math.floor(v*fz.height))
  const value = fz.ridgeness[row*fz.width+col]
  const f=lineamentAt(sharp,b.x,b.y,b.z); if(!f) continue
  let d=f.tx*hx+f.ty*hy+f.tz*hz; if(d<0)d=-d
  const ang = Math.acos(Math.min(1,d))*180/Math.PI
  for (const [name, lo] of [['all cells',-1],['top half',cut(0.5)],['top tenth',cut(0.9)],['top 2%',cut(0.98)]] as const) {
    if (value > lo) { if(!buckets.has(name)) buckets.set(name,[]); buckets.get(name)!.push(ang) }
  }
}
for (const [name, a] of buckets) {
  console.log(`${name.padEnd(10)}: median ${q(a,0.5).toFixed(0).padStart(2)} deg from the flow, within 20: ${(100*a.filter(x=>x<20).length/a.length).toFixed(0)}%  (n=${a.length})`)
}
