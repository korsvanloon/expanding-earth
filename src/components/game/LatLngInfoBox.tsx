import { areaNukes, areas } from 'data'
import { formatFloat, formatInt, formatNumber } from 'lib/format'
import { getPixelColor, pixelColorToHex, uvToPixel } from 'lib/image'
import { isValue } from 'lib/iterable'
import { PI } from 'lib/math'
import { Point, UV } from 'lib/type'
import classes from './LatLngInfoBox.module.css'

const LatLngInfoBox = ({ latLng, areaData }: { latLng: Point; areaData?: ImageData }) => {
  const uv: UV = {
    x: latLng.x / (2 * PI) + 0.5,
    y: latLng.y / PI + 0.5,
  }

  const height = 1024
  const color = areaData
    ? pixelColorToHex(getPixelColor(areaData, uvToPixel(uv, height)))
    : undefined
  const area = color ? areas.find((a) => a.color === color) : undefined

  const nukes = areaNukes.find((n) => n.name === area?.name)
  return (
    <div className={classes.container}>
      {'       horiz. verti.'}
      {[
        { name: 'UV    ', value: uv },
        { name: 'LatLng', value: latLng },
      ]
        .filter(isValue)
        .map(({ name, value }) => (
          <div key={name}>
            {name} {formatFloat(value.x)} {formatFloat(value.y)}
          </div>
        ))}
      {color && <div className={classes.color} style={{ backgroundColor: color }}></div>}
      {area && (
        <div>
          <div>Name {area.name}</div>
          <div>Pop {formatNumber(area.population)} k</div>
        </div>
      )}
      {nukes && (
        <div>
          <div>
            Nukes{'   '}
            {formatInt(nukes.active)}
            {'  '}
            {formatInt(nukes.reserve)}
          </div>
          <div>
            LatLng {formatFloat(nukes.latLng.x)} {formatFloat(nukes.latLng.y)}
          </div>
        </div>
      )}
    </div>
  )
}

export default LatLngInfoBox
