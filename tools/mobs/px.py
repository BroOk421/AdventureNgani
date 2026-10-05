"""Tiny pixel-art toolkit: shaded parts + selective outline."""
import math
from PIL import Image

def clamp(v, a, b): return a if v < a else b if v > b else v

class Part:
    def __init__(self, pts, pal, cx=None, cy=None, rx=None, ry=None, light=(-0.55, -0.75), flat=None, z=0, rim=True):
        self.pts = set(pts); self.pal = pal; self.z = z; self.flat = flat; self.rim = rim
        if cx is None and self.pts:
            xs = [p[0] for p in self.pts]; ys = [p[1] for p in self.pts]
            cx = (min(xs) + max(xs)) / 2; cy = (min(ys) + max(ys)) / 2
            rx = max(1, (max(xs) - min(xs)) / 2 + 0.5); ry = max(1, (max(ys) - min(ys)) / 2 + 0.5)
        self.cx, self.cy, self.rx, self.ry = cx, cy, rx, ry
        self.light = light
    def tone(self, x, y):
        if self.flat is not None: return self.pal[self.flat]
        nx = (x + 0.5 - self.cx) / self.rx; ny = (y + 0.5 - self.cy) / self.ry
        d2 = nx * nx + ny * ny
        nz = math.sqrt(max(0.0, 1 - min(1, d2)))
        lx, ly = self.light; lz = 0.95
        L = math.sqrt(lx * lx + ly * ly + lz * lz)
        v = (nx * lx + ny * ly + nz * lz) / L          # -1..1
        n = len(self.pal)
        # pal: darkest .. lightest (last = specular)
        t = (v + 0.35) / 1.25
        if self.rim and d2 > 0.82: t -= 0.18             # darker rim
        idx = int(clamp(t, 0, 0.999) * (n - 1))
        if v > 0.88 and n >= 4: idx = n - 1
        return self.pal[idx]

def ellipse(cx, cy, rx, ry):
    out = set()
    for y in range(int(cy - ry - 1), int(cy + ry + 2)):
        for x in range(int(cx - rx - 1), int(cx + rx + 2)):
            if ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1.0: out.add((x, y))
    return out

def poly(points):
    xs = [p[0] for p in points]; ys = [p[1] for p in points]
    out = set()
    for y in range(int(min(ys)) - 1, int(max(ys)) + 2):
        for x in range(int(min(xs)) - 1, int(max(xs)) + 2):
            px, py = x + 0.5, y + 0.5; inside = False
            j = len(points) - 1
            for i in range(len(points)):
                xi, yi = points[i]; xj, yj = points[j]
                if (yi > py) != (yj > py) and px < (xj - xi) * (py - yi) / (yj - yi + 1e-9) + xi: inside = not inside
                j = i
            if inside: out.add((x, y))
    return out

def rect(x0, y0, x1, y1): return {(x, y) for x in range(x0, x1 + 1) for y in range(y0, y1 + 1)}

def line(x0, y0, x1, y1):
    out = set(); n = int(max(abs(x1 - x0), abs(y1 - y0))) + 1
    for i in range(n + 1):
        t = i / max(1, n); out.add((round(x0 + (x1 - x0) * t), round(y0 + (y1 - y0) * t)))
    return out

def render(w, h, parts, outline, details=(), inner_lines=True, alpha=255):
    """parts: list of Part (drawn by z); details: list of (pts, color) drawn after; outline: color."""
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0)); px = img.load()
    owner = {}
    for part in sorted(parts, key=lambda p: p.z):
        for (x, y) in part.pts:
            if 0 <= x < w and 0 <= y < h:
                px[x, y] = part.tone(x, y) + (255,); owner[(x, y)] = part
    # inner contour: a part's pixels next to a LOWER-z part's pixels get that part's darkest tone
    if inner_lines:
        for (x, y), part in list(owner.items()):
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                o = owner.get((x + dx, y + dy))
                if o is not None and o is not part and o.z < part.z and part.flat is None:
                    pass
        edge = {}
        for (x, y), part in owner.items():
            for dx, dy in ((0, 1), (1, 0), (-1, 0), (0, -1)):
                o = owner.get((x + dx, y + dy))
                if o is not None and o.z > part.z:
                    edge[(x, y)] = part.pal[0]; break
        for (x, y), c in edge.items(): px[x, y] = c + (255,)
    for pts, col in details:
        for (x, y) in pts:
            if 0 <= x < w and 0 <= y < h: px[x, y] = col + (255,) if len(col) == 3 else col; owner.setdefault((x, y), None)
    # outer outline
    solid = {(x, y) for x in range(w) for y in range(h) if px[x, y][3] > 0}
    for (x, y) in list(solid):
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            q = (x + dx, y + dy)
            if q not in solid and 0 <= q[0] < w and 0 <= q[1] < h:
                px[q[0], q[1]] = outline + (255,)
    if alpha < 255:
        a = img.getchannel("A").point(lambda v: v * alpha // 255); img.putalpha(a)
    return img

def strip(frames):
    w, h = frames[0].size
    out = Image.new("RGBA", (w * len(frames), h))
    for i, f in enumerate(frames): out.paste(f, (i * w, 0))
    return out
