"""Build GTFS route shapes over water from OpenStreetMap.

Each consecutive stop pair in the feed is routed over a marine graph made of
  * OSM ferry routes (route=ferry ways), preferred, and
  * an open-water grid plus short connector edges, used only where OSM has
    no ferry route. These edges never cross an OSM coastline, and running over
    an OSM reef (natural=reef) costs REEF_COST times more, so inferred paths
    leave a lagoon through a gap in the atoll rim instead of over the reef.
Inferred (non-OSM) parts are straightened where the coast and reefs allow, and
every shape point is tagged with shape_pt_source = osm | inferred.

Usage
  python build_shapes.py --gtfs ../data --out ../data [--crossings ../data/crossings.csv]
  python build_shapes.py --bundle ../app/public/data

With --bundle, stop pairs come from the app's stops.json and legs.json and the
result is written to routes.geojson in the same folder (one LineString per
unordered stop pair; property osm is the share of its length on OSM ferry routes).

Writes to --out:
  shapes.txt             one shape per distinct stop sequence
  trips.txt              copy of the input with a shape_id column
  crossing_shapes.txt    (with --crossings) one shape per observed harbour pair, shape_id FROM>TO
  segments.json          stop-pair geometry, for reuse elsewhere
OSM downloads are cached in --cache (default ./osm_cache).
"""
import argparse, csv, heapq, json, math, os, sys, urllib.parse, urllib.request
from collections import defaultdict

OVERPASS = 'https://overpass-api.de/api/interpreter'
UA = 'island-connectivity-dashboard/0.1 (build_shapes.py)'
GRID_DEG = 0.03          # open-water grid spacing (~3.3 km); --bundle uses BUNDLE_GRID_DEG
BUNDLE_GRID_DEG = 0.01   # ~1.1 km, fine enough to find the passes through atoll rims
PENALTY = 1.4            # cost multiplier for non-OSM edges
REEF_COST = 12.0         # extra cost multiplier for the part of a non-OSM edge that is over reef
REEF_STEP_KM = 0.15      # sampling step when measuring how much of an edge is over reef
LINK_KM = 3.0            # ferry vertex <-> grid / other ferry ways
STOP_LINK_KM = 6.0       # stop <-> network
CELL = 0.01              # coastline spatial index cell (deg)


# ---------- geometry ----------
def hav(a, b):
    r = math.pi / 180
    dl, dn = (b[0] - a[0]) * r, (b[1] - a[1]) * r
    x = math.sin(dl / 2) ** 2 + math.cos(a[0] * r) * math.cos(b[0] * r) * math.sin(dn / 2) ** 2
    return 12742 * math.asin(math.sqrt(x))


def _orient(p, q, r):
    v = (q[1] - p[1]) * (r[0] - q[0]) - (q[0] - p[0]) * (r[1] - q[1])
    return 0 if abs(v) < 1e-14 else (1 if v > 0 else 2)


def seg_intersect(p1, q1, p2, q2):
    return _orient(p1, q1, p2) != _orient(p1, q1, q2) and _orient(p2, q2, p1) != _orient(p2, q2, q1)


def lerp(a, b, t):
    return (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)


def point_in_ring(pt, ring):
    y, x = pt
    inside = False
    j = len(ring) - 1
    for i in range(len(ring)):
        yi, xi = ring[i]
        yj, xj = ring[j]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
            inside = not inside
        j = i
    return inside


def douglas_peucker(pts, tol):
    if len(pts) < 3:
        return pts
    a, b = pts[0], pts[-1]
    best, idx = -1, 0
    for i in range(1, len(pts) - 1):
        p = pts[i]
        dy, dx = b[0] - a[0], b[1] - a[1]
        n = math.hypot(dy, dx)
        d = math.hypot(p[0] - a[0], p[1] - a[1]) if n == 0 else abs(dx * (a[0] - p[0]) - dy * (a[1] - p[1])) / n
        if d > best:
            best, idx = d, i
    if best <= tol:
        return [a, b]
    return douglas_peucker(pts[:idx + 1], tol)[:-1] + douglas_peucker(pts[idx:], tol)


