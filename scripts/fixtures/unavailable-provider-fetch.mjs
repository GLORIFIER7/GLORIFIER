globalThis.fetch = async () => new Response(
  JSON.stringify({ error: { message: 'provider unavailable in isolated regression test' } }),
  { status: 503, headers: { 'content-type': 'application/json' } },
);
