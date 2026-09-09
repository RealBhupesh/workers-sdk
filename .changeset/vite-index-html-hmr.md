---
"@cloudflare/vite-plugin": patch
---

Stop restarting the Vite dev server when the client `index.html` changes

The additional-modules plugin treats `.html` files as Worker Text modules. Vite's HTML entry was being tracked the same way, so editing `index.html` restarted the whole server and raced Vite's own page reload. The HTML entry is now only tracked when a Worker source actually imports it, so Worker-imported templates still restart while SPA HTML edits reload normally.
