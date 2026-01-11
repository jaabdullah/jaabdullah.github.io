How to run this site locally (required for metrics/publications)

Option A (VSCode):
1) Install the extension: "Live Server"
2) Right-click site/index.html -> "Open with Live Server"

Option B (Python):
1) Open a terminal in the 'site' folder
2) Run: python -m http.server 8000
3) Open: http://localhost:8000

If you open index.html directly (file://), the browser blocks loading JSON (profile.json) and APIs, so metrics/publications will not load.
