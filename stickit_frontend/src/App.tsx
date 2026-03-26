import { useEffect, useRef, useState, type MouseEvent } from "react"
import { invoke } from "@tauri-apps/api/core"
import { emit, emitTo, listen } from "@tauri-apps/api/event"
import { getCurrentWindow } from "@tauri-apps/api/window"
import { Rnd } from "react-rnd"
import "./App.css"
import {
  createNote,
  deleteNote,
  getInitialNotes,
  setNotePinned,
  updateBoardBounds,
  updateNoteText,
  updatePinnedBounds,
} from "./store/notesStore"
import type { Note, NoteBounds } from "./types/note"
import { STORAGE_KEY, createNoteId, loadNotes, saveNotes } from "./utils/storage"

const NOTE_WINDOW_PREFIX = "note_"
const NOTES_SYNC_EVENT = "notes:sync"
const PINNED_WINDOW_READY_EVENT = "pinned-window:ready"

type NotesSyncPayload = {
  notes: Note[]
  sourceWindowLabel: string
}

type PinnedWindowReadyPayload = {
  noteId: string
  windowLabel: string
}

async function openPinnedWindow(note: Note) {
  await invoke("open_or_focus_note_window", {
    noteId: note.id,
    pinnedBounds: note.pinnedBounds,
  })
}

async function closePinnedWindow(noteId: string) {
  await invoke("close_note_window", { noteId })
}

