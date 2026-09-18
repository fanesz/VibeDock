import { useEffect, useState } from "react";
import type { CommandSet, CustomCommand, Project, ShellKind } from "@types";
import { useTerminals } from "@stores/terminals";
import { useUI } from "@stores/ui";
import { useWorkspace } from "@stores/workspace";
import { cn } from "@utils/cn";
import {
  VscAdd,
  VscClose,
  VscEdit,
  VscGlobe,
  VscPlay,
  VscRootFolder,
  VscRunAll,
  VscTrash,
} from "react-icons/vsc";

const SHELLS: ShellKind[] = ["powershell", "cmd", "gitbash"];
type Scope = "global" | "project";
type Draft = { name: string; command: string; shell: ShellKind };
const EMPTY_DRAFT: Draft = { name: "", command: "", shell: "powershell" };

// null = closed; otherwise an add (no id) or edit (id + original scope) session.
type Editor = { scope: Scope; id?: string; origScope?: Scope };

export default function CommandsView({ project }: { project: Project }) {
  const globalCommands = useWorkspace((s) => s.globalCommands);
  const addCommand = useWorkspace((s) => s.addCommand);
  const updateCommand = useWorkspace((s) => s.updateCommand);
  const deleteCommand = useWorkspace((s) => s.deleteCommand);
  const addGlobalCommand = useWorkspace((s) => s.addGlobalCommand);
  const updateGlobalCommand = useWorkspace((s) => s.updateGlobalCommand);
  const deleteGlobalCommand = useWorkspace((s) => s.deleteGlobalCommand);
  const addCommandSet = useWorkspace((s) => s.addCommandSet);
  const updateCommandSet = useWorkspace((s) => s.updateCommandSet);
  const deleteCommandSet = useWorkspace((s) => s.deleteCommandSet);
  const addTerminal = useTerminals((s) => s.addTerminal);
  const setView = useUI((s) => s.setView);

  const projectCommands = project.customCommands ?? [];
  const commandSets = project.commandSets ?? [];
  const [editor, setEditor] = useState<Editor | null>(null);
  const [setEditorId, setSetEditorId] = useState<{ id?: string } | null>(null);

  // Commands always run in the project root (put a `cd` in the command for a subfolder).
  const run = (cmd: CustomCommand) => {
    addTerminal(project.id, project.path, { shell: cmd.shell, command: cmd.command });
    setView("terminals");
  };

  // A set opens one terminal per command at once (each its own tab).
  const runSet = (s: CommandSet) => {
    const cmds = s.commands.map((c) => c.trim()).filter(Boolean);
    if (cmds.length === 0) return;
    // If the project has just one untouched default terminal (never ran a command,
    // still named "Terminal N"), drop it so the set doesn't leave a blank tab behind.
    const ts = useTerminals.getState();
    const ids = ts.byProject[project.id] ?? [];
    if (ids.length === 1) {
      const t = ts.terminals[ids[0]];
      if (t && t.command == null && /^Terminal \d+$/.test(t.name)) ts.closeTerminal(ids[0]);
    }
    cmds.forEach((command) => addTerminal(project.id, project.path, { shell: s.shell, command }));
    setView("terminals");
  };

  const saveSet = (draft: { name: string; commands: string[]; shell: ShellKind }) => {
    const payload = {
      name: draft.name.trim(),
      commands: draft.commands.map((c) => c.trim()).filter(Boolean),
      shell: draft.shell,
    };
    if (!payload.name || payload.commands.length === 0) return;
    if (setEditorId?.id) updateCommandSet(project.id, { ...payload, id: setEditorId.id });
    else addCommandSet(project.id, payload);
    setSetEditorId(null);
  };

  const save = (scope: Scope, draft: Draft) => {
    const payload = { name: draft.name.trim(), command: draft.command.trim(), shell: draft.shell };
    if (!payload.name || !payload.command) return;
    if (editor?.id && scope === editor.origScope) {
      const cmd = { ...payload, id: editor.id };
      if (scope === "global") updateGlobalCommand(cmd);
      else updateCommand(project.id, cmd);
    } else {
      // New, or an edit that changed scope → drop from old scope, add to new.
      if (editor?.id) {
        if (editor.origScope === "global") deleteGlobalCommand(editor.id);
        else deleteCommand(project.id, editor.id);
      }
      if (scope === "global") addGlobalCommand(payload);
      else addCommand(project.id, payload);
    }
    setEditor(null);
  };

  return (
    <div className="mx-auto flex h-full max-w-2xl flex-col gap-4 overflow-y-auto p-6">
      <h1 className="text-lg font-semibold text-zinc-200">Custom Commands</h1>

      {/* Command sets — launch several terminals at once (per project). */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-1.5 text-[11px] font-semibold tracking-widest text-zinc-500 uppercase">
          <VscRunAll size={13} />
          Command Sets
          <span className="font-normal normal-case tracking-normal text-zinc-600">
            · open multiple terminals at once
          </span>
          <button
            onClick={() => setSetEditorId({})}
            title="Add command set"
            className="ml-auto flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-normal normal-case tracking-normal text-sky-500 hover:bg-zinc-800"
          >
            <VscAdd size={12} /> New
          </button>
        </div>
        {commandSets.length === 0 && (
          <p className="text-sm text-zinc-600">
            No sets yet. Create one to launch e.g. backend + frontend + db in one click.
          </p>
        )}
        {commandSets.map((s) => (
          <div
            key={s.id}
            className="group flex items-center gap-3 rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2"
          >
            <button
              onClick={() => runSet(s)}
              title={`Open ${s.commands.length} terminal${s.commands.length > 1 ? "s" : ""}`}
              className="rounded p-1 text-emerald-500 hover:bg-zinc-800"
            >
              <VscRunAll size={16} />
            </button>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-zinc-200">{s.name}</div>
              <div className="truncate text-xs text-zinc-500">
                {s.commands.length} command{s.commands.length > 1 ? "s" : ""} · {s.commands.join("  ·  ")}
              </div>
            </div>
            <button
              onClick={() => setSetEditorId({ id: s.id })}
              className="rounded p-1 text-zinc-500 opacity-0 hover:bg-zinc-800 hover:text-zinc-200 group-hover:opacity-100"
            >
              <VscEdit size={14} />
            </button>
            <button
              onClick={() => deleteCommandSet(project.id, s.id)}
              className="rounded p-1 text-zinc-500 opacity-0 hover:bg-zinc-800 hover:text-red-400 group-hover:opacity-100"
            >
              <VscTrash size={14} />
            </button>
          </div>
        ))}
      </div>

      <Section
        icon={<VscGlobe size={13} />}
        title="Global"
        hint="shown in every project"
        commands={globalCommands}
        emptyText="No global commands yet."
        onAdd={() => setEditor({ scope: "global" })}
        onRun={run}
        onEdit={(c) => setEditor({ scope: "global", id: c.id, origScope: "global" })}
        onDelete={(id) => deleteGlobalCommand(id)}
      />

      <Section
        icon={<VscRootFolder size={13} />}
        title={project.name}
        hint="only this project"
        commands={projectCommands}
        emptyText="No project commands yet."
        onAdd={() => setEditor({ scope: "project" })}
        onRun={run}
        onEdit={(c) => setEditor({ scope: "project", id: c.id, origScope: "project" })}
        onDelete={(id) => deleteCommand(project.id, id)}
      />

      {editor && (
        <CommandModal
          editor={editor}
          initial={
            editor.id
              ? (editor.origScope === "global" ? globalCommands : projectCommands).find(
                (c) => c.id === editor.id
              )
              : undefined
          }
          projectName={project.name}
          onCancel={() => setEditor(null)}
          onSave={save}
        />
      )}

      {setEditorId && (
        <SetModal
          initial={setEditorId.id ? commandSets.find((s) => s.id === setEditorId.id) : undefined}
          onCancel={() => setSetEditorId(null)}
          onSave={saveSet}
        />
      )}
    </div>
  );
}

function SetModal({
  initial,
  onCancel,
  onSave,
}: {
  initial?: CommandSet;
  onCancel: () => void;
  onSave: (draft: { name: string; commands: string[]; shell: ShellKind }) => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [shell, setShell] = useState<ShellKind>(initial?.shell ?? "powershell");
  // Always keep a trailing blank row to type into.
  const [commands, setCommands] = useState<string[]>([...(initial?.commands ?? []), ""]);
  const isEdit = !!initial;
  const filled = commands.map((c) => c.trim()).filter(Boolean);
  const valid = name.trim() && filled.length > 0;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  const setAt = (i: number, v: string) =>
    setCommands((prev) => {
      const next = prev.slice();
      next[i] = v;
      // Grow a fresh blank row when the last one is used.
      if (i === next.length - 1 && v.trim()) next.push("");
      return next;
    });
  const removeAt = (i: number) =>
    setCommands((prev) => (prev.length <= 1 ? prev : prev.filter((_, j) => j !== i)));

  return (
    <div className="vd-fade fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onCancel}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="vd-scale-in flex max-h-[85vh] w-full max-w-md flex-col rounded-lg border border-zinc-700 bg-zinc-900 shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
          <h2 className="text-sm font-semibold text-zinc-100">
            {isEdit ? "Edit command set" : "New command set"}
          </h2>
          <button onClick={onCancel} className="rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200">
            <VscClose size={16} />
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
          <Field label="Name">
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Dev stack"
              className="w-full rounded bg-zinc-950 px-2 py-1.5 text-sm text-zinc-100 outline-none ring-1 ring-zinc-800 focus:ring-sky-700"
            />
          </Field>

          <Field label="Commands — one terminal each">
            <div className="flex flex-col gap-1.5">
              {commands.map((c, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <span className="w-4 shrink-0 text-right text-xs text-zinc-600">{i + 1}</span>
                  <input
                    value={c}
                    onChange={(e) => setAt(i, e.target.value)}
                    placeholder="cd backend && bun run dev"
                    className="w-full rounded bg-zinc-950 px-2 py-1.5 font-mono text-sm text-zinc-100 outline-none ring-1 ring-zinc-800 focus:ring-sky-700"
                  />
                  <button
                    onClick={() => removeAt(i)}
                    disabled={commands.length <= 1}
                    className="shrink-0 rounded p-1 text-zinc-600 hover:bg-zinc-800 hover:text-red-400 disabled:opacity-30"
                  >
                    <VscClose size={14} />
                  </button>
                </div>
              ))}
            </div>
          </Field>

          <Field label="Shell">
            <select
              value={shell}
              onChange={(e) => setShell(e.target.value as ShellKind)}
              className="w-full rounded bg-zinc-950 px-2 py-1.5 text-sm text-zinc-200 outline-none ring-1 ring-zinc-800"
            >
              {SHELLS.map((sh) => (
                <option key={sh} value={sh}>
                  {sh}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <div className="flex items-center justify-between border-t border-zinc-800 px-4 py-3">
          <span className="text-xs text-zinc-600">
            Opens {filled.length} terminal{filled.length === 1 ? "" : "s"}
          </span>
          <div className="flex gap-2">
            <button onClick={onCancel} className="rounded px-3 py-1.5 text-sm text-zinc-400 hover:bg-zinc-800">
              Cancel
            </button>
            <button
              disabled={!valid}
              onClick={() => onSave({ name, commands, shell })}
              className={cn(
                "rounded px-3 py-1.5 text-sm font-medium text-white",
                valid ? "bg-sky-600 hover:bg-sky-500" : "cursor-not-allowed bg-zinc-800 text-zinc-500"
              )}
            >
              {isEdit ? "Save" : "Create"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function CommandModal({
  editor,
  initial,
  projectName,
  onCancel,
  onSave,
}: {
  editor: Editor;
  initial?: CustomCommand;
  projectName: string;
  onCancel: () => void;
  onSave: (scope: Scope, draft: Draft) => void;
}) {
  const [scope, setScope] = useState<Scope>(editor.scope);
  const [draft, setDraft] = useState<Draft>(
    initial
      ? { name: initial.name, command: initial.command, shell: initial.shell ?? "powershell" }
      : EMPTY_DRAFT
  );
  const isEdit = !!editor.id;
  const valid = draft.name.trim() && draft.command.trim();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && valid) onSave(scope, draft);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel, onSave, scope, draft, valid]);

  return (
    <div
      className="vd-fade fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onCancel}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="vd-scale-in w-full max-w-md rounded-lg border border-zinc-700 bg-zinc-900 shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
          <h2 className="text-sm font-semibold text-zinc-100">
            {isEdit ? "Edit command" : "New command"}
          </h2>
          <button onClick={onCancel} className="rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200">
            <VscClose size={16} />
          </button>
        </div>

        <div className="flex flex-col gap-3 p-4">
          <Field label="Scope">
            <div className="flex overflow-hidden rounded ring-1 ring-zinc-800">
              {(["global", "project"] as Scope[]).map((sc) => (
                <button
                  key={sc}
                  onClick={() => setScope(sc)}
                  className={cn(
                    "flex-1 px-3 py-1.5 text-xs",
                    scope === sc ? "bg-sky-600 text-white" : "text-zinc-400 hover:bg-zinc-800"
                  )}
                >
                  {sc === "project" ? projectName : "Global"}
                </button>
              ))}
            </div>
          </Field>

          <Field label="Name">
            <input
              autoFocus
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              placeholder="Backend"
              className="w-full rounded bg-zinc-950 px-2 py-1.5 text-sm text-zinc-100 outline-none ring-1 ring-zinc-800 focus:ring-sky-700"
            />
          </Field>

          <Field label="Command">
            <input
              value={draft.command}
              onChange={(e) => setDraft({ ...draft, command: e.target.value })}
              placeholder="bun run dev"
              className="w-full rounded bg-zinc-950 px-2 py-1.5 font-mono text-sm text-zinc-100 outline-none ring-1 ring-zinc-800 focus:ring-sky-700"
            />
          </Field>

          <Field label="Shell">
            <select
              value={draft.shell}
              onChange={(e) => setDraft({ ...draft, shell: e.target.value as ShellKind })}
              className="w-full rounded bg-zinc-950 px-2 py-1.5 text-sm text-zinc-200 outline-none ring-1 ring-zinc-800"
            >
              {SHELLS.map((sh) => (
                <option key={sh} value={sh}>
                  {sh}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <div className="flex justify-end gap-2 border-t border-zinc-800 px-4 py-3">
          <button onClick={onCancel} className="rounded px-3 py-1.5 text-sm text-zinc-400 hover:bg-zinc-800">
            Cancel
          </button>
          <button
            disabled={!valid}
            onClick={() => onSave(scope, draft)}
            className={cn(
              "rounded px-3 py-1.5 text-sm font-medium text-white",
              valid ? "bg-sky-600 hover:bg-sky-500" : "cursor-not-allowed bg-zinc-800 text-zinc-500"
            )}
          >
            {isEdit ? "Save" : "Add"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] font-semibold tracking-wide text-zinc-500 uppercase">{label}</span>
      {children}
    </label>
  );
}

function Section({
  icon,
  title,
  hint,
  commands,
  emptyText,
  onAdd,
  onRun,
  onEdit,
  onDelete,
}: {
  icon: React.ReactNode;
  title: string;
  hint: string;
  commands: CustomCommand[];
  emptyText: string;
  onAdd: () => void;
  onRun: (cmd: CustomCommand) => void;
  onEdit: (cmd: CustomCommand) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold tracking-widest text-zinc-500 uppercase">
        {icon}
        {title}
        <span className="font-normal normal-case tracking-normal text-zinc-600">· {hint}</span>
        <button
          onClick={onAdd}
          title={`Add ${title} command`}
          className="ml-auto flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-normal normal-case tracking-normal text-sky-500 hover:bg-zinc-800"
        >
          <VscAdd size={12} /> New
        </button>
      </div>
      {commands.length === 0 && <p className="text-sm text-zinc-600">{emptyText}</p>}
      {commands.map((cmd) => (
        <div
          key={cmd.id}
          className="group flex items-center gap-3 rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2"
        >
          <button
            onClick={() => onRun(cmd)}
            title="Run in new terminal"
            className="rounded p-1 text-emerald-500 hover:bg-zinc-800"
          >
            <VscPlay size={16} />
          </button>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium text-zinc-200">{cmd.name}</div>
            <code className="block truncate text-xs text-zinc-500">{cmd.command}</code>
          </div>
          <span className="shrink-0 text-[10px] uppercase text-zinc-600">{cmd.shell ?? "powershell"}</span>
          <button
            onClick={() => onEdit(cmd)}
            className="rounded p-1 text-zinc-500 opacity-0 hover:bg-zinc-800 hover:text-zinc-200 group-hover:opacity-100"
          >
            <VscEdit size={14} />
          </button>
          <button
            onClick={() => onDelete(cmd.id)}
            className="rounded p-1 text-zinc-500 opacity-0 hover:bg-zinc-800 hover:text-red-400 group-hover:opacity-100"
          >
            <VscTrash size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
