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

// Parse more permissive inputs: allows single quotes, unquoted keys, trailing commas, and JS-style comments
function parseJsonFlexible(input: string): unknown | null {
  // Fast path: valid JSON
  const strict = parseJsonSafely(input);
  if (strict !== null) return strict;

  let text = input;

  // 1) Remove // line comments and /* block comments */
  text = text.replace(/\/\*[\s\S]*?\*\//g, "");
  text = text.replace(/(^|\s)\/\/.*$/gm, "");

  // 2) Replace single-quoted strings with double-quoted strings (naive but practical)
  //    Handles escaped quotes within single-quoted strings
  text = text.replace(/'([^'\\]|\\.)*'/g, (m) => {
    const inner = m.slice(1, -1).replace(/\\'/g, "'").replace(/"/g, '\\"');
    return `"${inner}"`;
  });

  // 3) Quote unquoted object keys: foo: 1 -> "foo": 1
  //    Matches keys at start of object members (after { or ,)
  text = text.replace(/([\{,]\s*)([A-Za-z_][A-Za-z0-9_\-]*)(\s*:\s*)/g, (_m, p1, key, p3) => `${p1}"${key}"${p3}`);

  // 4) Remove trailing commas in objects and arrays
  text = text.replace(/,\s*([}\]])/g, '$1');

  // 5) Replace undefined with null
  text = text.replace(/\bundefined\b/g, 'null');

  // Try parsing again
  return parseJsonSafely(text);
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
  const [showAuthControls, setShowAuthControls] = useState(false);
  const [isPasteOverlayOpen, setIsPasteOverlayOpen] = useState(false);
  const [pasteBuffer, setPasteBuffer] = useState("");

  // Derived: parsed object and paths
  const parsedObject = useMemo(() => parseJsonSafely(rawJson), [rawJson]);

  // ----- Tree building for hierarchical path view -----
  type JsonTreeNode = {
    key: string;
    path: string;
    type: "object" | "array" | "value";
    valuePreview?: string;
    children?: JsonTreeNode[];
  };

  function createValuePreview(v: unknown): string {
    if (v === null) return "null";
    const t = typeof v;
    if (t === "string") return (v as string).length > 24 ? `${(v as string).slice(0, 24)}…` : (v as string);
    if (t === "number" || t === "boolean") return String(v);
    return "";
  }

  function buildJsonTree(value: unknown, basePath: string = "data"): JsonTreeNode {
    if (Array.isArray(value)) {
      const children: JsonTreeNode[] = [];
      for (let i = 0; i < value.length; i++) {
        const childValue = value[i];
        const childPath = `${basePath}[${i}]`;
        children.push(buildJsonTree(childValue, childPath));
      }
      return { key: basePath.split(/\.|\[/).pop() || basePath, path: basePath, type: "array", children };
    }
    if (value !== null && typeof value === "object") {
      const obj = value as Record<string, unknown>;
      const keys = Object.keys(obj);
      const children: JsonTreeNode[] = keys.map((k) => buildJsonTree(obj[k], `${basePath}.${k}`));
      return { key: basePath.split(/\.|\[/).pop() || basePath, path: basePath, type: "object", children };
    }
    return { key: basePath.split(/\.|\[/).pop() || basePath, path: basePath, type: "value", valuePreview: createValuePreview(value) };
  }

  function filterTreeByQuery(node: JsonTreeNode, q: string): JsonTreeNode | null {
    if (!q) return node;
    const ql = q.toLowerCase();
    const selfMatch = node.path.toLowerCase().includes(ql) || (node.valuePreview || "").toLowerCase().includes(ql);
    if (node.children && node.children.length > 0) {
      const filteredChildren = node.children.map((c) => filterTreeByQuery(c, q)).filter((c): c is JsonTreeNode => !!c);
      if (filteredChildren.length > 0 || selfMatch) return { ...node, children: filteredChildren };
      return null;
    }
    return selfMatch ? node : null;
  }

  const rootTree = useMemo(() => {
    if (!parsedObject) return null;
    return buildJsonTree(parsedObject, "data");
  }, [parsedObject]);

  const filteredTree = useMemo(() => {
    if (!rootTree) return null;
    return filterTreeByQuery(rootTree, pathSearch);
  }, [rootTree, pathSearch]);

  const [expanded, setExpanded] = useState<Set<string>>(new Set(["data"]));
  useEffect(() => {
    if (pathSearch && rootTree) {
      // Expand all during search
      const stack: JsonTreeNode[] = [rootTree];
      const all = new Set<string>();
      while (stack.length) {
        const n = stack.pop()!;
        all.add(n.path);
        if (n.children) stack.push(...n.children);
      }
      setExpanded(all);
    }
  }, [pathSearch, rootTree]);

  function toggleExpand(path: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  function JsonTreeView({ node, depth }: { node: JsonTreeNode; depth: number }) {
    const indent = { paddingLeft: `${depth * 12}px` } as const;
    const isBranch = node.type === "object" || node.type === "array";
    const isOpen = expanded.has(node.path);
    const keyColorByDepth = [
      "text-stone-900",
      "text-stone-800",
      "text-stone-700",
      "text-stone-700",
      "text-stone-700",
    ];
    const keyColor = keyColorByDepth[depth % keyColorByDepth.length];
    return (
      <div>
        <div className="group flex items-center justify-between gap-2 rounded-md px-2 py-1 hover:bg-amber-100/70" style={indent}>
          <button
            type="button"
            onClick={() => (isBranch ? toggleExpand(node.path) : navigator.clipboard.writeText(node.path).then(() => setToast("Copied path")))}
            className="flex items-center gap-2 text-left text-[12px] text-zinc-800"
          >
            {isBranch ? (
              <span className="inline-block w-6 text-amber-700 text-lg leading-none">{isOpen ? "▾" : "▸"}</span>
            ) : (
              <span className="inline-block w-6 text-amber-700 text-lg leading-none">•</span>
            )}
            <span className={`font-mono break-words ${keyColor}`}>
              {node.key}
              {node.type === "array" ? " []" : node.type === "object" ? " {}" : node.valuePreview ? `: ${node.valuePreview}` : ""}
            </span>
          </button>
          <div className="flex items-center gap-2 min-w-0 invisible group-hover:visible">
            <span className="font-mono text-[11px] text-stone-600 truncate max-w-[160px] md:max-w-[260px]" title={node.path}>
              {node.path}
            </span>
            <button
              type="button"
              onClick={async () => {
                await navigator.clipboard.writeText(node.path);
                setToast("Copied path");
              }}
              className="text-[11px] text-stone-700 hover:text-stone-900 px-2 py-0.5 rounded border border-amber-300 bg-amber-50"
              title="Copy path"
            >
              Copy
            </button>
          </div>
        </div>
        {isBranch && isOpen && node.children && (
          <div>
            {node.children.map((c) => (
              <JsonTreeView key={c.path} node={c} depth={depth + 1} />
            ))}
          </div>
        )}
      </div>
    );
  }

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
    setShowAuthControls(false);
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

  // Open paste overlay and try auto-read from clipboard if permitted
  async function openPasteOverlayAndMaybeReadClipboard() {
    setIsPasteOverlayOpen(true);
    setPasteBuffer("");
    try {
      const text = await navigator.clipboard.readText();
      if (text && text.trim()) {
        setPasteBuffer(text.trim());
      }
    } catch {
      // Ignore permission errors; user can paste manually
    }
  }

  // Validate and apply pasted JSON
  function applyPastedJson() {
    const candidate = pasteBuffer.trim();
    if (!candidate) {
      setToast("Nothing to paste");
      return;
    }
    const data = parseJsonFlexible(candidate);
    if (data == null) {
      setToast("Invalid JSON");
      return;
    }
    setRawJson(JSON.stringify(data, null, 2));
    setToast("Pasted JSON");
    setIsPasteOverlayOpen(false);
  }

  // ----- JSON syntax-highlighted pretty view -----
  const levelColors = [
    "text-cyan-400",
    "text-pink-400",
    "text-amber-300",
    "text-lime-300",
    "text-indigo-300",
  ];

  function PrimitiveToken({ value }: { value: unknown }) {
    if (value === null) return <span className="text-purple-300">null</span>;
    switch (typeof value) {
      case "string":
        return <span className="text-emerald-300">"{value as string}"</span>;
      case "number":
        return <span className="text-amber-300">{String(value)}</span>;
      case "boolean":
        return <span className="text-purple-300">{String(value)}</span>;
      default:
        return <span className="text-zinc-300">{String(value)}</span>;
    }
  }

  function Punct({ ch, depth }: { ch: string; depth: number }) {
    const cls = levelColors[depth % levelColors.length];
    return <span className={cls}>{ch}</span>;
  }

  function JsonCode({ value, depth }: { value: unknown; depth: number }) {
    const indent = "  ".repeat(depth);
    if (Array.isArray(value)) {
      if (value.length === 0) return (
        <>
          <Punct ch="[" depth={depth} /><Punct ch="]" depth={depth} />
        </>
      );
      return (
        <>
          <Punct ch="[" depth={depth} />{"\n"}
          {value.map((v, i) => (
            <span key={i}>
              {indent}  <JsonCode value={v} depth={depth + 1} />{i < value.length - 1 ? <span className="text-zinc-400">,</span> : null}{"\n"}
            </span>
          ))}
          {indent}<Punct ch="]" depth={depth} />
        </>
      );
    }
    if (value !== null && typeof value === "object") {
      const entries = Object.entries(value as Record<string, unknown>);
      if (entries.length === 0) return (
        <>
          <Punct ch="{" depth={depth} /><Punct ch="}" depth={depth} />
        </>
      );
      return (
        <>
          <Punct ch="{" depth={depth} />{"\n"}
          {entries.map(([k, v], idx) => (
            <span key={k}>
              {indent}  <span className="text-sky-400">"{k}"</span><span className="text-zinc-400">: </span>
              <JsonCode value={v} depth={depth + 1} />{idx < entries.length - 1 ? <span className="text-zinc-400">,</span> : null}{"\n"}
            </span>
          ))}
          {indent}<Punct ch="}" depth={depth} />
        </>
      );
    }
    return <PrimitiveToken value={value} />;
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
              {/* Main 75/25 split with 24px gap */}
              <div className="grid grid-cols-1 md:[grid-template-columns:3fr_1fr] gap-6 items-start">
                {/* Left: inputs and token */}
                <div className="flex flex-col gap-3">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="flex flex-col gap-1">
                      <input
                        type="url"
                        placeholder="https://api.example.com (Domain)"
                        value={domain}
                        onChange={(e) => setDomain(e.target.value)}
                        className={`w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-0 focus:border-[0.8px] ${
                          domainInvalid ? "border-red-500 focus:border-red-500" : "border-zinc-300 focus:border-zinc-300"
                        }`}
                      />
                    </div>

                    <div className="flex flex-col gap-1">
                      <input
                        type="text"
                        placeholder="/v1/users (Endpoint)"
                        value={endpoint}
                        onChange={(e) => setEndpoint(e.target.value)}
                        className={`w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-0 focus:border-[0.8px] ${
                          endpointInvalid ? "border-red-500 focus:border-red-500" : "border-zinc-300 focus:border-zinc-300"
                        }`}
                      />
                    </div>
                  </div>

                  {/* Auth Token inline strip */}
                  {showAuthControls && (
                    <div className="rounded-md border border-zinc-700/60 bg-zinc-900 p-2 flex items-center gap-2">
                      <select
                        value={tokenType}
                        onChange={(e) =>
                          setTokenType(
                            e.target.value as
                              | "Bearer"
                              | "API Key"
                              | "Refresh Token"
                              | "Basic"
                              | "Custom Header"
                          )
                        }
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
                        className="flex-1 rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black"
                      />
                      <button
                        type="button"
                        onClick={() => setShowToken((v) => !v)}
                        className="shrink-0 rounded-md border border-zinc-300 px-2 py-2 text-xs hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-black"
                      >
                        {showToken ? "Hide" : "Show"}
                      </button>
                    </div>
                  )}
                </div>

                {/* Right: actions box (25%) */}
                <div className="hidden md:flex flex-col gap-2 rounded-lg border border-amber-300 bg-amber-50 p-2">
                  <button
                    type="button"
                    onClick={() => setShowAuthControls((v) => !v)}
                    className="w-full rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-medium text-stone-800 hover:bg-amber-100 hover:text-stone-900 focus:outline-none focus:ring-2 focus:ring-amber-300"
                  >
                    {showAuthControls ? "Hide token" : "Add token"}
                  </button>
                  <div className="mt-1 flex gap-2">
                    <button
                      onClick={onFetch}
                      disabled={isLoading}
                      className="w-full rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-medium text-stone-800 hover:bg-amber-100 hover:text-stone-900 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-amber-300"
                    >
                      {isLoading ? "Fetching..." : "Fetch"}
                    </button>
                    <button
                      onClick={onReset}
                      className="w-full rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-medium text-stone-800 hover:bg-amber-100 hover:text-stone-900 focus:outline-none focus:ring-2 focus:ring-amber-300"
                    >
                      Clear
                    </button>
                  </div>
                </div>
              </div>

              {/* Mobile actions box */}
              <div className="md:hidden rounded-lg border border-amber-300 bg-amber-50 p-2 flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => setShowAuthControls((v) => !v)}
                  className="w-full rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-medium text-stone-800 hover:bg-amber-100 hover:text-stone-900 focus:outline-none focus:ring-2 focus:ring-amber-300"
                >
                  {showAuthControls ? "Hide token" : "Add token"}
                </button>
                <div className="flex gap-2">
                  <button
                    onClick={onFetch}
                    disabled={isLoading}
                    className="w-full rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-medium text-stone-800 hover:bg-amber-100 hover:text-stone-900 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-amber-300"
                  >
                    {isLoading ? "Fetching..." : "Fetch"}
                  </button>
                  <button
                    onClick={onReset}
                    className="w-full rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-medium text-stone-800 hover:bg-amber-100 hover:text-stone-900 focus:outline-none focus:ring-2 focus:ring-amber-300"
                  >
                    Clear
                  </button>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                <div className="text-xs text-zinc-500">
                  URL: <span className="font-mono">{`{domain}{endpoint}`}</span> → <span className="font-mono">{composedUrl || "(empty)"}</span>
                  <span className="ml-2">Only GET supported for now.</span>
                </div>
                {/* Action buttons moved to the right-side box */}
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
              <div className="rounded-lg border border-slate-800 bg-slate-950 min-h-[360px] lg:min-h-[480px] flex flex-col shadow-sm relative">
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
                <div
                  className="flex-1 overflow-auto p-3 cursor-pointer"
                  onClick={openPasteOverlayAndMaybeReadClipboard}
                  title="Click to paste JSON"
                >
                  {isLoading ? (
                    <div className="flex items-center gap-2 text-zinc-300 text-xs">
                      <span className="inline-block h-3 w-3 rounded-full border-2 border-zinc-400 border-t-transparent animate-spin"></span>
                      Fetching…
                    </div>
                  ) : parsedObject ? (
                    <pre className="text-xs leading-relaxed whitespace-pre-wrap break-words text-zinc-50 font-mono">
                      <JsonCode value={parsedObject} depth={0} />
                    </pre>
                  ) : (
                    <p className="text-xs text-zinc-400">No response yet. Click Fetch to view API output.</p>
                  )}
                </div>

                {isPasteOverlayOpen && (
                  <div className="absolute inset-0 bg-slate-950/95 p-3 flex flex-col gap-2">
                    <label className="text-[11px] text-zinc-300">Paste JSON below, then press Ctrl+Enter or Apply</label>
                    <textarea
                      value={pasteBuffer}
                      onChange={(e) => setPasteBuffer(e.target.value)}
                      onKeyDown={(e) => {
                        if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                          e.preventDefault();
                          applyPastedJson();
                        }
                      }}
                      autoFocus
                      className="flex-1 w-full resize-none rounded-md border border-slate-800 bg-slate-900 text-zinc-100 text-xs font-mono p-3 outline-none focus:ring-0 focus:border-[0.8px] focus:border-slate-700"
                      placeholder="Paste JSON here"
                    />
                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setIsPasteOverlayOpen(false)}
                        className="rounded-md border border-slate-700 px-3 py-1.5 text-xs text-zinc-300 hover:bg-slate-800"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={applyPastedJson}
                        className="rounded-md bg-zinc-100 text-zinc-900 px-3 py-1.5 text-xs hover:bg-white"
                      >
                        Apply
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Path Detector - Vintage soft theme */}
              <div className="rounded-lg border border-amber-300 bg-amber-50 min-h-[360px] lg:min-h-[480px] flex flex-col shadow-sm">
                <div className="flex items-center justify-between gap-3 border-b border-amber-200 bg-amber-100 px-3 py-2 rounded-t-lg">
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
                      className="w-full rounded-md border border-amber-300 bg-white/90 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-300"
                    />
                    {pathSearch && (
                      <button
                        type="button"
                        onClick={() => setPathSearch("")}
                        className="text-xs text-stone-700 hover:underline"
                        title="Clear"
                      >
                        × Clear
                      </button>
                    )}
                  </div>
                </div>
                <div className="flex-1 overflow-auto px-3 pb-3">
                  {isLoading ? (
                    <div className="flex items-center gap-2 text-stone-700 text-xs">
                      <span className="inline-block h-3 w-3 rounded-full border-2 border-zinc-500 border-t-transparent animate-spin"></span>
                      Fetching…
                    </div>
                  ) : !parsedObject ? (
                    <p className="text-xs text-stone-600">No paths yet. Paths will appear once we fetch a valid JSON response.</p>
                  ) : !filteredTree ? (
                    <p className="text-xs text-stone-600">No paths match your search.</p>
                  ) : (
                    <div className="text-[12px] text-stone-800 font-mono">
                      <JsonTreeView node={filteredTree} depth={0} />
                    </div>
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


