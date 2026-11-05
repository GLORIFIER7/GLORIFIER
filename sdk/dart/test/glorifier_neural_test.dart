import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'package:test/test.dart';
import 'package:glorifier_neural/glorifier_neural.dart';

void main() {
  test('rejects untrusted origins and invalid task schemas', () {
    expect(() => GlorifierNeuralClient('http://example.com'), throwsArgumentError);
    expect(() => GlorifierNeuralClient('https://evil.example/path'), throwsArgumentError);
    expect(() => GlorifierNeuralClient.validateTask({'action': 'read'}), throwsArgumentError);
    expect(() => GlorifierNeuralClient.validateTask({'task': 'read', 'extra': true}), throwsArgumentError);
    expect(() => GlorifierNeuralClient.validateTask({'task': ''}), throwsArgumentError);
  });

  test('health/readiness are unauthenticated and task submission carries caller token', () async {
    final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
    final auth = <String?>[];
    final completer = Completer<void>();
    server.listen((request) async {
      auth.add(request.headers.value(HttpHeaders.authorizationHeader));
      final isReady = request.uri.path.endsWith('/ready');
      final isTask = request.uri.path.endsWith('/tasks');
      request.response.statusCode = isReady ? HttpStatus.serviceUnavailable : (isTask ? HttpStatus.accepted : HttpStatus.ok);
      request.response.headers.contentType = ContentType.json;
      request.response.write(jsonEncode({'status': isReady ? 'NOT READY' : 'ok'}));
      await request.response.close();
      if (auth.length == 3 && !completer.isCompleted) completer.complete();
    });
    final client = GlorifierNeuralClient('http://127.0.0.1:${server.port}', token: 'caller-token', allowLoopbackHttp: true);
    try {
      expect((await client.health()).statusCode, HttpStatus.ok);
      expect((await client.ready()).statusCode, HttpStatus.serviceUnavailable);
      expect((await client.submitTask({'task': 'safe read-only status'})).statusCode, HttpStatus.accepted);
      await completer.future.timeout(const Duration(seconds: 3));
      expect(auth[0], isNull);
      expect(auth[1], isNull);
      expect(auth[2], 'Bearer caller-token');
    } finally {
      client.close();
      await server.close(force: true);
    }
  });
}