interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

interface McpToolExport {
  tools: McpToolDefinition[];
  callTool: (name: string, args: Record<string, unknown>) => Promise<unknown>;
  meter?: { credits: number };
  cost?: Record<string, unknown>;
  provider?: string;
}

/**
 * FAA Regulations MCP — US Federal Aviation Regulations (14 CFR, "FARs").
 *
 * The Federal Aviation Regulations ARE US federal regulations codified in
 * Title 14 of the CFR (Aeronautics and Space). Agents search "FAA regulation
 * on X", "FAR 91.113", "14 CFR part 107 drone rule" — never "eCFR title 14".
 * This is a thin, FAA-branded, keyless wrapper over the official eCFR API
 * (www.ecfr.gov/api), scoped to the whole of Title 14 (all of it is FAA /
 * aviation): part 91 general operating & flight rules, part 121 airline
 * operations, part 107 small unmanned aircraft (drones), part 61 airman
 * certification, part 135 commuter/on-demand, part 145 repair stations, etc.
 *
 * Tools:
 * - faa_regulation: full text of one Federal Aviation Regulation by citation
 * - faa_search:     keyword search across the Federal Aviation Regulations
 *
 * Self-contained: does NOT import the eCFR pack — calls the eCFR API directly.
 */


const BASE = 'https://www.ecfr.gov/api';
const UA = 'pipeworx/1.0 (+https://pipeworx.io)';
const TITLE = 14;
const CITE = '14 CFR';

// --- XML/entity helpers ------------------------------------------------------
function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');
}

