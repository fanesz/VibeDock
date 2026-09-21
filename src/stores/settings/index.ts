import { create } from "zustand";
import { ACTIONS, type ActionId } from "@utils/actions";
import { persist } from "zustand/middleware";

const defaults = (): Record<string, string> =>
  Object.fromEntries(ACTIONS.map((a) => [a.id, a.defaultKey]));

type SettingsState = {
  shortcuts: Record<string, string>; // ActionId -> serialized combo ("" = unbound)
  setShortcut: (id: ActionId, combo: string) => void;
  clearShortcut: (id: ActionId) => void;
  resetShortcuts: () => void;
};

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      shortcuts: defaults(),
      setShortcut: (id, combo) => set((s) => ({ shortcuts: { ...s.shortcuts, [id]: combo } })),
      clearShortcut: (id) => set((s) => ({ shortcuts: { ...s.shortcuts, [id]: "" } })),
      resetShortcuts: () => set({ shortcuts: defaults() }),
    }),
    {
      name: "vibedock.settings.v1",
      version: 1,
      // Fill in defaults for any action added after the user's config was saved.
      merge: (persisted, current) => ({
        ...current,
        ...(persisted as object),
        shortcuts: { ...defaults(), ...((persisted as SettingsState | undefined)?.shortcuts ?? {}) },
      }),
    }
  )
);
