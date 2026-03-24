export type NoteBounds = {
  x: number
  y: number
  width: number
  height: number
}

export type Note = {
  id: string
  text: string
  pinned: boolean
  color: string
  opacity: number
  boardBounds: NoteBounds
  pinnedBounds: NoteBounds
}
