export const info = <T>(input: T) => {
  if (isIterable(input)) {
    input = [...input] as any
  }
  console.log(input)
  ;(window as any).debugValue = input
  return input
}

function isIterable<T>(input: Iterable<T> | any): input is Iterable<T> {
  if (input === null || input === undefined) {
    return false
  }

  return typeof input[Symbol.iterator] === 'function'
}
