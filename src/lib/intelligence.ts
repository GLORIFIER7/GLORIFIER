import { getOptionalPostgresPool } from './db/postgres';

export type IntelligenceEvidence = {
  id: string;
  source: string;
  title: string;
  url: string;
  publishedAt?: string;
  summary: string;
  collectedAt: string;
};

export type IntelligenceAnalysis = {
  provider: string;
  model: string;
  output: string;
  status: 'completed' | 'unavailable';
};

export type IntelligenceReport = {
  id: string;
  generatedAt: string;
  windowHours: number;
  sourceCount: number;
  evidenceCount: number;
  analyses: IntelligenceAnalysis[];
  executiveSummary: string;
  themes: Array<{ theme: string; evidenceIds: string[]; summary: string }>;
  disagreements: string[];
  evidence: IntelligenceEvidence[];
};

let initialized = false;
let latestReport: IntelligenceReport | null = null;

function getPool() {
  return getOptionalPostgresPool();
}
async function ensureSchema() {
  if (initialized) return;
  const db = getPool();
  if (!db) return;
  await db.query(`
    CREATE TABLE IF NOT EXISTS intelligence_reports (
      id TEXT PRIMARY KEY,
      generated_at TIMESTAMPTZ NOT NULL,
      window_hours INTEGER NOT NULL,
      source_count INTEGER NOT NULL,
      evidence_count INTEGER NOT NULL,
      executive_summary TEXT NOT NULL,
      themes JSONB NOT NULL,
      disagreements JSONB NOT NULL
    );
    CREATE TABLE IF NOT EXISTS intelligence_evidence (
      id TEXT PRIMARY KEY,
      report_id TEXT NOT NULL REFERENCES intelligence_reports(id) ON DELETE CASCADE,
      source TEXT NOT NULL,
      title TEXT NOT NULL,
      url TEXT NOT NULL,
      published_at TIMESTAMPTZ NULL,
      summary TEXT NOT NULL,
      collected_at TIMESTAMPTZ NOT NULL
    );
    CREATE TABLE IF NOT EXISTS intelligence_analyses (
      id BIGSERIAL PRIMARY KEY,
      report_id TEXT NOT NULL REFERENCES intelligence_reports(id) ON DELETE CASCADE,
      provider TEXT NOT NULL,
      model TEXT NOT NULL,
      status TEXT NOT NULL,
      output TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS intelligence_evidence_report_idx ON intelligence_evidence(report_id);
    CREATE INDEX IF NOT EXISTS intelligence_evidence_published_idx ON intelligence_evidence(published_at DESC);
  `);
  initialized = true;
}

function stripHtml(value: string) {
  const withoutTags = value.replace(/<[^>]+>/g, ' ');
  // Decode each supported entity once. A combined callback replacement does not
  // reprocess the ampersand produced by decoding &amp; (avoids double-unescaping).
  return withoutTags
    .replace(/&amp;|&#39;|&quot;/g, (entity) => {
      switch (entity) {
        case '&amp;': return '&';
        case '&#39;': return "'";
        case '&quot;': return '"';
        default: return entity;
      }
    })
    .replace(/\s+/g, ' ')
    .trim();
}

function tagValue(block: string, tag: string) {
  const match = block.match(new RegExp(`<${tag}(?:[^>]*)>([\\s\\S]*?)</${tag}>`, 'i'));
  return match ? stripHtml(match[1]) : '';
}

function attrValue(block: string, tag: string, attr: string) {
  const match = block.match(new RegExp(`<${tag}[^>]*\\b${attr}=["']([^"']+)["']`, 'i'));
  return match ? match[1] : '';
}

async function fetchText(url: string) {
  const response = await fetch(url, {
    headers: { 'user-agent': 'GLORIFIER-Intelligence/1.0 (+public-monitoring)' },
    signal: AbortSignal.timeout(12_000)
  });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.text();
}

async function collectRss(source: string, url: string, limit = 8): Promise<IntelligenceEvidence[]> {
  const xml = await fetchText(url);
  const blocks = xml.match(/<(item|entry)[^>]*>[\s\S]*?<\/(item|entry)>/gi) || [];
  const collectedAt = new Date().toISOString();
  return blocks.slice(0, limit).map((block, index) => {
    const title = tagValue(block, 'title') || `Untitled ${index + 1}`;
    const link = tagValue(block, 'link') || attrValue(block, 'link', 'href');
    const publishedAt = tagValue(block, 'pubDate') || tagValue(block, 'published') || tagValue(block, 'updated');
    const summary = tagValue(block, 'description') || tagValue(block, 'summary') || tagValue(block, 'content');
    return {
      id: `${source}-${Buffer.from((link || title) + index).toString('base64url').slice(0, 24)}`,
      source,
      title: title.slice(0, 300),
      url: link,
      publishedAt: publishedAt || undefined,
      summary: summary.slice(0, 900),
      collectedAt
    };
  }).filter(item => item.url);
}

