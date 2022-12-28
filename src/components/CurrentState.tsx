// this comment tells babel to convert jsx to calls to a function called jsx instead of React.createElement
/**
 * @jsxFrag
 * @jsx jsx */
import { css, jsx } from '@emotion/react'
import { PointsInTime, Polygon } from 'lib/polygon'
import NumberInput from './form/NumberInput'
import TextInput from './form/TextInput'
import PointInput from './form/PointInput'

type Props = {
  polygons: Polygon[]
  currentPolygon?: Polygon
  currentPointIndex?: number
  onDeletePolygon: () => void
  onChange: () => void
  onClosePoint: () => void
  onDeletePoint: () => void
  onAddAge: () => void
  onSelectAge: (age: PointsInTime) => void
  onDeleteAge: (age: PointsInTime) => void
}

const CurrentState = ({
  polygons,
  currentPolygon,
  currentPointIndex,
  onDeletePolygon,
  onChange,
  onClosePoint,
  onDeletePoint,
  onAddAge,
  onSelectAge,
  onDeleteAge,
}: Props) => {
  return (
    <div css={style}>
      {currentPolygon && (
        <div>
          <header>
            <h3>polygon</h3>
            <span>{polygons.indexOf(currentPolygon)}</span>
            <button onClick={onDeletePolygon}>Delete</button>
          </header>
        </div>
      )}
      {currentPolygon && (
        <table>
          <thead>
            <tr>
              <th className="name">name</th>
              <th className="age">age</th>
              <th className="point">
                {currentPointIndex !== undefined && (
                  <>
                    point
                    <small>{currentPointIndex}</small>
                  </>
                )}
              </th>
              <td className="actions">
                {currentPointIndex !== undefined && (
                  <>
                    <button onClick={onDeletePoint}>Delete</button>
                    <button onClick={onClosePoint}>Close</button>
                  </>
                )}
              </td>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                {currentPointIndex !== undefined && (
                  <TextInput
                    value={currentPolygon.names[currentPointIndex]}
                    onChange={(value) => {
                      currentPolygon.names[currentPointIndex] = value
                      onChange()
                    }}
                  />
                )}
              </td>
              <td className="readonly">
                {(0.0).toLocaleString('nl-NL', {
                  maximumFractionDigits: 1,
                  minimumFractionDigits: 1,
                })}
              </td>
              <td>
                {currentPointIndex !== undefined && (
                  <PointInput
                    value={currentPolygon.points[currentPointIndex]}
                    onChange={onChange}
                  />
                )}
              </td>
              <td>
                {currentPointIndex !== undefined && (
                  <button
                    onClick={() =>
                      onSelectAge({
                        time: 0,
                        points: currentPolygon.points,
                      })
                    }
                  >
                    Select
                  </button>
                )}
              </td>
            </tr>
            {currentPolygon.timeline?.map((age) => (
              <tr key={age.time}>
                <td>
                  <NumberInput
                    value={age.time}
                    step={0.1}
                    max={1}
                    onChange={(value) => {
                      age.time = value
                      onChange()
                    }}
                  />
                </td>
                <td>
                  {currentPointIndex !== undefined && (
                    <PointInput value={age.points[currentPointIndex]} onChange={onChange} />
                  )}
                </td>
                <td>
                  <button onClick={() => onDeleteAge(age)}>Delete</button>
                  <button onClick={() => onSelectAge(age)}>Select</button>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td />
              <td>
                <button onClick={onAddAge}>Add Age</button>
              </td>
            </tr>
          </tfoot>
        </table>
      )}
    </div>
  )
}

export default CurrentState

const style = css`
  display: flex;
  > * {
    margin-left: 2rem;
    margin-right: 2rem;
  }
  header {
    display: flex;
    align-items: center;
    > * {
      margin-right: 0.75rem;
    }

    h3 {
      font-size: 1rem;
      margin-bottom: 0.25rem;
      margin-top: 0.25rem;
      flex: 0;
    }
  }
  small {
    margin-left: 0.25rem;
    font-weight: normal;
  }
  button {
    font-size: 0.5rem;
    width: 100%;
  }
  input,
  .readonly {
    max-width: 75px;
    padding-left: 1rem;
  }
  .readonly {
    display: inline-block;
    padding-right: 1.5rem;
    border: 1px solid hsla(0, 0%, 100%, 0.2);
    border-radius: 3px;
    height: 24px;
  }
  table {
    width: 100%;
  }
  .name {
  }
  .age {
    width: 5rem;
  }
  .point {
    width: 20rem;
  }
  .actions {
    width: 5rem;
  }
  td {
    text-align: center;
  }
  tbody > tr {
    &:hover {
      background-color: hsla(0, 0%, 100%, 0.1);
    }
  }
`
