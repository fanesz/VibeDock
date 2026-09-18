# Styling Guide

Minimal Tailwind/CSS rules for this template.

## Files

- `src/index.css`: imports Tailwind and global base styles.
- `src/common/classStyle/*`: reusable Tailwind class strings.
- `src/common/utils/cn.ts`: class merge helper.

## Tailwind

- Tailwind v4 is enabled through Vite; no config file is required for normal use.
- Use utility classes first.
- Extract repeated class strings to `common/classStyle`.
- Use `clsx` or `cn` for conditional classes.
- Avoid inline styles unless the value is truly dynamic.

## Layout

- Build mobile-first: base classes for mobile, then `sm:`, `md:`, `lg:`, `xl:`.
- Use `flex`, `grid`, `gap-*`, `space-y-*`, and max-width containers.
- Keep fixed-format UI stable with explicit size, aspect ratio, or grid tracks.
- Do not let text overflow buttons, cards, nav, or panels.

## States

- Loading: show a spinner, skeleton, or clear loading text.
- Empty: show a short empty message and an action when useful.
- Error: show the error near the failed UI.
- Disabled: use `disabled`, reduced opacity, and `cursor-not-allowed`.
- Focus: keep keyboard-visible focus styles on inputs and buttons.
