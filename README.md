# Stickit

A lightweight Windows desktop sticky notes app where notes can be pinned directly to the desktop with a modern glass UI.

## Features
- Lightweight (target ≤50MB RAM)
- Frameless desktop widget-style notes
- Always visible on the desktop
- Draggable and resizable notes
- Persistent note position and size
- Fast startup
- Local storage with SQLite
- Future cloud sync support

## Tech Stack
- **Desktop Framework:** Tauri
- **Frontend:** React + Vite + TypeScript
- **Local Storage:** SQLite
- **Future Backend:** FastAPI + PostgreSQL + WebSockets

## Project Structure
sticky-desktop-notes/
├── frontend/
│ └── src/
│ ├── components/
│ ├── pages/
│ ├── hooks/
│ ├── store/
│ └── styles/
├── src-tauri/
│ └── src/
│ └── main.rs
├── database/
│ └── schema.sql
└── docs/


## Setup

Install dependencies:

bash
# Node.js
node -v
npm -v

# Rust
rustc --version
cargo --version

# Tauri CLI
npm install -g @tauri-apps/cli

Run the app:
npm install
npm run tauri dev
