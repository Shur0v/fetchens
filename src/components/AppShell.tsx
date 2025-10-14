"use client";

import { useEffect, useMemo, useState } from "react";

// Validates a fully qualified domain URL like https://api.example.com
function isValidDomainUrl(candidate: string): boolean {
  try {
    const u = new URL(candidate);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

// Ensures endpoint begins with a leading slash
function isValidEndpointPath(candidate: string): boolean {
  return candidate.startsWith("/");
}

// Build auth headers for the selected token type
function buildAuthHeaders(
  tokenType: "Bearer" | "API Key" | "Refresh Token" | "Basic" | "Custom Header",
  token: string,
  customHeaderName: string,
  customPrefix: string
): Record<string, string> {
  if (!token) return {};
  switch (tokenType) {
    case "Bearer":
      return { Authorization: `Bearer ${token}` };
    case "API Key":
      return { "X-API-Key": token };
    case "Refresh Token":
      return { Authorization: `Refresh ${token}` };
    case "Basic":
      return { Authorization: `Basic ${token}` };
    case "Custom Header": {
      const headerName = (customHeaderName || "X-Custom-Token").trim();
      const value = customPrefix ? `${customPrefix.trim()} ${token}` : token;
      return { [headerName]: value };
    }
  }
}

// Safe JSON parse; returns null if invalid
function parseJsonSafely(text: string): unknown | null {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

// Case-insensitive filter for paths by substring query
function filterPaths(paths: string[], query: string): string[] {
  const q = query.trim().toLowerCase();
  if (!q) return paths;
  return paths.filter((p) => p.toLowerCase().includes(q));
}

// Copy text to clipboard
async function copyText(text: string): Promise<void> {
  await navigator.clipboard.writeText(text);
}

// Download text content as a file
function downloadTextAsFile(text: string, filename: string): void {
  const blob = new Blob([text], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function AppShell() {
  const [domain, setDomain] = useState("");
  const [endpoint, setEndpoint] = useState("");
  const [token, setToken] = useState("");
  const [tokenType, setTokenType] = useState<
    "Bearer" | "API Key" | "Refresh Token" | "Basic" | "Custom Header"
  >("Bearer");
  const [customHeaderName, setCustomHeaderName] = useState("X-Custom-Token");
  const [customPrefix, setCustomPrefix] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusCode, setStatusCode] = useState<number | null>(null);
  const [rawJson, setRawJson] = useState<string>(
    JSON.stringify(
      { status: "ready", hint: "Fetch an API to preview its raw JSON here." },
      null,
      2
    )
  );
  const [pathSearch, setPathSearch] = useState("");
  const [toast, setToast] = useState<string | null>(null);

  // Derived: parsed object and paths
  const parsedObject = useMemo(() => parseJsonSafely(rawJson), [rawJson]);

  function extractPaths(value: unknown, base: string = ""): string[] {
    const paths: string[] = [];
    if (Array.isArray(value)) {
      for (let i = 0; i < value.length; i++) {
        const child = value[i];
        const next = `${base}[${i}]`;
        paths.push(next);
        paths.push(...extractPaths(child, next));
      }
    } else if (value !== null && typeof value === "object") {
      for (const key of Object.keys(value as Record<string, unknown>)) {
        const child = (value as Record<string, unknown>)[key];
        const sep = base ? "." : "";
        const next = `${base}${sep}${key}`;
        paths.push(next);
        paths.push(...extractPaths(child, next));
      }
    }
    return paths;
  }

  const allPaths = useMemo(() => (parsedObject ? extractPaths(parsedObject, "data") : []), [parsedObject]);
  const filteredPaths = useMemo(() => filterPaths(allPaths, pathSearch), [allPaths, pathSearch]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 1400);
    return () => clearTimeout(t);
  }, [toast]);

  const composedUrl = useMemo(() => `${domain || ""}${endpoint || ""}`, [domain, endpoint]);

  const domainInvalid = useMemo(() => {
    if (!domain) return false; // treat empty as neutral
    return !isValidDomainUrl(domain);
  }, [domain]);

  const endpointInvalid = useMemo(() => {
    if (!endpoint) return false;
    return !isValidEndpointPath(endpoint);
  }, [endpoint]);

  const [responseTimeMs, setResponseTimeMs] = useState<number | null>(null);
  const [responseSizeBytes, setResponseSizeBytes] = useState<number | null>(null);

  async function onFetch() {
    setIsLoading(true);
    setError(null);
    setStatusCode(null);
    setResponseTimeMs(null);
    setResponseSizeBytes(null);
    try {
      if (!domain) {
        throw new Error("Domain is required");
      }
      if (domainInvalid) {
        throw new Error("Invalid domain URL");
      }
      if (endpointInvalid) {
        throw new Error("Endpoint must start with /");
      }
      const url = composedUrl;
      const headers = buildAuthHeaders(tokenType, token, customHeaderName, customPrefix);
      const t0 = performance.now();
      const res = await fetch(url, { headers, method: "GET" });
      const t1 = performance.now();
      setResponseTimeMs(Math.max(0, Math.round(t1 - t0)));
      setStatusCode(res.status);
      if (!res.ok) {
        if (res.status === 401) {
          throw new Error("Unauthorized (401)");
        }
        throw new Error(`Request failed (${res.status})`);
      }
      const text = await res.text();
      setResponseSizeBytes(new Blob([text]).size);
      const data = parseJsonSafely(text);
      if (data == null) {
        throw new Error("Response is not JSON");
      }
      setRawJson(JSON.stringify(data, null, 2));
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Network error";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }

  function onReset() {
    setDomain("");
    setEndpoint("");
    setToken("");
    setShowToken(false);
    setError(null);
    setStatusCode(null);
    setRawJson(
      JSON.stringify(
        { status: "ready", hint: "Fetch an API to preview its raw JSON here." },
        null,
        2
      )
    );
    setPathSearch("");
  }

  return (
    <div className="min-h-screen">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <header className="border-b border-zinc-200 px-4 py-4 md:px-8 md:py-5">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-xl md:text-2xl font-bold tracking-tight">API Response Explorer</h1>
              <p className="text-xs md:text-sm text-zinc-500 mt-1">Fetch. Preview. Copy JSON paths.</p>
            </div>
          </div>
        </header>

        {/* Content */}
        <div className="py-6 px-4 md:py-10 md:px-8">
          <main className="flex flex-col gap-6 md:gap-8">
            {/* Controls */}
            <section aria-label="Controls" className="flex flex-col gap-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-zinc-600">Domain</label>
                  <input
                    type="url"
                    placeholder="https://api.example.com"
                    value={domain}
                    onChange={(e) => setDomain(e.target.value)}
                    className={`w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 ${
                      domainInvalid ? "border-red-500 focus:ring-red-200" : "border-zinc-300 focus:ring-zinc-300"
                    }`}
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs text-zinc-600">Endpoint</label>
                  <input
                    type="text"
                    placeholder="/v1/users"
                    value={endpoint}
                    onChange={(e) => setEndpoint(e.target.value)}
                    className={`w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 ${
                      endpointInvalid ? "border-red-500 focus:ring-red-200" : "border-zinc-300 focus:ring-zinc-300"
                    }`}
                  />
                </div>
              </div>

              {/* Auth Token on its own full-width row */}
              <div className="flex flex-col gap-1">
                <label className="text-xs text-zinc-600">Auth Token (optional)</label>
              <div className="flex items-center gap-2">
                <select
                  value={tokenType}
                  onChange={(e) => setTokenType(
                    e.target.value as "Bearer" | "API Key" | "Refresh Token" | "Basic" | "Custom Header"
                  )}
                  className="rounded-md border border-zinc-300 bg-white px-2 py-2 text-xs text-zinc-700 focus:outline-none focus:ring-2 focus:ring-black"
                >
                  <option value="Bearer">Bearer</option>
                  <option value="API Key">API Key</option>
                  <option value="Refresh Token">Refresh Token</option>
                  <option value="Basic">Basic</option>
                  <option value="Custom Header">Custom Header</option>
                </select>
                {tokenType === "Custom Header" && (
                  <>
                    <input
                      type="text"
                      placeholder="Header name (e.g., X-Auth-Token)"
                      value={customHeaderName}
                      onChange={(e) => setCustomHeaderName(e.target.value)}
                      className="w-[180px] rounded-md border border-zinc-300 px-2 py-2 text-xs outline-none focus:ring-2 focus:ring-black"
                    />
                    <input
                      type="text"
                      placeholder="Prefix (optional)"
                      value={customPrefix}
                      onChange={(e) => setCustomPrefix(e.target.value)}
                      className="w-[150px] rounded-md border border-zinc-300 px-2 py-2 text-xs outline-none focus:ring-2 focus:ring-black"
                    />
                  </>
                )}
                <input
                    type={showToken ? "text" : "password"}
                    placeholder="••••••••"
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                  className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black"
                  />
                  <button
                    type="button"
                    onClick={() => setShowToken((v) => !v)}
                  className="shrink-0 rounded-md border border-zinc-300 px-2 py-2 text-xs hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-black"
                  >
                    {showToken ? "Hide" : "Show"}
                  </button>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                <div className="text-xs text-zinc-500">
                  URL: <span className="font-mono">{`{domain}{endpoint}`}</span> → <span className="font-mono">{composedUrl || "(empty)"}</span>
                  <span className="ml-2">Only GET supported for now.</span>
                </div>
                <div className="sm:ml-auto flex gap-2">
                  <button
                    onClick={onFetch}
                    disabled={isLoading}
                    className="rounded-md bg-black text-white px-4 py-2 text-sm hover:bg-zinc-800 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-black"
                  >
                    {isLoading ? "Fetching..." : "Fetch"}
                  </button>
                  <button
                    onClick={onReset}
                    className="rounded-md border border-zinc-300 px-4 py-2 text-sm hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-black"
                  >
                    Reset
                  </button>
                </div>
              </div>

              {(error || domainInvalid || endpointInvalid || statusCode) && (
                <div className="text-xs">
                  {domainInvalid && <p className="text-red-600">Invalid domain URL.</p>}
                  {endpointInvalid && <p className="text-red-600">Endpoint must start with "/".</p>}
                  {error && (
                    <div className="mt-1 rounded-md border border-red-200 bg-red-50 p-3 text-red-700 flex items-center justify-between gap-3">
                      <p className="text-xs">{error}</p>
                      <button
                        type="button"
                        onClick={onFetch}
                        className="rounded-md bg-red-600 text-white px-3 py-1 text-xs hover:bg-red-700"
                      >
                        Retry
                      </button>
                    </div>
                  )}
                  {!error && statusCode && statusCode >= 200 && (
                    <p className="text-zinc-600">Status: {statusCode}</p>
                  )}
                </div>
              )}
            </section>

            {/* Results */}
            <section aria-label="Results" className="grid grid-cols-1 gap-6 md:gap-8 lg:grid-cols-2">
              {/* API Preview - Dark theme */}
              <div className="rounded-lg border border-slate-800 bg-slate-950 min-h-[360px] lg:min-h-[480px] flex flex-col shadow-sm">
                <div className="flex items-center justify-between gap-3 border-b border-slate-800 bg-slate-900/60 px-3 py-2 rounded-t-lg">
                  <h3 className="text-xs font-medium text-zinc-200">Raw Response</h3>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={async () => {
                        await copyText(rawJson);
                        setToast("Copied JSON");
                      }}
                      className="text-[11px] text-zinc-300 hover:text-white px-2 py-1 rounded border border-slate-800 hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-black"
                      title="Copy JSON"
                    >
                      Copy
                    </button>
                    <button
                      type="button"
                      onClick={() => downloadTextAsFile(rawJson, "response.json")}
                      className="text-[11px] text-zinc-300 hover:text-white px-2 py-1 rounded border border-slate-800 hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-black"
                      title="Download JSON"
                    >
                      Download
                    </button>
                  </div>
                </div>
                <div className="flex-1 overflow-auto p-3">
                  {isLoading ? (
                    <div className="flex items-center gap-2 text-zinc-300 text-xs">
                      <span className="inline-block h-3 w-3 rounded-full border-2 border-zinc-400 border-t-transparent animate-spin"></span>
                      Fetching…
                    </div>
                  ) : parsedObject ? (
                    <pre className="text-xs leading-relaxed whitespace-pre-wrap break-words text-zinc-50 font-mono">
{rawJson}
                    </pre>
                  ) : (
                    <p className="text-xs text-zinc-400">No response yet. Click Fetch to view API output.</p>
                  )}
                </div>
              </div>

              {/* Path Detector - Light theme */}
              <div className="rounded-lg border border-zinc-200 bg-zinc-50 min-h-[360px] lg:min-h-[480px] flex flex-col shadow-sm">
                <div className="flex items-center justify-between gap-3 border-b border-zinc-200 bg-zinc-100 px-3 py-2 rounded-t-lg">
                  <h3 className="text-xs font-medium text-zinc-700">Detected JSON Paths</h3>
                </div>
                <div className="p-3">
                  {/* Search */}
                  <div className="mb-3 flex items-center gap-2">
                    <input
                      type="text"
                      placeholder="Search paths (e.g., name)"
                      value={pathSearch}
                      onChange={(e) => setPathSearch(e.target.value)}
                      className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black"
                    />
                    {pathSearch && (
                      <button
                        type="button"
                        onClick={() => setPathSearch("")}
                        className="text-xs text-zinc-600 hover:underline"
                        title="Clear"
                      >
                        × Clear
                      </button>
                    )}
                  </div>
                </div>
                <div className="flex-1 overflow-auto px-3 pb-3">
                  {isLoading ? (
                    <div className="flex items-center gap-2 text-zinc-600 text-xs">
                      <span className="inline-block h-3 w-3 rounded-full border-2 border-zinc-500 border-t-transparent animate-spin"></span>
                      Fetching…
                    </div>
                  ) : !parsedObject ? (
                    <p className="text-xs text-zinc-500">No paths yet. Paths will appear once we fetch a valid JSON response.</p>
                  ) : filteredPaths.length === 0 ? (
                    <p className="text-xs text-zinc-500">No paths match your search.</p>
                  ) : (
                    <ul className="text-[12px] text-zinc-800 font-mono space-y-1">
                      {filteredPaths.map((p) => (
                        <li key={p} className="group flex items-center justify-between gap-2 rounded-md px-2 py-1 hover:bg-zinc-100">
                          <span className="break-words">{p}</span>
                          <button
                            type="button"
                            onClick={async () => {
                              await navigator.clipboard.writeText(p);
                              setToast("Copied path");
                            }}
                            className="invisible group-hover:visible text-[11px] text-zinc-600 hover:text-zinc-800 px-2 py-0.5 rounded border border-zinc-300 bg-white focus:outline-none focus:ring-2 focus:ring-black"
                            title="Copy path"
                          >
                            Copy
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </section>
            {!!parsedObject && (
              <div className="flex items-center gap-3 text-xs text-zinc-600">
                {statusCode != null && (
                  <span className="rounded-md border border-zinc-200 bg-white px-2 py-1">Status: {statusCode}</span>
                )}
                {responseTimeMs != null && (
                  <span className="rounded-md border border-zinc-200 bg-white px-2 py-1">Time: {responseTimeMs} ms</span>
                )}
                {responseSizeBytes != null && (
                  <span className="rounded-md border border-zinc-200 bg-white px-2 py-1">Size: {responseSizeBytes} B</span>
                )}
              </div>
            )}
          </main>
        </div>
      </div>
      {/* Toast */}
      {toast && (
        <div className="fixed bottom-4 right-4 left-4 md:left-auto z-50">
          <div className="mx-auto w-max md:mx-0 rounded-md bg-zinc-900 text-white text-xs px-3 py-2 shadow-lg">
            {toast}
          </div>
        </div>
      )}
    </div>
  );
}


