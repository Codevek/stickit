import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Rnd } from "react-rnd";
import "./App.css";
import {
  createNote,
  deleteNote,
  getInitialNotes,
  setNotePinned,
  updateBoardBounds,
  updateNoteText,
  updatePinnedBounds,
} from "./store/notesStore";
import type { Note, NoteBounds } from "./types/note";
import { STORAGE_KEY, loadNotes } from "./utils/storage";

const NOTE_WINDOW_PREFIX = "note_";

async function openPinnedWindow(note: Note) {
  await invoke("open_or_focus_note_window", {
    noteId: note.id,
    pinnedBounds: note.pinnedBounds,
  });
}

async function closePinnedWindow(noteId: string) {
  await invoke("close_note_window", { noteId });
}

function App() {
  const appWindow = getCurrentWindow();
  const windowLabel = appWindow.label;
  const isPinnedWindow = windowLabel.startsWith(NOTE_WINDOW_PREFIX);
  const pinnedNoteId = isPinnedWindow
    ? windowLabel.slice(NOTE_WINDOW_PREFIX.length)
    : null;
  const [notes, setNotes] = useState<Note[]>(() => getInitialNotes());
  const [isPinnedEditing, setIsPinnedEditing] = useState(false);
  const pinnedTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const restoredPinnedWindowsRef = useRef(false);

  const pinnedNote = pinnedNoteId
    ? (notes.find((note) => note.id === pinnedNoteId) ?? null)
    : null;

  useEffect(() => {
    if (isPinnedWindow) {
      setNotes(loadNotes())
    }
  }, [isPinnedWindow])

  useEffect(() => {
    const root = document.documentElement;
    const body = document.body;
    const mountRoot = document.getElementById("root");

    root.classList.toggle("pinned-window", isPinnedWindow);
    body.classList.toggle("pinned-window", isPinnedWindow);
    mountRoot?.classList.toggle("pinned-window", isPinnedWindow);

    return () => {
      root.classList.remove("pinned-window");
      body.classList.remove("pinned-window");
      mountRoot?.classList.remove("pinned-window");
    };
  }, [isPinnedWindow]);

  useEffect(() => {
    if (!isPinnedWindow) return

    appWindow.setIgnoreCursorEvents(true)
  }, [isPinnedWindow])

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY) {
        setNotes(loadNotes());
      }
    };

    window.addEventListener("storage", handleStorage);

    return () => {
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  useEffect(() => {
    if (isPinnedWindow || restoredPinnedWindowsRef.current) {
      return;
    }

    restoredPinnedWindowsRef.current = true;

    void Promise.all(
      notes
        .filter((note) => note.pinned)
        .map((note) =>
          openPinnedWindow(note).catch((error) => console.error(error)),
        ),
    );
  }, [isPinnedWindow, notes]);

  useEffect(() => {
    if (!isPinnedWindow || !pinnedNoteId) {
      return;
    }

    if (pinnedNote && !pinnedNote.pinned) {
      void appWindow.close();
    }
  }, [appWindow, isPinnedWindow, pinnedNote, pinnedNoteId]);

  useEffect(() => {
    if (!isPinnedWindow || !pinnedNoteId) {
      return;
    }

    let isActive = true;
    let unlisteners: Array<() => void> = [];

    const persistBounds = (partialBounds: Partial<NoteBounds>) => {
      if (!isActive) {
        return;
      }

      setNotes((currentNotes) =>
        updatePinnedBounds(currentNotes, pinnedNoteId, partialBounds),
      );
    };

    const registerWindowListeners = async () => {
      const position = await appWindow.outerPosition();
      const size = await appWindow.innerSize();

      persistBounds({ x: position.x, y: position.y });
      persistBounds({ width: size.width, height: size.height });

      const unlistenMoved = await appWindow.onMoved(({ payload }) => {
        persistBounds({ x: payload.x, y: payload.y });
      });

      const unlistenResized = await appWindow.onResized(({ payload }) => {
        persistBounds({ width: payload.width, height: payload.height });
      });

      const unlistenFocusChanged = await appWindow.onFocusChanged(
        ({ payload }) => {
          if (!payload) {
            setIsPinnedEditing(false);
          }
        },
      );

      return [unlistenMoved, unlistenResized, unlistenFocusChanged];
    };

    void registerWindowListeners()
      .then((registeredUnlisteners) => {
        if (!isActive) {
          registeredUnlisteners.forEach((unlisten) => unlisten());
          return;
        }

        unlisteners = registeredUnlisteners;
      })
      .catch((error) => {
        console.error(error);
      });

    return () => {
      isActive = false;
      unlisteners.forEach((unlisten) => unlisten());
    };
  }, [appWindow, isPinnedWindow, pinnedNoteId]);

  useEffect(() => {
    if (isPinnedWindow && isPinnedEditing) {
      pinnedTextareaRef.current?.focus();
    }
  }, [isPinnedEditing, isPinnedWindow]);

  function handleCreate() {
    setNotes((currentNotes) => createNote(currentNotes));
  }

  function handleUpdate(id: string, text: string) {
    setNotes((currentNotes) => updateNoteText(currentNotes, id, text));
  }

  async function handleDelete(note: Note) {
    setNotes((currentNotes) => deleteNote(currentNotes, note.id));

    if (note.pinned) {
      try {
        await closePinnedWindow(note.id);
      } catch (error) {
        console.error(error);
      }
    }
  }

  async function handleTogglePin(note: Note) {
    const nextPinnedState = !note.pinned

    updateAndSave((currentNotes) =>
      setNotePinned(currentNotes, note.id, nextPinnedState)
    )

    try {
      if (nextPinnedState) {
        await openPinnedWindow({
          ...note,
          pinned: true,
        })
      } else {
        await closePinnedWindow(note.id)
      }
    } catch (error) {
      console.error(error)
    }
  }

  function updateAndSave(updater: (notes: Note[]) => Note[]) {
    setNotes((current) => {
      const next = updater(current)
      localStorage.setItem("stickit_notes", JSON.stringify(next))
      return next
    })
  }

  function handleBoardDragStop(note: Note, x: number, y: number) {
    setNotes((currentNotes) =>
      updateBoardBounds(currentNotes, note.id, {
        ...note.boardBounds,
        x,
        y,
      }),
    );
  }

  function handleBoardResizeStop(
    note: Note,
    width: number,
    height: number,
    x: number,
    y: number,
  ) {
    setNotes((currentNotes) =>
      updateBoardBounds(currentNotes, note.id, {
        x,
        y,
        width,
        height,
      }),
    );
  }
  const note = pinnedNote
  
  if (isPinnedWindow) {
   if (!pinnedNote) {
    return (
      <div className="pinned-note-loading">
        <div className="pinned-note-loading-copy">
          Loading...
        </div>
      </div>
    )
  }

  if (!pinnedNote.pinned) {
    return null
  }
    
    return (
      <div
        className="pinned-note-shell"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) {
            setIsPinnedEditing(false);
          }
        }}
      >
        <article
          className={`pinned-note-card ${isPinnedEditing ? "is-editing" : "is-frozen"}`}
          style={{
            backgroundColor: pinnedNote.color,
            opacity: pinnedNote.opacity,
          }}
        >
          <div
            className="drag-zone pinned-drag-zone"
            data-tauri-drag-region
            onMouseDown={() => {
              setIsPinnedEditing(false);
            }}
          >
            <span className="window-state">
              {isPinnedEditing ? "Editing" : "Frozen"}
            </span>
          </div>

          <div className="pinned-note-body">
            {isPinnedEditing ? (
              <textarea
                value={pinnedNote.text}
                onFocus={() => appWindow.setIgnoreCursorEvents(false)}
                onBlur={() => appWindow.setIgnoreCursorEvents(true)}
                onChange={(event) => handleUpdate(pinnedNote.id, event.target.value)}
                className="note note-textarea pinned-textarea"
                placeholder="Write something..."
              />
            ) : (
              <button
                type="button"
                className="pinned-note-overlay"
                onClick={() => {
                  setIsPinnedEditing(true);
                }}
                style={{ pointerEvents: isPinnedEditing ? "none" : "auto" }}
              >
                {pinnedNote.text ? (
                  <span className="pinned-note-preview">{pinnedNote.text}</span>
                ) : (
                  <span className="pinned-note-placeholder">
                    Click to write something...
                  </span>
                )}
              </button>
            )}
          </div>
        </article>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <section className="hero-panel">
        <p className="eyebrow">Desktop sticky notes</p>
        <div className="hero-copy">
          <h1>StickIt</h1>
          <p>
            Create notes on the board, then pin the ones you want floating on
            your desktop.
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
                handleBoardDragStop(note, data.x, data.y);
              }}
              onResizeStop={(_, __, ref, ___, position) => {
                handleBoardResizeStop(
                  note,
                  Number.parseInt(ref.style.width, 10),
                  Number.parseInt(ref.style.height, 10),
                  position.x,
                  position.y,
                );
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
                        event.stopPropagation();
                        void handleTogglePin(note);
                      }}
                    >
                      {note.pinned ? "Unpin" : "Pin"}
                    </button>

                    <button
                      type="button"
                      className="delete-btn"
                      onClick={(event) => {
                        event.stopPropagation();
                        void handleDelete(note);
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </div>

                <textarea
                  value={note.text}
                  onFocus={() => appWindow.setIgnoreCursorEvents(false)}
                  onBlur={() => {
                    setIsPinnedEditing(false)
                    appWindow.setIgnoreCursorEvents(true)
                  }}
                  onChange={(event) =>
                    handleUpdate(note.id, event.target.value)
                  }
                  className="note note-textarea pinned-textarea"
                  placeholder="Write something..."
                />
              </article>
            </Rnd>
          ))}
        </div>
      </section>
    </div>
  );
}

export default App;
