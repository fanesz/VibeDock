import { create } from "zustand";

export type ViewKind = "terminals" | "commands" | "git" | "notepad";
export type ModalKind = "killPort" | "history" | "settings";

type UIState = {
  activeView: ViewKind;
  quickOpen: boolean;
  modal: ModalKind | null;
  setView: (v: ViewKind) => void;
  setQuickOpen: (b: boolean) => void;
  setModal: (m: ModalKind | null) => void;
};

export const useUI = create<UIState>((set) => ({
  activeView: "terminals",
  quickOpen: false,
  modal: null,
  setView: (v) => set({ activeView: v }),
  setQuickOpen: (b) => set({ quickOpen: b }),
  setModal: (m) => set({ modal: m }),
}));
