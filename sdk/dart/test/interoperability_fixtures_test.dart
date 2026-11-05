import 'dart:convert';
import 'dart:io';
import 'package:test/test.dart';

Map<String, dynamic> _loadFixtureDocument() {
  var directory = Directory.current;
  while (true) {
    final candidate = File('${directory.path}/docs/architecture/interoperability-contract-fixtures.json');
    if (candidate.existsSync()) return jsonDecode(candidate.readAsStringSync()) as Map<String, dynamic>;
    final parent = directory.parent;
    if (parent.path == directory.path) throw StateError('Could not locate canonical interoperability fixtures.');
    directory = parent;
  }
}

Map<String, Map<String, dynamic>> _fixtureCases() {
  final document = _loadFixtureDocument();
  if (document['schemaVersion'] != '1.0.0' || document['encoding'] != 'UTF-8') {
    throw StateError('Unsupported interoperability fixture document.');
  }
  final rules = document['rules'];
  if (rules is! List || rules.isEmpty) throw StateError('Fixture rules are missing.');
  final entries = document['cases'];
  if (entries is! List) throw StateError('Fixture cases must be an array.');
  final result = <String, Map<String, dynamic>>{};
  for (final entry in entries) {
    if (entry is! Map<String, dynamic>) throw StateError('Fixture case must be an object.');
    final id = entry['id'];
    if (id is! String || id.isEmpty || result.containsKey(id)) throw StateError('Fixture IDs must be non-empty and unique.');
    result[id] = entry;
  }
  return result;
}

Map<String, dynamic> _roundTrip(Map<String, dynamic> payload) =>
    jsonDecode(utf8.decode(utf8.encode(jsonEncode(payload)))) as Map<String, dynamic>;

void main() {
  test('consumes canonical cross-language fixtures without coercion', () {
    final fixtures = _fixtureCases();
    final unicode = fixtures['unicode-round-trip']!['payload'] as Map<String, dynamic>;
    final decodedUnicode = _roundTrip(unicode);
    final message = decodedUnicode['message'] as String;
    expect(message, unicode['message']);
    expect(message, contains('🌐'));
    expect(message, contains('你好'));

    final quantity = fixtures['large-quantity-string']!['payload'] as Map<String, dynamic>;
    expect(quantity['quantity'], isA<String>());
    expect(quantity['quantity'], matches(RegExp(r'^(0|[1-9][0-9]*)$')));
    expect(_roundTrip(quantity)['quantity'], quantity['quantity']);

    final nullable = fixtures['null-versus-absent']!;
    final nullablePayload = nullable['payload'] as Map<String, dynamic>;
    expect(nullablePayload.containsKey('presentNull'), isTrue);
    expect(nullablePayload['presentNull'], isNull);
    for (final absentField in nullable['absentFields'] as List<dynamic>) {
      expect(nullablePayload.containsKey(absentField), isFalse);
    }
    expect(nullablePayload['emptyString'], '');

    final nestedPayload = fixtures['nested-collections']!['payload'] as Map<String, dynamic>;
    final items = _roundTrip(nestedPayload)['items'] as List<dynamic>;
    expect((items[0] as Map<String, dynamic>)['enabled'], isTrue);
    expect((items[0] as Map<String, dynamic>)['count'], 0);
    expect((items[1] as Map<String, dynamic>)['enabled'], isFalse);
    expect((items[1] as Map<String, dynamic>)['count'], 2);

    final error = fixtures['stable-error-envelope']!['payload'] as Map<String, dynamic>;
    expect(error['ok'], isFalse);
    expect(error['status'], 'error');
    expect(error['code'], 'REQUEST_BODY_TOO_LARGE');
    expect(error['error'], isA<String>());
  });
}
