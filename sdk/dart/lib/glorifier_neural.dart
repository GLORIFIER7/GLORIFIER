import 'dart:convert';
import 'dart:io';

const int maxTaskBodyBytes = 65536;
const int maxResponseBodyBytes = 1048576;

class NeuralApiResponse {
  const NeuralApiResponse(this.statusCode, this.body, this.correlationId, this.retryAfter);
  final int statusCode;
  final Map<String, dynamic> body;
  final String? correlationId;
  final String? retryAfter;
}

/// Native Dart 3.4+ client for the GLORIFIER Neural HTTP/JSON API.
class GlorifierNeuralClient {
  GlorifierNeuralClient(String baseUrl, {String? token,
    Set<String> allowedOrigins = const {'https://glorifier.glorifier.workers.dev'},
    bool allowLoopbackHttp = false, Duration timeout = const Duration(seconds: 8)})
      : _origin = _validateOrigin(baseUrl, allowedOrigins, allowLoopbackHttp),
        _token = token,
        _timeout = timeout,
        _http = HttpClient() {
    if (timeout <= Duration.zero || timeout > const Duration(seconds: 60)) {
      throw ArgumentError('timeout must be between 0 and 60 seconds');
    }
    if (token != null && RegExp(r'[\s\x00-\x1f\x7f]').hasMatch(token)) {
      throw ArgumentError('token must be a raw bearer token');
    }
  }

  final Uri _origin;
  final String? _token;
  final Duration _timeout;
  final HttpClient _http;

  static Uri _validateOrigin(String raw, Set<String> allowed, bool allowLoopback) {
    final uri = Uri.tryParse(raw);
    if (uri == null || !uri.hasAuthority || uri.host.isEmpty || uri.userInfo.isNotEmpty ||
        uri.hasQuery || uri.hasFragment || (uri.path.isNotEmpty && uri.path != '/')) {
      throw ArgumentError('baseUrl must be an origin only');
    }
    final local = uri.scheme == 'http' && allowLoopback &&
        (uri.host == 'localhost' || uri.host == '127.0.0.1' || uri.host == '::1');
    if (uri.scheme != 'https' && !local) throw ArgumentError('baseUrl must use HTTPS');
    final normalized = '${uri.scheme}://${uri.authority}'.toLowerCase();
    if (!local && !allowed.map((v) => v.replaceFirst(RegExp(r'/$'), '').toLowerCase()).contains(normalized)) {
      throw ArgumentError('baseUrl is not an exact allowed origin');
    }
    return Uri.parse('$normalized/');
  }

  Future<NeuralApiResponse> health() => _request('GET', '/api/neural/health');
  Future<NeuralApiResponse> ready() => _request('GET', '/api/neural/ready');

  Future<NeuralApiResponse> submitTask(Map<String, dynamic> task) async {
    validateTask(task);
    if (_token == null || _token!.isEmpty) throw StateError('caller bearer token is required for task submission');
    final bytes = utf8.encode(jsonEncode(task));
    if (bytes.length > maxTaskBodyBytes) throw ArgumentError('task request body exceeds 65,536 bytes');
    return _request('POST', '/api/neural/v1/tasks', body: bytes);
  }

  static void validateTask(Map<String, dynamic> task) {
    const allowed = {'task', 'purpose', 'require_approval', 'action_class'};
    if (task.keys.any((key) => !allowed.contains(key))) throw ArgumentError('task contains unknown fields');
    final prompt = task['task'];
    if (prompt is! String || prompt.trim().isEmpty || prompt.runes.length > 20000) {
      throw ArgumentError('task must contain 1-20,000 characters');
    }
    if (task.containsKey('purpose') && (task['purpose'] is! String || (task['purpose'] as String).isEmpty || (task['purpose'] as String).runes.length > 100)) {
      throw ArgumentError('purpose must contain 1-100 characters');
    }
    if (task.containsKey('require_approval') && task['require_approval'] is! bool) {
      throw ArgumentError('require_approval must be boolean');
    }
    if (task.containsKey('action_class') && (task['action_class'] is! String || (task['action_class'] as String).isEmpty || (task['action_class'] as String).runes.length > 64)) {
      throw ArgumentError('action_class must contain 1-64 characters');
    }
  }

  Future<NeuralApiResponse> _request(String method, String path, {List<int>? body}) async {
    final uri = _origin.resolve(path);
    final request = await _http.openUrl(method, uri).timeout(_timeout);
    request.followRedirects = false;
    request.maxRedirects = 0;
    request.headers.set(HttpHeaders.acceptHeader, 'application/json');
    if (body != null) {
      request.headers.contentType = ContentType('application', 'json', charset: 'utf-8');
      request.add(body);
    }
    if (method == 'POST' && path == '/api/neural/v1/tasks' && _token != null) {
      request.headers.set(HttpHeaders.authorizationHeader, 'Bearer $_token');
    }
    final response = await request.close().timeout(_timeout);
    final output = BytesBuilder(copy: false);
    await for (final chunk in response.timeout(_timeout)) {
      if (output.length + chunk.length > maxResponseBodyBytes) throw HttpException('GLORIFIER response exceeds 1 MiB');
      output.add(chunk);
    }
    final decoded = jsonDecode(utf8.decode(output.takeBytes()));
    if (decoded is! Map<String, dynamic>) throw const FormatException('GLORIFIER response must be a JSON object');
    return NeuralApiResponse(response.statusCode, decoded,
        response.headers.value('X-Correlation-ID'), response.headers.value(HttpHeaders.retryAfterHeader));
  }

  void close() => _http.close(force: true);
}