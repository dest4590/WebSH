use std::{env, path::PathBuf};

use crate::{log, state::TunnelNode};
use std::fs;

#[derive(Debug)]
pub struct Config {
    pub allowed_origin: Option<Vec<String>>,
    pub tunnel_secret: String,
    pub tunnel_nodes: Vec<TunnelNode>,
}

impl Config {
    pub fn load() -> Result<Self, String> {
        let allowed_origin = env::var("ALLOWED_ORIGIN")
            .ok()
            .and_then(|raw| parse_allowed_origins(&raw));

        if let Some(ref origins) = allowed_origin {
            log::info("origin policy enabled");
            for origin in origins {
                log::info(&format!(" - {origin}"));
            }
        } else {
            log::info("origin policy disabled; all origins accepted for development");
        }

        let tunnel_secret =
            env::var("TUNNEL_SECRET").map_err(|_| "TUNNEL_SECRET must be set".to_string())?;

        let backend_nodes = PathBuf::from("nodes.yaml");
        let parent_nodes = PathBuf::from("../nodes.yaml");

        let (_, tunnel_nodes) = if let Ok(raw) = fs::read_to_string(&backend_nodes) {
            (backend_nodes, parse_tunnel_nodes_yaml(&raw)?)
        } else if let Ok(raw) = fs::read_to_string(&parent_nodes) {
            (parent_nodes, parse_tunnel_nodes_yaml(&raw)?)
        } else {
            (backend_nodes.clone(), Vec::new())
        };

        let tunnel_nodes = if tunnel_nodes.is_empty() {
            log::info("no tunnel nodes configured; provisioning default mock node");
            vec![TunnelNode::default()]
        } else {
            tunnel_nodes
        };

        Ok(Self {
            allowed_origin,
            tunnel_secret,
            tunnel_nodes,
        })
    }
}

fn parse_allowed_origins(raw: &str) -> Option<Vec<String>> {
    let origins = raw
        .split(',')
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(String::from)
        .collect::<Vec<_>>();

    if origins.is_empty() {
        None
    } else {
        Some(origins)
    }
}

fn parse_tunnel_nodes_yaml(raw: &str) -> Result<Vec<TunnelNode>, String> {
    let nodes: Vec<TunnelNode> =
        serde_yaml::from_str(raw).map_err(|e| format!("failed to parse nodes.yaml: {e}"))?;

    log::info(&format!("loaded {} tunnel nodes", nodes.len()));
    for node in &nodes {
        log::info(&format!(
            "node={} url={} tier={}",
            node.name, node.url, node.tier
        ));
    }

    Ok(nodes)
}
