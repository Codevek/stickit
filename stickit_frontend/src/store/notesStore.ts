import type { Note, NoteBounds } from "../types/note"
import {
  createNoteId,
  DEFAULT_BOARD_BOUNDS,
  DEFAULT_PINNED_BOUNDS,
  loadNotes,
} from "../utils/storage"

export function createNote(notes: Note[], id = createNoteId(notes.length)): Note[] {
  const offset = (notes.length % 5) * 24
  const newNote: Note = {
    id,
    text: "",
    pinned: false,
    color: "#fce27a",
    opacity: 1,
    boardBounds: {
      x: DEFAULT_BOARD_BOUNDS.x + offset,
      y: DEFAULT_BOARD_BOUNDS.y + offset,
      width: DEFAULT_BOARD_BOUNDS.width,
      height: DEFAULT_BOARD_BOUNDS.height,
    },
    pinnedBounds: {
      x: DEFAULT_PINNED_BOUNDS.x + offset,
      y: DEFAULT_PINNED_BOUNDS.y + offset,
      width: DEFAULT_PINNED_BOUNDS.width,
      height: DEFAULT_PINNED_BOUNDS.height,
    },
  }

  return [...notes, newNote]
}

export function updateNoteText(notes: Note[], id: string, text: string): Note[] {
  return notes.map((note) =>
    note.id === id
      ? {
          ...note,
          text,
        }
      : note,
  )
}

export function setNotePinned(notes: Note[], id: string, pinned: boolean): Note[] {
  return notes.map((note) =>
    note.id === id
      ? {
          ...note,
          pinned,
        }
      : note,
  )
}

export function updateBoardBounds(notes: Note[], id: string, bounds: NoteBounds): Note[] {
  return notes.map((note) =>
    note.id === id
      ? {
          ...note,
          boardBounds: bounds,
        }
      : note,
  )
}

export function updatePinnedBounds(
  notes: Note[],
  id: string,
  bounds: Partial<NoteBounds>,
): Note[] {
  return notes.map((note) =>
    note.id === id
      ? {
          ...note,
          pinnedBounds: {
            ...note.pinnedBounds,
            ...bounds,
          },
        }
      : note,
  )
}

export function deleteNote(notes: Note[], id: string): Note[] {
  return notes.filter((note) => note.id !== id)
}

export function getInitialNotes(): Note[] {
  return loadNotes()
}
