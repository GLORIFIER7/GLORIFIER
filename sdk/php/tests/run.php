<?php
declare(strict_types=1);

require __DIR__ . '/../src/GlorifierNeuralClient.php';

use Glorifier\Neural\GlorifierNeuralClient;

final class FakeGlorifierClient extends GlorifierNeuralClient {
    public array $requests = [];
    protected function perform(string $method, string $path, ?array $payload = null): array {
        $this->requests[] = [$method, $path, $payload];
        return ['status_code' => $path === '/api/neural/ready' ? 503 : 200, 'body' => ['status' => 'test']];
    }
}

function check(bool $condition, string $message): void {
    if (!$condition) throw new RuntimeException($message);
}

foreach (['http://example.com', 'https://evil.example/path', 'https://user:pass@example.com'] as $url) {
    try { GlorifierNeuralClient::createForTests($url); throw new RuntimeException('expected origin rejection'); }
    catch (InvalidArgumentException) {}
}

$client = new FakeGlorifierClient('https://glorifier.glorifier.workers.dev', 'caller-token');
$client->health();
$client->ready();
$client->submitTask(['task' => 'safe read-only check', 'require_approval' => true]);
check($client->requests[0][0] === 'GET' && $client->requests[0][1] === '/api/neural/health', 'health route mismatch');
check($client->requests[1][0] === 'GET' && $client->requests[1][1] === '/api/neural/ready', 'readiness route mismatch');
check($client->requests[2][0] === 'POST' && $client->requests[2][1] === '/api/neural/v1/tasks', 'task route mismatch');

foreach ([['action' => 'read'], ['task' => ''], ['task' => 'read', 'extra' => true], ['task' => 'read', 'require_approval' => 'yes']] as $invalid) {
    try { GlorifierNeuralClient::validateTask($invalid); throw new RuntimeException('expected task rejection'); }
    catch (InvalidArgumentException) {}
}
echo "PHP SDK contract tests passed\n";
