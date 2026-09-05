/**
 * The wait, shown.
 *
 * Two things in this viewer take long enough that a reader needs telling: the
 * first load, which is sixteen megabytes before anything can be drawn, and the
 * explorer, which fetches a coarse mesh and then solves two hundred million
 * years on it. Both can say how far along they are, so both get a bar with a
 * real share in it rather than a spinner -- except while something is being
 * waited for that cannot be measured, where the bar sweeps instead of lying
 * about a number.
 */
export function Loader({ share, note }: {
  /** How far along, 0 to 1, or null when there is no number to be had. */
  share: number | null
  /** What is being waited for, in a few words. */
  note?: string
}) {
  return (
    <div className="loader">
      <div className={share === null ? 'progress sweeping' : 'progress'} role="progressbar"
        aria-valuemin={0} aria-valuemax={100}
        aria-valuenow={share === null ? undefined : Math.round(100 * share)}
      >
        <div style={share === null ? undefined : { width: `${Math.round(100 * share)}%` }} />
      </div>
      {note && <p className="caption">{note}</p>}
    </div>
  )
}
