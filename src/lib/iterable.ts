import { pipeInto, pipe } from 'ts-functional-pipe'

export const makePocketsOf = <T>(amount: number) =>
  function* (items: Iterable<T>) {
    let group: T[] = []
    for (const item of items) {
      if (group.length === amount) {
        yield group
        group = []
      }
      group.push(item)
    }
  }

export const map = <T, S>(mapped: (i: T) => S) =>
  function* (items: Iterable<T>) {
    for (const item of items) {
      yield mapped(item)
    }
  }
export const flat = function* <T>(items: Iterable<Iterable<T>>) {
  for (const item of items) {
    for (const item2 of item) {
      yield item2
    }
  }
}
export const flatMap = <T, S>(mapped: (i: T) => S[]) =>
  function* (items: Iterable<T>) {
    for (const item of items) {
      for (const item2 of mapped(item)) {
        yield item2
      }
    }
  }

export const where = <T>(isTrue: (i: T) => boolean) =>
  function* (items: Iterable<T>) {
    for (const item of items) {
      if (isTrue(item)) {
        yield item
      }
    }
  }
export const reduce = <T, S>(initialValue: S, accumulator: (previous: S, current: T) => S) =>
  function (items: Iterable<T>) {
    let result = initialValue
    for (const item of items) {
      result = accumulator(result, item)
    }
    return result
  }

export const toArray = <T>(items: Iterable<T>) => [...items]

const bla = () => {
  const result = pipeInto(
    [1, 2, 3, 4, 5, 6, 7, 8],
    where((x) => x % 2 === 0),
    makePocketsOf(2),
    map(
      pipe(
        map((x) => `${x}`),
        toArray,
      ),
    ),
    toArray,
    //
  )

  /**
   *
   * ```ts
   * const result = [1, 2, 3, 4]
   *  |> buffer(2)
   *  |> map( map(toString) |> toArray) )
   *  |> toArray
   *
   * // [['1', '2'], ['3', '4']]
    ```
   */
}
