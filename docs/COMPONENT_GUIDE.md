# Component Guide

Small patterns to copy when adding frontend code.

## Page

- Path: `src/pages/{PageName}/index.tsx`.
- Own route-level data loading and layout.
- Split large page-only pieces into `src/pages/{PageName}/sections/*`.

```tsx
import { useThings } from "@stores/thing";

export default function ThingPage() {
  const { things, isLoading, error, refreshThings } = useThings();

  if (isLoading) return <div>Loading...</div>;
  if (error) return <button onClick={() => refreshThings()}>Retry</button>;
  if (things.length === 0) return <div>No items found.</div>;

  return <main>{things.map((thing) => <div key={thing.id}>{thing.name}</div>)}</main>;
}
```

## Store Feature

- New SWR-backed server-state feature shape:
  - `src/stores/{feature}/{feature}.types.ts`
  - `src/stores/{feature}/{feature}.keys.ts`
  - `src/stores/{feature}/{feature}.service.ts`
  - `src/stores/{feature}/{feature}.hooks.ts`
  - `src/stores/{feature}/index.ts`
- Put stable SWR keys in the keys file.
- Put HTTP calls in the service and return domain data from response `data`.
- Put `useSWR` queries and `useSWRMutation` mutations in the hooks file.
- Export the public hooks/service/types API from `index.ts`.

```ts
// thing.keys.ts
export const thingKeys = {
  all: ["things"] as const,
  list: () => [...thingKeys.all, "list"] as const,
  detail: (id: string) => [...thingKeys.all, "detail", id] as const,
};
```

```ts
// thing.service.ts
import { API } from "@stores/shared";
import type { Thing } from "./thing.types";

const api = new API();

export async function getThings(): Promise<Thing[]> {
  const response = await api.GET<Thing[]>("/v1/things");
  return response.data ?? [];
}

export async function createThing(name: string): Promise<Thing> {
  const response = await api.POST<Thing>("/v1/things", { name });
  if (!response.data) throw new Error(response.message || "Failed to create thing");
  return response.data;
}
```

```ts
// thing.hooks.ts
import useSWR from "swr";
import useSWRMutation from "swr/mutation";
import { thingKeys } from "./thing.keys";
import { createThing, getThings } from "./thing.service";

export function useThings() {
  const swr = useSWR(thingKeys.list(), getThings);

  return {
    ...swr,
    things: swr.data ?? [],
    refreshThings: swr.mutate,
  };
}

export function useCreateThingMutation() {
  return useSWRMutation(thingKeys.list(), (_key, { arg }: { arg: string }) => createThing(arg), {
    populateCache: (created, current = []) => [...current, created],
    revalidate: false,
  });
}
```

## Naming

- Components and pages: `PascalCase`.
- Hooks: `useCamelCase`.
- Utilities/types/stores: follow nearby file names.
- Event handlers: `handleSubmit`, `handleClick`, `handleInputChange`.
- Booleans: `isLoading`, `hasError`, `canEdit`, `shouldShow`.
