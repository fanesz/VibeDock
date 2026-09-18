import AppShell from "@components/AppShell";
import ToastSnackbar from "@components/ToastSnackbar";

// VibeDock is a single-window workspace app, not a routed multi-page site:
// view switching is state-driven (Zustand), so no React Router here.
export default function App() {
  return (
    <>
      <AppShell />
      <ToastSnackbar />
    </>
  );
}
