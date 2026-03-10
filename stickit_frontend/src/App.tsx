import { useState } from "react";
import "./App.css";

type Note = {
  id: number;
  text: string;
};

function App() {
  const [notes, setNotes] = useState<Note[]>([]);

  function createNote() {
    const newNote: Note = {
      id: Date.now(),
      text: "",
    };

    setNotes([...notes, newNote]);
  }

  function updateNote(id: number, text: string) {
    setNotes(
      notes.map((note) =>
        note.id === id ? { ...note, text } : note
      )
    );
  }

  return (
    <div className="app">
      <h1>StickIt</h1>

      <button onClick={createNote}>+ New Note</button>

      <div className="notes">
        {notes.map((note) => (
          <textarea
            key={note.id}
            value={note.text}
            onChange={(e) => updateNote(note.id, e.target.value)}
            className="note"
            placeholder="Write something..."
          />
        ))}
      </div>
    </div>
  );
}

export default App;