function stripHtml(s: unknown): string {
  if (typeof s !== 'string') return '';
  return decodeEntities(s.replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim();
}

function xmlToText(xml: string): string {
  return decodeEntities(
    xml
      .replace(/<\?xml[^>]*\?>/g, '')
      .replace(/<HEAD>[\s\S]*?<\/HEAD>/g, '')
      .replace(/<\/(P|FP|HEAD|DIV\d+)>/g, '\n')
      .replace(/<[^>]+>/g, ''),
  )
    .split('\n')
    .map((l) => l.replace(/[ \t]+/g, ' ').trim())
    .filter(Boolean)
    .join('\n')
    .trim();
}

// --- eCFR fetch with per-attempt timeout + 503 retry -------------------------
async function ecfrOnce(path: string, accept: string, timeoutMs: number): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(`${BASE}${path}`, {
      headers: { Accept: accept, 'User-Agent': UA },
      signal: ctrl.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

async function ecfrFetch(path: string, accept: string, retries = 3): Promise<Response> {
  let res: Response | null = null;
  for (let i = 0; i < retries; i++) {
    try {
      res = await ecfrOnce(path, accept, 12000);
      if (res.status !== 503) return res;
    } catch {
      res = null; // aborted (timeout) or network error — retry
    }
    if (i < retries - 1) await new Promise((r) => setTimeout(r, 600 * (i + 1)));
  }
  if (res) return res;
  throw new Error('eCFR temporarily unavailable (the eCFR text endpoint is timing out — retry in a few seconds).');
}

async function ecfrGet(path: string): Promise<Record<string, unknown>> {
  const res = await ecfrFetch(path, 'application/json');
  if (!res.ok) throw new Error(`eCFR: ${res.status} ${(await res.text()).slice(0, 200)}`);
  return (await res.json()) as Record<string, unknown>;
}

// Current currency date for this title, with a 7-day-ago fallback.
async function currentDate(): Promise<string> {
  try {
    const data = await ecfrGet('/versioner/v1/titles.json');
    const titles = Array.isArray(data.titles) ? (data.titles as Array<Record<string, unknown>>) : [];
    const t = titles.find((x) => Number(x.number) === TITLE);
    if (t && typeof t.up_to_date_as_of === 'string' && t.up_to_date_as_of) return t.up_to_date_as_of;
  } catch {
    /* fall through to date fallback */
  }
  return new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
}

// --- citation parsing --------------------------------------------------------
// Forgiving: "91.113", "14 CFR 91.113", "FAR 91.113", "§91.113", "91.113(b)",
// "part 91", "107". Returns the section (part.section) or a bare part.
function parseCitation(raw: string): { section: string | null; part: string | null } {
  let s = raw.trim();
  s = s.replace(/§+/g, ' ');
  // strip agency/citation noise words (FAR = Federal Aviation Regulations)
  s = s.replace(/\b(14\s*cfr|far|cfr|part|sections?|sec\.?)\b/gi, ' ');
  s = s.replace(/\s+/g, ' ').trim();
  const secMatch = s.match(/(\d{1,4})\.(\d+[A-Za-z]*)/);
  if (secMatch) return { section: `${secMatch[1]}.${secMatch[2]}`, part: secMatch[1] };
  const partMatch = s.match(/\b(\d{1,4})\b/);
  if (partMatch) return { section: null, part: partMatch[1] };
  return { section: null, part: null };
}

// Best-effort subpart lookup for a section, via the eCFR search hierarchy.
async function lookupSubpart(section: string): Promise<string | null> {
  try {
    const params = new URLSearchParams({ query: section, per_page: '5', order: 'relevance' });
    params.append('hierarchy[title]', String(TITLE));
    const data = await ecfrGet(`/search/v1/results?${params.toString()}`);
    const results = Array.isArray(data.results) ? (data.results as Array<Record<string, unknown>>) : [];
    for (const r of results) {
      const h = (r.hierarchy as Record<string, unknown> | undefined) ?? {};
      if (h.section != null && String(h.section) === section && h.subpart != null) {
        return String(h.subpart);
      }
    }
  } catch {
    /* ignore — subpart is optional metadata */
  }
  return null;
}

// --- tools -------------------------------------------------------------------
const tools: McpToolExport['tools'] = [
  {
    name: 'faa_regulation',
    description:
      'Get the full text of one Federal Aviation Regulation (FAR) — a US FAA / aviation regulation codified in 14 CFR — by its citation. Returns the exact regulatory wording currently in force. Answers "what does FAR 91.113 say", "what is the FAA regulation for X", "does the FAA require X", "read 14 CFR 107.29", "the FAA right-of-way rule". Forgiving citation input: "91.113", "14 CFR 91.113", "FAR 91.113", "§91.113", even "91.113(b)" (paragraph stripped to the section). Covers 14 CFR part 91 general operating & flight rules, part 121 airline/scheduled operations, part 135 commuter & on-demand, part 107 small unmanned aircraft (drone) rules, part 61 pilot/airman certification, part 43 maintenance, part 145 repair stations, part 25 aircraft airworthiness — the whole of Title 14 (aviation, aircraft, airspace, pilots). Pass a whole part (e.g. "91" or "107") to get that part\'s section list. Example: faa_regulation({ citation: "91.113" }) -> right-of-way rules; faa_regulation({ citation: "FAR 107.29" }) -> drone operation at night. Keyless.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        citation: {
          type: 'string',
          description:
            'FAR citation. A section: "91.113", "14 CFR 91.113", "FAR 107.29", "§61.113", "91.113(b)". Or a whole part: "91", "part 107" -> returns the part\'s section list.',
        },
      },
      required: ['citation'],
    },
  },
  {
    name: 'faa_search',
    description:
      'Keyword search across the Federal Aviation Regulations — US FAA / aviation rules in 14 CFR. Answers "what FAA regulations cover X", "the aviation rule / FAR about X", "find the FAA regulation for X". Great for topics: right-of-way, VFR/IFR flight rules, minimum safe altitudes, drone / small unmanned aircraft operations, remote pilot certification, airline operating requirements, pilot certification and medical, aircraft airworthiness, maintenance and repair stations, airspace, TFRs. Returns matching Federal Aviation Regulations with citation (14 CFR / FAR), heading, excerpt, and source URL. Note: the CFR text uses "unmanned aircraft", not "drone" — search "unmanned aircraft night" for drone-at-night rules. Example: faa_search({ query: "unmanned aircraft night" }); faa_search({ query: "right-of-way rules", limit: 15 }). Keyless.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        query: {
          type: 'string',
          description:
            'Aviation-regulation topic or phrase, e.g. "right-of-way rules", "unmanned aircraft night", "minimum safe altitudes", "remote pilot certificate", "airline operating requirements".',
        },
        limit: { type: 'number', description: 'Max results to return, 1-20 (default 10).' },
      },
      required: ['query'],
    },
  },
];

