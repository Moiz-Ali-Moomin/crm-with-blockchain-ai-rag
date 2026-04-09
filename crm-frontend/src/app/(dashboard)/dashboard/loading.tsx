/**
 * Dashboard loading skeleton — mirrors page.tsx layout exactly.
 * Streams immediately while the async Server Component fetches data.
 */

function Shimmer({ className = '' }: { className?: string }) {
  return (
    <div className={`animate-pulse bg-gray-200 rounded-lg ${className}`} />
  );
}

export default function DashboardLoading() {
  return (
    <div className="space-y-6">
      {/* ── KPI row ─────────────────────────────────────────────────────────── */}
      <section>
        <Shimmer className="h-2.5 w-20 rounded-full mb-4" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="bg-white border border-gray-200 rounded-xl p-5 animate-pulse"
              style={{ animationDelay: `${i * 0.06}s` }}
            >
              {/* Header row */}
              <div className="flex items-center justify-between mb-4">
                <div className="h-2.5 w-20 bg-gray-200 rounded-full" />
                <div className="w-7 h-7 rounded-lg bg-gray-100" />
              </div>
              {/* Value */}
              <div className="h-8 w-28 bg-gray-200 rounded-md mb-3" />
              {/* Trend pill */}
              <div className="flex items-center gap-2">
                <div className="h-5 w-14 bg-gray-100 rounded-full" />
                <div className="h-2.5 w-16 bg-gray-100 rounded-full" />
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Charts + sidebar ─────────────────────────────────────────────────── */}
      <section>
        <div className="grid grid-cols-1 xl:grid-cols-10 gap-4">
          {/* Charts left */}
          <div className="xl:col-span-7">
            <div className="flex items-center justify-between mb-4">
              <Shimmer className="h-2.5 w-24 rounded-full" />
              <Shimmer className="h-2.5 w-16 rounded-full" />
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Revenue skeleton */}
              <div
                className="bg-white border border-gray-200 rounded-xl overflow-hidden animate-pulse"
                style={{ animationDelay: '0.2s' }}
              >
                {/* Card header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-gray-100" />
                    <div className="h-2.5 w-16 bg-gray-200 rounded-full" />
                  </div>
                  <div className="h-2 w-14 bg-gray-100 rounded-full" />
                </div>
                {/* Chart area */}
                <div className="px-4 pt-4 pb-5">
                  <div className="h-52 flex items-end gap-1.5">
                    {[55, 70, 45, 88, 60, 75, 50, 90, 65, 80, 48, 85].map((h, i) => (
                      <div
                        key={i}
                        className="flex-1 rounded-t-sm bg-blue-50"
                        style={{ height: `${h}%` }}
                      />
                    ))}
                  </div>
                </div>
              </div>

              {/* Pipeline skeleton */}
              <div
                className="bg-white border border-gray-200 rounded-xl overflow-hidden animate-pulse"
                style={{ animationDelay: '0.3s' }}
              >
                {/* Card header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-gray-100" />
                    <div className="h-2.5 w-20 bg-gray-200 rounded-full" />
                  </div>
                  <div className="h-2 w-16 bg-gray-100 rounded-full" />
                </div>
                {/* Bar rows */}
                <div className="px-4 pt-4 pb-5">
                  <div className="h-52 space-y-4 pt-2">
                    {[85, 65, 50, 35, 20].map((w, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <div className="h-2 w-20 bg-gray-100 rounded-full shrink-0" />
                        <div
                          className="h-5 bg-blue-50 rounded-r-sm"
                          style={{ width: `${w}%` }}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Right sidebar */}
          <div className="xl:col-span-3 space-y-4">
            <div className="flex items-center justify-between mb-4">
              <Shimmer className="h-2.5 w-12 rounded-full" />
              <Shimmer className="h-2.5 w-14 rounded-full" />
            </div>

            {/* Tasks skeleton */}
            <div
              className="bg-white border border-gray-200 rounded-xl overflow-hidden animate-pulse"
              style={{ animationDelay: '0.35s' }}
            >
              {/* Header */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-gray-100" />
                  <div className="h-2.5 w-24 bg-gray-200 rounded-full" />
                </div>
                <div className="h-4 w-5 bg-gray-100 rounded-full" />
              </div>
              {/* Rows */}
              <div className="divide-y divide-gray-100">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3 px-5 py-3">
                    <div className="w-4 h-4 rounded border border-gray-200 shrink-0" />
                    <div className="flex-1 space-y-1.5">
                      <div className="h-2.5 bg-gray-200 rounded-full w-4/5" />
                      <div className="h-2 bg-gray-100 rounded-full w-2/5" />
                    </div>
                    <div className="h-4 w-12 bg-gray-100 rounded-full" />
                  </div>
                ))}
              </div>
              {/* Footer */}
              <div className="px-5 py-3 border-t border-gray-100 bg-gray-50">
                <div className="h-2.5 w-20 bg-gray-200 rounded-full" />
              </div>
            </div>

            {/* Activity skeleton */}
            <div
              className="bg-white border border-gray-200 rounded-xl overflow-hidden animate-pulse"
              style={{ animationDelay: '0.44s' }}
            >
              {/* Header */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
                <div className="h-2.5 w-28 bg-gray-200 rounded-full" />
                <div className="h-2.5 w-10 bg-gray-100 rounded-full" />
              </div>
              {/* Feed rows */}
              <div className="divide-y divide-gray-50">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="flex gap-3 px-5 py-3">
                    <div className="w-6 h-6 rounded-full bg-gray-200 shrink-0" />
                    <div className="flex-1 space-y-1.5">
                      <div className="h-2.5 bg-gray-200 rounded-full w-full" />
                      <div className="h-2 bg-gray-100 rounded-full w-1/3" />
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
