use reqwest::blocking::Client as HttpClient;
use reqwest::redirect::Policy;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::io::Read;
use std::time::Duration;
use url::Url;

pub const MAX_TASK_BODY_BYTES: usize = 65_536;
pub const MAX_RESPONSE_BODY_BYTES: usize = 1_048_576;
pub const MAX_TASK_CHARACTERS: usize = 20_000;

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct TaskRequest {
    pub task: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub purpose: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub require_approval: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub action_class: Option<String>,
}

#[derive(Clone, Debug)]
pub struct ApiResponse {
    pub status: u16,
    pub body: Value,
    pub correlation_id: Option<String>,
    pub retry_after: Option<String>,
}

#[derive(Debug)]
pub enum ClientError { InvalidOrigin(String), InvalidTask(String), MissingToken, Http(reqwest::Error), Io(std::io::Error), InvalidJson(serde_json::Error), ResponseTooLarge }

pub struct GlorifierNeuralClient { origin: Url, token: Option<String>, http: HttpClient }

impl GlorifierNeuralClient {
    pub fn new(base_url: &str, token: Option<String>, allowed_origins: &[&str], allow_loopback_http: bool) -> Result<Self, ClientError> {
        let mut origin = Url::parse(base_url).map_err(|e| ClientError::InvalidOrigin(e.to_string()))?;
        if !origin.username().is_empty() || origin.password().is_some() || origin.query().is_some() || origin.fragment().is_some() ||
            (origin.path() != "/" && !origin.path().is_empty()) {
            return Err(ClientError::InvalidOrigin("base_url must be an origin only".into()));
        }
        let local = origin.scheme() == "http" && allow_loopback_http &&
            (origin.host_str() == Some("localhost") || origin.host_str() == Some("127.0.0.1") || origin.host_str() == Some("::1"));
        if origin.scheme() != "https" && !local { return Err(ClientError::InvalidOrigin("HTTPS is required".into())); }
        let normalized = origin.as_str().trim_end_matches('/').to_lowercase();
        if !local && !allowed_origins.iter().any(|allowed| allowed.trim_end_matches('/').to_lowercase() == normalized) &&
            normalized != "https://glorifier.glorifier.workers.dev" {
            return Err(ClientError::InvalidOrigin("base_url is not an exact allowed origin".into()));
        }
        origin.set_path("/");
        let http = HttpClient::builder().timeout(Duration::from_secs(8)).redirect(Policy::none()).build().map_err(ClientError::Http)?;
        Ok(Self { origin, token, http })
    }

    pub fn health(&self) -> Result<ApiResponse, ClientError> { self.request("GET", "/api/neural/health", None) }
    pub fn ready(&self) -> Result<ApiResponse, ClientError> { self.request("GET", "/api/neural/ready", None) }

    pub fn submit_task(&self, task: &TaskRequest) -> Result<ApiResponse, ClientError> {
        if self.token.as_deref().unwrap_or("").is_empty() { return Err(ClientError::MissingToken); }
        validate_task(task)?;
        let body = serde_json::to_vec(task).map_err(|e| ClientError::InvalidTask(e.to_string()))?;
        if body.len() > MAX_TASK_BODY_BYTES { return Err(ClientError::InvalidTask("request body exceeds 65,536 bytes".into())); }
        self.request("POST", "/api/neural/v1/tasks", Some(body))
    }

    fn request(&self, method: &str, path: &str, body: Option<Vec<u8>>) -> Result<ApiResponse, ClientError> {
        let url = self.origin.join(path).map_err(|e| ClientError::InvalidOrigin(e.to_string()))?;
        let mut request = match method { "POST" => self.http.post(url), _ => self.http.get(url) }.header("Accept", "application/json");
        if let Some(bytes) = body { request = request.header("Content-Type", "application/json; charset=utf-8").body(bytes); }
        if method == "POST" && path == "/api/neural/v1/tasks" {
            if let Some(token) = &self.token { request = request.bearer_auth(token); }
        }
        let mut response = request.send().map_err(ClientError::Http)?;
        let status = response.status().as_u16();
        let correlation_id = response.headers().get("X-Correlation-ID").and_then(|v| v.to_str().ok()).map(str::to_owned);
        let retry_after = response.headers().get("Retry-After").and_then(|v| v.to_str().ok()).map(str::to_owned);
        let mut bytes = Vec::new();
        response.take((MAX_RESPONSE_BODY_BYTES + 1) as u64).read_to_end(&mut bytes).map_err(ClientError::Io)?;
        if bytes.len() > MAX_RESPONSE_BODY_BYTES { return Err(ClientError::ResponseTooLarge); }
        let body: Value = serde_json::from_slice(&bytes).map_err(ClientError::InvalidJson)?;
        if !body.is_object() { return Err(ClientError::InvalidTask("response must be a JSON object".into())); }
        Ok(ApiResponse { status, body, correlation_id, retry_after })
    }
}

fn validate_task(task: &TaskRequest) -> Result<(), ClientError> {
    if task.task.trim().is_empty() || task.task.chars().count() > MAX_TASK_CHARACTERS {
        return Err(ClientError::InvalidTask("task must contain 1-20,000 characters".into()));
    }
    if task.purpose.as_ref().is_some_and(|v| v.is_empty() || v.chars().count() > 100) {
        return Err(ClientError::InvalidTask("purpose must contain 1-100 characters".into()));
    }
    if task.action_class.as_ref().is_some_and(|v| v.is_empty() || v.chars().count() > 64) {
        return Err(ClientError::InvalidTask("action_class must contain 1-64 characters".into()));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tiny_http::{Response, Server};
    use std::thread;

    #[test]
    fn rejects_untrusted_origins_and_invalid_task() {
        assert!(GlorifierNeuralClient::new("http://example.com", None, &[], false).is_err());
        assert!(GlorifierNeuralClient::new("https://example.com/path", None, &["https://example.com"], false).is_err());
        let client = GlorifierNeuralClient::new("https://glorifier.glorifier.workers.dev", Some("x".into()), &[], false).unwrap();
        let bad = TaskRequest { task: "read".into(), purpose: Some("x".repeat(101)), require_approval: None, action_class: None };
        assert!(client.submit_task(&bad).is_err());
    }

    #[test]
    fn health_readiness_and_task_auth_boundaries() {
        let server = Server::http("127.0.0.1:0").unwrap();
        let address = format!("http://{}", server.server_addr());
        let handle = thread::spawn(move || {
            for _ in 0..3 {
                let request = server.recv().unwrap();
                let path = request.url().to_string();
                let auth = request.headers().iter().find(|h| h.field.equiv("Authorization")).map(|h| h.value.as_str().to_string());
                if path.ends_with("/health") { assert!(auth.is_none()); request.respond(Response::from_string(r#"{"status":"ok"}"#).with_status_code(200)).unwrap(); }
                else if path.ends_with("/ready") { request.respond(Response::from_string(r#"{"status":"NOT READY"}"#).with_status_code(503)).unwrap(); }
                else { assert_eq!(auth.as_deref(), Some("Bearer token")); request.respond(Response::from_string(r#"{"status":"accepted"}"#).with_status_code(202)).unwrap(); }
            }
        });
        let client = GlorifierNeuralClient::new(&address, Some("token".into()), &[], true).unwrap();
        assert_eq!(client.health().unwrap().status, 200);
        assert_eq!(client.ready().unwrap().status, 503);
        let task = TaskRequest { task: "safe read-only status".into(), purpose: None, require_approval: Some(true), action_class: Some("read_only".into()) };
        assert_eq!(client.submit_task(&task).unwrap().status, 202);
        handle.join().unwrap();
    }
}