---
paths:
  - "src/webview/**"
---

# Webview UI

- Prefer reusable components in `src/webview/common/` over ad-hoc markup.
- NEVER use native HTML form controls such as `select` or checkbox inputs.
  Use the project's themed components, including `Dropdown` and
  `ColoredSelect`.
