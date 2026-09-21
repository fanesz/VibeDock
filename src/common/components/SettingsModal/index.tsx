import { useEffect, useState } from "react";
import { useSettings } from "@stores/settings";
import { ACTIONS, eventCombo, prettyCombo, setCapturing, type ActionId } from "@utils/actions";
import { cn } from "@utils/cn";
import { VscClose, VscSettingsGear } from "react-icons/vsc";

export default function SettingsModal({ onClose }: { onClose: () => void }) {
  const shortcuts = useSettings((s) => s.shortcuts);
  const setShortcut = useSettings((s) => s.setShortcut);
  const clearShortcut = useSettings((s) => s.clearShortcut);
  const resetShortcuts = useSettings((s) => s.resetShortcuts);
  const [recording, setRecording] = useState<ActionId | null>(null);

  // Esc closes the modal — unless we're mid-recording, where it cancels recording.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !recording) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, recording]);

  // Capture the next real key-combo for the action being recorded. Runs in the
  // capture phase and stands the global dispatcher down so it doesn't also fire.
  useEffect(() => {
    if (!recording) return;
    setCapturing(true);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setRecording(null);
        return;
      }
      const combo = eventCombo(e);
      if (!combo) return; // modifier-only — keep waiting
      e.preventDefault();
      e.stopPropagation();
      setShortcut(recording, combo);
      setRecording(null);
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      setCapturing(false);
    };
  }, [recording, setShortcut]);

  // Which combos are bound more than once (so we can flag the clash).
  const counts = new Map<string, number>();
  for (const c of Object.values(shortcuts)) if (c) counts.set(c, (counts.get(c) ?? 0) + 1);

  const groups = [...new Set(ACTIONS.map((a) => a.group))];

  return (
    <div className="vd-fade fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="vd-scale-in flex max-h-[80vh] w-full max-w-lg flex-col rounded-lg border border-zinc-700 bg-zinc-900 shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold text-zinc-100">
            <VscSettingsGear size={14} /> Settings — Keyboard shortcuts
          </h2>
          <button onClick={onClose} className="rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200">
            <VscClose size={16} />
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
          {groups.map((g) => (
            <div key={g}>
              <div className="mb-1 text-[10px] font-semibold tracking-widest text-zinc-500 uppercase">{g}</div>
              <div className="flex flex-col divide-y divide-zinc-800 rounded-md border border-zinc-800">
                {ACTIONS.filter((a) => a.group === g).map((a) => {
                  const combo = shortcuts[a.id] ?? "";
                  const clash = combo !== "" && (counts.get(combo) ?? 0) > 1;
                  const isRec = recording === a.id;
                  return (
                    <div key={a.id} className="flex items-center justify-between gap-3 px-3 py-2">
                      <span className="text-sm text-zinc-200">{a.label}</span>
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => setRecording(isRec ? null : a.id)}
                          className={cn(
                            "min-w-[7rem] rounded border px-2 py-1 text-center font-mono text-xs",
                            isRec
                              ? "animate-pulse border-sky-600 bg-sky-950 text-sky-300"
                              : clash
                                ? "border-amber-700 bg-amber-950/40 text-amber-400"
                                : "border-zinc-700 bg-zinc-950 text-zinc-300 hover:border-zinc-600"
                          )}
                          title={clash ? "This shortcut is used by another action" : "Click, then press a key combo"}
                        >
                          {isRec ? "Press keys…" : combo ? prettyCombo(combo) : "Unbound"}
                        </button>
                        <button
                          onClick={() => clearShortcut(a.id)}
                          disabled={!combo}
                          className="rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200 disabled:opacity-30"
                          title="Clear shortcut"
                        >
                          <VscClose size={14} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between border-t border-zinc-800 px-4 py-3">
          <span className="text-[11px] text-zinc-600">Click a shortcut, then press the keys. Esc cancels.</span>
          <button
            onClick={resetShortcuts}
            className="rounded px-3 py-1.5 text-xs text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
          >
            Reset to defaults
          </button>
        </div>
      </div>
    </div>
  );
}
