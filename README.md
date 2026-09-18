# Tauri React Base Template

Base Tauri 2 + React 19 + TypeScript project aligned with the main frontend patterns.

## Stack

- Tauri 2, Vite 7, React 19, TypeScript.
- Tailwind CSS 4 via `@tailwindcss/vite`.
- React Router 7 for route structure.
- SWR for server state, cache, query revalidation, and remote mutations.
- Zustand for local/client-only state.
- Axios for API services.
- Sonner for toast notifications.

## Commands

- `bun run dev`: start Vite on the Tauri dev port.
- `bun run tauri dev`: start the Tauri desktop app.
- `bun run build`: run TypeScript and Vite build.
- `bun run lint`: run ESLint.
- `bun run format`: run Prettier.

## Main Paths

- `src/App.tsx`: app routes and base layout.
- `src/pages/*`: route pages.
- `src/common/components/*`: shared UI.
- `src/common/hooks/*`: shared hooks.
- `src/common/utils/*`: utilities.
- `src/common/types/index.ts`: shared types.
- `src/stores/*`: SWR feature modules and shared API utilities.
- `src-tauri/*`: Rust/Tauri app shell.

## API Queries

Use SWR feature hooks for server state. Auth is the reference implementation.

```tsx
import { useAuth } from "@stores/auth";

export default function ProfileStatus() {
  const { user, isLoading, error, refreshUser } = useAuth();

  if (isLoading) return <div>Loading...</div>;
  if (error) return <button onClick={() => refreshUser()}>Retry</button>;

  return <div>{user ? user.email : "Signed out"}</div>;
}
```

Feature modules should keep request keys, services, and SWR hooks together under `src/stores/{feature}`.

## Recommended IDE Setup

- [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)
