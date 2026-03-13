import Anthropic from '@anthropic-ai/sdk';
import { NextRequest, NextResponse } from 'next/server';

const TOOL_NAME = 'pubmed-ai-search';
const TOOL_EMAIL = 'research@example.com';

const PUBMED_TYPE_MAP: Record<string, string> = {
  'Clinical Trial': 'Clinical Trial',
  'Review': 'Review',
  'Meta-Analysis': 'Meta-Analysis',
  'Systematic Review': 'Systematic Review',
  'RCT': 'Randomized Controlled Trial',
  'Case Reports': 'Case Reports',
  'Observational': 'Observational Study',
  'Editorial': 'Editorial',
};

// ---------------------------------------------------------------------------
// Static JCR impact factor dictionary (journal name → IF)
// ---------------------------------------------------------------------------
const JOURNAL_IF: Record<string, number> = {
  "the new england journal of medicine": 96.2,
  "lancet (london, england)": 98.4,
  "the lancet": 98.4,
  "jama": 63.1,
  "bmj (clinical research ed.)": 93.6,
  "nature medicine": 82.9,
  "nature": 50.5,
  "science (new york, n.y.)": 44.7,
  "cell": 45.5,
  "nature reviews. drug discovery": 120.1,
  "nature reviews. cancer": 72.0,
  "nature reviews. immunology": 67.7,
  "nature biotechnology": 33.1,
  "nature genetics": 31.7,
  "nature methods": 36.1,
  "nature communications": 14.7,
  "proceedings of the national academy of sciences of the united states of america": 9.4,
  "the lancet. oncology": 51.1,
  "the lancet. infectious diseases": 36.4,
  "the lancet. neurology": 48.0,
  "the lancet. respiratory medicine": 38.6,
  "the lancet. diabetes & endocrinology": 44.9,
  "the lancet. psychiatry": 30.8,
  "the lancet. digital health": 30.8,
  "the lancet. gastroenterology & hepatology": 35.7,
  "the lancet. haematology": 24.7,
  "the lancet. hiv": 14.1,
  "the lancet. microbe": 20.9,
  "the lancet. rheumatology": 15.6,
  "the lancet. planetary health": 24.1,
  "the lancet. public health": 25.3,
  "the lancet. child & adolescent health": 19.9,
  "the lancet. healthy longevity": 13.5,
  "the lancet regional health. europe": 15.3,
  "jama internal medicine": 22.5,
  "jama oncology": 22.5,
  "jama neurology": 20.4,
  "jama cardiology": 14.8,
  "jama pediatrics": 14.5,
  "jama surgery": 11.6,
  "jama psychiatry": 14.7,
  "jama ophthalmology": 8.1,
  "jama dermatology": 9.5,
  "jama otolaryngology-- head & neck surgery": 6.0,
  "jama network open": 10.5,
  "jama health forum": 9.5,
  "circulation": 35.5,
  "european heart journal": 37.6,
  "journal of the american college of cardiology": 21.7,
  "circulation research": 20.1,
  "european journal of heart failure": 16.9,
  "jacc. heart failure": 13.3,
  "heart rhythm": 5.5,
  "heart (british cardiac society)": 6.1,
  "cardiovascular research": 10.2,
  "journal of the american heart association": 6.1,
  "atherosclerosis": 5.3,
  "international journal of cardiology": 4.0,
  "american heart journal": 4.5,
  "journal of cardiac surgery": 1.6,
  "journal of clinical oncology": 45.3,
  "annals of oncology": 32.0,
  "cancer discovery": 29.7,
  "cancer cell": 50.3,
  "clinical cancer research": 11.5,
  "journal of thoracic oncology": 20.4,
  "european journal of cancer": 8.4,
  "british journal of cancer": 8.8,
  "cancer research": 12.7,
  "molecular cancer": 27.7,
  "oncogene": 8.0,
  "international journal of cancer": 7.3,
  "neuro-oncology": 15.9,
  "gynecologic oncology": 5.0,
  "lung cancer (amsterdam, netherlands)": 5.3,
  "breast cancer research and treatment": 4.4,
  "cancers": 5.2,
  "cancer": 6.2,
  "gastroenterology": 29.4,
  "gut": 24.5,
  "hepatology (baltimore, md.)": 17.3,
  "journal of hepatology": 25.7,
  "american journal of gastroenterology": 14.4,
  "alimentary pharmacology & therapeutics": 7.6,
  "gastrointestinal endoscopy": 7.7,
  "endoscopy": 9.3,
  "journal of crohn's & colitis": 8.3,
  "inflammatory bowel diseases": 6.1,
  "clinical gastroenterology and hepatology": 12.6,
  "liver international": 6.7,
  "world journal of gastroenterology": 4.3,
  "american journal of respiratory and critical care medicine": 24.7,
  "chest": 9.6,
  "the european respiratory journal": 16.6,
  "thorax": 10.0,
  "intensive care medicine": 27.1,
  "critical care medicine": 9.3,
  "critical care (london, england)": 8.8,
  "respiratory research": 4.1,
  "annals of intensive care": 5.6,
  "clinical infectious diseases": 11.8,
  "the journal of infectious diseases": 6.4,
  "emerging infectious diseases": 7.2,
  "clinical microbiology reviews": 20.5,
  "journal of antimicrobial chemotherapy": 5.4,
  "antimicrobial agents and chemotherapy": 4.9,
  "infection control and hospital epidemiology": 4.2,
  "bmc infectious diseases": 3.7,
  "neuron": 16.2,
  "nature neuroscience": 25.0,
  "brain : a journal of neurology": 14.5,
  "annals of neurology": 11.2,
  "neurology": 9.9,
  "stroke": 8.3,
  "movement disorders": 9.3,
  "epilepsia": 6.6,
  "journal of neurology, neurosurgery, and psychiatry": 11.1,
  "journal of neurology": 6.0,
  "journal of alzheimer's disease": 3.4,
  "multiple sclerosis (houndmills, basingstoke, england)": 6.3,
  "cephalalgia": 6.0,
  "molecular psychiatry": 11.0,
  "the american journal of psychiatry": 18.1,
  "biological psychiatry": 10.6,
  "world psychiatry": 73.3,
  "psychological medicine": 6.9,
  "journal of affective disorders": 6.6,
  "schizophrenia bulletin": 6.6,
  "depression and anxiety": 5.5,
  "journal of psychiatric research": 4.8,
  "journal of the american society of nephrology": 10.3,
  "kidney international": 14.8,
  "american journal of kidney diseases": 12.1,
  "nephrology, dialysis, transplantation": 6.1,
  "clinical journal of the american society of nephrology": 9.4,
  "clinical kidney journal": 3.9,
  "diabetes care": 16.2,
  "diabetologia": 8.4,
  "diabetes": 7.7,
  "the journal of clinical endocrinology and metabolism": 5.8,
  "thyroid": 5.4,
  "european journal of endocrinology": 5.8,
  "annals of the rheumatic diseases": 27.4,
  "arthritis & rheumatology (hoboken, n.j.)": 13.3,
  "rheumatology (oxford, england)": 5.5,
  "immunity": 32.4,
  "the journal of allergy and clinical immunology": 14.2,
  "nature immunology": 30.5,
  "journal of experimental medicine": 15.3,
  "journal of immunology (baltimore, md. : 1950)": 4.4,
  "frontiers in immunology": 7.3,
  "allergy": 12.6,
  "clinical and experimental allergy": 6.3,
  "blood": 21.0,
  "journal of clinical investigation": 15.9,
  "leukemia": 12.8,
  "haematologica": 10.1,
  "blood advances": 7.5,
  "thrombosis and haemostasis": 5.0,
  "annals of surgery": 10.1,
  "british journal of surgery": 8.6,
  "surgery": 3.6,
  "annals of surgical oncology": 6.4,
  "the journal of thoracic and cardiovascular surgery": 5.1,
  "european journal of surgical oncology": 3.8,
  "world journal of surgery": 2.5,
  "american journal of surgery": 3.0,
  "journal of gastrointestinal surgery": 2.6,
  "journal of vascular surgery": 4.3,
  "surgical endoscopy": 3.8,
  "anesthesiology": 9.1,
  "british journal of anaesthesia": 9.8,
  "anaesthesia": 7.5,
  "regional anesthesia and pain medicine": 7.0,
  "anesthesia and analgesia": 5.7,
  "pain": 7.9,
  "european journal of pain (london, england)": 3.8,
  "journal of pain": 5.5,
  "european journal of anaesthesiology": 5.6,
  "american journal of obstetrics and gynecology": 9.8,
  "bjog : an international journal of obstetrics and gynaecology": 7.2,
  "obstetrics and gynecology": 7.2,
  "human reproduction (oxford, england)": 6.1,
  "fertility and sterility": 6.7,
  "human reproduction update": 14.8,
  "pediatrics": 8.0,
  "the journal of pediatrics": 4.4,
  "archives of disease in childhood": 4.7,
  "pediatric research": 3.6,
  "journal of the american academy of dermatology": 11.5,
  "british journal of dermatology": 11.0,
  "journal of investigative dermatology": 7.5,
  "dermatology (basel, switzerland)": 3.5,
  "ophthalmology": 13.7,
  "american journal of ophthalmology": 4.4,
  "british journal of ophthalmology": 4.7,
  "investigative ophthalmology & visual science": 5.0,
  "radiology": 12.1,
  "european radiology": 5.9,
  "journal of nuclear medicine": 9.3,
  "neuroimage": 5.7,
  "magnetic resonance in medicine": 3.3,
  "american journal of neuroradiology": 3.5,
  "the american journal of sports medicine": 6.2,
  "british journal of sports medicine": 18.4,
  "the journal of bone and joint surgery. american volume": 6.0,
  "arthroscopy": 5.2,
  "osteoarthritis and cartilage": 7.2,
  "bone": 4.1,
  "british journal of pharmacology": 9.3,
  "clinical pharmacology and therapeutics": 7.4,
  "european journal of pharmacology": 4.2,
  "pharmacological reviews": 21.1,
  "drug resistance updates": 24.3,
  "pharmacology & therapeutics": 12.3,
  "the journal of pathology": 7.6,
  "modern pathology": 7.1,
  "laboratory investigation": 5.6,
  "american journal of clinical pathology": 4.4,
  "annals of emergency medicine": 6.2,
  "academic emergency medicine": 4.2,
  "resuscitation": 6.5,
  "the journal of emergency medicine": 2.0,
  "american journal of human genetics": 9.8,
  "genome biology": 12.3,
  "genome research": 7.0,
  "human molecular genetics": 5.1,
  "european journal of human genetics": 4.2,
  "plos medicine": 15.8,
  "international journal of epidemiology": 7.7,
  "american journal of epidemiology": 5.3,
  "european journal of epidemiology": 9.9,
  "environmental health perspectives": 10.1,
  "plos one": 3.7,
  "scientific reports": 4.6,
  "bmc medicine": 9.3,
  "bmj open": 2.9,
  "medicine": 1.6,
  "elife": 7.7,
  "the cochrane database of systematic reviews": 8.4,
  "nature microbiology": 20.5,
  "mbio": 6.4,
  "microbiome": 15.5,
  "gut microbes": 12.2,
  "journal of clinical microbiology": 6.8,
  "american journal of transplantation": 8.9,
  "transplantation": 5.3,
  "age and ageing": 6.0,
  "the journals of gerontology. series a, biological sciences and medical sciences": 5.1,
  "european urology": 25.3,
  "the journal of urology": 7.4,
  "bju international": 4.5,
  "the laryngoscope": 2.8,
  "head & neck": 2.7,
  "nutrients": 5.9,
  "the american journal of clinical nutrition": 7.0,
  "clinical nutrition (edinburgh, scotland)": 7.3,
  "european journal of nutrition": 4.4,
  "molecular cell": 14.5,
  "cell metabolism": 29.0,
  "cell reports": 8.8,
  "cell host & microbe": 20.6,
  "cell stem cell": 19.8,
  "nucleic acids research": 14.9,
  "journal of biological chemistry": 4.8,
  "embo journal": 11.4,
  "embo molecular medicine": 12.1,
  "nature biomedical engineering": 28.1,
  "biomaterials": 14.0,
  "acta biomaterialia": 9.7,
  "environment international": 11.8,
  "archives of toxicology": 6.0,
  "international journal of molecular sciences": 5.6,
  "molecules (basel, switzerland)": 4.6,
  "cells": 6.0,
  "journal of clinical medicine": 3.9,
  "frontiers in medicine": 3.9,
  "frontiers in pharmacology": 5.6,
  "frontiers in oncology": 4.7,
  "frontiers in microbiology": 5.2,
  "frontiers in neurology": 3.4,
  "frontiers in endocrinology": 5.2,
  "frontiers in cardiovascular medicine": 3.6,
  "frontiers in cell and developmental biology": 5.5,
  "frontiers in genetics": 3.7,
  "frontiers in psychiatry": 4.7,
  "frontiers in public health": 5.2,
  "frontiers in surgery": 2.6,
  "frontiers in pediatrics": 3.2,
  "cureus": 1.2,
};

