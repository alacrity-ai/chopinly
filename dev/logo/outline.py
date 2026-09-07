# Outlines the Chopinly wordmark (Fraunces 550, opsz 144) to SVG paths so the brand
# SVGs carry no font dependency. Called by finalize.mjs with the browser-measured glyph
# origins (Chrome shapes + kerns the word; we only lift the outlines).
#   python3 dev/logo/outline.py dev/logo/out/wordmark-metrics.json dev/logo/out/wordmark-paths.json
import json, sys
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.boundsPen import BoundsPen

metrics = json.load(open(sys.argv[1]))
size = metrics["size"]
font = TTFont("fonts/fraunces-roman.woff2")
font = instantiateVariableFont(font, {"opsz": min(144, size), "wght": 550})
upm = font["head"].unitsPerEm
scale = size / upm
cmap = font.getBestCmap()
glyphs = font.getGlyphSet()
xh = font["OS/2"].sxHeight * scale
cap = font["OS/2"].sCapHeight * scale

paths, bounds = [], None
for g in metrics["glyphs"]:
    name = cmap[ord(g["ch"])]
    pen = SVGPathPen(glyphs)
    glyphs[name].draw(pen)
    bp = BoundsPen(glyphs)
    glyphs[name].draw(bp)
    x0, y0, x1, y1 = bp.bounds
    paths.append({"ch": g["ch"], "d": pen.getCommands(), "x": g["x"], "ink": [x0 * scale, x1 * scale]})
    gb = (g["x"] + x0 * scale, g["x"] + x1 * scale)
    bounds = gb if bounds is None else (min(bounds[0], gb[0]), max(bounds[1], gb[1]))

# the dot of the i is a small key (brand detail): centred on the dotless i, above the x-height
i = next(p for p in paths if p["ch"] == "ı")
cx = i["x"] + (i["ink"][0] + i["ink"][1]) / 2
dot = {"w": 0.15 * size, "h": 0.20 * size, "rx": 0.03 * size}
dot["x"] = cx - dot["w"] / 2
dot["y"] = -(xh + 0.10 * size) - dot["h"]  # y is relative to the baseline, up is negative

json.dump({"size": size, "scale": scale, "capHeight": cap, "xHeight": xh, "ascent": font["hhea"].ascent * scale, "descent": -font["hhea"].descent * scale,
           "inkLeft": bounds[0], "inkRight": bounds[1], "paths": paths, "dot": dot}, open(sys.argv[2], "w"), indent=1)
print(f"outlined {len(paths)} glyphs at {size}px (opsz {min(144, size)}, wght 550); ink {bounds[0]:.1f}..{bounds[1]:.1f}")
