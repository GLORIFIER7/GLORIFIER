<?php
declare(strict_types=1);

require __DIR__ . '/run.php';

function findRepositoryRootForInteropFixtures(): string {
    $directory = dirname(__DIR__, 3);
    $candidate = $directory . '/docs/architecture/interoperability-contract-fixtures.json';
    if (!is_file($candidate)) throw new RuntimeException('Could not locate canonical interoperability fixtures.');
    return $directory;
}

$fixturePath = findRepositoryRootForInteropFixtures() . '/docs/architecture/interoperability-contract-fixtures.json';
$document = json_decode(file_get_contents($fixturePath), true, 512, JSON_THROW_ON_ERROR);
if (($document['schemaVersion'] ?? null) !== '1.0.0' || ($document['encoding'] ?? null) !== 'UTF-8') {
    throw new RuntimeException('Unsupported interoperability fixture document.');
}
if (!is_array($document['rules'] ?? null) || count($document['rules']) === 0) {
    throw new RuntimeException('Fixture rules are missing.');
}

$cases = [];
foreach ($document['cases'] ?? [] as $case) {
    $id = $case['id'] ?? null;
    if (!is_string($id) || $id === '' || array_key_exists($id, $cases)) {
        throw new RuntimeException('Fixture IDs must be non-empty and unique.');
    }
    $cases[$id] = $case;
}
$assert = static function (bool $condition, string $message): void {
    if (!$condition) throw new RuntimeException($message);
};
$roundTrip = static fn(array $payload): array =>
    json_decode(json_encode($payload, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE), true, 512, JSON_THROW_ON_ERROR);

$unicode = $cases['unicode-round-trip']['payload'];
$unicodeDecoded = $roundTrip($unicode);
$assert($unicodeDecoded['message'] === $unicode['message'], 'Unicode fixture changed during JSON round trip');
$assert(str_contains($unicodeDecoded['message'], '🌐') && str_contains($unicodeDecoded['message'], '你好'), 'Unicode fixture lost code points');

$quantity = $cases['large-quantity-string']['payload'];
$assert(is_string($quantity['quantity']), 'arbitrary-precision quantity must remain a string');
$assert(preg_match('/^(0|[1-9][0-9]*)$/', $quantity['quantity']) === 1, 'quantity must be a canonical decimal string');
$assert($roundTrip($quantity)['quantity'] === $quantity['quantity'], 'quantity changed during JSON round trip');

$nullable = $cases['null-versus-absent'];
$nullablePayload = $nullable['payload'];
$assert(array_key_exists('presentNull', $nullablePayload) && $nullablePayload['presentNull'] === null, 'explicit null must be preserved');
foreach ($nullable['absentFields'] as $absentField) {
    $assert(!array_key_exists($absentField, $nullablePayload), 'absent field was introduced');
}
$assert($nullablePayload['emptyString'] === '', 'empty string was changed');

$nested = $roundTrip($cases['nested-collections']['payload']);
$assert($nested['items'][0]['enabled'] === true && $nested['items'][0]['count'] === 0, 'first nested value changed type or value');
$assert($nested['items'][1]['enabled'] === false && $nested['items'][1]['count'] === 2, 'second nested value changed type or value');

$error = $cases['stable-error-envelope']['payload'];
$assert($error['ok'] === false && $error['status'] === 'error', 'stable error state changed');
$assert($error['code'] === 'REQUEST_BODY_TOO_LARGE' && is_string($error['error']), 'stable error identifiers changed');

echo "PHP shared interoperability fixture tests passed\n";
