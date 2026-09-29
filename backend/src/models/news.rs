use serde::{Deserialize, Serialize};
use std::convert::TryFrom;
use std::fmt;
use std::str::FromStr;

#[derive(Debug, Serialize, Deserialize, Clone, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct NewsItem {
    pub id: i64,
    pub title: String,
    pub content: String,
    pub author_id: i64,
    pub created_at: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Comment {
    pub id: i64,
    pub news_id: i64,
    pub user_id: i64,
    pub user_name: String,
    pub content: String,
    pub created_at: i64,
}

#[derive(Deserialize, Serialize, Debug, Clone)]
pub enum Reaction {
    #[serde(rename = ">_<")]
    GreaterUnderscoreLess,
    #[serde(rename = "^_^")]
    CaretUnderscoreCaret,
    #[serde(rename = "O_O")]
    OUnderscoreO,
    #[serde(rename = "T_T")]
    TUnderscoreT,
    #[serde(rename = "-_-")]
    DashUnderscoreDash,
    #[serde(rename = "(o_o)")]
    ParenOUnderscoreOParen,
    #[serde(rename = "(^_^)")]
    ParenCaretUnderscoreCaretParen,
}

impl fmt::Display for Reaction {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let s = match self {
            Reaction::GreaterUnderscoreLess => ">_<",
            Reaction::CaretUnderscoreCaret => "^_^",
            Reaction::OUnderscoreO => "O_O",
            Reaction::TUnderscoreT => "T_T",
            Reaction::DashUnderscoreDash => "-_-",
            Reaction::ParenOUnderscoreOParen => "(o_o)",
            Reaction::ParenCaretUnderscoreCaretParen => "(^_^)",
        };
        write!(f, "{}", s)
    }
}

impl FromStr for Reaction {
    type Err = ();
    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            ">_<" => Ok(Reaction::GreaterUnderscoreLess),
            "^_^" => Ok(Reaction::CaretUnderscoreCaret),
            "O_O" => Ok(Reaction::OUnderscoreO),
            "T_T" => Ok(Reaction::TUnderscoreT),
            "-_-" => Ok(Reaction::DashUnderscoreDash),
            "(o_o)" => Ok(Reaction::ParenOUnderscoreOParen),
            "(^_^)" => Ok(Reaction::ParenCaretUnderscoreCaretParen),
            _ => Err(()),
        }
    }
}

impl TryFrom<&str> for Reaction {
    type Error = ();
    fn try_from(value: &str) -> Result<Self, Self::Error> {
        Reaction::from_str(value)
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ReactionCount {
    pub reaction: String,
    pub count: i64,
    pub me: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct NewsWithDetails {
    pub news: NewsItem,
    pub comments: Vec<Comment>,
    pub reactions: Vec<ReactionCount>,
}
