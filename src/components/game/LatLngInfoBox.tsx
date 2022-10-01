import { areaNukes, colorToCountry } from 'data'
import { formatFloat, formatInt } from 'lib/format'
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
  const name =
    color && color in colorToCountry
      ? colorToCountry[color as keyof typeof colorToCountry]
      : undefined

  const nukes = areaNukes.find((n) => n.name === name)
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
      {color && (
        <div className="color" style={{ backgroundColor: color }}>
          {name}
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
