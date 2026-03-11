import { useState } from "react"
import "./App.css"

import type { Note } from "./types/note"
import { createNote, updateNote, deleteNote, getInitialNotes } from "./store/notesStore"

function App() {
  const [notes, setNotes] = useState<Note[]>(getInitialNotes())

  function handleCreate() {
    setNotes(createNote(notes))
  }

  function handleUpdate(id: string, text: string) {
    setNotes(updateNote(notes, id, text))
  }

  function handleDelete(id: string) {
    setNotes(deleteNote(notes, id))
  }

  return (
    <div className="app">
      <h1>StickIt</h1>

      <button onClick={handleCreate}>+ New Note</button>

      <div className="notes">
        {notes.map(note => (
          <div key={note.id} className="note-wrapper">

            <textarea
              value={note.text}
              onChange={(e) => handleUpdate(note.id, e.target.value)}
              className="note"
              placeholder="Write something..."
            />

            <button
              className="delete"
              onClick={() => handleDelete(note.id)}
            >
              delete
            </button>

          </div>
        ))}
      </div>
    </div>
  )
}

export default App