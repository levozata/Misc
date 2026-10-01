"""Build the artifact page (index.html) and the standalone site (site/index.html) from template.html."""
import pathlib
here = pathlib.Path(__file__).parent
tpl = (here / "template.html").read_text()
geo = (here / "geo.js").read_text()
body = tpl.replace("/*GEO*/", geo)
(here / "index.html").write_text(body)
head = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="description" content="Interactive map of strikes, marches, rallies and blockades in Paris, Oct 2026 — English, español, français.">
<meta property="og:title" content="Paris dans la rue">
<meta property="og:description" content="Grèves, manifs, rassemblements à Paris · Strikes and protests in Paris · Huelgas y protestas en París — Oct 2026">
"""
i = body.index("</style>") + len("</style>")
site = head + body[:i] + "\n<style>body{margin:0}</style>\n</head>\n<body>\n" + body[i:] + "\n</body>\n</html>\n"
(here / "site").mkdir(exist_ok=True)
(here / "site" / "index.html").write_text(site)
print("built", len(body), len(site))
