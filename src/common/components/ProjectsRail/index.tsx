import { useEffect, useMemo, useState } from "react";
import type { Project } from "@types";
import { toast } from "sonner";
import { deriveRecents, useWorkspace } from "@stores/workspace";
import { invoke } from "@tauri-apps/api/core";
import { cn } from "@utils/cn";
import {
  VscClose,
  VscEdit,
  VscFileCode,
  VscFolder,
  VscFolderOpened,
  VscListSelection,
  VscNewFolder,
  VscTrash,
} from "react-icons/vsc";

type Ctx = { x: number; y: number; project: Project; recent: boolean };

export default function ProjectsRail() {
  const projects = useWorkspace((s) => s.projects);
  const openProjectIds = useWorkspace((s) => s.openProjectIds);
  const activeProjectId = useWorkspace((s) => s.activeProjectId);
  const openProjectDialog = useWorkspace((s) => s.openProjectDialog);
  const reopenProject = useWorkspace((s) => s.reopenProject);
  const activateProject = useWorkspace((s) => s.activateProject);
  const closeProject = useWorkspace((s) => s.closeProject);
  const moveProject = useWorkspace((s) => s.moveProject);
  const renameProject = useWorkspace((s) => s.renameProject);
  const removeRecent = useWorkspace((s) => s.removeRecent);

  const openProjects = useMemo(
    () => openProjectIds.map((id) => projects[id]).filter(Boolean),
    [openProjectIds, projects]
  );
  const recents = useMemo(
    () => deriveRecents(projects, openProjectIds),
    [projects, openProjectIds]
  );

  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [ctx, setCtx] = useState<Ctx | null>(null);

  const openCtx = (e: React.MouseEvent, project: Project, recent: boolean) => {
    e.preventDefault();
    setCtx({ x: e.clientX, y: e.clientY, project, recent });
  };

  return (
    <aside className="flex h-full w-60 shrink-0 flex-col border-r border-zinc-800 bg-zinc-950">
      <div className="flex items-center justify-between px-3 pt-3 pb-2">
        <span className="text-[11px] font-semibold tracking-widest text-zinc-500">PROJECTS</span>
        <button
          onClick={() => void openProjectDialog()}
          title="Open folder"
          className="rounded p-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
        >
          <VscNewFolder size={16} />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2">
        {openProjects.length === 0 && recents.length === 0 && (
          <p className="px-2 py-6 text-xs leading-relaxed text-zinc-600">
            No projects yet. Click the folder icon above to open one.
          </p>
        )}

        {openProjects.map((p, i) => {
          const active = p.id === activeProjectId;
          return (
            <div
              key={p.id}
              draggable={renamingId !== p.id}
              onDragStart={(e) => {
                setDragIndex(i);
                e.dataTransfer.effectAllowed = "move";
              }}
              onDragEnd={() => {
                setDragIndex(null);
                setDragOverIndex(null);
              }}
              onDragOver={(e) => {
                if (dragIndex === null) return;
                e.preventDefault();
                setDragOverIndex(i);
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (dragIndex !== null) moveProject(dragIndex, i);
                setDragIndex(null);
                setDragOverIndex(null);
              }}
              onClick={() => activateProject(p.id)}
              onContextMenu={(e) => openCtx(e, p, false)}
              className={cn(
                "group flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm",
                active ? "bg-zinc-800 text-zinc-100" : "text-zinc-300 hover:bg-zinc-900",
                dragOverIndex === i && dragIndex !== i && "ring-1 ring-sky-500"
              )}
            >
              {active ? (
                <VscFolderOpened className="shrink-0 text-sky-400" size={16} />
              ) : (
                <VscFolder className="shrink-0 text-zinc-500" size={16} />
              )}
              {renamingId === p.id ? (
                <input
                  autoFocus
                  defaultValue={p.name}
                  onClick={(e) => e.stopPropagation()}
                  onBlur={(e) => {
                    renameProject(p.id, e.target.value);
                    setRenamingId(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                    if (e.key === "Escape") setRenamingId(null);
                  }}
                  className="min-w-0 flex-1 rounded bg-zinc-950 px-1 text-sm text-zinc-100 outline-none ring-1 ring-sky-600"
                />
              ) : (
                <span
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    setRenamingId(p.id);
                  }}
                  title={p.path}
                  className="min-w-0 flex-1 truncate"
                >
                  {p.name}
                </span>
              )}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  closeProject(p.id);
                }}
                title="Close project"
                className="shrink-0 rounded p-0.5 text-zinc-500 opacity-0 hover:bg-zinc-700 hover:text-zinc-100 group-hover:opacity-100"
              >
                <VscClose size={14} />
              </button>
            </div>
          );
        })}

        {recents.length > 0 && (
          <div className="mt-4 px-2 pb-1 text-[11px] font-semibold tracking-widest text-zinc-600">
            RECENT
          </div>
        )}
        {recents.map((p) => (
          <div
            key={p.id}
            onClick={() => reopenProject(p.id)}
            onContextMenu={(e) => openCtx(e, p, true)}
            className="group flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm text-zinc-500 hover:bg-zinc-900 hover:text-zinc-300"
          >
            <VscFolder className="shrink-0" size={16} />
            <span title={p.path} className="min-w-0 flex-1 truncate">
              {p.name}
            </span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                removeRecent(p.id);
              }}
              title="Forget project"
              className="shrink-0 rounded p-0.5 opacity-0 hover:bg-zinc-700 hover:text-zinc-100 group-hover:opacity-100"
            >
              <VscTrash size={13} />
            </button>
          </div>
        ))}
      </div>

      {ctx && (
        <ProjectContextMenu
          ctx={ctx}
          onClose={() => setCtx(null)}
          onRename={() => setRenamingId(ctx.project.id)}
          onClose_={() => closeProject(ctx.project.id)}
          onForget={() => removeRecent(ctx.project.id)}
        />
      )}
    </aside>
  );
}

