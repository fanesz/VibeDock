import { useGitBranch } from "@stores/git";
import { useTerminals } from "@stores/terminals";
import { useWorkspace } from "@stores/workspace";
import { VscFolder, VscGitMerge, VscTerminal } from "react-icons/vsc";

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
