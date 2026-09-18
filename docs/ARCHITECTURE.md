# Tauri Template Architecture

Minimal context for AI/code agents and devs working in this app.

## Stack

- Tauri 2, Vite 7, React 19, TypeScript.
- Tailwind CSS 4 via `@tailwindcss/vite` and `src/index.css`.
- React Router 7 for routes.
- SWR for server state, cache, query revalidation, and remote mutations.
- Zustand for local/client-only state.
- Axios for HTTP.
- Sonner and React Icons are available for toasts and icons.

## Commands

- Install/update deps with Bun because `bun.lock` exists.
- `bun run dev` starts Vite on port `1420`.
- `bun run tauri dev` starts the desktop app.
- `bun run build` runs `tsc -b` and Vite build.
- `bun run lint` runs ESLint.
- `bun run format` runs Prettier.

## Main Paths

- `src/main.tsx`: React entry.
- `src/App.tsx`: routes and app shell.
- `src/pages/*`: route pages.
- `src/common/components/*`: shared UI.
- `src/common/hooks/*`: shared hooks.
- `src/common/utils/*`: utilities.
- `src/common/types/index.ts`: shared types.
- `src/common/classStyle/*`: reusable class strings.
- `src/stores/*`: SWR feature modules and shared API utilities.
- `src-tauri/*`: Tauri and Rust app shell.

## Data Flow

1. UI event or route load.
2. Page/component calls an SWR feature hook from `src/stores/{feature}`.
3. The hook uses a stable SWR key and a service function.
4. The service uses the shared Axios client.
5. Backend returns `snake_case`.
6. Shared API transforms request/response casing where configured.
7. SWR caches server state, dedupes requests, and revalidates stale data.

Local UI state that is not server data can stay in Zustand or component state.

## SWR Notes

- Root `SWRConfig` lives in `src/App.tsx` and uses `swrConfig` from `src/stores/shared`.
- Query hooks use `useSWR(key, fetcher)` and return `data`, `error`, `isLoading`, `isValidating`, and `mutate`.
- Mutation hooks use `useSWRMutation` for POST/PUT/PATCH/DELETE actions.
- Populate SWR cache after successful mutations when the response already includes the updated data.
- Prefer `mutate(key)` for revalidation instead of writing directly to the cache.
- Zustand should not hold API-backed server data.

## API Notes

- Prefer `src/stores/shared/api.ts` for service functions.
- It uses `VITE_API_BASE_URL` or `http://127.0.0.1:3000`.
- It sends credentials and attaches `accessToken` except on auth endpoints.
- It converts request params/body to `snake_case` and responses to `camelCase`.
- API methods return `APIResponse<T>` from `@types` and reject failures with `ApiError`.
- Token helpers live in `src/stores/shared/session.ts`.

## Import Rules

- Prefer aliases over deep relative imports for shared code.
- Keep Vite aliases and TypeScript `paths` in sync.
- Existing aliases include `@components`, `@hooks`, `@utils`, `@types`, `@pages`, `@assets`, `@public`, `@classStyle`, and `@stores`.
