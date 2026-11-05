<?php
declare(strict_types=1);

namespace Glorifier\Neural;

use InvalidArgumentException;
use RuntimeException;

/** Native PHP 8.2+ client for GLORIFIER's versioned Neural HTTP/JSON contract. */
class GlorifierNeuralClient
{
    public const MAX_TASK_BODY_BYTES = 65536;
    public const MAX_RESPONSE_BODY_BYTES = 1048576;
    private string $origin;
    private ?string $token;
    private int $timeoutSeconds;

    /** @param list<string> $allowedOrigins */
    public function __construct(
        string $baseUrl,
        ?string $token = null,
        array $allowedOrigins = ['https://glorifier.glorifier.workers.dev'],
        bool $allowLoopbackHttp = false,
        int $timeoutSeconds = 8
    ) {
        $parts = parse_url(trim($baseUrl));
        if ($parts === false || empty($parts['scheme']) || empty($parts['host']) ||
            isset($parts['user']) || isset($parts['pass']) || isset($parts['query']) || isset($parts['fragment']) ||
            (isset($parts['path']) && !in_array($parts['path'], ['', '/'], true))) {
            throw new InvalidArgumentException('baseUrl must be an origin only');
        }
        $scheme = strtolower($parts['scheme']);
        $host = strtolower($parts['host']);
        $port = isset($parts['port']) ? ':' . $parts['port'] : '';
        $local = $scheme === 'http' && $allowLoopbackHttp &&
            (in_array($host, ['localhost', '127.0.0.1', '::1'], true));
        if ($scheme !== 'https' && !$local) {
            throw new InvalidArgumentException('baseUrl must use HTTPS');
        }
        $origin = $scheme . '://' . $host . $port;
        $allowed = array_map(static fn($value) => rtrim(strtolower((string)$value), '/'), $allowedOrigins);
        if (!$local && !in_array($origin, $allowed, true)) {
            throw new InvalidArgumentException('baseUrl is not an exact allowed origin');
        }
        if ($timeoutSeconds < 1 || $timeoutSeconds > 60) {
            throw new InvalidArgumentException('timeout must be between 1 and 60 seconds');
        }
        if ($token !== null && preg_match('/[\x00-\x20\x7f]/', $token)) {
            throw new InvalidArgumentException('token must be a raw bearer token');
        }
        $this->origin = $origin;
        $this->token = ($token === null || trim($token) === '') ? null : $token;
        $this->timeoutSeconds = $timeoutSeconds;
    }

    public function health(): array { return $this->request('GET', '/api/neural/health'); }
    public function ready(): array { return $this->request('GET', '/api/neural/ready'); }

    /** @param array<string,mixed> $task */
    public function submitTask(array $task): array
    {
        self::validateTask($task);
        if ($this->token === null) throw new RuntimeException('caller bearer token is required for task submission');
        return $this->request('POST', '/api/neural/v1/tasks', $task);
    }

    /** @param array<string,mixed> $task */
    public static function validateTask(array $task): void
    {
        $allowed = ['task', 'purpose', 'require_approval', 'action_class'];
        if (array_diff(array_keys($task), $allowed) !== []) throw new InvalidArgumentException('task contains unknown fields');
        if (!isset($task['task']) || !is_string($task['task']) || trim($task['task']) === '' || mb_strlen($task['task'], 'UTF-8') > 20000) {
            throw new InvalidArgumentException('task must contain 1-20,000 characters');
        }
        if (array_key_exists('purpose', $task) && (!is_string($task['purpose']) || $task['purpose'] === '' || mb_strlen($task['purpose'], 'UTF-8') > 100)) {
            throw new InvalidArgumentException('purpose must contain 1-100 characters');
        }
        if (array_key_exists('require_approval', $task) && !is_bool($task['require_approval'])) {
            throw new InvalidArgumentException('require_approval must be boolean');
        }
        if (array_key_exists('action_class', $task) && (!is_string($task['action_class']) || $task['action_class'] === '' || mb_strlen($task['action_class'], 'UTF-8') > 64)) {
            throw new InvalidArgumentException('action_class must contain 1-64 characters');
        }
    }

    /** @param array<string,mixed>|null $payload */
    protected function perform(string $method, string $path, ?array $payload = null): array
    {
        $body = $payload === null ? null : json_encode($payload, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE);
        if ($body !== null && strlen($body) > self::MAX_TASK_BODY_BYTES) throw new InvalidArgumentException('task request body exceeds 65,536 bytes');
        $responseBody = '';
        $headers = ['Accept: application/json'];
        if ($method === 'POST' && $path === '/api/neural/v1/tasks' && $this->token !== null) $headers[] = 'Authorization: Bearer ' . $this->token;
        if ($body !== null) $headers[] = 'Content-Type: application/json; charset=utf-8';
        $curl = curl_init($this->origin . $path);
        if ($curl === false) throw new RuntimeException('unable to initialize HTTP transport');
        curl_setopt_array($curl, [
            CURLOPT_CUSTOMREQUEST => $method,
            CURLOPT_HTTPHEADER => $headers,
            CURLOPT_RETURNTRANSFER => false,
            CURLOPT_FOLLOWLOCATION => false,
            CURLOPT_MAXREDIRS => 0,
            CURLOPT_CONNECTTIMEOUT => $this->timeoutSeconds,
            CURLOPT_TIMEOUT => $this->timeoutSeconds,
            CURLOPT_SSL_VERIFYPEER => true,
            CURLOPT_SSL_VERIFYHOST => 2,
            CURLOPT_WRITEFUNCTION => static function ($handle, string $chunk) use (&$responseBody): int {
                if (strlen($responseBody) + strlen($chunk) > self::MAX_RESPONSE_BODY_BYTES) return 0;
                $responseBody .= $chunk;
                return strlen($chunk);
            },
        ]);
        if ($body !== null) curl_setopt($curl, CURLOPT_POSTFIELDS, $body);
        $ok = curl_exec($curl);
        $status = (int)curl_getinfo($curl, CURLINFO_RESPONSE_CODE);
        $error = curl_error($curl);
        curl_close($curl);
        if ($ok === false) throw new RuntimeException('GLORIFIER transport failed or response exceeded 1 MiB: ' . $error);
        $decoded = json_decode($responseBody, true, 512, JSON_THROW_ON_ERROR);
        if (!is_array($decoded)) throw new RuntimeException('GLORIFIER response must be a JSON object');
        return ['status_code' => $status, 'body' => $decoded];
    }

    private function request(string $method, string $path, ?array $payload = null): array
    {
        return $this->perform($method, $path, $payload);
    }
}
