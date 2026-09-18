import ProjectTerminals from "@components/ProjectTerminals";
import { useWorkspace } from "@stores/workspace";
import { cn } from "@utils/cn";

// Renders every OPEN project's terminals, showing only the active one. Inactive
// projects stay mounted (hidden) so their live terminals keep running and their
// scrollback survives a project switch.
export default function TerminalsLayer({ shown }: { shown: boolean }) {
  const openProjectIds = useWorkspace((s) => s.openProjectIds);
  const activeProjectId = useWorkspace((s) => s.activeProjectId);
  const projects = useWorkspace((s) => s.projects);

  return (
    <div className="relative h-full w-full">
      {openProjectIds.map((pid) => {
        const p = projects[pid];
        if (!p) return null;
        return (
          <div
            key={pid}
            className={cn("absolute inset-0", pid === activeProjectId ? "block" : "hidden")}
          >
            <ProjectTerminals projectId={pid} cwd={p.path} active={shown && pid === activeProjectId} />
          </div>
        );
      })}
    </div>
  );
}
