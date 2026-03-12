export type Note = {
  id: string
  text: string
  pinned: boolean
  color: string
  opacity: number

  position: {
    x: number
    y: number
  }

  size: {
    width: number
    height: number
  }
}