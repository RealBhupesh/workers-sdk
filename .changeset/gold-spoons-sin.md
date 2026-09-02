---
"wrangler": patch
---

Use `database_id` for D1 bindings (over `id`)

Wrangler now prefers the canonical API identifier for D1 bindings, `database_id`, when creating Worker versions and when `init --from-dash`. Wrangler continues to support the deprecated `id` field when used.
