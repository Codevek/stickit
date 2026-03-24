import { useState, useEffect } from "react"
import "./App.css"
import { Rnd } from "react-rnd"
import { invoke } from "@tauri-apps/api/core"
import type { Note } from "./types/note"
import { createNote, updateNote, deleteNote, getInitialNotes } from "./store/notesStore"
import { getCurrentWindow } from "@tauri-apps/api/window"
// import { getCurrentWindow } from "@tauri-apps/api/window"

function App() {
  const [notes, setNotes] = useState<Note[]>(getInitialNotes())
  const windowLabel = getCurrentWindow().label
  const [isFocused, setIsFocused] = useState(false)  
  const appWindow = getCurrentWindow()

  const noteId = windowLabel.startsWith("note_")
    ? windowLabel.replace("note_", "")
    : null


  useEffect(() => {
    if (noteId) {
      document.body.classList.add('pinned-window')
    } else {
      document.body.classList.remove('pinned-window')
    }
  }, [noteId])

  function toggleEdit() {
    const next = !isFocused
    setIsFocused(next)
    appWindow.setIgnoreCursorEvents(!next)
  }

  function handleCreate() {
    setNotes(createNote(notes))
  }

  function handleUpdate(id: string, text: string) {
    const updated = updateNote(notes, id, text);
    setNotes(updated)
    if (noteId) {
      localStorage.setItem("stickit_notes", JSON.stringify(updated))
    }
  }

  function handleDelete(id: string) {
    setNotes(deleteNote(notes, id))
  }

  async function handlePin(note: Note) {
    await invoke("pin_note", { note })
  }

  const visibleNotes = noteId
    ? notes.filter(n => n.id === noteId)
    : notes

  if (noteId) {
    const note = visibleNotes[0];
    if (!note) return null;

    return (
      <div className="pinned-note-view">
        <div className="note-container pinned">
          <div className="drag-zone" data-tauri-drag-region>
          </div>
          <textarea
            value={note.text}
            onChange={(e) => handleUpdate(note.id, e.target.value)}
            className="note"
            placeholder="Write something..."
          />
          <div className="note-bottom-pad"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <h1>StickIt</h1>

      <button onClick={handleCreate}>+ New Note</button>

      <div className="notes">
        {visibleNotes.map((note) => (
          <Rnd
            key={note.id}
            size={{
              width: note.size?.width ?? 220,
              height: note.size?.height ?? 160
            }}
            position={{
              x: note.position?.x ?? 100,
              y: note.position?.y ?? 100
            }}
            onDragStop={(_, d) => {
              const updated = notes.map(n =>
                n.id === note.id
                  ? { ...n, position: { x: d.x, y: d.y } }
                  : n
              )

              setNotes(updated)
              localStorage.setItem("stickit_notes", JSON.stringify(updated))
            }}
            onResizeStop={(_, __, ref, ___, position) => {
              const updated = notes.map(n =>
                n.id === note.id
                  ? {
                      ...n,
                      size: {
                        width: parseInt(ref.style.width),
                        height: parseInt(ref.style.height)
                      },
                      position
                    }
                  : n
              )

              setNotes(updated)
              localStorage.setItem("stickit_notes", JSON.stringify(updated))
            }}
            dragHandleClassName="drag-zone"
          >
            <div
              className="note-container"
              onClick={toggleEdit}
            >

              <div 
                className="drag-zone"
                data-tauri-drag-region
              >

                <button
                  className="pin-btn"
                  onClick={() => handlePin(note)}
                >
                  🧷
                </button>

                <button
                  className="delete-btn"
                  onClick={() => handleDelete(note.id)}
                >
                  X
                </button>
              </div>

              <textarea
                value={note.text}
                onChange={(e) => handleUpdate(note.id, e.target.value)}
                className="note"
                placeholder="Write something..."
              />

              <div className="note-bottom-pad"></div>

            </div>
          </Rnd>
        ))}
      </div>
    </div>
  )
}

export default App