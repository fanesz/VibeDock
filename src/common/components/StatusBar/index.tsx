import useSWR from "swr";
import { useGitBranch } from "@stores/git";
import { useTerminals } from "@stores/terminals";
import { useWorkspace } from "@stores/workspace";
import { invoke } from "@tauri-apps/api/core";
import { VscFolder, VscGitMerge, VscPulse, VscTerminal } from "react-icons/vsc";

export default function StatusBar() {
  const activeProjectId = useWorkspace((s) => s.activeProjectId);
  const openCount = useWorkspace((s) => s.openProjectIds.length);
  const active = useWorkspace((s) => (s.activeProjectId ? s.projects[s.activeProjectId] : null));
  const termCount = useTerminals((s) =>
    activeProjectId ? (s.byProject[activeProjectId]?.length ?? 0) : 0
  );
  const branch = useGitBranch(active?.path);

  return (
    <footer className="flex h-6 shrink-0 items-center gap-4 border-t border-zinc-800 bg-zinc-950 px-3 text-[11px] text-zinc-500">
      {branch && (
        <span className="flex items-center gap-1 text-zinc-400">
          <VscGitMerge size={12} />
          {branch}
        </span>
      )}
      <span className="text-zinc-600">{openCount} open</span>
      {activeProjectId && (
        <span className="flex items-center gap-1 text-zinc-600">
          <VscTerminal size={12} />
          {termCount} {termCount === 1 ? "terminal" : "terminals"}
        </span>
      )}
      <ClaudeLimits />

      {active && (
        <span className="ml-auto flex min-w-0 items-center gap-1">
          <VscFolder size={12} />
          <span className="truncate" title={active.path}>
            {active.path}
          </span>
        </span>
      )}
      {!activeProjectId && <span className="ml-auto text-zinc-700">no project</span>}
    </footer>
  );
}

// --- Claude subscription limits (5h + weekly), account-wide ---

type LimitWindow = { utilization: number; resets_at: string | null };
type Limits = {
  five_hour: LimitWindow;
  seven_day: LimitWindow;
  seven_day_opus: LimitWindow | null;
  seven_day_sonnet: LimitWindow | null;
};

const pct = (n: number) => `${Math.round(n)}%`;
// Smooth green→yellow→orange→red ramp: hue 140 (green) down to 0 (red) as the
// window fills. Soft saturation/lightness so it doesn't glare on the dark bar.
const limitColor = (u: number) => `hsl(${(1 - Math.min(100, Math.max(0, u)) / 100) * 140} 65% 55%)`;

function resetLabel(iso: string | null): string {
  if (!iso) return "";
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "resetting…";
  const h = Math.floor(ms / 3.6e6);
  const m = Math.floor((ms % 3.6e6) / 6e4);
  const rel = h >= 24 ? `${Math.floor(h / 24)}d ${h % 24}h` : h >= 1 ? `${h}h ${m}m` : `${m}m`;
  return `resets in ${rel}`;
}

function ClaudeLimits() {
  const { data, error } = useSWR<Limits>("claude_limits", () => invoke<Limits>("claude_limits"), {
    refreshInterval: 60_000,
  });
  if (error || !data) return null; // stay quiet when signed out / offline

  const { five_hour: f, seven_day: w } = data;
  const worst = Math.max(f.utilization, w.utilization);

  return (
    <div className="group relative flex items-center">
      <span className="flex cursor-default items-center gap-1.5">
        <VscPulse size={12} style={{ color: limitColor(worst) }} />
        <span className="text-zinc-400">5h {pct(f.utilization)}</span>
        <span className="text-zinc-600">·</span>
        <span className="text-zinc-400">wk {pct(w.utilization)}</span>
      </span>

      {/* Hover card opens upward (status bar sits at the bottom). */}
      <div className="vd-pop pointer-events-none absolute bottom-full left-0 z-50 mb-1.5 hidden w-64 rounded-md border border-zinc-700 bg-zinc-900 p-3 shadow-xl group-hover:block">
        <div className="mb-2 text-[11px] font-semibold tracking-wide text-zinc-300">
          Claude usage limits
        </div>
        <LimitRow label="5-hour" w={f} />
        <LimitRow label="Weekly" w={w} />
        {data.seven_day_opus && <LimitRow label="Weekly · Opus" w={data.seven_day_opus} />}
        {data.seven_day_sonnet && <LimitRow label="Weekly · Sonnet" w={data.seven_day_sonnet} />}
      </div>
    </div>
  );
}

function LimitRow({ label, w }: { label: string; w: LimitWindow }) {
  return (
    <div className="mb-2.5 last:mb-0">
      <div className="mb-1 flex items-center justify-between text-[11px]">
        <span className="text-zinc-300">{label}</span>
        <span className="text-zinc-400">{pct(w.utilization)}</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-800">
        <div
          className="h-full rounded-full transition-all"
          style={{
            width: `${Math.min(100, Math.max(2, w.utilization))}%`,
            backgroundColor: limitColor(w.utilization),
          }}
        />
      </div>
      {w.resets_at && <div className="mt-1 text-[10px] text-zinc-500">{resetLabel(w.resets_at)}</div>}
    </div>
  );
}