function App() {
  const appWindow = getCurrentWindow()
  const windowLabel = appWindow.label
  const isPinnedWindow = windowLabel.startsWith(NOTE_WINDOW_PREFIX)
  const pinnedNoteId = isPinnedWindow
    ? windowLabel.slice(NOTE_WINDOW_PREFIX.length)
    : null
  const [notes, setNotes] = useState<Note[]>(() => getInitialNotes())
  const restoredPinnedWindowsRef = useRef(false)

  const pinnedNote = pinnedNoteId
    ? notes.find((note) => note.id === pinnedNoteId) ?? null
    : null
  const [isPinnedWindowReady, setIsPinnedWindowReady] = useState(
    () => !isPinnedWindow || pinnedNote !== null,
  )
  const notesRef = useRef(notes)

  useEffect(() => {
    notesRef.current = notes
  }, [notes])

  async function broadcastNotes(nextNotes: Note[]) {
    await emit<NotesSyncPayload>(NOTES_SYNC_EVENT, {
      notes: nextNotes,
      sourceWindowLabel: windowLabel,
    })
  }

  function updateNotes(updater: (currentNotes: Note[]) => Note[]) {
    setNotes((currentNotes) => {
      const nextNotes = saveNotes(updater(currentNotes))
      void broadcastNotes(nextNotes).catch((error) => console.error(error))
      return nextNotes
    })
  }

  useEffect(() => {
    const root = document.documentElement
    const body = document.body
    const mountRoot = document.getElementById("root")

    root.classList.toggle("pinned-window", isPinnedWindow)
    body.classList.toggle("pinned-window", isPinnedWindow)
    mountRoot?.classList.toggle("pinned-window", isPinnedWindow)

    return () => {
      root.classList.remove("pinned-window")
      body.classList.remove("pinned-window")
      mountRoot?.classList.remove("pinned-window")
    }
  }, [isPinnedWindow])

  useEffect(() => {
    let isActive = true
    let stopListening = () => {}

    const handleStorage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY) {
        const syncedNotes = loadNotes()
        setIsPinnedWindowReady(true)
        setNotes(syncedNotes)
      }
    }

    window.addEventListener("storage", handleStorage)

    void listen<NotesSyncPayload>(NOTES_SYNC_EVENT, ({ payload }) => {
      if (!isActive || payload.sourceWindowLabel === windowLabel) {
        return
      }

      const syncedNotes = saveNotes(payload.notes)
      setIsPinnedWindowReady(true)
      setNotes(syncedNotes)
    })
      .then((unlisten) => {
        stopListening = unlisten
      })
      .catch((error) => console.error(error))

    return () => {
      isActive = false
      stopListening()
      window.removeEventListener("storage", handleStorage)
    }
  }, [windowLabel])

  useEffect(() => {
    if (isPinnedWindow) {
      return
    }

    let isActive = true
    let stopListening = () => {}

    void listen<PinnedWindowReadyPayload>(PINNED_WINDOW_READY_EVENT, ({ payload }) => {
      if (!isActive || !payload.windowLabel.startsWith(NOTE_WINDOW_PREFIX)) {
        return
      }

      void emitTo<NotesSyncPayload>(payload.windowLabel, NOTES_SYNC_EVENT, {
        notes: notesRef.current,
        sourceWindowLabel: windowLabel,
      }).catch((error) => console.error(error))
    })
      .then((unlisten) => {
        stopListening = unlisten
      })
      .catch((error) => console.error(error))

    return () => {
      isActive = false
      stopListening()
    }
  }, [isPinnedWindow, windowLabel])

  useEffect(() => {
    if (isPinnedWindow || restoredPinnedWindowsRef.current) {
      return
    }

    restoredPinnedWindowsRef.current = true

    void Promise.all(
      notes
        .filter((note) => note.pinned)
        .map((note) => openPinnedWindow(note).catch((error) => console.error(error))),
    )
  }, [isPinnedWindow, notes])

  useEffect(() => {
    if (!isPinnedWindow || !pinnedNoteId || pinnedNote) {
      return
    }

    let isActive = true

    const requestNoteState = () => {
      if (!isActive) {
        return
      }

      void emit<PinnedWindowReadyPayload>(PINNED_WINDOW_READY_EVENT, {
        noteId: pinnedNoteId,
        windowLabel,
      }).catch((error) => console.error(error))
    }

    requestNoteState()
    const intervalId = window.setInterval(requestNoteState, 500)

    return () => {
      isActive = false
      window.clearInterval(intervalId)
    }
  }, [isPinnedWindow, pinnedNote, pinnedNoteId, windowLabel])

  useEffect(() => {
    if (!isPinnedWindow || !pinnedNoteId || !isPinnedWindowReady) {
      return
    }

    if (!pinnedNote || !pinnedNote.pinned) {
      void appWindow.close()
    }
  }, [appWindow, isPinnedWindow, isPinnedWindowReady, pinnedNote, pinnedNoteId])

  useEffect(() => {
    if (!isPinnedWindow || !pinnedNoteId) {
      return
    }

    let isActive = true
    let unlisteners: Array<() => void> = []

    const persistBounds = (partialBounds: Partial<NoteBounds>) => {
      if (!isActive) {
        return
      }

      updateNotes((currentNotes) =>
        updatePinnedBounds(currentNotes, pinnedNoteId, partialBounds),
      )
    }

    const registerWindowListeners = async () => {
      const position = await appWindow.outerPosition()
      const size = await appWindow.innerSize()

      persistBounds({ x: position.x, y: position.y })
      persistBounds({ width: size.width, height: size.height })

      const unlistenMoved = await appWindow.onMoved(({ payload }) => {
        persistBounds({ x: payload.x, y: payload.y })
      })

      const unlistenResized = await appWindow.onResized(({ payload }) => {
        persistBounds({ width: payload.width, height: payload.height })
      })

      return [unlistenMoved, unlistenResized]
    }

    void registerWindowListeners()
      .then((registeredUnlisteners) => {
        if (!isActive) {
          registeredUnlisteners.forEach((unlisten) => unlisten())
          return
        }

        unlisteners = registeredUnlisteners
      })
      .catch((error) => {
        console.error(error)
      })

    return () => {
      isActive = false
      unlisteners.forEach((unlisten) => unlisten())
    }
  }, [appWindow, isPinnedWindow, pinnedNoteId])

  function handleCreate() {
    const noteId = createNoteId()
    updateNotes((currentNotes) => createNote(currentNotes, noteId))
  }

  function handleUpdate(id: string, text: string) {
    updateNotes((currentNotes) => updateNoteText(currentNotes, id, text))
  }

  async function handleDelete(note: Note) {
    updateNotes((currentNotes) => deleteNote(currentNotes, note.id))

    if (note.pinned) {
      try {
        await closePinnedWindow(note.id)
      } catch (error) {
        console.error(error)
      }
    }
  }

  async function handleTogglePin(note: Note) {
    const nextPinnedState = !note.pinned
    const updatedNote: Note = {
      ...note,
      pinned: nextPinnedState,
    }

    updateNotes((currentNotes) => setNotePinned(currentNotes, note.id, nextPinnedState))

    try {
      if (nextPinnedState) {
        await openPinnedWindow(updatedNote)
      } else {
        await closePinnedWindow(note.id)
      }
    } catch (error) {
      console.error(error)
    }
  }

  function handleBoardDragStop(note: Note, x: number, y: number) {
    updateNotes((currentNotes) =>
      updateBoardBounds(currentNotes, note.id, {
        ...note.boardBounds,
        x,
        y,
      }),
    )
  }

  function handleBoardResizeStop(
    note: Note,
    width: number,
    height: number,
    x: number,
    y: number,
  ) {
    updateNotes((currentNotes) =>
      updateBoardBounds(currentNotes, note.id, {
        x,
        y,
        width,
        height,
      }),
    )
  }

  function handlePinnedToolbarMouseDown(event: MouseEvent<HTMLDivElement>) {
    if ((event.target as HTMLElement).closest("button")) {
      return
    }

    void appWindow.startDragging().catch((error) => console.error(error))
  }

  if (isPinnedWindow) {
    if (!isPinnedWindowReady && !pinnedNote) {
      return (
        <div className="pinned-note-shell">
          <article className="pinned-note-card pinned-note-loading">
            <div className="drag-zone pinned-note-toolbar" />
            <div className="pinned-note-body pinned-note-loading-copy">
              Loading note...
            </div>
          </article>
        </div>
      )
    }

    if (!pinnedNote || !pinnedNote.pinned) {
      return null
    }

    return (
      <div className="pinned-note-shell">
        <article
          className="pinned-note-card"
          style={{
            backgroundColor: pinnedNote.color,
            opacity: pinnedNote.opacity,
          }}
        >
          <div
            className="drag-zone pinned-note-toolbar"
            data-tauri-drag-region
            onMouseDown={handlePinnedToolbarMouseDown}
          >
            <span className="window-state">Pinned</span>
            <div className="toolbar-actions">
              <button
                type="button"
                className="pin-btn is-active"
                onClick={() => {
                  void handleTogglePin(pinnedNote)
                }}
              >
                Unpin
              </button>

              <button
                type="button"
                className="delete-btn"
                onClick={() => {
                  void handleDelete(pinnedNote)
                }}
              >
                Delete
              </button>
            </div>
          </div>

          <div className="pinned-note-body">
            <textarea
              value={pinnedNote.text}
              onChange={(event) => handleUpdate(pinnedNote.id, event.target.value)}
              className="note note-textarea pinned-textarea"
              placeholder="Write something..."
            />
          </div>
        </article>
      </div>
    )
  }

  return (
    <div className="app-shell">
      <section className="hero-panel">
        <p className="eyebrow">Desktop sticky notes</p>
        <div className="hero-copy">
          <h1>StickIt</h1>
          <p>
            Create notes on the board, then pin the ones you want floating on your
            desktop.
          </p>
        </div>
        <button className="create-note-btn" onClick={handleCreate}>
          New Note
        </button>
      </section>

      <section className="board-panel">
        <div className="notes-board">
          {notes.map((note) => (
            <Rnd
              key={note.id}
              size={{
                width: note.boardBounds.width,
                height: note.boardBounds.height,
              }}
              position={{
                x: note.boardBounds.x,
                y: note.boardBounds.y,
              }}
              minWidth={220}
              minHeight={170}
              bounds="parent"
              dragHandleClassName="drag-zone"
              onDragStop={(_, data) => {
                handleBoardDragStop(note, data.x, data.y)
              }}
              onResizeStop={(_, __, ref, ___, position) => {
                handleBoardResizeStop(
                  note,
                  Number.parseInt(ref.style.width, 10),
                  Number.parseInt(ref.style.height, 10),
                  position.x,
                  position.y,
                )
              }}
            >
              <article
                className={`board-note-card ${note.pinned ? "is-pinned" : ""}`}
                style={{
                  backgroundColor: note.color,
                  opacity: note.opacity,
                }}
              >
                <div className="drag-zone board-note-toolbar">
                  <span className="note-badge">
                    {note.pinned ? "Pinned" : "Board"}
                  </span>
                  <div className="toolbar-actions">
                    <button
                      type="button"
                      className={`pin-btn ${note.pinned ? "is-active" : ""}`}
                      onClick={(event) => {
                        event.stopPropagation()
                        void handleTogglePin(note)
                      }}
                    >
                      {note.pinned ? "Unpin" : "Pin"}
                    </button>

                    <button
                      type="button"
                      className="delete-btn"
                      onClick={(event) => {
                        event.stopPropagation()
                        void handleDelete(note)
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </div>

                <textarea
                  value={note.text}
                  onChange={(event) => handleUpdate(note.id, event.target.value)}
                  className="note note-textarea"
                  placeholder="Write something..."
                />
              </article>
            </Rnd>
          ))}
        </div>
      </section>
    </div>
  )
}

export default App
