/**
 * Where every knob in the pipeline is read from.
 *
 * The solver's settings used to come from `process.env`, which is right for a
 * command line and impossible in a browser: there is no environment there, and
 * `process` is not even defined, so a module that reads one at load time throws
 * on import. Two did.
 *
 * So the environment is a variable. It starts as the real one where there is
 * one and an empty set where there is not, which means every default stands.
 * `setKnobs` replaces it, and the solver's `configure` is what calls that, so a
 * panel of sliders and a shell hand their nine numbers to the same place.
 *
 * Read late, never at module load. A constant folded in at import time is
 * exactly the bug this exists to prevent: it would capture the default before
 * the caller had said anything.
 */
export let ENV: Record<string, string | undefined> =
  typeof process === 'undefined' ? {} : process.env

export function setKnobs(env: Record<string, string | undefined>): void {
  ENV = env
}

/** A numeric knob, with the default that ships. */
export const knob = (name: string, fallback: number): number =>
  Number(ENV[name] ?? fallback)
