import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';

const TOOL_NAME = 'pubmed-ai-search';
const TOOL_EMAIL = 'research@example.com';

type Article = {
  uid: string;
  title: string;
  authors: { name: string }[];
  fulljournalname: string;
  pubdate: string;
  impactFactor: number | null;
  articleids?: { idtype: string; value: string }[];
};

// Fetch abstracts for a list of PMIDs via PubMed efetch (XML)
async function fetchAbstracts(pmids: string[]): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  const BATCH = 200;

  for (let i = 0; i < pmids.length; i += BATCH) {
    const batch = pmids.slice(i, i + BATCH);
    const params = new URLSearchParams({
      db: 'pubmed',
      id: batch.join(','),
      rettype: 'xml',
      retmode: 'xml',
      tool: TOOL_NAME,
      email: TOOL_EMAIL,
    });

    const res = await fetch(`https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?${params}`);
    if (!res.ok) continue;
    const xml = await res.text();

    const articleBlocks = Array.from(xml.matchAll(/<PubmedArticle>([\s\S]*?)<\/PubmedArticle>/g));
    for (const match of articleBlocks) {
      const block = match[1];
      const pmidMatch = block.match(/<PMID[^>]*>(\d+)<\/PMID>/);
      if (!pmidMatch) continue;
      const pmid = pmidMatch[1];

      const abstractParts: string[] = [];
      const abstractMatches = Array.from(block.matchAll(/<AbstractText(?:[^>]* Label="([^"]*)")?[^>]*>([\s\S]*?)<\/AbstractText>/g));
      for (const a of abstractMatches) {
        const label = a[1];
        const text = a[2].replace(/<[^>]+>/g, '').trim();
        abstractParts.push(label ? `${label}: ${text}` : text);
      }
      result[pmid] = abstractParts.join(' ');
    }
  }

  return result;
}

function articleUrl(a: Article): string {
  const doi = a.articleids?.find(id => id.idtype === 'doi')?.value ?? '';
  return doi ? `https://doi.org/${doi}` : `https://pubmed.ncbi.nlm.nih.gov/${a.uid}/`;
}

function buildExcel(articles: Article[], abstracts: Record<string, string>): Blob {
  const truncate = (s: string, max = 32000) => s.length > max ? s.slice(0, max) + '…' : s;

  const rows = articles.map(a => ({
    PMID: a.uid,
    Authors: truncate(a.authors?.map(au => au.name).join(', ') ?? ''),
    Title: truncate(a.title ?? ''),
    Journal: a.fulljournalname ?? '',
    Date: a.pubdate ?? '',
    'Impact Factor': a.impactFactor ?? '',
    URL: articleUrl(a),
    Abstract: truncate(abstracts[a.uid] ?? ''),
  }));

  const ws = XLSX.utils.json_to_sheet(rows);
  ws['!cols'] = [
    { wch: 12 }, { wch: 40 }, { wch: 60 }, { wch: 35 },
    { wch: 12 }, { wch: 14 }, { wch: 45 }, { wch: 80 },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Results');

  const rawBuf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  return new Blob([new Uint8Array(rawBuf as number[])], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

function buildNotebookLM(articles: Article[], abstracts: Record<string, string>): Blob {
  const divider = '='.repeat(80);

  const sections = articles.map((a, i) => {
    const ifText = a.impactFactor != null ? ` | Impact Factor: ${a.impactFactor}` : '';
    const lines = [
      `${divider}`,
      `Paper ${i + 1} of ${articles.length}`,
      `${divider}`,
      `Title:   ${a.title ?? ''}`,
      `Authors: ${a.authors?.map(au => au.name).join(', ') ?? ''}`,
      `Journal: ${a.fulljournalname ?? ''}${ifText}`,
      `Date:    ${a.pubdate ?? ''}`,
      `PMID:    ${a.uid}`,
      `URL:     ${articleUrl(a)}`,
      ``,
      `Abstract:`,
      abstracts[a.uid] ?? '(No abstract available)',
    ];
    return lines.join('\n');
  });

  const header = [
    `PubMed Search Results`,
    `Total papers: ${articles.length}`,
    `Exported: ${new Date().toLocaleDateString()}`,
    ``,
    ``,
  ].join('\n');

  return new Blob([header + sections.join('\n\n')], { type: 'text/plain' });
}

export async function POST(req: NextRequest) {
  try {
    const { articles, format = 'excel' } = await req.json() as {
      articles: Article[];
      format?: 'excel' | 'notebooklm';
    };

    if (!articles?.length) {
      return NextResponse.json({ error: 'No articles provided' }, { status: 400 });
    }

    const pmids = articles.map(a => a.uid);
    const abstracts = await fetchAbstracts(pmids);

    if (format === 'notebooklm') {
      const blob = buildNotebookLM(articles, abstracts);
      return new NextResponse(blob, {
        headers: {
          'Content-Type': 'text/plain',
          'Content-Disposition': 'attachment; filename="pubmed-notebooklm.txt"',
        },
      });
    }

    // Default: Excel
    const blob = buildExcel(articles, abstracts);
    return new NextResponse(blob, {
      headers: {
        'Content-Disposition': 'attachment; filename="pubmed-results.xlsx"',
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('Export error:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
