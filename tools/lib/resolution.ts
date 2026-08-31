/**
 * How finely the shell is divided, and the one place that decides it.
 *
 * Two stages and the freshness check all need the same answer: the builder to
 * make the mesh, the freshness check to notice that the data on disk was built
 * at a different resolution than the one being asked for. Reading the
 * environment in each of them would let a draft run leave subdivision-5 data
 * with a fresh timestamp, which the next build would then declare up to date --
 * and the viewer would serve a draft as if it were the published run.
 *
 * This lives under tools rather than shared because it reads the environment,
 * and shared/ is compiled into the browser bundle where there is none.
 */
export const DEFAULT_SUBDIVISION = 6

export const subdivision = (): number => Number(process.env.SUBDIV ?? DEFAULT_SUBDIVISION)