// In-memory cache for Claude-looked-up journals (persists for the process lifetime)
const ifCache: Record<string, number | null> = {};

function lookupStaticIF(journalName: string): number | null {
  const key = journalName.toLowerCase().trim();
  // Exact match
  if (JOURNAL_IF[key] !== undefined) return JOURNAL_IF[key];
  // Normalised match (remove trailing punctuation/articles)
  const norm = key.replace(/[.,;:]+$/, '').trim();
  if (JOURNAL_IF[norm] !== undefined) return JOURNAL_IF[norm];
  return null;
}

async function lookupIFsViaClaude(journalNames: string[]): Promise<Record<string, number | null>> {
  if (journalNames.length === 0) return {};
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const list = journalNames.map((n, i) => `${i + 1}. ${n}`).join('\n');
  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 600,
    temperature: 0,
    messages: [{
      role: 'user',
      content: `Return the Journal Citation Reports (JCR) Impact Factor for each journal below.
Respond ONLY with a JSON object mapping each journal name exactly as given to its IF as a number, or null if unknown.
Example: {"Journal of X": 4.2, "Unknown Journal": null}

Journals:
${list}`,
    }],
  });
  const block = response.content[0];
  if (block.type !== 'text') return {};
  try {
    const json = block.text.match(/\{[\s\S]*\}/)?.[0] ?? '{}';
    return JSON.parse(json) as Record<string, number | null>;
  } catch {
    return {};
  }
}