async function collectJsonApi(source: string, url: string, mapper: (item: any, index: number) => IntelligenceEvidence | null) {
  const response = await fetch(url, {
    headers: { 'user-agent': 'GLORIFIER-Intelligence/1.0 (+public-monitoring)', accept: 'application/json' },
    signal: AbortSignal.timeout(12_000)
  });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  const data = await response.json();
  const items = Array.isArray(data) ? data : (Array.isArray(data.items) ? data.items : []);
  return items.slice(0, 10).map(mapper).filter(Boolean) as IntelligenceEvidence[];
}

async function collectSources(windowHours: number) {
  const sources: Array<{ source: string; run: () => Promise<IntelligenceEvidence[]> }> = [
    {
      source: 'Google News / AI',
      run: () => collectRss('google-news-ai', 'https://news.google.com/rss/search?q=artificial+intelligence+OR+AI+models&hl=en-US&gl=US&ceid=US:en')
    },
    {
      source: 'Google News / GLORIFIER',
      run: () => collectRss('google-news-glorifier', 'https://news.google.com/rss/search?q=GLORIFIER+OR+Glorifier+Services&hl=en-US&gl=US&ceid=US:en')
    },
    {
      source: 'arXiv / AI',
      run: () => collectRss('arxiv-ai', 'https://export.arxiv.org/rss/cs.AI')
    },
    {
      source: 'Hugging Face / Models',
      run: () => collectJsonApi('hugging-face-models', 'https://huggingface.co/api/models?sort=lastModified&direction=-1&limit=10', (item, index) => ({
        id: `hf-${item.id || index}`,
        source: 'hugging-face-models',
        title: item.id || 'Hugging Face model',
        url: `https://huggingface.co/${item.id || ''}`,
        publishedAt: item.lastModified,
        summary: `Downloads: ${item.downloads ?? 'n/a'}; likes: ${item.likes ?? 'n/a'}; pipeline: ${item.pipeline_tag ?? 'n/a'}`,
        collectedAt: new Date().toISOString()
      }))
    },
    {
      source: 'GitHub / GLORIFIER',
      run: () => collectRss('github-glorifier', 'https://github.com/GLORIFIER7/glorifier-artificial-intelligence/commits/main.atom')
    },
    {
      source: 'Hacker News / AI',
      run: () => collectJsonApi('hacker-news-ai', 'https://hn.algolia.com/api/v1/search_by_date?query=AI&tags=story&hitsPerPage=10', (item, index) => ({
        id: `hn-${item.objectID || index}`,
        source: 'hacker-news-ai',
        title: item.title || item.story_title || 'Hacker News story',
        url: item.url || `https://news.ycombinator.com/item?id=${item.objectID}`,
        publishedAt: item.created_at,
        summary: item.story_text || '',
        collectedAt: new Date().toISOString()
      }))
    }
  ];

  const results = await Promise.allSettled(sources.map(s => s.run()));
  const evidence: IntelligenceEvidence[] = [];
  const sourceStatus: string[] = [];
  results.forEach((result, index) => {
    const name = sources[index].source;
    if (result.status === 'fulfilled') {
      evidence.push(...result.value);
      sourceStatus.push(`${name}: ${result.value.length} items`);
    } else {
      sourceStatus.push(`${name}: unavailable`);
    }
  });

  const cutoff = Date.now() - windowHours * 60 * 60 * 1000;
  const recent = evidence.filter(item => {
    if (!item.publishedAt) return true;
    const time = Date.parse(item.publishedAt);
    return Number.isNaN(time) || time >= cutoff;
  });

  const deduped = [...new Map(recent.map(item => [item.url, item])).values()];
  return { evidence: deduped.slice(0, 50), sourceStatus };
}

