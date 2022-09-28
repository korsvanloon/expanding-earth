export function* range(size: number) {
  for (let i = 0; i < size; i++) {
    yield i
  }
}

export const combine = <T>(...others: Iterable<T>[]) =>
  function* (items: Iterable<T>) {
    yield* items
    for (const otherItems of others) {
      yield* otherItems
    }
  }

export const makePocketsOf = <T>(amount: number) =>
  function* (items: Iterable<T>) {
    let group: T[] = []
    for (const item of items) {
      group.push(item)
      if (group.length === amount) {
        yield group
        group = []
      }
    }
  }

export const bufferCount = <T>(size: number, startBufferEvery: number) =>
  function* (items: Iterable<T>) {
    const buffers = [[]] as T[][]
    let i = 0
    for (const item of items) {
      for (const buffer of buffers) {
        buffer.push(item)
      }
      if (buffers[0].length === size) {
        yield buffers.shift()!
      }
      if (i++ % startBufferEvery === 0) {
        buffers.push([])
      }
    }
  }

export const map = <T, S>(mapped: (item: T, index: number) => S) =>
  function* (items: Iterable<T>) {
    let index = 0
    for (const item of items) {
      yield mapped(item, index++)
    }
  }

export const flat = function* <T>(items: Iterable<Iterable<T>>) {
  for (const item of items) {
    for (const item2 of item) {
      yield item2
    }
  }
}

export const flatMap = <T, S>(mapped: (item: T) => S[]) =>
  function* (items: Iterable<T>) {
    for (const item of items) {
      for (const item2 of mapped(item)) {
        yield item2
      }
    }
  }

export const where = <T>(isTrue: (item: T) => boolean) =>
  function* (items: Iterable<T>) {
    for (const item of items) {
      if (isTrue(item)) {
        yield item
      }
    }
  }

export const find = <T>(by: (item: T) => boolean) =>
  function (items: Iterable<T>) {
    for (const item of items) {
      if (by(item)) return item
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

export const compare = <T>(comparison: (previous: T, current: T) => T) =>
  function (items: Iterable<T>) {
    let result: T | undefined = undefined
    for (const item of items) {
      if (!result) {
        result = item
      } else {
        result = comparison(result, item)
      }
    }
    return result
  }

export const getLowest = <T>(by: (item: T) => number) => compare(lowest(by))
export const getHighest = <T>(by: (item: T) => number) => compare(highest(by))

export const lowest =
  <T>(by: (item: T) => number) =>
  (a: T, b: T) =>
    by(a) > by(b) ? a : b

export const highest =
  <T>(by: (item: T) => number) =>
  (a: T, b: T) =>
    by(a) < by(b) ? a : b

export const toArray = <T>(items: Iterable<T>) => (items instanceof Array ? items : [...items])

export const isValue = <T>(input: T): input is NonNullable<T> =>
  input !== null && input !== undefined
