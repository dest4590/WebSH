use websh_backend::state::{TunnelNode, WsQuery, validate_target};

#[test]
fn tunnelnode_default_values() {
    let t = TunnelNode::default();
    assert_eq!(t.name, "mock1");
    assert_eq!(t.url, "http://localhost:8080");
    assert_eq!(t.tier, "free");
}

#[test]
fn tunnelnode_deserialize_yaml() {
    let raw = r"- name: nodeA
  url: https://example.com
  tier: pro
";

    let nodes: Vec<TunnelNode> = serde_yaml::from_str(raw).expect("parse nodes yaml");
    assert_eq!(nodes.len(), 1);
    assert_eq!(nodes[0].name, "nodeA");
    assert_eq!(nodes[0].tier, "pro");
}

#[test]
fn validate_target_accepts_hostname() {
    let q = WsQuery {
        host: "example.com".to_string(),
        port: 22,
        ..Default::default()
    };
    assert!(validate_target(&q).is_ok());
}

#[test]
fn validate_target_rejects_empty_host() {
    let q = WsQuery {
        host: String::new(),
        ..Default::default()
    };
    assert!(validate_target(&q).is_err());
}

#[test]
fn validate_target_rejects_bad_chars() {
    let q = WsQuery {
        host: "bad_host!".to_string(),
        ..Default::default()
    };
    assert!(validate_target(&q).is_err());
}
