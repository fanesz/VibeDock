import { create } from "zustand";

export type ViewKind = "terminals" | "commands" | "git" | "notepad";

type UIState = {
  activeView: ViewKind;
  quickOpen: boolean;
  setView: (v: ViewKind) => void;
  setQuickOpen: (b: boolean) => void;
};

export const useUI = create<UIState>((set) => ({
  activeView: "terminals",
  quickOpen: false,
  setView: (v) => set({ activeView: v }),
  setQuickOpen: (b) => set({ quickOpen: b }),
}));
