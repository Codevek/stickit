import type { Note } from "../types/note"

const STORAGE_KEY = "stickit_notes"

export function loadNotes(): Note[] {
  const data = localStorage.getItem(STORAGE_KEY)

  if (!data) return []

  return JSON.parse(data)
}

export function saveNotes(notes: Note[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(notes))
}