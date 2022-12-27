import { round } from 'lib/math'

type Props = {
  id: string
  time: number
}

const AgeFilter = ({ id, time }: Props) => {
  const tableValues = '0 '.repeat(round(time * 255)) + '1 '.repeat(round((1 - time) * 255))

  return (
    <svg style={{ display: 'none' }}>
      <filter id={id} colorInterpolationFilters="sRGB">
        <feComponentTransfer>
          <feFuncR type="discrete" tableValues={tableValues} />
          <feFuncG type="discrete" tableValues={tableValues} />
          <feFuncB type="discrete" tableValues={tableValues} />
        </feComponentTransfer>
        <feColorMatrix
          type="matrix"
          values="1 0 0 0 0
                  0 1 0 0 0
                  0 0 1 0 0
                 -1 0 0 0.5 0"
        />
      </filter>
    </svg>
  )
}

export default AgeFilter