function ProjectContextMenu({
  ctx,
  onClose,
  onRename,
  onClose_,
  onForget,
}: {
  ctx: Ctx;
  onClose: () => void;
  onRename: () => void;
  onClose_: () => void;
  onForget: () => void;
}) {
  useEffect(() => {
    const close = () => onClose();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("mousedown", close);
    window.addEventListener("resize", close);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("resize", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const run = (fn: () => void) => {
    onClose();
    fn();
  };
  const path = ctx.project.path;

  return (
    <div
      className="vd-pop fixed z-50 w-48 overflow-hidden rounded-md border border-zinc-700 bg-zinc-900 py-1 shadow-xl"
      style={{ top: ctx.y, left: Math.min(ctx.x, window.innerWidth - 200) }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <Item
        icon={<VscFolderOpened size={14} />}
        label="Open folder"
        onClick={() => run(() => void invoke("open_in_explorer", { path }).catch((e) => toast.error(String(e))))}
      />
      <Item
        icon={<VscListSelection size={14} />}
        label="Reveal in Explorer"
        onClick={() => run(() => void invoke("reveal_in_explorer", { path }).catch((e) => toast.error(String(e))))}
      />
      <Item
        icon={<VscFileCode size={14} />}
        label="Open in VS Code"
        onClick={() => run(() => void invoke("open_in_vscode", { path }).catch((e) => toast.error(String(e))))}
      />
      {!ctx.recent && <Item icon={<VscEdit size={14} />} label="Rename" onClick={() => run(onRename)} />}
      <div className="my-1 border-t border-zinc-800" />
      {ctx.recent ? (
        <Item icon={<VscTrash size={14} />} label="Forget" danger onClick={() => run(onForget)} />
      ) : (
        <Item icon={<VscClose size={14} />} label="Close project" onClick={() => run(onClose_)} />
      )}
    </div>
  );
}

function Item({
  icon,
  label,
  danger,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  danger?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-zinc-800",
        danger ? "text-zinc-300 hover:text-red-400" : "text-zinc-300 hover:text-zinc-100"
      )}
    >
      <span className="shrink-0 text-zinc-500">{icon}</span>
      {label}
    </button>
  );
}
