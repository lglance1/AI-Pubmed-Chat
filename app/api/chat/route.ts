import Anthropic from '@anthropic-ai/sdk';
import { NextRequest, NextResponse } from 'next/server';

const TOOL_NAME = 'pubmed-ai-chat';
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

type Message = {
  role: 'user' | 'assistant';
  content: string;
};

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

function buildContext(articles: Article[], abstracts: Record<string, string>): string {
  return articles.map((a, i) => {
    const doi = a.articleids?.find(id => id.idtype === 'doi')?.value ?? '';
    const url = doi ? `https://doi.org/${doi}` : `https://pubmed.ncbi.nlm.nih.gov/${a.uid}/`;
    const ifText = a.impactFactor != null ? ` | IF: ${a.impactFactor}` : '';
    const abstract = abstracts[a.uid] ?? '(No abstract available)';

    return [
      `[Paper ${i + 1}]`,
      `Title: ${a.title}`,
      `Authors: ${a.authors?.map(au => au.name).join(', ') ?? ''}`,
      `Journal: ${a.fulljournalname}${ifText} | ${a.pubdate}`,
      `PMID: ${a.uid} | URL: ${url}`,
      `Abstract: ${abstract}`,
    ].join('\n');
  }).join('\n\n');
}

export async function POST(req: NextRequest) {
  try {
    const { articles, abstracts: providedAbstracts, messages } = await req.json() as {
      articles: Article[];
      abstracts?: Record<string, string>;
      messages: Message[];
    };

    if (!articles?.length) {
      return NextResponse.json({ error: 'No articles provided' }, { status: 400 });
    }
    if (!messages?.length) {
      return NextResponse.json({ error: 'No messages provided' }, { status: 400 });
    }

    // Use provided abstracts or fetch them
    const abstracts = providedAbstracts ?? await fetchAbstracts(articles.map(a => a.uid));
    const context = buildContext(articles, abstracts);

    const systemPrompt = `You are a medical research assistant analyzing ${articles.length} PubMed papers retrieved from a literature search. Your role is to help the user understand, synthesize, and explore this body of evidence.

When answering:
- Cite specific papers by number (e.g. [Paper 3]) or title
- Synthesize findings across papers where relevant
- Note agreements, contradictions, or gaps in the evidence
- Be concise but thorough
- If asked about something not covered in the papers, say so clearly

Here are the ${articles.length} papers:

${context}`;

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2048,
      system: systemPrompt,
      messages: messages.map(m => ({ role: m.role, content: m.content })),
    });

    const block = response.content[0];
    if (block.type !== 'text') throw new Error('Unexpected response type');

    // Return abstracts on first call so client can cache them
    const isFirstCall = !providedAbstracts;
    return NextResponse.json({
      reply: block.text,
      ...(isFirstCall ? { abstracts } : {}),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('Chat error:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