function parseJson<T>(text: string, fallback: T): T {
  try {
    const fenced = text.match(/\`\`\`(?:json)?\s*([\s\S]*?)\`\`\`/i)?.[1] || text;
    return JSON.parse(fenced.trim()) as T;
  } catch {
    return fallback;
  }
}

export async function generateIntelligenceReport(deps: {
  runModel: (provider: 'openai' | 'gemini', prompt: string, options?: { jsonMode?: boolean; systemInstruction?: string }) => Promise<{ text: string; model: string } | null>;
  windowHours?: number;
}): Promise<IntelligenceReport> {
  const windowHours = deps.windowHours ?? 24;
  const { evidence, sourceStatus } = await collectSources(windowHours);
  const evidencePacket = evidence.map(item => ({
    id: item.id,
    source: item.source,
    title: item.title,
    url: item.url,
    publishedAt: item.publishedAt,
    summary: item.summary
  }));

  const prompt = `Create a factual cross-model intelligence report from the evidence below.
Do not invent facts or imply that an item is true beyond its source. Preserve URLs and evidence IDs.
Return JSON with:
{
  "executiveSummary": string,
  "themes": [{"theme": string, "evidenceIds": string[], "summary": string}],
  "disagreements": string[]
}
Use "disagreements" only for materially different interpretations present in the evidence; otherwise use [].
Source collection status: ${sourceStatus.join('; ')}
Evidence:
${JSON.stringify(evidencePacket)}`;

  const [gpt, gemini] = await Promise.all([
    deps.runModel('openai', prompt, { jsonMode: true }),
    deps.runModel('gemini', prompt, { jsonMode: true })
  ]);

  const analyses: IntelligenceAnalysis[] = [
    gpt ? { provider: 'OpenAI', model: gpt.model, output: gpt.text, status: 'completed' } : { provider: 'OpenAI', model: 'unavailable', output: 'OpenAI key/model unavailable.', status: 'unavailable' },
    gemini ? { provider: 'Google Gemini', model: gemini.model, output: gemini.text, status: 'completed' } : { provider: 'Google Gemini', model: 'unavailable', output: 'Gemini key/model unavailable.', status: 'unavailable' }
  ];

  const parsed = analyses.filter(a => a.status === 'completed').map(a => parseJson<{ executiveSummary?: string; themes?: IntelligenceReport['themes']; disagreements?: string[] }>(a.output, {}));
  const first = parsed[0] || {};
  const second = parsed[1] || {};
  const mergedThemes = [...(first.themes || []), ...(second.themes || [])];
  const themes = [...new Map(mergedThemes.map(theme => [theme.theme.toLowerCase(), theme])).values()].slice(0, 12);
  const disagreements = [...new Set([...(first.disagreements || []), ...(second.disagreements || [])])].slice(0, 10);
  const executiveSummary = first.executiveSummary || second.executiveSummary || `Collected ${evidence.length} evidence items from ${new Set(evidence.map(e => e.source)).size} public sources. Cross-model synthesis was unavailable or returned no structured summary.`;

  const report: IntelligenceReport = {
    id: `intel-${Date.now()}`,
    generatedAt: new Date().toISOString(),
    windowHours,
    sourceCount: new Set(evidence.map(e => e.source)).size,
    evidenceCount: evidence.length,
    analyses,
    executiveSummary,
    themes,
    disagreements,
    evidence
  };

  latestReport = report;
  await ensureSchema();
  const db = getPool();
  if (db) {
    await db.query(
      'INSERT INTO intelligence_reports (id, generated_at, window_hours, source_count, evidence_count, executive_summary, themes, disagreements) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (id) DO NOTHING',
      [report.id, report.generatedAt, report.windowHours, report.sourceCount, report.evidenceCount, report.executiveSummary, JSON.stringify(report.themes), JSON.stringify(report.disagreements)]
    );
    for (const item of report.evidence) {
      await db.query(
        'INSERT INTO intelligence_evidence (id, report_id, source, title, url, published_at, summary, collected_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (id) DO NOTHING',
        [item.id, report.id, item.source, item.title, item.url, item.publishedAt || null, item.summary, item.collectedAt]
      );
    }
    for (const analysis of report.analyses) {
      await db.query(
        'INSERT INTO intelligence_analyses (report_id, provider, model, status, output) VALUES ($1,$2,$3,$4,$5)',
        [report.id, analysis.provider, analysis.model, analysis.status, analysis.output]
      );
    }
  }

  return report;
}

export async function getLatestIntelligenceReport() {
  if (latestReport) return latestReport;
  const db = getPool();
  if (!db) return null;
  await ensureSchema();
  const reportRow = await db.query('SELECT * FROM intelligence_reports ORDER BY generated_at DESC LIMIT 1');
  if (!reportRow.rows[0]) return null;
  const row = reportRow.rows[0];
  const evidenceRows = await db.query('SELECT id, source, title, url, published_at AS "publishedAt", summary, collected_at AS "collectedAt" FROM intelligence_evidence WHERE report_id=$1 ORDER BY published_at DESC NULLS LAST LIMIT 50', [row.id]);
  const analysesRows = await db.query('SELECT provider, model, status, output FROM intelligence_analyses WHERE report_id=$1 ORDER BY id', [row.id]);
  latestReport = {
    id: row.id,
    generatedAt: row.generated_at,
    windowHours: row.window_hours,
    sourceCount: row.source_count,
    evidenceCount: row.evidence_count,
    executiveSummary: row.executive_summary,
    themes: row.themes || [],
    disagreements: row.disagreements || [],
    evidence: evidenceRows.rows,
    analyses: analysesRows.rows
  };
  return latestReport;
}
