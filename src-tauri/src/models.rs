// models.rs — shared data structures

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Todo {
    pub id: String,
    pub title: String,
    pub done: bool,
    pub priority: u8, // 1=low, 2=medium, 3=high
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateTodo {
    pub title: String,
    pub priority: Option<u8>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateTodo {
    pub id: String,
    pub title: Option<String>,
    pub done: Option<bool>,
    pub priority: Option<u8>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppSettings {
    pub theme: String,          // "dark" | "light"
    pub opacity: f64,           // 0.4–1.0
    pub font_size: u8,          // 12–18
    pub accent_color: String,   // hex color
    pub widget_x: i32,
    pub widget_y: i32,
    pub widget_w: u32,
    pub widget_h: u32,
    pub auto_launch: bool,
    pub collapse_on_idle: bool,
    pub show_completed: bool,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            theme: "dark".to_string(),
            opacity: 0.92,
            font_size: 13,
            accent_color: "#7C5CFC".to_string(),
            widget_x: 40,
            widget_y: 40,
            widget_w: 240,
            widget_h: 380,
            auto_launch: false,
            collapse_on_idle: false,
            show_completed: true,
        }
    }
}
