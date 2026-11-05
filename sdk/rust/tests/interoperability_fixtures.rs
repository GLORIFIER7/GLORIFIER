use serde_json::{json, Value};
use std::{collections::HashMap, fs};

fn load_cases() -> HashMap<String, Value> {
    let mut current = std::env::current_dir().expect("current directory");
    let fixture_path = loop {
        let candidate = current.join("docs/architecture/interoperability-contract-fixtures.json");
        if candidate.is_file() { break candidate; }
        if !current.pop() { panic!("could not locate canonical interoperability fixtures"); }
    };
    let raw = fs::read_to_string(&fixture_path).expect("read canonical fixture file");
    let document: Value = serde_json::from_str(&raw).expect("parse canonical fixture JSON");
    assert_eq!(document["schemaVersion"], "1.0.0");
    assert_eq!(document["encoding"], "UTF-8");
    assert!(document["rules"].as_array().is_some_and(|rules| !rules.is_empty()));
    let cases = document["cases"].as_array().expect("cases array");
    let mut mapped = HashMap::new();
    for test_case in cases {
        let id = test_case["id"].as_str().expect("string fixture id");
        assert!(!id.is_empty());
        assert!(mapped.insert(id.to_owned(), test_case.clone()).is_none(), "duplicate fixture case {id}");
    }
    mapped
}

#[test]
fn consumes_canonical_cross_language_fixtures_without_coercion() {
    let cases = load_cases();
    let unicode = &cases["unicode-round-trip"]["payload"];
    let wire = serde_json::to_vec(unicode).expect("serialize Unicode fixture");
    let decoded: Value = serde_json::from_slice(&wire).expect("decode Unicode fixture");
    assert_eq!(decoded["message"], unicode["message"]);
    assert!(decoded["message"].as_str().unwrap().contains("🌐"));
    assert!(decoded["message"].as_str().unwrap().contains("你好"));

    let quantity = &cases["large-quantity-string"]["payload"];
    let quantity_text = quantity["quantity"].as_str().expect("quantity must remain a string");
    assert!(quantity_text.parse::<u128>().is_err() || quantity_text.len() > 38);
    let wire = serde_json::to_vec(quantity).expect("serialize quantity fixture");
    let decoded: Value = serde_json::from_slice(&wire).expect("decode quantity fixture");
    assert_eq!(decoded["quantity"].as_str(), Some(quantity_text));

    let nullable = &cases["null-versus-absent"];
    let nullable_payload = &nullable["payload"];
    assert!(nullable_payload.get("presentNull").is_some_and(Value::is_null));
    for absent in nullable["absentFields"].as_array().expect("absent fields") {
        assert!(nullable_payload.get(absent.as_str().unwrap()).is_none());
    }
    assert_eq!(nullable_payload["emptyString"], "");

    let nested = &cases["nested-collections"]["payload"];
    let wire = serde_json::to_vec(nested).expect("serialize nested fixture");
    let decoded: Value = serde_json::from_slice(&wire).expect("decode nested fixture");
    assert_eq!(decoded["items"][0]["enabled"], json!(true));
    assert_eq!(decoded["items"][0]["count"], json!(0));
    assert_eq!(decoded["items"][1]["enabled"], json!(false));
    assert_eq!(decoded["items"][1]["count"], json!(2));

    let error = &cases["stable-error-envelope"]["payload"];
    assert_eq!(error["ok"], false);
    assert_eq!(error["status"], "error");
    assert_eq!(error["code"], "REQUEST_BODY_TOO_LARGE");
    assert!(error["error"].is_string());
}
