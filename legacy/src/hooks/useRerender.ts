import { useReducer } from 'react'

const forceUpdateReducer = (i: number) => i + 1

export const useRerender = () => useReducer(forceUpdateReducer, 0)[1]
