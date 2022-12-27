import { FlyingSaucer, MovementPath, MovementPathObject, Nuke } from 'data'
import { formatNumber } from 'lib/format'
import { hasCaptured, vehiclePositionAt } from 'lib/game'
import { hasProperty, hasProperty2 } from 'lib/iterable'
import { vec2 } from 'lib/lat-lng'
import { sumBy } from 'lib/math'
import classes from './ProgressBox.module.css'

type Props = {
  time: number
  scenario: MovementPathObject<Nuke>[]
  allFlyingSaucers: MovementPathObject<FlyingSaucer>[]
}

const ProgressBox = ({ time, scenario, allFlyingSaucers }: Props) => {
  const totalNukes = sumBy(scenario, (x) => x.object.amount)

  const launchedNukes = sumBy(
    scenario.filter((n) => n.movementPath.startTime <= time),
    (n) => n.object.amount,
  )

  const flyingSaucers = allFlyingSaucers.map((object) => ({
    ...object,
    currentPosition: vehiclePositionAt(object.movementPath, time),
  }))

  const nukes = scenario
    .map((nuke) => ({
      ...nuke,
      currentPosition: vehiclePositionAt(nuke.movementPath, time),
    }))
    .map((nuke) => ({
      ...nuke,
      captured:
        hasProperty2(nuke, 'currentPosition') &&
        flyingSaucers.some(
          (s) => hasProperty2(s, 'currentPosition') && hasCaptured(s, nuke, 200, time),
        ),
    }))

  const explodedNukes = sumBy(
    nukes.filter(
      (n) =>
        !n.captured &&
        n.currentPosition &&
        vec2(n.currentPosition).equals(vec2(n.movementPath.destination)),
    ),
    (n) => n.object.amount,
  )

  const totalSaucers = sumBy(flyingSaucers, (s) => s.object.amount)
  return (
    <dl className={classes.box}>
      <dt>Nukes</dt>
      <dd>
        {launchedNukes} / {totalNukes}
      </dd>
      <dt>Exploded</dt>
      <dd>{explodedNukes}</dd>
      <dt>Saucers</dt>
      <dd>{totalSaucers}</dd>
      <dt>Casualties</dt>
      <dd>{formatNumber(explodedNukes * 35000)}</dd>
    </dl>
  )
}

export default ProgressBox
