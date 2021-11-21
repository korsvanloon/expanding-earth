import { isIterable } from './iterable'

export const info = <T>(input: T) => {
  if (isIterable(input)) {
    input = [...input] as any
  }
  console.log(input)
  ;(window as any).debugValue = input
  return input
}
