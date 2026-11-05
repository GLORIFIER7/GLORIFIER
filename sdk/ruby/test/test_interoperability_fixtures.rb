require "json"
require "minitest/autorun"

class InteroperabilityFixtureTest < Minitest::Test
  def repository_root
    current = Dir.pwd
    loop do
      candidate = File.join(current, "docs", "architecture", "interoperability-contract-fixtures.json")
      return current if File.file?(candidate)
      parent = File.dirname(current)
      raise "Could not locate canonical interoperability fixtures." if parent == current
      current = parent
    end
  end

  def fixture_cases
    document = JSON.parse(File.read(File.join(repository_root, "docs", "architecture", "interoperability-contract-fixtures.json"), encoding: "UTF-8"))
    assert_equal "1.0.0", document.fetch("schemaVersion")
    assert_equal "UTF-8", document.fetch("encoding")
    refute_empty document.fetch("rules")
    cases = {}
    document.fetch("cases").each do |entry|
      id = entry.fetch("id")
      refute_empty id
      refute cases.key?(id), "duplicate fixture case: #{id}"
      cases[id] = entry
    end
    cases
  end

  def round_trip(payload)
    JSON.parse(JSON.generate(payload))
  end

  def test_consumes_canonical_cross_language_fixtures_without_coercion
    cases = fixture_cases

    unicode = cases.fetch("unicode-round-trip").fetch("payload")
    decoded = round_trip(unicode)
    assert_equal unicode.fetch("message"), decoded.fetch("message")
    assert_includes decoded.fetch("message"), "🌐"
    assert_includes decoded.fetch("message"), "你好"

    quantity = cases.fetch("large-quantity-string").fetch("payload")
    assert_kind_of String, quantity.fetch("quantity")
    assert_match(/\A(?:0|[1-9][0-9]*)\z/, quantity.fetch("quantity"))
    assert_equal quantity.fetch("quantity"), round_trip(quantity).fetch("quantity")

    nullable = cases.fetch("null-versus-absent")
    payload = nullable.fetch("payload")
    assert payload.key?("presentNull")
    assert_nil payload.fetch("presentNull")
    nullable.fetch("absentFields").each { |field| refute payload.key?(field) }
    assert_equal "", payload.fetch("emptyString")

    nested = round_trip(cases.fetch("nested-collections").fetch("payload"))
    assert_equal true, nested.fetch("items")[0].fetch("enabled")
    assert_equal 0, nested.fetch("items")[0].fetch("count")
    assert_equal false, nested.fetch("items")[1].fetch("enabled")
    assert_equal 2, nested.fetch("items")[1].fetch("count")

    error = cases.fetch("stable-error-envelope").fetch("payload")
    assert_equal false, error.fetch("ok")
    assert_equal "error", error.fetch("status")
    assert_equal "REQUEST_BODY_TOO_LARGE", error.fetch("code")
    assert_kind_of String, error.fetch("error")
  end
end