async function callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  try {
    switch (name) {
      case 'faa_regulation':
        return getRegulation(args);
      case 'faa_search':
        return searchRegulations(args);
      default:
        return { error: `Unknown tool: ${name}` };
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

async function getRegulation(args: Record<string, unknown>): Promise<unknown> {
  const raw = typeof args.citation === 'string' ? args.citation : '';
  if (!raw.trim()) return { error: 'provide a citation, e.g. "91.113" or "FAR 107.29"' };

  const { section, part } = parseCitation(raw);
  if (!part) {
    return {
      error: `Could not parse an FAA citation from "${raw}". Use a section like "91.113" or "FAR 107.29", or a part like "107".`,
    };
  }

  const date = await currentDate();

  // ---- whole part requested: return its section list -----------------------
  if (!section) {
    const res = await ecfrFetch(
      `/versioner/v1/full/${date}/title-${TITLE}.xml?part=${encodeURIComponent(part)}`,
      'application/xml',
    );
    if (res.status === 404) return { error: `${CITE} part ${part} not found as of ${date}.`, part, date };
    if (res.status === 503) return { error: 'eCFR temporarily unavailable — retry in a few seconds.', part };
    if (!res.ok) throw new Error(`eCFR: ${res.status} ${(await res.text()).slice(0, 200)}`);
    const xml = await res.text();
    const blocks = xml.split(/<DIV8\b/).slice(1);
    const sections = blocks
      .map((b) => {
        const n = b.match(/\bN="([^"]+)"/)?.[1] ?? null;
        const head = b.match(/<HEAD>([\s\S]*?)<\/HEAD>/);
        return { section: n, heading: head ? stripHtml(head[1]) : null };
      })
      .filter((s) => s.section);
    return {
      part,
      citation: `${CITE} Part ${part}`,
      date,
      source: 'eCFR / FAA 14 CFR (Federal Aviation Regulations)',
      source_url: `https://www.ecfr.gov/current/title-${TITLE}/part-${part}`,
      section_count: sections.length,
      note: `This is a whole FAR part (${sections.length} sections). Call faa_regulation with a specific citation (e.g. "${sections[0]?.section ?? part + '.1'}") to get full text.`,
      sections,
    };
  }

  // ---- single section ------------------------------------------------------
  const res = await ecfrFetch(
    `/versioner/v1/full/${date}/title-${TITLE}.xml?part=${encodeURIComponent(part)}&section=${encodeURIComponent(section)}`,
    'application/xml',
  );
  if (res.status === 404 || res.status === 400) {
    return {
      error: `Federal Aviation Regulation ${CITE} ${section} not found as of ${date}. Check the citation, or use faa_search to find it.`,
      citation: `${CITE} ${section}`,
      part,
      date,
    };
  }
  if (res.status === 503) return { error: 'eCFR temporarily unavailable — retry in a few seconds.', citation: `${CITE} ${section}` };
  if (!res.ok) throw new Error(`eCFR: ${res.status} ${(await res.text()).slice(0, 200)}`);
  const body = await res.text();
  // eCFR returns JSON {"error":"No matching content found."} for removed/absent sections
  if (body.trim().startsWith('{')) {
    return {
      error: `Federal Aviation Regulation ${CITE} ${section} not found as of ${date}. Check the citation, or use faa_search to find it.`,
      citation: `${CITE} ${section}`,
      part,
      date,
    };
  }
  const xml = body;

  const headMatch = xml.match(/<HEAD>([\s\S]*?)<\/HEAD>/);
  const heading = headMatch ? stripHtml(headMatch[1]) : null;
  const full = xmlToText(xml);
  const CAP = 30000;
  const truncated = full.length > CAP;
  const subpart = await lookupSubpart(section);

  return {
    citation: `${CITE} ${section}`,
    part,
    subpart: subpart ?? null,
    heading,
    text: truncated ? full.slice(0, CAP) : full,
    truncated,
    date,
    source: 'eCFR / FAA 14 CFR (Federal Aviation Regulations)',
    source_url: `https://www.ecfr.gov/current/title-${TITLE}/section-${section}`,
  };
}

async function searchRegulations(args: Record<string, unknown>): Promise<unknown> {
  const query = typeof args.query === 'string' ? args.query.trim() : '';
  if (!query) return { error: 'provide a query, e.g. "right-of-way rules" or "unmanned aircraft night"' };

  const limit = Math.min(Math.max(Number(args.limit) || 10, 1), 20);

  // eCFR search returns one row per matching PARAGRAPH, so a single dense
  // section can fill an entire page. Dedupe by citation and walk up to 3 pages
  // (20/page, the API max) until `limit` distinct sections are collected.
  const seen = new Set<string>();
  const results: Array<Record<string, unknown>> = [];
  let total: unknown = null;

  for (let page = 1; page <= 3 && results.length < limit; page++) {
    const params = new URLSearchParams({
      query,
      per_page: '20',
      page: String(page),
      order: 'relevance',
    });
    params.append('hierarchy[title]', String(TITLE));

    const data = await ecfrGet(`/search/v1/results?${params.toString()}`);
    const meta = (data.meta as Record<string, unknown> | undefined) ?? {};
    if (total == null) total = meta.total_count ?? null;
    const rawResults = Array.isArray(data.results) ? (data.results as Array<Record<string, unknown>>) : [];
    if (rawResults.length === 0) break;

    for (const r of rawResults) {
      if (results.length >= limit) break;
      const h = (r.hierarchy as Record<string, unknown> | undefined) ?? {};
      const headings = (r.headings as Record<string, unknown> | undefined) ?? {};
      const hHeadings = (r.hierarchy_headings as Record<string, unknown> | undefined) ?? {};
      const part = h.part != null ? String(h.part) : null;
      const section = h.section != null ? String(h.section) : null;
      const subpart = h.subpart != null ? String(h.subpart) : null;
      if (!section && !part) continue;
      const heading =
        (typeof headings.section === 'string' && stripHtml(headings.section)) ||
        (typeof hHeadings.section === 'string' && stripHtml(hHeadings.section)) ||
        null;
      let citation: string;
      let source_url: string;
      if (section) {
        citation = `${CITE} ${section}`;
        source_url = `https://www.ecfr.gov/current/title-${TITLE}/section-${section}`;
      } else {
        citation = `${CITE} Part ${part}`;
        source_url = `https://www.ecfr.gov/current/title-${TITLE}/part-${part}`;
      }
      if (seen.has(citation)) continue;
      seen.add(citation);
      results.push({
        part,
        subpart,
        section,
        citation,
        heading,
        excerpt: stripHtml(r.full_text_excerpt ?? (r as Record<string, unknown>).excerpt).slice(0, 300),
        source_url,
      });
    }
    if (rawResults.length < 20) break;
  }

  return {
    query,
    total_matches: total,
    count: results.length,
    scope: 'FCC regulations — 47 CFR (Federal Communications Commission / telecommunications)',
    source: 'eCFR / FCC 47 CFR',
    results,
  };
}

export default { tools, callTool, meter: { credits: 1 } } satisfies McpToolExport;