async function getImpactFactors(
  articles: Record<string, unknown>[]
): Promise<Record<string, number | null>> {
  // Collect unique journal names
  const journalNames = [...new Set(
    articles
      .map(a => a['fulljournalname'])
      .filter((n): n is string => typeof n === 'string' && n.trim().length > 0)
  )];

  const result: Record<string, number | null> = {};
  const needsClaude: string[] = [];

  for (const name of journalNames) {
    const staticVal = lookupStaticIF(name);
    if (staticVal !== null) {
      result[name] = staticVal;
    } else if (ifCache[name] !== undefined) {
      result[name] = ifCache[name];
    } else {
      needsClaude.push(name);
    }
  }

  if (needsClaude.length > 0) {
    const claudeResult = await lookupIFsViaClaude(needsClaude);
    for (const name of needsClaude) {
      const val = claudeResult[name] ?? null;
      ifCache[name] = val;
      result[name] = val;
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Claude: convert natural language → PubMed query (cached)
// ---------------------------------------------------------------------------
const nlQueryCache = new Map<string, string>();

async function nlToPubmedQuery(nlQuery: string): Promise<string> {
  const key = nlQuery.trim().toLowerCase();
  if (nlQueryCache.has(key)) return nlQueryCache.get(key)!;

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 400,
    temperature: 0,
    messages: [
      {
        role: 'user',
        content: `Convert this natural language research question into an optimized PubMed search query.
Use Boolean operators (AND, OR, NOT) where appropriate.
Return ONLY the raw search string — no explanation, no quotes around the whole thing.

IMPORTANT RULES:
1. Restrict all searches to title and abstract using [tiab] on every term.
2. Identify the key CONCEPTS in the question and build a clause for each concept using AND between concepts.
3. Within each concept, group synonyms/variants with OR.
4. For compound adjective+noun concepts (e.g. "preoperative MI", "postoperative stroke"), do NOT use exact phrase matching — those phrases rarely appear verbatim in titles/abstracts. Instead, keep the medical noun as an exact phrase [tiab] and use the modifier as a separate [tiab] term connected by AND. Example: (preoperative[tiab] AND ("myocardial infarction"[tiab] OR MI[tiab])). Exact [tiab] phrases are fine for established multi-word terms like "heart failure", "myocardial infarction", "blood pressure", "atrial fibrillation".
5. For author searches use LastName Initials[AU] — no [tiab] on author terms.
6. Do NOT use bare untagged terms or MeSH terms.

IMPORTANT: Always include synonyms for timing/context modifiers. For example:
- "preoperative" → preoperative[tiab] OR "prior to surgery"[tiab] OR "before surgery"[tiab] OR prior[tiab]
- "postoperative" → postoperative[tiab] OR "after surgery"[tiab] OR perioperative[tiab]
- "noncardiac surgery" → "noncardiac surgery"[tiab] OR "non-cardiac surgery"[tiab]

Examples:
- "preoperative MI and postoperative MI" →
  ("myocardial infarction"[tiab] OR "MI"[tiab] OR NSTEMI[tiab] OR STEMI[tiab]) AND (preoperative[tiab] OR prior[tiab] OR "before surgery"[tiab] OR postoperative[tiab] OR perioperative[tiab] OR "after surgery"[tiab])
- "postoperative stroke after cardiac surgery" →
  (postoperative[tiab] OR perioperative[tiab] OR "after surgery"[tiab]) AND (stroke[tiab] OR "cerebrovascular accident"[tiab]) AND ("cardiac surgery"[tiab] OR "heart surgery"[tiab] OR CABG[tiab])
- "articles by L Glance" → Glance L[AU]
- "heart failure mortality in elderly" →
  ("heart failure"[tiab]) AND (mortality[tiab] OR death[tiab]) AND (elderly[tiab] OR aged[tiab] OR "older adults"[tiab])

Question: ${nlQuery}`,
      },
    ],
  });

  const block = response.content[0];
  if (block.type !== 'text') throw new Error('Unexpected Claude response');
  const result = block.text.trim();
  nlQueryCache.set(key, result);
  return result;
}

// ---------------------------------------------------------------------------
// PubMed: search → PMIDs
// ---------------------------------------------------------------------------
const PAGE_SIZE = 25;

async function esearch(
  query: string,
  sort = 'relevance',
  retstart = 0,
  retmax = PAGE_SIZE,
): Promise<{ pmids: string[]; total: number }> {
  const params = new URLSearchParams({
    db: 'pubmed',
    term: query,
    retmax: String(retmax),
    retstart: String(retstart),
    retmode: 'json',
    sort,
    tool: TOOL_NAME,
    email: TOOL_EMAIL,
  });

  const res = await fetch(
    `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?${params}`
  );
  if (!res.ok) throw new Error('PubMed esearch failed');
  const data = await res.json();
  return {
    pmids: (data.esearchresult?.idlist as string[]) ?? [],
    total: parseInt(data.esearchresult?.count ?? '0', 10),
  };
}

// ---------------------------------------------------------------------------
// PubMed: PMIDs → article summaries
// ---------------------------------------------------------------------------
async function esummaryBatch(pmids: string[]): Promise<Record<string, unknown>[]> {
  const params = new URLSearchParams({
    db: 'pubmed',
    id: pmids.join(','),
    retmode: 'json',
    tool: TOOL_NAME,
    email: TOOL_EMAIL,
  });
  const res = await fetch(
    `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?${params}`
  );
  if (!res.ok) throw new Error('PubMed esummary failed');
  const data = await res.json();
  return pmids.map(id => data.result?.[id] as Record<string, unknown>).filter(Boolean);
}

async function esummary(pmids: string[]): Promise<Record<string, unknown>[]> {
  if (pmids.length === 0) return [];
  const BATCH = 200;
  const results: Record<string, unknown>[] = [];
  for (let i = 0; i < pmids.length; i += BATCH) {
    const batch = pmids.slice(i, i + BATCH);
    const batchResults = await esummaryBatch(batch);
    results.push(...batchResults);
  }
  return results;
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { query, translatedQuery, filters, page = 0, returnAll = false } = body as {
      query: string;
      translatedQuery?: string;
      page?: number;
      returnAll?: boolean;
      filters: {
        yearFrom?: string;
        yearTo?: string;
        articleTypes?: string[];
        minImpactFactor?: number;
        journalSearch?: string;
        sortBy?: 'relevance' | 'year' | 'if';
      };
    };

    if (!query?.trim()) {
      return NextResponse.json({ error: 'Query is required' }, { status: 400 });
    }

    // 1. Convert NL → PubMed query (skip if already translated)
    let pubmedQuery = translatedQuery?.trim() || await nlToPubmedQuery(query);

    // 2. Date filter
    const y1 = filters.yearFrom?.trim();
    const y2 = filters.yearTo?.trim();
    if (y1 && y2) pubmedQuery += ` AND ${y1}:${y2}[dp]`;
    else if (y1) pubmedQuery += ` AND ${y1}:3000[dp]`;
    else if (y2) pubmedQuery += ` AND 1900:${y2}[dp]`;

    // 3. Article type filter
    if (filters.articleTypes && filters.articleTypes.length > 0) {
      const ptClauses = filters.articleTypes
        .map(t => `"${PUBMED_TYPE_MAP[t] ?? t}"[pt]`)
        .join(' OR ');
      pubmedQuery += ` AND (${ptClauses})`;
    }

    // 4. Journal filter
    if (filters.journalSearch?.trim()) {
      pubmedQuery += ` AND "${filters.journalSearch.trim()}"[journal]`;
    }

    // 5. Search PubMed
    const usingIfFilter = filters.minImpactFactor != null;
    const needsFullFetch = usingIfFilter || filters.sortBy === 'if' || returnAll;
    let fetchTotal = 0;
    let articles: Record<string, unknown>[] = [];

    if (needsFullFetch) {
      // Fetch ALL PMIDs (up to 10k) so IF filter/sort applies across all results
      const { pmids: allPmids, total } = await esearch(pubmedQuery, 'relevance', 0, 10000);
      fetchTotal = total;
      articles = await esummary(allPmids);
    } else {
      const pubmedSort = filters.sortBy === 'year' ? 'pub_date' : 'relevance';
      const { pmids, total } = await esearch(pubmedQuery, pubmedSort, page * PAGE_SIZE);
      fetchTotal = total;
      articles = await esummary(pmids);
    }

    // 6. Impact factor enrichment
    const ifMap = await getImpactFactors(articles);
    articles = articles.map(article => {
      const name = article['fulljournalname'];
      const impactFactor = typeof name === 'string' ? (ifMap[name] ?? null) : null;
      return { ...article, impactFactor };
    });

    // 7. Apply IF filter across all results
    if (usingIfFilter) {
      articles = articles.filter(
        a =>
          typeof a.impactFactor === 'number' &&
          (a.impactFactor as number) >= (filters.minImpactFactor as number)
      );
    }

    // 8. Sort (only when we have the full set)
    if (needsFullFetch) {
      if (filters.sortBy === 'if') {
        articles.sort((a, b) => {
          const ia = typeof a.impactFactor === 'number' ? (a.impactFactor as number) : -1;
          const ib = typeof b.impactFactor === 'number' ? (b.impactFactor as number) : -1;
          return ib - ia;
        });
      } else if (filters.sortBy === 'year') {
        articles.sort((a, b) => {
          const da = String(a['sortpubdate'] ?? a['pubdate'] ?? '');
          const db = String(b['sortpubdate'] ?? b['pubdate'] ?? '');
          return db.localeCompare(da);
        });
      }
      // 'relevance': keep original esearch order
    }

    // 9. Return: full set when needsFullFetch (client paginates locally), else single page
    if (needsFullFetch) {
      return NextResponse.json({
        articles,           // all filtered+sorted articles
        pubmedQuery,
        total: articles.length,
        pageSize: PAGE_SIZE,
        clientPaginate: true,  // tells frontend to paginate locally
      });
    }

    return NextResponse.json({ articles, pubmedQuery, total: fetchTotal, page, pageSize: PAGE_SIZE, filteredCount: articles.length });
  } catch (err) {
    console.error('Search error:', err);
    const message = err instanceof Error ? err.message : 'Search failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
