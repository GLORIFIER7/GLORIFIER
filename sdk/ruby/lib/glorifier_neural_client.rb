require "json"
require "net/http"
require "uri"

# Native Ruby 3.2+ client for GLORIFIER's versioned Neural HTTP/JSON API.
class GlorifierNeuralClient
  MAX_TASK_BODY_BYTES = 65_536
  MAX_RESPONSE_BODY_BYTES = 1_048_576
  MAX_TASK_CHARACTERS = 20_000
  TASK_FIELDS = %w[task purpose require_approval action_class].freeze

  def initialize(base_url, token: nil, allowed_origins: ["https://glorifier.glorifier.workers.dev"], allow_loopback_http: false, timeout: 8)
    uri = URI.parse(base_url.to_s.strip)
    raise ArgumentError, "base_url must be an origin only" unless uri.is_a?(URI::HTTP) && uri.host && !uri.userinfo && !uri.query && !uri.fragment && [nil, "", "/"].include?(uri.path)
    local = uri.scheme == "http" && allow_loopback_http && %w[localhost 127.0.0.1 ::1].include?(uri.host)
    raise ArgumentError, "base_url must use HTTPS" unless uri.scheme == "https" || local
    origin = "#{uri.scheme}://#{uri.host.downcase}#{uri.port == uri.default_port ? "" : ":#{uri.port}"}"
    allowed = allowed_origins.map { |item| item.to_s.downcase.sub(%r{/$}, "") }
    raise ArgumentError, "base_url is not an exact allowed origin" unless local || allowed.include?(origin)
    raise ArgumentError, "timeout must be between 1 and 60 seconds" unless timeout.to_f.positive? && timeout.to_f <= 60
    raise ArgumentError, "token must be a raw bearer token" if token && token.match?(/[\s\x00-\x1f\x7f]/)
    @origin = origin
    @token = token.nil? || token.empty? ? nil : token
    @timeout = timeout.to_f
  end

  def health = request("GET", "/api/neural/health")
  def ready = request("GET", "/api/neural/ready")

  def submit_task(task)
    self.class.validate_task(task)
    raise ArgumentError, "caller bearer token is required for task submission" unless @token
    request("POST", "/api/neural/v1/tasks", task)
  end

  def self.validate_task(task)
    raise ArgumentError, "task must be a Hash" unless task.is_a?(Hash)
    raise ArgumentError, "task contains unknown fields" unless (task.keys - TASK_FIELDS).empty?
    prompt = task["task"]
    raise ArgumentError, "task must contain 1-20,000 characters" unless prompt.is_a?(String) && !prompt.strip.empty? && prompt.length <= MAX_TASK_CHARACTERS
    purpose = task["purpose"] if task.key?("purpose")
    raise ArgumentError, "purpose must contain 1-100 characters" if task.key?("purpose") && (!purpose.is_a?(String) || purpose.empty? || purpose.length > 100)
    raise ArgumentError, "require_approval must be boolean" if task.key?("require_approval") && ![true, false].include?(task["require_approval"])
    action_class = task["action_class"] if task.key?("action_class")
    raise ArgumentError, "action_class must contain 1-64 characters" if task.key?("action_class") && (!action_class.is_a?(String) || action_class.empty? || action_class.length > 64)
  end

  protected

  def perform(method, path, payload = nil)
    body = payload.nil? ? nil : JSON.generate(payload)
    raise ArgumentError, "task request body exceeds 65,536 bytes" if body && body.bytesize > MAX_TASK_BODY_BYTES
    uri = URI("#{@origin}#{path}")
    http = Net::HTTP.new(uri.host, uri.port)
    http.use_ssl = uri.scheme == "https"
    http.open_timeout = @timeout
    http.read_timeout = @timeout
    http.write_timeout = @timeout if http.respond_to?(:write_timeout=)
    http.max_retries = 0 if http.respond_to?(:max_retries=)
    request = method == "POST" ? Net::HTTP::Post.new(uri) : Net::HTTP::Get.new(uri)
    request["Accept"] = "application/json"
    request["Authorization"] = "Bearer #{@token}" if method == "POST" && path == "/api/neural/v1/tasks" && @token
    if body
      request["Content-Type"] = "application/json; charset=utf-8"
      request.body = body
    end
    response_body = +""
    response = http.request(request) do |res|
      res.read_body do |chunk|
        raise IOError, "GLORIFIER response exceeds 1 MiB" if response_body.bytesize + chunk.bytesize > MAX_RESPONSE_BODY_BYTES
        response_body << chunk
      end
    end
    parsed = JSON.parse(response_body)
    raise IOError, "GLORIFIER response must be a JSON object" unless parsed.is_a?(Hash)
    { status_code: response.code.to_i, body: parsed, correlation_id: response["X-Correlation-ID"], retry_after: response["Retry-After"] }
  end

  private

  def request(method, path, payload = nil) = perform(method, path, payload)
end