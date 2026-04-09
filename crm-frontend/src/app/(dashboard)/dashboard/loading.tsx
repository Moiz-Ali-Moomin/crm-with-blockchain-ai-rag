/**
 * Dashboard loading skeleton — mirrors page.tsx layout exactly.
 * Streams immediately while the async Server Component fetches data.
 */

function Shimmer({ className = '' }: { className?: string }) {
  return (
    <div
      className={`animate-pulse bg-gray-700/40 rounded-lg ${className}`}
    />
  );
}

export default function DashboardLoading() {
  return (
    <div className="space-y-6">
      {/* ── KPI row ─────────────────────────────────────────────────────────── */}
      <section>
        <Shimmer className="h-3 w-20 rounded-full mb-3" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="bg-[#1f2937] border border-gray-700/60 rounded-xl p-5 animate-pulse"
              style={{ animationDelay: `${i * 0.06}s` }}
            >
              <div className="flex items-start justify-between mb-4">
                <div className="h-2.5 w-20 bg-gray-700/60 rounded-full" />
                <div className="w-8 h-8 rounded-lg bg-gray-700/60" />
              </div>
              <div className="h-7 w-24 bg-gray-700/60 rounded-md mb-3" />
              <div className="h-2.5 w-28 bg-gray-700/40 rounded-full" />
            </div>
          ))}
        </div>
      </section>

      {/* ── Charts + sidebar ─────────────────────────────────────────────────── */}
      <section>
        <div className="grid grid-cols-1 xl:grid-cols-10 gap-4">
          {/* Charts left */}
          <div className="xl:col-span-7">
            <Shimmer className="h-3 w-24 rounded-full mb-3" />
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Revenue skeleton */}
              <div
                className="bg-[#1f2937] border border-gray-700/60 rounded-xl p-5 animate-pulse"
                style={{ animationDelay: '0.25s' }}
              >
                <div className="flex items-center justify-between mb-5">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-gray-700/60" />
                    <div className="h-2.5 w-16 bg-gray-700/60 rounded-full" />
                  </div>
                  <div className="h-2 w-14 bg-gray-700/40 rounded-full" />
                </div>
                <div className="h-52 flex items-end gap-1.5">
                  {[55, 70, 45, 88, 60, 75, 50, 90, 65, 80, 48, 85].map((h, i) => (
                    <div
                      key={i}
                      className="flex-1 rounded-t-sm bg-blue-500/10"
                      style={{ height: `${h}%` }}
                    />
                  ))}
                </div>
              </div>

              {/* Pipeline skeleton */}
              <div
                className="bg-[#1f2937] border border-gray-700/60 rounded-xl p-5 animate-pulse"
                style={{ animationDelay: '0.35s' }}
              >
                <div className="flex items-center gap-2 mb-5">
                  <div className="w-7 h-7 rounded-lg bg-gray-700/60" />
                  <div className="h-2.5 w-20 bg-gray-700/60 rounded-full" />
                </div>
                <div className="h-52 space-y-3 pt-2">
                  {[85, 65, 50, 35, 20].map((w, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <div className="h-2 w-16 bg-gray-700/40 rounded-full" />
                      <div
                        className="h-6 bg-blue-500/10 rounded-sm"
                        style={{ width: `${w}%` }}
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Right sidebar */}
          <div className="xl:col-span-3 space-y-4">
            <Shimmer className="h-3 w-12 rounded-full mb-3" />

            {/* Tasks skeleton */}
            <div
              className="bg-[#1f2937] border border-gray-700/60 rounded-xl p-5 animate-pulse"
              style={{ animationDelay: '0.4s' }}
            >
              <div className="flex items-center justify-between mb-4">
                <div className="h-3 w-28 bg-gray-700/60 rounded-full" />
                <div className="h-4 w-5 bg-gray-700/40 rounded-full" />
              </div>
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3 py-1">
                    <div className="w-4 h-4 rounded border border-gray-700" />
                    <div className="flex-1 space-y-1.5">
                      <div className="h-2.5 bg-gray-700/60 rounded-full w-4/5" />
                      <div className="h-2 bg-gray-700/40 rounded-full w-2/5" />
                    </div>
                    <div className="h-4 w-10 bg-gray-700/40 rounded" />
                  </div>
                ))}
              </div>
            </div>

            {/* Activity skeleton */}
            <div
              className="bg-[#1f2937] border border-gray-700/60 rounded-xl p-5 animate-pulse"
              style={{ animationDelay: '0.48s' }}
            >
              <div className="h-3 w-28 bg-gray-700/60 rounded-full mb-4" />
              <div className="space-y-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="flex gap-3">
                    <div className="w-2 h-2 rounded-full bg-gray-700 mt-1.5 shrink-0" />
                    <div className="flex-1 space-y-1.5">
                      <div className="h-2.5 bg-gray-700/60 rounded-full w-full" />
                      <div className="h-2 bg-gray-700/40 rounded-full w-1/3" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
