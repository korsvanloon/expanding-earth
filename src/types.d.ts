type Unwrap<T> = T extends Promise<infer U>
  ? U
  : T extends (...args: any) => Promise<infer U>
  ? U
  : T extends (...args: any) => infer U
  ? U
  : T

declare module '*.csv' {
  const value: Record<string, any>[]
  export default value
}
