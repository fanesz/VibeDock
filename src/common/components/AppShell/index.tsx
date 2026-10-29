import { useEffect, useState } from "react";
import ActivityBar from "@components/ActivityBar";
import CommandsView from "@components/CommandsView";
import ErrorBoundary from "@components/ErrorBoundary";
import GitView from "@components/GitView";
import NotepadView from "@components/NotepadView";
import ProjectsRail from "@components/ProjectsRail";
import QuickOpen from "@components/QuickOpen";
import StatusBar from "@components/StatusBar";
import TerminalsLayer from "@components/TerminalsLayer";
import TitleBar from "@components/TitleBar";
import { useSettings } from "@stores/settings";
import { useUI } from "@stores/ui";
import { useWorkspace } from "@stores/workspace";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { eventCombo, isCapturing, runAction, type ActionId } from "@utils/actions";
import { cn } from "@utils/cn";
import { VscFolderOpened } from "react-icons/vsc";

export default function AppShell() {
  const openCount = useWorkspace((s) => s.openProjectIds.length);
  const activeProject = useWorkspace((s) => (s.activeProjectId ? s.projects[s.activeProjectId] : null));
  const openProjectDialog = useWorkspace((s) => s.openProjectDialog);
  const openFolders = useWorkspace((s) => s.openFolders);
  const activeView = useUI((s) => s.activeView);
  const quickOpen = useUI((s) => s.quickOpen);
  const [isDraggingFile, setIsDraggingFile] = useState(false);

  // Native OS file/folder drag-and-drop handler
  useEffect(() => {
    if (typeof window === "undefined" || !("__TAURI_INTERNALS__" in window)) return;
    let unlisten: (() => void) | undefined;
    getCurrentWebview()
      .onDragDropEvent((event) => {
        if (event.payload.type === "enter" || event.payload.type === "over") {
          setIsDraggingFile(true);
        } else if (event.payload.type === "leave") {
          setIsDraggingFile(false);
        } else if (event.payload.type === "drop") {
          setIsDraggingFile(false);
          const paths = event.payload.paths;
          if (paths && paths.length > 0) {
            void openFolders(paths);
          }
        }
      })
      .then((fn) => {
        unlisten = fn;
      })
      .catch((err) => {
        console.error("Failed to setup drag drop listener:", err);
      });

    return () => {
      unlisten?.();
    };
  }, [openFolders]);

  // Global keyboard shortcuts (configurable in Settings). Capture phase +
  // stopPropagation so a bound combo is consumed here and the focused terminal
  // never also processes it. Stands down while the settings recorder is capturing.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isCapturing()) return;
      const combo = eventCombo(e);
      if (!combo) return;
      const shortcuts = useSettings.getState().shortcuts;
      const hit = (Object.keys(shortcuts) as ActionId[]).find((id) => shortcuts[id] === combo);
      if (!hit) return;
      e.preventDefault();
      e.stopPropagation();
      runAction(hit);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-zinc-900 text-zinc-100">
      <TitleBar />
      <div className="flex min-h-0 flex-1">
        <ProjectsRail />
        <ActivityBar />
        <main className="relative flex min-w-0 flex-1 flex-col">
          {openCount === 0 ? (
            <EmptyState onOpen={() => void openProjectDialog()} />
          ) : (
            <>
              {/* Terminals stay mounted across view switches so processes survive */}
              <div className={cn("absolute inset-0", activeView === "terminals" ? "block" : "hidden")}>
                <TerminalsLayer shown={activeView === "terminals"} />
              </div>
              {activeView === "commands" && activeProject && (
                <div className="absolute inset-0 bg-zinc-900">
                  <ErrorBoundary label="Commands view crashed">
                    <CommandsView project={activeProject} />
                  </ErrorBoundary>
                </div>
              )}
              {activeView === "git" && activeProject && (
                <div className="absolute inset-0 bg-zinc-900">
                  <ErrorBoundary label="Git view crashed">
                    <GitView project={activeProject} />
                  </ErrorBoundary>
                </div>
              )}
              {activeView === "notepad" && activeProject && (
                <div className="absolute inset-0 bg-zinc-900">
                  <ErrorBoundary label="Notepad view crashed">
                    <NotepadView project={activeProject} />
                  </ErrorBoundary>
                </div>
              )}
              {quickOpen && <QuickOpen />}
            </>
          )}
        </main>
      </div>
      <StatusBar />
      {isDraggingFile && (
        <div className="pointer-events-none fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-zinc-950/85 backdrop-blur-xs border-2 border-dashed border-sky-500 m-2 rounded-lg">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-sky-500/10 text-sky-400 ring-1 ring-sky-500/30">
            <VscFolderOpened size={36} />
          </div>
          <div className="text-base font-medium text-zinc-100">Drop folder to open project</div>
          <p className="text-xs text-zinc-400">Folder will be added to your workspace projects</p>
        </div>
      )}
    </div>
  );
}

function EmptyState({ onOpen }: { onOpen: () => void }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 text-center">
      <h1 className="text-2xl font-semibold text-zinc-300">VibeDock</h1>
      <p className="text-sm text-zinc-500">Your project command center. Drag &amp; drop a folder here or open one.</p>
      <button
        onClick={onOpen}
        className="rounded bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500"
      >
        Open a folder
      </button>
    </div>
  );
}
