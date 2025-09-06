# Row Checker (Decorator) – v3.0

**Goal:** Keep the original behavior and markup style, but make the three settings actually work everywhere:

- **Position (Left/Right):** A single fixed-width checkbox column is inserted on the chosen side for both legacy `<table>` and modern ARIA grid layouts, including the header row.
- **Alignment (Left/Center/Right):** The checkbox is aligned inside its cell using a flex wrapper bound to `--rc-justify`.
- **Color (hex):** Drives the checkbox fill/border and the selected-row highlight using `--rc-color`.

**Details**
- Header cell includes a “select all” checkbox.
- Selections persist for the session via `sessionStorage`, keyed by app id + object id.
- MutationObserver is throttled and guarded to survive re-renders without loops.
- No globals; AMD-injected jQuery only.

**Setup**
1. Import ZIP and add the extension to the same sheet as your table.
2. Set **Target Table Object ID**.
3. Adjust **Checkbox Column Position**, **Checkbox Alignment**, and **Check Color (hex)**.