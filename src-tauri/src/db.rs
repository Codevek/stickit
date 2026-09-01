// db.rs — SQLite persistence layer using rusqlite

use crate::models::{AppSettings, CreateTodo, Todo, UpdateTodo};
use chrono::Utc;
use rusqlite::{params, Connection, Result};
use std::path::PathBuf;
use uuid::Uuid;

pub struct Db {
    pub path: PathBuf,
}

impl Db {
    pub fn new(app_data_dir: PathBuf) -> Self {
        let path = app_data_dir.join("stickit.db");
        Self { path }
    }

    fn conn(&self) -> Result<Connection> {
        let conn = Connection::open(&self.path)?;
        conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL;")?;
        Ok(conn)
    }

    pub fn init(&self) -> Result<()> {
        let conn = self.conn()?;
        conn.execute_batch(
            "
            CREATE TABLE IF NOT EXISTS todos (
                id          TEXT PRIMARY KEY,
                title       TEXT NOT NULL,
                done        INTEGER NOT NULL DEFAULT 0,
                priority    INTEGER NOT NULL DEFAULT 1,
                created_at  TEXT NOT NULL,
                updated_at  TEXT NOT NULL,
                deleted     INTEGER NOT NULL DEFAULT 0
            );

            CREATE TABLE IF NOT EXISTS settings (
                key   TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );
            ",
        )?;
        Ok(())
    }

    // ─── Todos ──────────────────────────────────────────────────────────────

    pub fn get_todos(&self, show_completed: bool) -> Result<Vec<Todo>> {
        let conn = self.conn()?;
        let query = if show_completed {
            "SELECT id, title, done, priority, created_at, updated_at
             FROM todos WHERE deleted = 0 ORDER BY done ASC, priority DESC, created_at ASC"
        } else {
            "SELECT id, title, done, priority, created_at, updated_at
             FROM todos WHERE deleted = 0 AND done = 0 ORDER BY priority DESC, created_at ASC"
        };
        let mut stmt = conn.prepare(query)?;
        let todos = stmt
            .query_map([], |row| {
                Ok(Todo {
                    id: row.get(0)?,
                    title: row.get(1)?,
                    done: row.get::<_, i32>(2)? != 0,
                    priority: row.get::<_, u8>(3)?,
                    created_at: row.get(4)?,
                    updated_at: row.get(5)?,
                })
            })?
            .collect::<Result<Vec<_>>>()?;
        Ok(todos)
    }

    pub fn create_todo(&self, input: CreateTodo) -> Result<Todo> {
        let conn = self.conn()?;
        let id = Uuid::new_v4().to_string();
        let now = Utc::now().to_rfc3339();
        let priority = input.priority.unwrap_or(1).min(3).max(1);

        conn.execute(
            "INSERT INTO todos (id, title, done, priority, created_at, updated_at)
             VALUES (?1, ?2, 0, ?3, ?4, ?5)",
            params![id, input.title, priority, now, now],
        )?;

        Ok(Todo {
            id,
            title: input.title,
            done: false,
            priority,
            created_at: now.clone(),
            updated_at: now,
        })
    }

    pub fn update_todo(&self, input: UpdateTodo) -> Result<Todo> {
        let conn = self.conn()?;
        let now = Utc::now().to_rfc3339();

        if let Some(title) = &input.title {
            conn.execute(
                "UPDATE todos SET title = ?1, updated_at = ?2 WHERE id = ?3",
                params![title, now, input.id],
            )?;
        }
        if let Some(done) = input.done {
            conn.execute(
                "UPDATE todos SET done = ?1, updated_at = ?2 WHERE id = ?3",
                params![done as i32, now, input.id],
            )?;
        }
        if let Some(priority) = input.priority {
            conn.execute(
                "UPDATE todos SET priority = ?1, updated_at = ?2 WHERE id = ?3",
                params![priority, now, input.id],
            )?;
        }

        let mut stmt = conn.prepare(
            "SELECT id, title, done, priority, created_at, updated_at FROM todos WHERE id = ?1",
        )?;
        let todo = stmt.query_row(params![input.id], |row| {
            Ok(Todo {
                id: row.get(0)?,
                title: row.get(1)?,
                done: row.get::<_, i32>(2)? != 0,
                priority: row.get::<_, u8>(3)?,
                created_at: row.get(4)?,
                updated_at: row.get(5)?,
            })
        })?;

        Ok(todo)
    }

    pub fn delete_todo(&self, id: &str) -> Result<()> {
        let conn = self.conn()?;
        let now = Utc::now().to_rfc3339();
        conn.execute(
            "UPDATE todos SET deleted = 1, updated_at = ?1 WHERE id = ?2",
            params![now, id],
        )?;
        Ok(())
    }

    pub fn clear_completed(&self) -> Result<usize> {
        let conn = self.conn()?;
        let now = Utc::now().to_rfc3339();
        let count = conn.execute(
            "UPDATE todos SET deleted = 1, updated_at = ?1 WHERE done = 1",
            params![now],
        )?;
        Ok(count)
    }

    // ─── Settings ───────────────────────────────────────────────────────────

    pub fn get_settings(&self) -> Result<AppSettings> {
        let conn = self.conn()?;
        let mut stmt = conn.prepare("SELECT key, value FROM settings")?;
        let pairs: Vec<(String, String)> = stmt
            .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))?
            .collect::<Result<Vec<_>>>()?;

        let mut s = AppSettings::default();
        for (k, v) in pairs {
            match k.as_str() {
                "theme" => s.theme = v,
                "opacity" => s.opacity = v.parse().unwrap_or(s.opacity),
                "font_size" => s.font_size = v.parse().unwrap_or(s.font_size),
                "accent_color" => s.accent_color = v,
                "widget_x" => s.widget_x = v.parse().unwrap_or(s.widget_x),
                "widget_y" => s.widget_y = v.parse().unwrap_or(s.widget_y),
                "widget_w" => s.widget_w = v.parse().unwrap_or(s.widget_w),
                "widget_h" => s.widget_h = v.parse().unwrap_or(s.widget_h),
                "auto_launch" => s.auto_launch = v == "true",
                "collapse_on_idle" => s.collapse_on_idle = v == "true",
                "show_completed" => s.show_completed = v == "true",
                _ => {}
            }
        }
        Ok(s)
    }

    pub fn save_settings(&self, s: &AppSettings) -> Result<()> {
        let conn = self.conn()?;
        let pairs = vec![
            ("theme", s.theme.clone()),
            ("opacity", s.opacity.to_string()),
            ("font_size", s.font_size.to_string()),
            ("accent_color", s.accent_color.clone()),
            ("widget_x", s.widget_x.to_string()),
            ("widget_y", s.widget_y.to_string()),
            ("widget_w", s.widget_w.to_string()),
            ("widget_h", s.widget_h.to_string()),
            ("auto_launch", s.auto_launch.to_string()),
            ("collapse_on_idle", s.collapse_on_idle.to_string()),
            ("show_completed", s.show_completed.to_string()),
        ];
        for (k, v) in pairs {
            conn.execute(
                "INSERT INTO settings (key, value) VALUES (?1, ?2)
                 ON CONFLICT(key) DO UPDATE SET value = ?2",
                params![k, v],
            )?;
        }
        Ok(())
    }

    pub fn set_setting(&self, key: &str, value: &str) -> Result<()> {
        let conn = self.conn()?;
        conn.execute(
            "INSERT INTO settings (key, value) VALUES (?1, ?2)
             ON CONFLICT(key) DO UPDATE SET value = ?2",
            params![key, value],
        )?;
        Ok(())
    }
}
