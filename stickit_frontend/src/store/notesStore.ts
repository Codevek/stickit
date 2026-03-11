import type { Note } from "../types/note"
import { loadNotes, saveNotes } from "../utils/storage"

export function createNote(notes: Note[]): Note[] {
  const newNote: Note = {
    id: Date.now().toString(),
    text: "",
    pinned: false,
    color: "#fff8a6",
    opacity: 1
  }

  const updated = [...notes, newNote]

  saveNotes(updated)

  return updated
}

export function updateNote(notes: Note[], id: string, text: string) {
  const updated = notes.map(note =>
    note.id === id ? { ...note, text } : note
  )

  saveNotes(updated)

  return updated
}

export function deleteNote(notes: Note[], id: string) {
  const updated = notes.filter(note => note.id !== id)

  saveNotes(updated)

  return updated
}

export function getInitialNotes(): Note[] {
  return loadNotes()
}