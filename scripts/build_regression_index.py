#!/usr/bin/env python3
"""
scripts/build_regression_index.py
Builds regression-history/index.html from all regression-*.html files.
Run from the repo root after checking out agent/auto-tests branch.
"""
import os
import glob

files = sorted(glob.glob('regression-history/regression-*.html'), reverse=True)

rows = []
for f in files:
    name = os.path.basename(f)
    parts = name.replace('.html', '').split('-')
    num = parts[1] if len(parts) > 1 else '?'
    conclusion = parts[-1] if len(parts) > 1 else '?'
    icon = '\u2705' if 'success' in conclusion or 'passed' in conclusion else '\u274C'
    rows.append(
        '<tr>'
        f'<td>#{num}</td>'
        f'<td>{name}</td>'
        f'<td>{icon} {conclusion.upper()}</td>'
        f'<td><a href="{name}">View</a></td>'
        '</tr>'
    )

tbody = '\n'.join(rows)

html = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Regression Run History</title>
<style>
  body {{font-family:system-ui,sans-serif;background:#0f172a;color:#e2e8f0;padding:2rem;max-width:800px;margin:0 auto}}
  h1 {{color:#f8fafc;font-size:1.5rem;margin-bottom:1.5rem}}
  p {{color:#64748b;font-size:.875rem;margin-top:-.5rem;margin-bottom:1.5rem}}
  table {{width:100%;border-collapse:collapse;background:#1e293b;border-radius:8px;overflow:hidden}}
  th {{padding:.75rem 1rem;text-align:left;background:#162032;color:#64748b;font-size:.75rem;text-transform:uppercase;letter-spacing:.05em}}
  td {{padding:.75rem 1rem;border-top:1px solid #334155;font-size:.875rem}}
  a {{color:#4FC3F7;text-decoration:none}}
  a:hover {{text-decoration:underline}}
  .badge {{font-size:.7rem;padding:2px 8px;border-radius:999px;background:#9333ea22;color:#9333ea;margin-left:.5rem}}
</style>
</head>
<body>
<h1>Regression Run History <span class="badge">@regression tests only</span></h1>
<p>Last {len(files)} run(s) stored. Older runs pruned automatically after 10.</p>
<table>
  <thead><tr><th>Run</th><th>File</th><th>Result</th><th>Report</th></tr></thead>
  <tbody>
{tbody}
  </tbody>
</table>
</body>
</html>"""

os.makedirs('regression-history', exist_ok=True)
with open('regression-history/index.html', 'w') as f:
    f.write(html)

print(f'Index written with {len(files)} entries')
for entry in files:
    print(f'  - {os.path.basename(entry)}')
