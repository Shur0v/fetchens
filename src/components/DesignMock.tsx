export default function DesignMock() {
  return (
    <div className="min-h-screen">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <header className="border-b border-zinc-200 px-4 py-4 md:px-8 md:py-5">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-xl md:text-2xl font-semibold tracking-tight">API Response Explorer</h1>
              <p className="text-xs md:text-sm text-zinc-500 mt-1">Fetch. Preview. Copy JSON paths.</p>
            </div>
          </div>
        </header>

        {/* Content */}
        <div className="py-6 px-4 md:py-10 md:px-8">
          {/* ControlsBar */}
          <section className="flex flex-col gap-6 md:gap-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs text-zinc-600">Domain</label>
                <input
                  type="url"
                  defaultValue="https://jsonplaceholder.typicode.com"
                  placeholder="https://backend.example.com"
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-700 focus:outline-none focus:ring-2 focus:ring-black"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-zinc-600">Endpoint</label>
                <input
                  type="text"
                  defaultValue="/users"
                  placeholder="/api/users"
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-700 focus:outline-none focus:ring-2 focus:ring-black"
                />
              </div>
            </div>

            {/* Auth Token full row */}
            <div className="flex flex-col gap-1">
              <label className="text-xs text-zinc-600">Auth Token (optional)</label>
              <div className="flex items-center gap-2">
                <select className="rounded-lg border border-zinc-300 bg-white px-2 py-2 text-xs text-zinc-700 focus:outline-none focus:ring-2 focus:ring-black">
                  <option>Bearer</option>
                  <option>API Key</option>
                </select>
                <input
                  type="password"
                  defaultValue="••••••••"
                  placeholder="••••••••"
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-700 focus:outline-none focus:ring-2 focus:ring-black"
                />
                <button className="shrink-0 rounded-lg border border-zinc-300 px-3 py-2 text-xs text-zinc-700 hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-black">Show</button>
              </div>
            </div>

            {/* Compose URL helper */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-2">
              <div className="text-xs text-zinc-500">
                URL: <span className="font-mono">{`{domain}{endpoint}`}</span>
              </div>
              <div className="sm:ml-auto flex gap-2">
                <button className="rounded-lg bg-black text-white px-4 py-2 text-sm hover:bg-zinc-800 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-black">Fetch</button>
                <button className="rounded-lg border border-zinc-300 px-4 py-2 text-sm text-zinc-700 hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-black">Reset</button>
              </div>
            </div>

            {/* Optional Stats strip (after load) */}
            <div className="hidden md:flex items-center gap-3 text-xs text-zinc-600">
              <span className="rounded-lg border border-zinc-200 bg-white px-2 py-1">Status: 200</span>
              <span className="rounded-lg border border-zinc-200 bg-white px-2 py-1">Time: 182 ms</span>
              <span className="rounded-lg border border-zinc-200 bg-white px-2 py-1">Size: 3.2 KB</span>
            </div>

            {/* Alert (error banner) */}
            {/*
            <div className="rounded-lg border border-red-200 bg-red-50 text-red-700 px-3 py-2 text-xs">
              Unauthorized (401). Try again.
            </div>
            */}

            {/* ResultsGrid */}
            <section className="grid grid-cols-1 gap-6 md:gap-8 lg:grid-cols-2">
              {/* ApiPreviewPanel */}
              <div className="rounded-lg border border-slate-800 bg-slate-950 min-h-[360px] lg:min-h-[480px] flex flex-col shadow-sm">
                <div className="flex items-center justify-between gap-3 border-b border-slate-800 bg-slate-900/60 px-3 py-2 rounded-t-lg">
                  <h3 className="text-xs font-medium text-zinc-200">Raw Response</h3>
                  <div className="flex items-center gap-2">
                    <button className="text-[11px] text-zinc-300 hover:text-white px-2 py-1 rounded-lg border border-slate-800 hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-black">Copy</button>
                    <button className="text-[11px] text-zinc-300 hover:text-white px-2 py-1 rounded-lg border border-slate-800 hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-black">Download</button>
                  </div>
                </div>
                <div className="flex-1 overflow-auto p-3">
                  {/* Loaded state sample */}
                  <pre className="text-sm leading-relaxed whitespace-pre-wrap break-words text-zinc-50 font-mono">{
`{
  "users": [
    { "id": 1, "name": "Leanne Graham" },
    { "id": 2, "name": "Ervin Howell" }
  ]
}`}
                  </pre>

                  {/* Empty state */}
                  {/* <p className="text-xs text-zinc-400">No response yet. Click Fetch to view API output.</p> */}

                  {/* Loading state */}
                  {/* <div className="flex items-center gap-2 text-zinc-300 text-xs"><span className="inline-block h-3 w-3 rounded-full border-2 border-zinc-400 border-t-transparent animate-spin"></span>Fetching…</div> */}
                </div>
              </div>

              {/* PathDetectorPanel */}
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
                      className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-700 focus:outline-none focus:ring-2 focus:ring-black"
                    />
                    <button className="text-xs text-zinc-600 hover:underline">× Clear</button>
                  </div>
                </div>
                <div className="flex-1 overflow-auto px-3 pb-3">
                  {/* Loaded list */}
                  <ul className="text-[12px] text-zinc-800 font-mono space-y-1">
                    <li className="group flex items-center justify-between gap-2 rounded-lg px-2 py-1 hover:bg-zinc-100">
                      <span className="break-words">data.users[0].id</span>
                      <button className="invisible group-hover:visible text-[11px] text-zinc-600 hover:text-zinc-800 px-2 py-0.5 rounded-lg border border-zinc-300 bg-white focus:outline-none focus:ring-2 focus:ring-black">Copy</button>
                    </li>
                    <li className="group flex items-center justify-between gap-2 rounded-lg px-2 py-1 hover:bg-zinc-100">
                      <span className="break-words">data.users[0].name</span>
                      <button className="invisible group-hover:visible text-[11px] text-zinc-600 hover:text-zinc-800 px-2 py-0.5 rounded-lg border border-zinc-300 bg-white focus:outline-none focus:ring-2 focus:ring-black">Copy</button>
                    </li>
                    <li className="group flex items-center justify-between gap-2 rounded-lg px-2 py-1 hover:bg-zinc-100">
                      <span className="break-words">data.users[1].id</span>
                      <button className="invisible group-hover:visible text-[11px] text-zinc-600 hover:text-zinc-800 px-2 py-0.5 rounded-lg border border-zinc-300 bg-white focus:outline-none focus:ring-2 focus:ring-black">Copy</button>
                    </li>
                    <li className="group flex items-center justify-between gap-2 rounded-lg px-2 py-1 hover:bg-zinc-100">
                      <span className="break-words">data.users[1].name</span>
                      <button className="invisible group-hover:visible text-[11px] text-zinc-600 hover:text-zinc-800 px-2 py-0.5 rounded-lg border border-zinc-300 bg-white focus:outline-none focus:ring-2 focus:ring-black">Copy</button>
                    </li>
                  </ul>

                  {/* Empty list */}
                  {/* <p className="text-xs text-zinc-500">No paths yet. Paths will appear once we fetch a valid JSON response.</p> */}

                  {/* Loading list */}
                  {/* <div className="flex items-center gap-2 text-zinc-600 text-xs"><span className="inline-block h-3 w-3 rounded-full border-2 border-zinc-500 border-t-transparent animate-spin"></span>Fetching…</div> */}
                </div>
              </div>
            </section>
          </section>

          {/* Toast example (design only) */}
          {/* <div className="fixed bottom-4 right-4 left-4 md:left-auto z-50"><div className="mx-auto w-max md:mx-0 rounded-lg bg-black text-white text-xs px-3 py-2 shadow-lg">Copied!</div></div> */}
        </div>
      </div>
    </div>
  );
}


