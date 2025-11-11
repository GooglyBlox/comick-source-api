"use client";

import { useEffect, useState } from "react";

interface Source {
  id: string;
  name: string;
  baseUrl: string;
  description?: string;
  clientOnly?: boolean;
}

interface SourceHealth {
  status: "healthy" | "cloudflare" | "timeout" | "error";
  message: string;
  responseTime?: number;
  lastChecked: string;
}

export default function Home() {
  const [sources, setSources] = useState<Source[]>([]);
  const [health, setHealth] = useState<Record<string, SourceHealth>>({});
  const [loading, setLoading] = useState(true);
  const [healthLoading, setHealthLoading] = useState(true);

  useEffect(() => {
    // Fetch sources
    fetch("/api/sources")
      .then((res) => res.json())
      .then((data) => {
        setSources(data.sources || []);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Failed to load sources:", err);
        setLoading(false);
      });

    // Fetch health status (now all sources run on edge runtime)
    fetch("/api/health")
      .then((res) => res.json())
      .then((data) => {
        setHealth(data.sources || {});
        setHealthLoading(false);
      })
      .catch((err) => {
        console.error("Failed to load health:", err);
        setHealthLoading(false);
      });
  }, []);

  const getStatusColor = (status?: string) => {
    switch (status) {
      case "healthy":
        return "bg-emerald-500";
      case "cloudflare":
        return "bg-yellow-500";
      case "timeout":
        return "bg-orange-500";
      case "error":
        return "bg-red-500";
      default:
        return "bg-neutral-600";
    }
  };

  const getStatusTextColor = (status?: string) => {
    switch (status) {
      case "healthy":
        return "text-emerald-400";
      case "cloudflare":
        return "text-yellow-400";
      case "timeout":
        return "text-orange-400";
      case "error":
        return "text-red-400";
      default:
        return "text-neutral-500";
    }
  };

  const getStatusLabel = (status?: string) => {
    switch (status) {
      case "healthy":
        return "Operational";
      case "cloudflare":
        return "Cloudflare Protected";
      case "timeout":
        return "Slow/Timeout";
      case "error":
        return "Error";
      default:
        return "Checking...";
    }
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      {/* Header */}
      <header className="border-b border-neutral-800">
        <div className="max-w-7xl mx-auto px-6 py-6">
          <h1 className="text-2xl font-semibold tracking-tight">
            Comick Source API
          </h1>
          <p className="text-sm text-neutral-400 mt-1">
            RESTful API for manga/comic metadata
          </p>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-12">
        {/* API Documentation */}
        <section className="mb-16">
          <h2 className="text-lg font-semibold mb-6">Endpoints</h2>

          <div className="space-y-8">
            {/* GET /api/sources */}
            <div className="border border-neutral-800 rounded-lg overflow-hidden">
              <div className="bg-neutral-900/50 px-6 py-4 border-b border-neutral-800">
                <div className="flex items-center gap-3">
                  <span className="text-xs font-mono bg-emerald-500/10 text-emerald-400 px-2 py-1 rounded">
                    GET
                  </span>
                  <code className="text-sm font-mono text-neutral-300">
                    /api/sources
                  </code>
                </div>
                <p className="text-sm text-neutral-400 mt-2">
                  Retrieve list of available sources
                </p>
              </div>
              <div className="px-6 py-4 bg-neutral-900/30">
                <pre className="text-xs font-mono text-neutral-300 overflow-x-auto">
                  {`{
  "sources": [
    {
      "id": "mangapark",
      "name": "MangaPark",
      "baseUrl": "https://mangapark.io",
      "description": "MangaPark - https://mangapark.io"
    }
  ]
}`}
                </pre>
              </div>
            </div>

            {/* POST /api/search */}
            <div className="border border-neutral-800 rounded-lg overflow-hidden">
              <div className="bg-neutral-900/50 px-6 py-4 border-b border-neutral-800">
                <div className="flex items-center gap-3">
                  <span className="text-xs font-mono bg-blue-500/10 text-blue-400 px-2 py-1 rounded">
                    POST
                  </span>
                  <code className="text-sm font-mono text-neutral-300">
                    /api/search
                  </code>
                </div>
                <p className="text-sm text-neutral-400 mt-2">
                  Search for manga across one or all sources
                </p>
              </div>
              <div className="px-6 py-4 bg-neutral-900/30 border-b border-neutral-800">
                <p className="text-xs text-neutral-500 mb-2">Request Body</p>
                <pre className="text-xs font-mono text-neutral-300 overflow-x-auto">
                  {`{
  "query": "solo leveling",
  "source": "mangapark"  // or "all" for all sources
}`}
                </pre>
              </div>
              <div className="px-6 py-4 bg-neutral-900/30">
                <p className="text-xs text-neutral-500 mb-2">Response</p>
                <pre className="text-xs font-mono text-neutral-300 overflow-x-auto">
                  {`{
  "results": [
    {
      "id": "343921",
      "title": "Solo Leveling",
      "url": "https://mangapark.io/title/75577-en-solo-leveling",
      "coverImage": "https://...",
      "latestChapter": 179,
      "lastUpdated": "2 days ago"
    }
  ],
  "source": "MangaPark"
}`}
                </pre>
              </div>
            </div>

            {/* POST /api/chapters */}
            <div className="border border-neutral-800 rounded-lg overflow-hidden">
              <div className="bg-neutral-900/50 px-6 py-4 border-b border-neutral-800">
                <div className="flex items-center gap-3">
                  <span className="text-xs font-mono bg-blue-500/10 text-blue-400 px-2 py-1 rounded">
                    POST
                  </span>
                  <code className="text-sm font-mono text-neutral-300">
                    /api/chapters
                  </code>
                </div>
                <p className="text-sm text-neutral-400 mt-2">
                  Get chapter list for a manga
                </p>
              </div>
              <div className="px-6 py-4 bg-neutral-900/30 border-b border-neutral-800">
                <p className="text-xs text-neutral-500 mb-2">Request Body</p>
                <pre className="text-xs font-mono text-neutral-300 overflow-x-auto">
                  {`{
  "url": "https://mangapark.io/title/75577-en-solo-leveling",
  "source": "mangapark"  // optional
}`}
                </pre>
              </div>
              <div className="px-6 py-4 bg-neutral-900/30">
                <p className="text-xs text-neutral-500 mb-2">Response</p>
                <pre className="text-xs font-mono text-neutral-300 overflow-x-auto">
                  {`{
  "chapters": [
    {
      "id": "1",
      "number": 1,
      "title": "Chapter 1",
      "url": "https://..."
    }
  ],
  "source": "MangaPark",
  "totalChapters": 179
}`}
                </pre>
              </div>
            </div>

            {/* GET /api/health */}
            <div className="border border-neutral-800 rounded-lg overflow-hidden">
              <div className="bg-neutral-900/50 px-6 py-4 border-b border-neutral-800">
                <div className="flex items-center gap-3">
                  <span className="text-xs font-mono bg-emerald-500/10 text-emerald-400 px-2 py-1 rounded">
                    GET
                  </span>
                  <code className="text-sm font-mono text-neutral-300">
                    /api/health
                  </code>
                </div>
                <p className="text-sm text-neutral-400 mt-2">
                  Check health status of all sources (cached for 5 minutes)
                </p>
              </div>
              <div className="px-6 py-4 bg-neutral-900/30">
                <pre className="text-xs font-mono text-neutral-300 overflow-x-auto">
                  {`{
  "sources": {
    "mangapark": {
      "status": "healthy",
      "message": "Source is operational",
      "responseTime": 1234,
      "lastChecked": "2025-01-08T..."
    }
  }
}`}
                </pre>
              </div>
            </div>
          </div>
        </section>

        {/* Available Sources */}
        <section>
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold">Available Sources</h2>
            <span className="text-sm text-neutral-500">
              {sources.length} sources
            </span>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="w-6 h-6 border-2 border-neutral-700 border-t-neutral-400 rounded-full animate-spin"></div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {sources.map((source) => {
                const sourceHealth = health[source.id];
                const statusColor = getStatusColor(sourceHealth?.status);
                const statusLabel = getStatusLabel(sourceHealth?.status);

                return (
                  <div
                    key={source.id}
                    className="border border-neutral-800 rounded-lg p-5 hover:border-neutral-700 transition-colors"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <h3 className="font-medium text-neutral-100">
                        {source.name}
                      </h3>
                      <div className="flex items-center gap-2">
                        {healthLoading ? (
                          <div className="w-2 h-2 rounded-full bg-neutral-600 animate-pulse"></div>
                        ) : (
                          <div
                            className={`w-2 h-2 rounded-full ${statusColor}`}
                            title={sourceHealth?.message || "Unknown"}
                          ></div>
                        )}
                      </div>
                    </div>

                    <a
                      href={source.baseUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-neutral-500 hover:text-neutral-400 transition-colors break-all"
                    >
                      {source.baseUrl}
                    </a>

                    {sourceHealth && (
                      <div className="mt-3 text-xs">
                        <span
                          className={`${getStatusTextColor(sourceHealth.status)}`}
                        >
                          {statusLabel}
                        </span>
                        {sourceHealth.responseTime && (
                          <span className="text-neutral-600 ml-2">
                            ({sourceHealth.responseTime}ms)
                          </span>
                        )}
                      </div>
                    )}

                    <div className="mt-4 pt-4 border-t border-neutral-800">
                      <code className="text-xs text-neutral-600 font-mono">
                        {source.id}
                      </code>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-neutral-800 mt-20">
        <div className="max-w-7xl mx-auto px-6 py-8">
          <p className="text-sm text-neutral-600">
            Metadata-only API • No image scraping • Search and chapter listing
          </p>
        </div>
      </footer>
    </div>
  );
}
