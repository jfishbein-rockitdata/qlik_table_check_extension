
# Row Checker (Decorator) – v2.3

**Fixes for your report**
- **Responsive checks**: delegated click handling on the table grid → events work immediately even after Qlik re-renders rows.
- **Width updates live**: checkbox column width is re-applied on every refresh (not only on first render). Change the property and it takes effect.
- **Hide works**: helper collapses in analysis mode; no visible frame.

## Usage
1. Upload ZIP → Extensions.
2. Add **Row Checker (Decorator)** to the same sheet as your table.
3. Set **Target Table Object ID** (e.g., `uYpJm`).
4. Optional: adjust **Checked Row Color** & **Checkbox Column Width** (default 16px).
5. Leave **Hide this helper in analysis mode** enabled.
