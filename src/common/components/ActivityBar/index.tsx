import type { ViewKind } from "@stores/ui";
import { useUI } from "@stores/ui";
import { cn } from "@utils/cn";
import {
  VscListSelection,
  VscNote,
  VscSearch,
  VscSettingsGear,
  VscSourceControl,
  VscTerminal,
} from "react-icons/vsc";

const VIEWS: { key: ViewKind; icon: React.ReactNode; title: string }[] = [
  { key: "terminals", icon: <VscTerminal size={22} />, title: "Terminals" },
  { key: "git", icon: <VscSourceControl size={22} />, title: "Git" },
  { key: "commands", icon: <VscListSelection size={22} />, title: "Commands" },
  { key: "notepad", icon: <VscNote size={22} />, title: "Notepad" },
];

export default function ActivityBar() {
  const activeView = useUI((s) => s.activeView);
  const setView = useUI((s) => s.setView);
  const setQuickOpen = useUI((s) => s.setQuickOpen);
  const setModal = useUI((s) => s.setModal);

  return (
    <div className="flex w-12 shrink-0 flex-col items-center gap-1 border-r border-zinc-800 bg-zinc-950 py-2">
      {VIEWS.map((v) => (
        <button
          key={v.key}
          onClick={() => setView(v.key)}
          title={v.title}
          className={cn(
            "rounded-md p-2",
            activeView === v.key
              ? "bg-zinc-800 text-sky-400"
              : "text-zinc-500 hover:bg-zinc-900 hover:text-zinc-200"
          )}
        >
          {v.icon}
        </button>
      ))}
      <button
        onClick={() => setQuickOpen(true)}
        title="Quick open file (Ctrl+P)"
        className="mt-auto rounded-md p-2 text-zinc-500 hover:bg-zinc-900 hover:text-zinc-200"
      >
        <VscSearch size={20} />
      </button>
      <button
        onClick={() => setModal("settings")}
        title="Settings"
        className="rounded-md p-2 text-zinc-500 hover:bg-zinc-900 hover:text-zinc-200"
      >
        <VscSettingsGear size={20} />
      </button>
    </div>
  );
}
