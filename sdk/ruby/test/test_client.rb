require "minitest/autorun"
require_relative "../lib/glorifier_neural_client"

class FakeGlorifierNeuralClient < GlorifierNeuralClient
  attr_reader :requests
  def initialize(*args, **kwargs)
    super
    @requests = []
  end
  protected
  def perform(method, path, payload = nil)
    @requests << [method, path, payload]
    { status_code: path.end_with?("/ready") ? 503 : 200, body: { "status" => "test" } }
  end
end

class GlorifierNeuralClientTest < Minitest::Test
  def test_rejects_untrusted_origins
    assert_raises(ArgumentError) { GlorifierNeuralClient.new("http://example.com") }
    assert_raises(ArgumentError) { GlorifierNeuralClient.new("https://evil.example/path") }
  end

  def test_scopes_token_to_task_route
    client = FakeGlorifierNeuralClient.new("https://glorifier.glorifier.workers.dev", token: "caller-token")
    client.health
    client.ready
    client.submit_task("task" => "safe read-only status", "require_approval" => true)
    assert_equal ["GET", "/api/neural/health"], client.requests[0][0, 2]
    assert_equal ["GET", "/api/neural/ready"], client.requests[1][0, 2]
    assert_equal ["POST", "/api/neural/v1/tasks"], client.requests[2][0, 2]
  end

  def test_rejects_unknown_and_invalid_task_fields
    assert_raises(ArgumentError) { GlorifierNeuralClient.validate_task("action" => "read") }
    assert_raises(ArgumentError) { GlorifierNeuralClient.validate_task("task" => "read", "extra" => true) }
    assert_raises(ArgumentError) { GlorifierNeuralClient.validate_task("task" => "", "purpose" => "general") }
  end
end