# ---------- OSM ----------
def overpass(query, path):
    if os.path.exists(path):
        with open(path, encoding='utf-8') as f:
            return json.load(f)
    print(f'  downloading {os.path.basename(path)} from Overpass...', file=sys.stderr)
    req = urllib.request.Request(OVERPASS, data=urllib.parse.urlencode({'data': query}).encode(),
                                 headers={'User-Agent': UA, 'Accept': 'application/json'})
    with urllib.request.urlopen(req, timeout=300) as r:
        data = json.loads(r.read().decode('utf-8'))
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(data, f)
    return data


class Land:
    """Coastline segments with a grid index, plus closed rings for point-in-land tests."""

    def __init__(self, ways):
        self.segs, self.rings, self.idx = [], [], defaultdict(list)
        for w in ways:
            pts = [(g['lat'], g['lon']) for g in w.get('geometry', [])]
            if len(pts) < 2:
                continue
            if w['nodes'][0] == w['nodes'][-1] and len(pts) > 3:
                ys, xs = [p[0] for p in pts], [p[1] for p in pts]
                self.rings.append((min(ys), max(ys), min(xs), max(xs), pts))
            for a, b in zip(pts, pts[1:]):
                k = len(self.segs)
                self.segs.append((a, b))
                for cy in range(int(min(a[0], b[0]) // CELL), int(max(a[0], b[0]) // CELL) + 1):
                    for cx in range(int(min(a[1], b[1]) // CELL), int(max(a[1], b[1]) // CELL) + 1):
                        self.idx[(cy, cx)].append(k)

    def on_land(self, p):
        return any(y0 <= p[0] <= y1 and x0 <= p[1] <= x1 and point_in_ring(p, r) for y0, y1, x0, x1, r in self.rings)

    def crosses(self, a, b):
        seen = set()
        for cy in range(int(min(a[0], b[0]) // CELL), int(max(a[0], b[0]) // CELL) + 1):
            for cx in range(int(min(a[1], b[1]) // CELL), int(max(a[1], b[1]) // CELL) + 1):
                for k in self.idx.get((cy, cx), ()):
                    if k in seen:
                        continue
                    seen.add(k)
                    s = self.segs[k]
                    if seg_intersect(a, b, s[0], s[1]):
                        return True
        return False

    def nearest_coast_km(self, p, search=0.05):
        best = None
        for cy in range(int((p[0] - search) // CELL), int((p[0] + search) // CELL) + 1):
            for cx in range(int((p[1] - search) // CELL), int((p[1] + search) // CELL) + 1):
                for k in self.idx.get((cy, cx), ()):
                    d = hav(p, self.segs[k][0])
                    best = d if best is None or d < best else best
        return best


class Reef:
    """OSM reef areas (closed ways and multipolygon relations) for point-in-reef tests.

    Relation members are not stitched into rings: an even-odd ray cast over all of a
    feature's outer and inner member segments gives the same answer."""

    def __init__(self, elements):
        self.band = defaultdict(list)  # lat band -> [(feature, a, b)]
        for f, e in enumerate(elements):
            if e['type'] == 'way':
                lines = [e.get('geometry', [])]
            else:
                lines = [m.get('geometry', []) for m in e.get('members', []) if m.get('role') in ('outer', 'inner')]
            for g in lines:
                pts = [(q['lat'], q['lon']) for q in g if q]
                for a, b in zip(pts, pts[1:]):
                    for cy in range(int(min(a[0], b[0]) // CELL), int(max(a[0], b[0]) // CELL) + 1):
                        self.band[cy].append((f, a, b))

    def contains(self, p):
        y, x = p
        odd = set()
        for f, a, b in self.band.get(int(y // CELL), ()):
            if (a[0] > y) != (b[0] > y) and x < (b[1] - a[1]) * (y - a[0]) / (b[0] - a[0]) + a[1]:
                odd ^= {f}
        return bool(odd)

    def km(self, a, b):
        """Approximate length of the segment a-b that lies over reef."""
        d = hav(a, b)
        n = max(1, int(d / REEF_STEP_KM))
        hits = sum(self.contains(lerp(a, b, (k + 0.5) / n)) for k in range(n))
        return d * hits / n


# ---------- graph ----------
class Graph:
    def __init__(self, reef=None):
        self.reef = reef
        self.pos, self.adj, self.kind = [], defaultdict(list), []
        self.key = {}
        self.hash = defaultdict(list)

    def node(self, p, kind, key=None):
        if key is not None and key in self.key:
            return self.key[key]
        i = len(self.pos)
        self.pos.append(p)
        self.kind.append(kind)
        if key is not None:
            self.key[key] = i
        self.hash[(int(p[0] // 0.05), int(p[1] // 0.05))].append(i)
        return i

    def edge(self, a, b, src):
        d = hav(self.pos[a], self.pos[b])
        if src == 'osm':
            w = d
        else:
            r = self.reef.km(self.pos[a], self.pos[b]) if self.reef else 0.0
            w = (d + r * (REEF_COST - 1)) * PENALTY
        self.adj[a].append((b, w, src))
        self.adj[b].append((a, w, src))

    def near(self, p, km, kinds=None):
        r = int(km / 5.5) + 1
        cy, cx = int(p[0] // 0.05), int(p[1] // 0.05)
        out = []
        for y in range(cy - r, cy + r + 1):
            for x in range(cx - r, cx + r + 1):
                for i in self.hash.get((y, x), ()):
                    if kinds and self.kind[i] not in kinds:
                        continue
                    d = hav(p, self.pos[i])
                    if d <= km:
                        out.append((d, i))
        return sorted(out)

    def prune(self, min_size):
        """Drop components smaller than min_size from the spatial hash, so stops never attach
        to water pockets sealed in by a coastline (lakes, or gaps where a coast way is open)."""
        comp = {}
        for s0 in range(len(self.pos)):
            if s0 in comp:
                continue
            comp[s0], stack, members = s0, [s0], [s0]
            while stack:
                for v, _, _ in self.adj[stack.pop()]:
                    if v not in comp:
                        comp[v] = s0
                        stack.append(v)
                        members.append(v)
            if len(members) < min_size:
                dead = set(members)
                for k, ids in self.hash.items():
                    self.hash[k] = [i for i in ids if i not in dead]

    def dijkstra(self, s, t):
        dist, prev = {s: 0.0}, {}
        h = [(0.0, s)]
        while h:
            d, u = heapq.heappop(h)
            if u == t:
                break
            if d > dist[u]:
                continue
            for v, w, src in self.adj[u]:
                nd = d + w
                if nd < dist.get(v, 1e18):
                    dist[v], prev[v] = nd, (u, src)
                    heapq.heappush(h, (nd, v))
        if t not in prev and s != t:
            return None
        path, u = [(t, None)], t
        while u != s:
            u, src = prev[u]
            path.append((u, src))
        path.reverse()
        # [(node, source of edge leaving this node)]
        return [(path[i][0], path[i + 1][1] if i + 1 < len(path) else None) for i in range(len(path))]


def build_graph(ferry, land, bbox, reef=None, grid_deg=GRID_DEG):
    G = Graph(reef)
    s, w, n, e = bbox
    # OSM ferry routes
    for way in ferry:
        pts = [(g['lat'], g['lon']) for g in way.get('geometry', [])]
        ids = [G.node(p, 'ferry', key=nid) for p, nid in zip(pts, way['nodes'])]
        for a, b in zip(ids, ids[1:]):
            G.edge(a, b, 'osm')
    # open-water grid
    grid = {}
    lat = s
    r = 0
    while lat <= n:
        lon, c = w, 0
        while lon <= e:
            if not land.on_land((lat, lon)):
                grid[(r, c)] = G.node((lat, lon), 'grid')
            lon += grid_deg
            c += 1
        lat += grid_deg
        r += 1
    for (r, c), i in grid.items():
        for dr, dc in ((0, 1), (1, 0), (1, 1), (1, -1)):
            j = grid.get((r + dr, c + dc))
            if j is not None and not land.crosses(G.pos[i], G.pos[j]):
                G.edge(i, j, 'inferred')
    # connect ferry vertices to the grid and to other ferry ways
    ferry_nodes = [i for i, k in enumerate(G.kind) if k == 'ferry']
    for i in ferry_nodes:
        p = G.pos[i]
        links = 0
        for d, j in G.near(p, LINK_KM, kinds=('grid',)):
            if links >= 4:
                break
            if not land.crosses(p, G.pos[j]):
                G.edge(i, j, 'inferred')
                links += 1
        for d, j in G.near(p, 1.5, kinds=('ferry',))[:6]:
            if j != i and not any(v == j for v, _, _ in G.adj[i]) and not land.crosses(p, G.pos[j]):
                G.edge(i, j, 'inferred')
    G.prune(50)
    return G


def attach_stop(G, land, sid, p):
    """Stops may be island centroids (on land), so ignore the coast within the stop's own island."""
    i = G.node(p, 'stop', key=('stop', sid))
    coast = land.nearest_coast_km(p)
    exempt = (coast * 1.6 + 0.3) if (coast is not None and land.on_land(p)) else 0.3
    linked = 0
    for d, j in G.near(p, STOP_LINK_KM, kinds=('ferry', 'grid')):
        if linked >= 10:
            break
        q = G.pos[j]
        t = min(0.95, exempt / d) if d > 0 else 0
        if not land.crosses(lerp(p, q, t), q):
            G.edge(i, j, 'inferred')
            linked += 1
    if not linked:
        d, j = G.near(p, 50, kinds=('ferry', 'grid'))[0]
        G.edge(i, j, 'inferred')
    return i, exempt


def route_pair(G, land, a, b, stops):
    path = G.dijkstra(stops[a][0], stops[b][0])
    pa, pb = G.pos[stops[a][0]], G.pos[stops[b][0]]
    if not path:
        return [(pa, 'inferred'), (pb, 'inferred')]
    pts = [(G.pos[n], src or 'inferred') for n, src in path]

    def reef_km(i, k):
        return sum(G.reef.km(pts[m][0], pts[m + 1][0]) for m in range(i, k)) if G.reef else 0.0

    def clear(p, q, i, j):
        # a shortcut may not add reef exposure, so paths keep to the passes
        if G.reef and G.reef.km(p, q) > reef_km(i, j) + 0.05:
            return False
        # exempt the stop's own island at either end
        if i == 0:
            d = hav(p, q)
            p = lerp(p, q, min(0.95, stops[a][1] / d)) if d > 0 else p
        if j == len(pts) - 1:
            d = hav(p, q)
            q = lerp(q, p, min(0.95, stops[b][1] / d)) if d > 0 else q
        return not land.crosses(p, q)

    # straighten inferred stretches (string pulling), keep OSM geometry
    out, i = [pts[0]], 0
    while i < len(pts) - 1:
        if pts[i][1] == 'osm':
            out.append(pts[i + 1])
            i += 1
            continue
        j = i + 1
        k = i + 1
        while k < len(pts) and (k == i + 1 or pts[k - 1][1] != 'osm'):
            if clear(pts[i][0], pts[k][0], i, k):
                j = k
            k += 1
        out.append(pts[j])
        i = j
    # simplify OSM runs, tag each point with the source of the edge that leaves it
    res, run = [], [out[0]]
    for pt in out[1:]:
        if pt[1] == run[-1][1] or len(run) == 0:
            run.append(pt)
        else:
            run.append(pt)
            res.append(run)
            run = [pt]
    res.append(run)
    final = []
    for r in res:
        src = r[0][1]
        coords = [p for p, _ in r]
        if src == 'osm':
            coords = douglas_peucker(coords, 0.0003)
        for c in coords:
            if final and final[-1][0] == c:
                continue
            final.append((c, src))
    final[-1] = (pb, final[-1][1])
    final[0] = (pa, final[0][1])
    return final


# ---------- GTFS I/O ----------
def read_csv(path):
    with open(path, encoding='utf-8-sig', newline='') as f:
        return list(csv.DictReader(f))


def write_csv(path, rows, cols):
    with open(path, 'w', encoding='utf-8', newline='') as f:
        wr = csv.DictWriter(f, fieldnames=cols, extrasaction='ignore')
        wr.writeheader()
        wr.writerows(rows)


def shape_rows(shape_id, pts):
    rows, dist = [], 0.0
    for k, (c, src) in enumerate(pts):
        if k:
            dist += hav(pts[k - 1][0], c)
        rows.append({'shape_id': shape_id, 'shape_pt_lat': f'{c[0]:.5f}', 'shape_pt_lon': f'{c[1]:.5f}',
                     'shape_pt_sequence': k + 1, 'shape_dist_traveled': f'{dist:.3f}', 'shape_pt_source': src})
    return rows


def route_all(pos, pairs, cache, grid_deg=GRID_DEG):
    """Route each (a, b) stop pair; returns {(a, b): [((lat, lon), source), ...]}."""
    lats, lons = [p[0] for p in pos.values()], [p[1] for p in pos.values()]
    bbox = (min(lats) - 0.15, min(lons) - 0.15, max(lats) + 0.15, max(lons) + 0.15)
    bb = f'{bbox[0]:.3f},{bbox[1]:.3f},{bbox[2]:.3f},{bbox[3]:.3f}'
    tag = bb.replace(',', '_')
    ferry = overpass(f'[out:json][timeout:180];way["route"="ferry"]({bb});out geom;',
                     os.path.join(cache, f'ferry_{tag}.json'))['elements']
    coast = overpass(f'[out:json][timeout:180];way["natural"="coastline"]({bb});out geom;',
                     os.path.join(cache, f'coast_{tag}.json'))['elements']
    reefs = overpass(f'[out:json][timeout:180];(way["natural"="reef"]({bb});relation["natural"="reef"]({bb}););'
                     'out geom;', os.path.join(cache, f'reef_{tag}.json'))['elements']
    print(f'OSM: {len(ferry)} ferry ways, {len(coast)} coastline ways, {len(reefs)} reefs', file=sys.stderr)

    land = Land(coast)
    G = build_graph(ferry, land, bbox, Reef(reefs), grid_deg)
    used = {s for p in pairs for s in p}
    stops = {s: attach_stop(G, land, s, pos[s]) for s in used}
    print(f'graph: {len(G.pos)} nodes; routing {len(pairs)} stop pairs', file=sys.stderr)

    seg = {}
    for a, b in sorted(pairs):
        if (b, a) in seg:
            seg[(a, b)] = list(reversed([(c, s) for c, s in seg[(b, a)]]))
            # after reversing, each point's tag should describe the edge leaving it
            pts = seg[(a, b)]
            seg[(a, b)] = [(pts[k][0], pts[k + 1][1] if k + 1 < len(pts) else pts[k][1]) for k in range(len(pts))]
        else:
            seg[(a, b)] = route_pair(G, land, a, b, stops)

    return seg


def main_bundle(args):
    with open(os.path.join(args.bundle, 'stops.json'), encoding='utf-8') as f:
        stops_in = json.load(f)
    with open(os.path.join(args.bundle, 'legs.json'), encoding='utf-8') as f:
        legs = json.load(f)
    pos = {s['id']: (float(s['lat']), float(s['lon'])) for s in stops_in}
    pairs = {tuple(sorted((l['from'], l['to']))) for l in legs
             if l['from'] != l['to'] and l['from'] in pos and l['to'] in pos}
    seg = route_all(pos, pairs, args.cache, BUNDLE_GRID_DEG)
    features = []
    for (a, b), v in sorted(seg.items()):
        tot = osm = 0.0
        for k in range(len(v) - 1):
            d = hav(v[k][0], v[k + 1][0])
            tot += d
            osm += d if v[k][1] == 'osm' else 0
        features.append({'type': 'Feature', 'properties': {'a': a, 'b': b, 'osm': round(osm / max(tot, 1e-9), 2)},
                         'geometry': {'type': 'LineString',
                                      'coordinates': [[round(c[1], 5), round(c[0], 5)] for c, _ in v]}})
    out = {'type': 'FeatureCollection',
           'attribution': 'Route paths: © OpenStreetMap contributors, ODbL',
           'features': features}
    path = os.path.join(args.bundle, 'routes.geojson')
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(out, f, separators=(',', ':'))
    print(f'wrote {path}: {len(features)} stop pairs', file=sys.stderr)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--gtfs', help='folder with stops.txt, trips.txt, stop_times.txt')
    ap.add_argument('--out', help='output folder (GTFS mode)')
    ap.add_argument('--bundle', help='app data folder with stops.json and legs.json; writes routes.geojson there')
    ap.add_argument('--crossings', help='optional crossings.csv (from_harbour,to_harbour)')
    ap.add_argument('--cache', default=os.path.join(os.path.dirname(os.path.abspath(__file__)), 'osm_cache'))
    args = ap.parse_args()
    if not args.bundle and not (args.gtfs and args.out):
        ap.error('give --bundle, or both --gtfs and --out')
    os.makedirs(args.cache, exist_ok=True)
    if args.bundle:
        return main_bundle(args)
    os.makedirs(args.out, exist_ok=True)

    stops_in = read_csv(os.path.join(args.gtfs, 'stops.txt'))
    parent = {s['stop_id']: (s.get('parent_station') or '').strip() or s['stop_id'] for s in stops_in}
    pos = {s['stop_id']: (float(s['stop_lat']), float(s['stop_lon'])) for s in stops_in if s.get('stop_lat')}
    trips = read_csv(os.path.join(args.gtfs, 'trips.txt'))
    seqs = defaultdict(list)
    for r in read_csv(os.path.join(args.gtfs, 'stop_times.txt')):
        seqs[r['trip_id']].append((int(r['stop_sequence']), r['stop_id']))
    trip_stops = {t: [s for _, s in sorted(v)] for t, v in seqs.items()}
    pairs = set()
    for st in trip_stops.values():
        pairs.update(zip(st, st[1:]))
    cross_pairs = []
    if args.crossings:
        for r in read_csv(args.crossings):
            a, b = parent.get(r['from_harbour'], r['from_harbour']), parent.get(r['to_harbour'], r['to_harbour'])
            if a in pos and b in pos:
                cross_pairs.append((a, b))
                pairs.add((a, b))

    seg = route_all(pos, pairs, args.cache)

    # shapes per distinct stop sequence
    shapes, shape_of_seq, rows = {}, {}, []
    for tid, st in trip_stops.items():
        key = tuple(st)
        if key not in shape_of_seq:
            sid = f'SH{len(shape_of_seq) + 1:03d}'
            pts = []
            for a, b in zip(st, st[1:]):
                s = seg[(a, b)]
                pts.extend(s if not pts else s[1:])
            shape_of_seq[key] = sid
            rows.extend(shape_rows(sid, pts))
        shapes[tid] = shape_of_seq[key]
    cols = ['shape_id', 'shape_pt_lat', 'shape_pt_lon', 'shape_pt_sequence', 'shape_dist_traveled', 'shape_pt_source']
    write_csv(os.path.join(args.out, 'shapes.txt'), rows, cols)
    tcols = list(trips[0].keys()) + ([] if 'shape_id' in trips[0] else ['shape_id'])
    for t in trips:
        t['shape_id'] = shapes.get(t['trip_id'], t.get('shape_id', ''))
    write_csv(os.path.join(args.out, 'trips.txt'), trips, tcols)
    if cross_pairs:
        crow = []
        for a, b in dict.fromkeys(cross_pairs):
            crow.extend(shape_rows(f'{a}>{b}', seg[(a, b)]))
        write_csv(os.path.join(args.out, 'crossing_shapes.txt'), crow, cols)
    with open(os.path.join(args.out, 'segments.json'), 'w', encoding='utf-8') as f:
        json.dump({f'{a}|{b}': [[round(c[0], 5), round(c[1], 5), s] for c, s in v] for (a, b), v in seg.items()}, f)

    osm_km = tot_km = 0.0
    for v in seg.values():
        for k in range(len(v) - 1):
            d = hav(v[k][0], v[k + 1][0])
            tot_km += d
            osm_km += d if v[k][1] == 'osm' else 0
    print(f'done: {len(shape_of_seq)} shapes, {len(seg)} stop pairs; '
          f'{100 * osm_km / max(tot_km, 1e-9):.0f}% of path length follows OSM ferry routes', file=sys.stderr)


if __name__ == '__main__':
    main()
