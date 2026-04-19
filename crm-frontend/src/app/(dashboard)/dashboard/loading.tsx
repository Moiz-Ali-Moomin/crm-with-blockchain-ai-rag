function Shimmer({ className = '' }: { className?: string }) {
  return (
    <div className={`animate-pulse bg-shimmer rounded-lg ${className}`} />
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
              className="bg-canvas border border-ui-border rounded-xl p-5 animate-pulse"
              style={{ animationDelay: `${i * 0.06}s` }}
            >
              <div className="flex items-center justify-between mb-4">
                <div className="h-2.5 w-20 bg-shimmer rounded-full" />
                <div className="w-7 h-7 rounded-lg bg-shimmer-subtle" />
              </div>
              <div className="h-8 w-28 bg-shimmer rounded-md mb-3" />
              <div className="flex items-center gap-2">
                <div className="h-5 w-14 bg-shimmer-subtle rounded-full" />
                <div className="h-2.5 w-16 bg-shimmer-subtle rounded-full" />
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
                className="bg-canvas border border-ui-border rounded-xl overflow-hidden animate-pulse"
                style={{ animationDelay: '0.2s' }}
              >
                <div className="flex items-center justify-between px-5 py-4 border-b border-ui-border-subtle">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-shimmer-subtle" />
                    <div className="h-2.5 w-16 bg-shimmer rounded-full" />
                  </div>
                  <div className="h-2 w-14 bg-shimmer-subtle rounded-full" />
                </div>
                <div className="px-4 pt-4 pb-5">
                  <div className="h-52 flex items-end gap-1.5">
                    {[55, 70, 45, 88, 60, 75, 50, 90, 65, 80, 48, 85].map((h, i) => (
                      <div
                        key={i}
                        className="flex-1 rounded-t-sm bg-blue-50 dark:bg-blue-900/20"
                        style={{ height: `${h}%` }}
                      />
                    ))}
                  </div>
                </div>
              </div>

              {/* Pipeline skeleton */}
              <div
                className="bg-canvas border border-ui-border rounded-xl overflow-hidden animate-pulse"
                style={{ animationDelay: '0.3s' }}
              >
                <div className="flex items-center justify-between px-5 py-4 border-b border-ui-border-subtle">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-shimmer-subtle" />
                    <div className="h-2.5 w-20 bg-shimmer rounded-full" />
                  </div>
                  <div className="h-2 w-16 bg-shimmer-subtle rounded-full" />
                </div>
                <div className="px-4 pt-4 pb-5">
                  <div className="h-52 space-y-4 pt-2">
                    {[85, 65, 50, 35, 20].map((w, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <div className="h-2 w-20 bg-shimmer-subtle rounded-full shrink-0" />
                        <div
                          className="h-5 bg-blue-50 dark:bg-blue-900/20 rounded-r-sm"
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
              className="bg-canvas border border-ui-border rounded-xl overflow-hidden animate-pulse"
              style={{ animationDelay: '0.35s' }}
            >
              <div className="flex items-center justify-between px-5 py-4 border-b border-ui-border-subtle">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-shimmer-subtle" />
                  <div className="h-2.5 w-24 bg-shimmer rounded-full" />
                </div>
                <div className="h-4 w-5 bg-shimmer-subtle rounded-full" />
              </div>
              <div className="divide-y divide-ui-border-subtle">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3 px-5 py-3">
                    <div className="w-4 h-4 rounded border border-ui-border shrink-0" />
                    <div className="flex-1 space-y-1.5">
                      <div className="h-2.5 bg-shimmer rounded-full w-4/5" />
                      <div className="h-2 bg-shimmer-subtle rounded-full w-2/5" />
                    </div>
                    <div className="h-4 w-12 bg-shimmer-subtle rounded-full" />
                  </div>
                ))}
              </div>
              <div className="px-5 py-3 border-t border-ui-border-subtle bg-canvas-subtle">
                <div className="h-2.5 w-20 bg-shimmer rounded-full" />
              </div>
            </div>

            {/* Activity skeleton */}
            <div
              className="bg-canvas border border-ui-border rounded-xl overflow-hidden animate-pulse"
              style={{ animationDelay: '0.44s' }}
            >
              <div className="flex items-center justify-between px-5 py-4 border-b border-ui-border-subtle">
                <div className="h-2.5 w-28 bg-shimmer rounded-full" />
                <div className="h-2.5 w-10 bg-shimmer-subtle rounded-full" />
              </div>
              <div className="divide-y divide-ui-border-subtle">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="flex gap-3 px-5 py-3">
                    <div className="w-6 h-6 rounded-full bg-shimmer shrink-0" />
                    <div className="flex-1 space-y-1.5">
                      <div className="h-2.5 bg-shimmer rounded-full w-full" />
                      <div className="h-2 bg-shimmer-subtle rounded-full w-1/3" />
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
