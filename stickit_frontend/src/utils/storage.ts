import type { Note, NoteBounds } from "../types/note"

export const STORAGE_KEY = "stickit_notes"

export const DEFAULT_BOARD_BOUNDS: NoteBounds = {
  x: 80,
  y: 120,
  width: 260,
  height: 200,
}

export const DEFAULT_PINNED_BOUNDS: NoteBounds = {
  x: 160,
  y: 160,
  width: 300,
  height: 220,
}

type StoredNote = Partial<Note> & {
  position?: Partial<Pick<NoteBounds, "x" | "y">>
  size?: Partial<Pick<NoteBounds, "width" | "height">>
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value)
}

function normalizeBounds(
  value: Partial<NoteBounds> | undefined,
  fallback: NoteBounds,
): NoteBounds {
  return {
    x: isFiniteNumber(value?.x) ? value.x : fallback.x,
    y: isFiniteNumber(value?.y) ? value.y : fallback.y,
    width: isFiniteNumber(value?.width) ? value.width : fallback.width,
    height: isFiniteNumber(value?.height) ? value.height : fallback.height,
  }
}

function baseBoardBounds(index: number): NoteBounds {
  const offset = (index % 5) * 24

  return {
    x: DEFAULT_BOARD_BOUNDS.x + offset,
    y: DEFAULT_BOARD_BOUNDS.y + offset,
    width: DEFAULT_BOARD_BOUNDS.width,
    height: DEFAULT_BOARD_BOUNDS.height,
  }
}

function normalizeNote(note: StoredNote, index: number): Note {
  const fallbackBoardBounds = baseBoardBounds(index)
  const legacyBounds = normalizeBounds(
    {
      x: note.position?.x,
      y: note.position?.y,
      width: note.size?.width,
      height: note.size?.height,
    },
    fallbackBoardBounds,
  )

  const boardBounds = normalizeBounds(note.boardBounds, legacyBounds)
  const pinnedFallback = {
    ...DEFAULT_PINNED_BOUNDS,
    x: boardBounds.x + 40,
    y: boardBounds.y + 40,
    width: Math.max(DEFAULT_PINNED_BOUNDS.width, boardBounds.width),
    height: Math.max(DEFAULT_PINNED_BOUNDS.height, boardBounds.height),
  }

  return {
    id:
      typeof note.id === "string" && note.id.trim().length > 0
        ? note.id
        : `note-${Date.now()}-${index}`,
    text: typeof note.text === "string" ? note.text : "",
    pinned: Boolean(note.pinned),
    color: typeof note.color === "string" ? note.color : "#fce27a",
    opacity: isFiniteNumber(note.opacity) ? note.opacity : 1,
    boardBounds,
    pinnedBounds: normalizeBounds(note.pinnedBounds, pinnedFallback),
  }
}

function normalizeNotes(input: unknown): Note[] {
  if (!Array.isArray(input)) {
    return []
  }

  return input.map((note, index) => normalizeNote((note ?? {}) as StoredNote, index))
}

export function loadNotes(): Note[] {
  const data = localStorage.getItem(STORAGE_KEY)

  if (!data) {
    return []
  }

  try {
    return normalizeNotes(JSON.parse(data))
  } catch {
    return []
  }
}

export function saveNotes(notes: Note[]): Note[] {
  const normalized = normalizeNotes(notes)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized))
  return normalized
}
