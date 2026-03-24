import type { Note, NoteBounds } from "../types/note"
import {
  DEFAULT_BOARD_BOUNDS,
  DEFAULT_PINNED_BOUNDS,
  loadNotes,
  saveNotes,
} from "../utils/storage"

function commit(notes: Note[]): Note[] {
  return saveNotes(notes)
}

export function createNote(notes: Note[]): Note[] {
  const offset = (notes.length % 5) * 24
  const newNote: Note = {
    id: Date.now().toString(),
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

  return commit([...notes, newNote])
}

export function updateNoteText(notes: Note[], id: string, text: string): Note[] {
  return commit(
    notes.map((note) =>
      note.id === id
        ? {
            ...note,
            text,
          }
        : note,
    ),
  )
}

export function setNotePinned(notes: Note[], id: string, pinned: boolean): Note[] {
  return commit(
    notes.map((note) =>
      note.id === id
        ? {
            ...note,
            pinned,
          }
        : note,
    ),
  )
}

export function updateBoardBounds(notes: Note[], id: string, bounds: NoteBounds): Note[] {
  return commit(
    notes.map((note) =>
      note.id === id
        ? {
            ...note,
            boardBounds: bounds,
          }
        : note,
    ),
  )
}

export function updatePinnedBounds(
  notes: Note[],
  id: string,
  bounds: Partial<NoteBounds>,
): Note[] {
  return commit(
    notes.map((note) =>
      note.id === id
        ? {
            ...note,
            pinnedBounds: {
              ...note.pinnedBounds,
              ...bounds,
            },
          }
        : note,
    ),
  )
}

export function deleteNote(notes: Note[], id: string): Note[] {
  return commit(notes.filter((note) => note.id !== id))
}

export function getInitialNotes(): Note[] {
  return loadNotes()
}
