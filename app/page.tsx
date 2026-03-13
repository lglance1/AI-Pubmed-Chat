'use client';

import { useState, KeyboardEvent, useRef, useEffect } from 'react';

type ChatMessage = { role: 'user' | 'assistant'; content: string };

const ARTICLE_TYPES = [
  'Clinical Trial',
  'Review',
  'Meta-Analysis',
  'Systematic Review',
  'RCT',
  'Case Reports',
  'Observational',
  'Editorial',
];

const IF_PRESETS = [5, 10, 20, 50];

interface Article {
  uid: string;
  title: string;
  authors: { name: string }[];
  fulljournalname: string;
  pubdate: string;
  pubtype: string[];
  essn: string;
  issn: string;
  impactFactor: number | null;
  articleids?: { idtype: string; value: string }[];
}

interface SearchFilters {
  yearFrom: string;
  yearTo: string;
  articleTypes: string[];
  minImpactFactor: number | undefined;
  journalSearch: string;
  sortBy: 'relevance' | 'year' | 'if';
}

const THIS_YEAR = new Date().getFullYear();

export default function Home() {
  const [query, setQuery] = useState('');
  const [yearFrom, setYearFrom] = useState('');
  const [yearTo, setYearTo] = useState('');
  const [articleTypes, setArticleTypes] = useState<string[]>([]);
  const [minIF, setMinIF] = useState('');
  const [journalSearch, setJournalSearch] = useState('');
  const [sortBy, setSortBy] = useState<'relevance' | 'year' | 'if'>('relevance');

  const [results, setResults] = useState<Article[]>([]);
  const [pubmedQuery, setPubmedQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);
  const [page, setPage] = useState(0);
  const [totalResults, setTotalResults] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const [filteredCount, setFilteredCount] = useState(0);
  const [cachedArticles, setCachedArticles] = useState<Article[]>([]);
  const [isExporting, setIsExporting] = useState(false);
  const [lastQuery, setLastQuery] = useState('');
  const [lastFilters, setLastFilters] = useState<SearchFilters | null>(null);

  // Chat state
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [chatAbstracts, setChatAbstracts] = useState<Record<string, string> | null>(null);
  const [isLoadingAbstracts, setIsLoadingAbstracts] = useState(false);
  const chatBottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages, isChatLoading]);

  const toggleType = (type: string) =>
    setArticleTypes(prev =>
      prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]
    );

  const doSearch = async (searchQuery: string, filters: SearchFilters, pageNum: number, existingTranslation?: string) => {
    setIsLoading(true);
    setError(null);
    setResults([]);
    setCachedArticles([]);
    setChatOpen(false);
    setChatMessages([]);
    setChatAbstracts(null);

    try {
      const res = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: searchQuery,
          translatedQuery: existingTranslation,
          filters,
          page: pageNum,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Search failed');
      }

      const data = await res.json();
      setPubmedQuery(data.pubmedQuery);
      setPageSize(data.pageSize ?? 25);

      if (data.clientPaginate) {
        // Full filtered set returned — cache it and paginate locally
        const all: Article[] = data.articles;
        setCachedArticles(all);
        const slice = all.slice(0, data.pageSize ?? 25);
        setResults(slice);
        setTotalResults(all.length);
        setFilteredCount(slice.length);
      } else {
        setCachedArticles([]);
        setResults(data.articles);
        setTotalResults(data.total);
        setFilteredCount(data.filteredCount ?? data.articles.length);
      }
      setPage(pageNum);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Search failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSearch = async () => {
    if (!query.trim()) return;
    setSearched(true);
    setPubmedQuery('');
    const filters: SearchFilters = {
      yearFrom, yearTo, articleTypes,
      minImpactFactor: minIF ? parseFloat(minIF) : undefined,
      journalSearch, sortBy,
    };
    setLastQuery(query);
    setLastFilters(filters);
    await doSearch(query, filters, 0);
  };

  const goToPage = async (pageNum: number) => {
    if (!lastFilters) return;
    window.scrollTo({ top: 0, behavior: 'smooth' });

    if (cachedArticles.length > 0) {
      // Paginate locally — no API call needed
      const ps = pageSize ?? 25;
      const slice = cachedArticles.slice(pageNum * ps, (pageNum + 1) * ps);
      setResults(slice);
      setPage(pageNum);
    } else {
      await doSearch(lastQuery, lastFilters, pageNum, pubmedQuery);
    }
  };

  const handleExport = async (format: 'excel' | 'notebooklm') => {
    if (!lastQuery || !lastFilters) return;
    setIsExporting(true);
    try {
      // If no cached full set, fetch all results first
      let articlesToExport: Article[] = cachedArticles.length > 0 ? cachedArticles : [];
      if (articlesToExport.length === 0) {
        const allRes = await fetch('/api/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: lastQuery, translatedQuery: pubmedQuery, filters: lastFilters, page: 0, returnAll: true }),
        });
        if (!allRes.ok) {
          const e = await allRes.json().catch(() => ({}));
          throw new Error(e.error || `Search fetch failed (${allRes.status})`);
        }
        const allData = await allRes.json();
        articlesToExport = allData.articles;
      }
      if (!articlesToExport.length) return;

      const res = await fetch('/api/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ articles: articlesToExport, format }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || `Export failed (${res.status})`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = format === 'notebooklm' ? 'pubmed-notebooklm.txt' : 'pubmed-results.xlsx';
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: unknown) {
      alert(`Export failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setIsExporting(false);
    }
  };

  const openChat = async () => {
    setChatOpen(true);
    if (chatAbstracts) return; // already fetched
    const articles = cachedArticles.length > 0 ? cachedArticles : results;
    if (!articles.length) return;
    setIsLoadingAbstracts(true);
    try {
      const res = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: lastQuery, translatedQuery: pubmedQuery, filters: lastFilters, page: 0, returnAll: true }),
      });
      const data = await res.json();
      // Fetch abstracts via export endpoint reuse: send to chat directly
      setChatAbstracts({}); // trigger chat with empty abstracts — server will fetch
    } catch {
      setChatAbstracts({});
    } finally {
      setIsLoadingAbstracts(false);
    }
  };

  const sendChatMessage = async (text?: string) => {
    const content = (text ?? chatInput).trim();
    if (!content || isChatLoading) return;
    const articles = cachedArticles.length > 0 ? cachedArticles : results;
    if (!articles.length) return;

    const newMessages: ChatMessage[] = [...chatMessages, { role: 'user', content }];
    setChatMessages(newMessages);
    setChatInput('');
    setIsChatLoading(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          articles,
          abstracts: chatAbstracts ?? undefined,
          messages: newMessages,
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      // Cache abstracts returned from server on first call
      if (data.abstracts) setChatAbstracts(data.abstracts);
      setChatMessages(prev => [...prev, { role: 'assistant', content: data.reply }]);
    } catch (e: unknown) {
      setChatMessages(prev => [...prev, { role: 'assistant', content: `Error: ${e instanceof Error ? e.message : 'Something went wrong'}` }]);
    } finally {
      setIsChatLoading(false);
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') handleSearch();
  };

  const hasActiveFilters =
    yearFrom || yearTo || articleTypes.length > 0 || minIF || journalSearch;

  const clearFilters = () => {
    setYearFrom('');
    setYearTo('');
    setArticleTypes([]);
    setMinIF('');
    setJournalSearch('');
    setSortBy('relevance');
  };

  const DATE_PRESETS = [
    { label: '1 year', from: String(THIS_YEAR - 1) },
    { label: '5 years', from: String(THIS_YEAR - 5) },
    { label: '10 years', from: String(THIS_YEAR - 10) },
  ];

  return (
    <div className="min-h-screen bg-white text-[#333]" style={{ fontFamily: 'Source Sans Pro, Arial, sans-serif' }}>

      {/* NLM top bar */}
      <div style={{ backgroundColor: '#20558A' }}>
        <div className="max-w-7xl mx-auto px-4 py-1 flex items-center gap-2">
          <span className="text-xs" style={{ color: '#A8C8E8' }}>National Library of Medicine</span>
          <span className="text-xs" style={{ color: '#6699BB' }}>|</span>
          <span className="text-xs" style={{ color: '#A8C8E8' }}>National Institutes of Health</span>
        </div>
      </div>

      {/* Header */}
      <header style={{ backgroundColor: '#20558A', borderBottom: '3px solid #1A4470' }}>
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center">
          <span className="text-white text-2xl font-bold tracking-tight">PubMed</span>
          <span className="ml-2 text-xs px-1.5 py-0.5 rounded" style={{ backgroundColor: '#1A4470', color: '#A8C8E8' }}>
            AI
          </span>
        </div>
      </header>

      {/* Search bar */}
      <div style={{ backgroundColor: '#E8F0F7', borderBottom: '1px solid #C5D8EA' }} className="py-4">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex">
            <input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Search in plain English, e.g. how does exercise affect depression in older adults?"
              className="flex-1 px-3 py-2 text-sm text-gray-800 placeholder-gray-400 outline-none bg-white"
              style={{ border: '1px solid #AAC2D8', borderRight: 'none', borderRadius: '2px 0 0 2px' }}
            />
            <button
              onClick={handleSearch}
              disabled={isLoading || !query.trim()}
              className="px-6 py-2 text-sm font-semibold text-white transition-colors"
              style={{
                backgroundColor: isLoading || !query.trim() ? '#6B99BC' : '#20558A',
                border: '1px solid #20558A',
                borderRadius: '0 2px 2px 0',
                cursor: isLoading || !query.trim() ? 'not-allowed' : 'pointer',
              }}
            >
              {isLoading ? (
                <span className="flex items-center gap-2">
                  <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin inline-block" />
                  Searching…
                </span>
              ) : (
                'Search'
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="max-w-7xl mx-auto px-4 py-5 flex gap-6">

        {/* ── Left sidebar ── */}
        <aside className="w-56 shrink-0">
          <div style={{ border: '1px solid #D3D3D3' }}>

            {/* Sidebar title */}
            <div
              className="px-3 py-2 flex items-center justify-between"
              style={{ backgroundColor: '#20558A' }}
            >
              <span className="text-xs font-bold uppercase tracking-wide text-white">
                Filter Results
              </span>
              {hasActiveFilters && (
                <button
                  onClick={clearFilters}
                  className="text-xs underline"
                  style={{ color: '#A8C8E8' }}
                >
                  Clear all
                </button>
              )}
            </div>

            {/* Publication Date */}
            <FilterSection title="Publication Date">
              <div className="space-y-1.5">
                {DATE_PRESETS.map(({ label, from }) => (
                  <label key={label} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="pubdate"
                      checked={yearFrom === from && yearTo === ''}
                      onChange={() => { setYearFrom(from); setYearTo(''); }}
                      className="accent-[#20558A]"
                    />
                    <span className="text-sm">{label}</span>
                  </label>
                ))}
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="pubdate"
                    checked={yearFrom === '' && yearTo === ''}
                    onChange={() => { setYearFrom(''); setYearTo(''); }}
                    className="accent-[#20558A]"
                  />
                  <span className="text-sm">Any date</span>
                </label>
                <div className="pt-1">
                  <p className="text-xs mb-1" style={{ color: '#666' }}>Custom range</p>
                  <div className="flex items-center gap-1">
                    <input
                      type="text"
                      inputMode="numeric"
                      placeholder="From"
                      value={yearFrom}
                      onChange={e => setYearFrom(e.target.value.replace(/\D/g, ''))}
                      className="w-full px-2 py-1 text-xs outline-none"
                      style={{ border: '1px solid #CCC' }}
                    />
                    <span className="text-xs shrink-0" style={{ color: '#666' }}>–</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      placeholder="To"
                      value={yearTo}
                      onChange={e => setYearTo(e.target.value.replace(/\D/g, ''))}
                      className="w-full px-2 py-1 text-xs outline-none"
                      style={{ border: '1px solid #CCC' }}
                    />
                  </div>
                </div>
              </div>
            </FilterSection>

            {/* Article Types */}
            <FilterSection title="Article Type">
              <div className="space-y-1.5">
                {ARTICLE_TYPES.map(type => (
                  <label key={type} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={articleTypes.includes(type)}
                      onChange={() => toggleType(type)}
                      className="accent-[#20558A]"
                    />
                    <span className="text-sm">{type}</span>
                  </label>
                ))}
              </div>
            </FilterSection>

            {/* Impact Factor */}
            <FilterSection title="Min. Impact Factor">
              <div className="flex items-center gap-1 mb-2">
                <span className="text-xs shrink-0" style={{ color: '#666' }}>≥</span>
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="e.g. 8"
                  value={minIF}
                  onChange={e => setMinIF(e.target.value.replace(/[^0-9.]/g, ''))}
                  className="w-full px-2 py-1 text-xs outline-none"
                  style={{ border: '1px solid #CCC' }}
                />
              </div>
              <div className="flex flex-wrap gap-1">
                {IF_PRESETS.map(p => (
                  <button
                    key={p}
                    onClick={() => setMinIF(minIF === String(p) ? '' : String(p))}
                    className="text-xs px-2 py-0.5 transition-colors"
                    style={{
                      border: `1px solid ${minIF === String(p) ? '#20558A' : '#CCC'}`,
                      backgroundColor: minIF === String(p) ? '#20558A' : 'transparent',
                      color: minIF === String(p) ? '#fff' : '#333',
                      borderRadius: '2px',
                    }}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </FilterSection>

            {/* Sort By */}
            <FilterSection title="Sort By">
              <div className="space-y-1.5">
                {([
                  { value: 'relevance', label: 'Relevance' },
                  { value: 'year',      label: 'Year (newest first)' },
                  { value: 'if',        label: 'Impact Factor' },
                ] as const).map(({ value, label }) => (
                  <label key={value} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="sort-by"
                      checked={sortBy === value}
                      onChange={() => setSortBy(value)}
                      className="accent-[#20558A]"
                    />
                    <span className="text-sm">{label}</span>
                  </label>
                ))}
              </div>
            </FilterSection>

            {/* Journal */}
            <FilterSection title="Journal" last>
              <input
                type="text"
                placeholder="Search journals…"
                value={journalSearch}
                onChange={e => setJournalSearch(e.target.value)}
                className="w-full px-2 py-1.5 text-sm outline-none"
                style={{ border: '1px solid #CCC' }}
              />
            </FilterSection>
          </div>
        </aside>

        {/* ── Main content ── */}
        <main className="flex-1 min-w-0">

          {/* Pre-search state */}
          {!searched && !isLoading && (
            <p className="text-sm py-4" style={{ color: '#666' }}>
              Enter your research question above to search PubMed.
            </p>
          )}

          {/* Loading */}
          {isLoading && (
            <div className="py-8 flex items-center gap-2 text-sm" style={{ color: '#666' }}>
              <div
                className="w-4 h-4 border-2 border-t-transparent rounded-full animate-spin"
                style={{ borderColor: '#20558A', borderTopColor: 'transparent' }}
              />
              Searching PubMed…
            </div>
          )}

          {/* Error */}
          {error && !isLoading && (
            <div
              className="px-4 py-3 text-sm mb-4"
              style={{ border: '1px solid #E8A0A0', backgroundColor: '#FDF0F0', color: '#C00' }}
            >
              {error}
            </div>
          )}

          {/* Query translation */}
          {pubmedQuery && !isLoading && (
            <div
              className="px-3 py-2 mb-3 text-xs"
              style={{ border: '1px solid #D3D3D3', backgroundColor: '#F4F4F4' }}
            >
              <span className="font-bold" style={{ color: '#555' }}>Query translation: </span>
              <span className="font-mono" style={{ color: '#333' }}>{pubmedQuery}</span>
            </div>
          )}

          {/* Results count + Export */}
          {!isLoading && results.length > 0 && (
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm" style={{ color: '#333' }}>
                Displaying <strong>{page * pageSize + 1}–{Math.min((page + 1) * pageSize, totalResults)}</strong> of <strong>{totalResults.toLocaleString()}</strong> result{totalResults !== 1 ? 's' : ''}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => handleExport('excel')}
                  disabled={isExporting}
                  className="px-3 py-1 text-sm transition-colors"
                  style={{
                    border: '1px solid #20558A',
                    backgroundColor: isExporting ? '#F4F4F4' : '#20558A',
                    color: isExporting ? '#999' : '#fff',
                    cursor: isExporting ? 'not-allowed' : 'pointer',
                  }}
                >
                  {isExporting ? 'Exporting…' : `Export ${(cachedArticles.length || totalResults).toLocaleString()} to Excel`}
                </button>
                <button
                  onClick={() => handleExport('notebooklm')}
                  disabled={isExporting}
                  className="px-3 py-1 text-sm transition-colors"
                  style={{
                    border: '1px solid #20558A',
                    backgroundColor: isExporting ? '#F4F4F4' : '#fff',
                    color: isExporting ? '#999' : '#20558A',
                    cursor: isExporting ? 'not-allowed' : 'pointer',
                  }}
                >
                  {isExporting ? 'Exporting…' : `Export ${(cachedArticles.length || totalResults).toLocaleString()} to NotebookLM`}
                </button>
              </div>
            </div>
          )}

          {/* Results list */}
          {!isLoading && results.length > 0 && (
            <div style={{ border: '1px solid #D3D3D3' }}>
              {results.map((article, i) => (
                <ArticleItem key={article.uid} article={article} index={page * pageSize + i + 1} />
              ))}
            </div>
          )}

          {/* Pagination */}
          {!isLoading && totalResults > pageSize && (
            <div className="flex items-center gap-2 mt-4 text-sm" style={{ color: '#333' }}>
              <button
                onClick={() => goToPage(page - 1)}
                disabled={page === 0}
                className="px-3 py-1 transition-colors"
                style={{
                  border: '1px solid #AAC2D8',
                  backgroundColor: page === 0 ? '#F4F4F4' : '#fff',
                  color: page === 0 ? '#999' : '#20558A',
                  cursor: page === 0 ? 'not-allowed' : 'pointer',
                }}
              >
                ← Previous
              </button>
              <span style={{ color: '#666' }}>
                Page {page + 1} of {Math.ceil(totalResults / pageSize).toLocaleString()}
              </span>
              <button
                onClick={() => goToPage(page + 1)}
                disabled={(page + 1) * pageSize >= totalResults}
                className="px-3 py-1 transition-colors"
                style={{
                  border: '1px solid #AAC2D8',
                  backgroundColor: (page + 1) * pageSize >= totalResults ? '#F4F4F4' : '#fff',
                  color: (page + 1) * pageSize >= totalResults ? '#999' : '#20558A',
                  cursor: (page + 1) * pageSize >= totalResults ? 'not-allowed' : 'pointer',
                }}
              >
                Next →
              </button>
            </div>
          )}

          {/* No results */}
          {searched && !isLoading && !error && results.length === 0 && (
            <p className="py-8 text-sm text-center" style={{ color: '#666' }}>
              No results found. Try adjusting your search or relaxing the filters.
            </p>
          )}

          {/* Chat with Results */}
          {!isLoading && results.length > 0 && (
            <div className="mt-6">
              {!chatOpen ? (
                <button
                  onClick={openChat}
                  className="w-full py-3 text-sm font-medium transition-colors"
                  style={{
                    border: '2px solid #20558A',
                    backgroundColor: '#fff',
                    color: '#20558A',
                    cursor: 'pointer',
                  }}
                >
                  💬 Chat with these {(cachedArticles.length || totalResults).toLocaleString()} results
                </button>
              ) : (
                <div style={{ border: '1px solid #D3D3D3' }}>
                  {/* Chat header */}
                  <div className="flex items-center justify-between px-4 py-2" style={{ backgroundColor: '#20558A' }}>
                    <span className="text-sm font-medium text-white">
                      💬 Chat with {(cachedArticles.length || totalResults).toLocaleString()} papers
                    </span>
                    <button
                      onClick={() => setChatOpen(false)}
                      className="text-white text-xs opacity-75 hover:opacity-100"
                    >
                      ✕ Close
                    </button>
                  </div>

                  {/* Suggested questions */}
                  {chatMessages.length === 0 && (
                    <div className="p-4" style={{ backgroundColor: '#F9F9F9', borderBottom: '1px solid #E0E0E0' }}>
                      <p className="text-xs mb-2" style={{ color: '#666' }}>Suggested questions:</p>
                      <div className="flex flex-wrap gap-2">
                        {[
                          'What are the main findings across these papers?',
                          'What are the limitations of this evidence?',
                          'Which papers have the strongest study design?',
                          'Are there any contradictions in the findings?',
                          'Summarize the clinical implications',
                        ].map(q => (
                          <button
                            key={q}
                            onClick={() => sendChatMessage(q)}
                            className="px-3 py-1 text-xs transition-colors"
                            style={{
                              border: '1px solid #AAC2D8',
                              backgroundColor: '#fff',
                              color: '#20558A',
                              cursor: 'pointer',
                            }}
                          >
                            {q}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Messages */}
                  <div className="p-4 space-y-4 overflow-y-auto" style={{ maxHeight: '500px', minHeight: '100px' }}>
                    {isLoadingAbstracts && (
                      <p className="text-sm text-center" style={{ color: '#666' }}>Loading paper abstracts…</p>
                    )}
                    {chatMessages.map((m, i) => (
                      <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div
                          className="px-4 py-2 text-sm max-w-[85%]"
                          style={{
                            backgroundColor: m.role === 'user' ? '#20558A' : '#F4F4F4',
                            color: m.role === 'user' ? '#fff' : '#333',
                            borderRadius: '4px',
                            whiteSpace: 'pre-wrap',
                          }}
                        >
                          {m.content}
                        </div>
                      </div>
                    ))}
                    {isChatLoading && (
                      <div className="flex justify-start">
                        <div className="px-4 py-2 text-sm" style={{ backgroundColor: '#F4F4F4', borderRadius: '4px', color: '#666' }}>
                          Thinking…
                        </div>
                      </div>
                    )}
                    <div ref={chatBottomRef} />
                  </div>

                  {/* Input */}
                  <div className="flex gap-2 p-3" style={{ borderTop: '1px solid #E0E0E0' }}>
                    <input
                      type="text"
                      value={chatInput}
                      onChange={e => setChatInput(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') sendChatMessage(); }}
                      placeholder="Ask a question about these papers…"
                      className="flex-1 px-3 py-2 text-sm outline-none"
                      style={{ border: '1px solid #D3D3D3' }}
                      disabled={isChatLoading}
                    />
                    <button
                      onClick={() => sendChatMessage()}
                      disabled={isChatLoading || !chatInput.trim()}
                      className="px-4 py-2 text-sm text-white transition-colors"
                      style={{
                        backgroundColor: isChatLoading || !chatInput.trim() ? '#AAC2D8' : '#20558A',
                        cursor: isChatLoading || !chatInput.trim() ? 'not-allowed' : 'pointer',
                      }}
                    >
                      Send
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

function FilterSection({
  title,
  children,
  last = false,
}: {
  title: string;
  children: React.ReactNode;
  last?: boolean;
}) {
  return (
    <div style={{ borderBottom: last ? 'none' : '1px solid #D3D3D3' }}>
      <div
        className="px-3 py-2"
        style={{ backgroundColor: '#F4F4F4', borderBottom: '1px solid #D3D3D3' }}
      >
        <span className="text-sm font-semibold" style={{ color: '#333' }}>{title}</span>
      </div>
      <div className="px-3 py-3">{children}</div>
    </div>
  );
}

function ArticleItem({ article, index }: { article: Article; index: number }) {
  const authors = article.authors?.map(a => a.name).join(', ') ?? '';
  const types = article.pubtype ?? [];

  return (
    <div
      className="px-4 py-4"
      style={{ borderBottom: '1px solid #E8E8E8', backgroundColor: '#FFF' }}
    >
      <div className="flex gap-3">
        {/* Index */}
        <div className="text-sm shrink-0 w-6 text-right pt-0.5" style={{ color: '#999' }}>
          {index}.
        </div>

        {/* Body */}
        <div className="flex-1 min-w-0">
          {/* Title */}
          <a
            href={`https://pubmed.ncbi.nlm.nih.gov/${article.uid}/`}
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold leading-snug hover:underline"
            style={{ color: '#20558A', fontSize: '15px' }}
          >
            {article.title}
          </a>

          {/* Authors */}
          {authors && (
            <p className="text-sm mt-0.5" style={{ color: '#444' }}>{authors}</p>
          )}

          {/* Citation */}
          <p className="text-sm mt-0.5" style={{ color: '#666' }}>
            <em>{article.fulljournalname}</em>
            {article.pubdate && <span>. {article.pubdate}</span>}
            {article.impactFactor != null && (
              <span className="ml-2 not-italic font-semibold" style={{ color: '#2E7D32' }}>
                IF {article.impactFactor.toFixed(1)}
              </span>
            )}
          </p>

          {/* PMID + types */}
          <div className="flex flex-wrap items-center gap-2 mt-1">
            <span className="text-xs" style={{ color: '#666' }}>
              PMID: <span className="font-mono">{article.uid}</span>
            </span>
            {types.slice(0, 3).map(t => (
              <span
                key={t}
                className="text-xs px-1.5 py-0.5"
                style={{ border: '1px solid #20558A', color: '#20558A', borderRadius: '2px' }}
              >
                {t}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
