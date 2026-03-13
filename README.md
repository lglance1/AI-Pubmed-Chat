# AI-Powered PubMed Search

A Next.js web application that lets you search PubMed using plain English. An AI model translates your natural language query into an optimized PubMed search string, and results are enriched with journal impact factors.

## Features

- **Natural language search** — type a research question instead of Boolean queries
- **Impact factor filtering** — filter results by minimum journal IF (JCR 2023 values)
- **Sort options** — sort by relevance, publication date, or impact factor
- **Full pagination** — retrieves all matching articles, not just the first page
- **Excel export** — download results (PMID, authors, title, journal, date, IF, URL, abstract) as `.xlsx`
- **Sidebar filters** — publication date range, article type, journal name
- **PubMed-style UI** — familiar layout with navy header and two-column design

## Setup

### Prerequisites

- Node.js 18+
- An [Anthropic API key](https://console.anthropic.com/)

### Installation

```bash
git clone https://github.com/lglance1/AI-Pubmed-Search.git
cd AI-Pubmed-Search
npm install
```

### Configuration

Copy the example environment file and add your Anthropic API key:

```bash
cp .env.local.example .env.local
```

Edit `.env.local`:

```
ANTHROPIC_API_KEY=your-api-key-here
```

### Running

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## How It Works

1. Your natural language query is sent to **Claude Haiku**, which converts it into an optimized PubMed search string using `[tiab]` (title/abstract) field tags
2. The query is sent to the **PubMed E-utilities API** (esearch + esummary)
3. Journal impact factors are looked up from a static **JCR 2023 dictionary** (450+ journals), with Claude Haiku as a fallback for unknown journals
4. When filtering or sorting by IF, all matching articles are fetched upfront and cached client-side for instant pagination
5. Abstracts are fetched via PubMed efetch at export time

## Tech Stack

- [Next.js 14](https://nextjs.org/) (App Router)
- [Anthropic Claude Haiku](https://www.anthropic.com/) — query translation and IF lookup fallback
- [PubMed E-utilities](https://www.ncbi.nlm.nih.gov/books/NBK25501/) — article search and metadata
- [SheetJS (xlsx)](https://sheetjs.com/) — Excel export
- [Tailwind CSS](https://tailwindcss.com/)
