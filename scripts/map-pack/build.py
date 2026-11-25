"""Bake the offline Nairobi map pack from the Overture data that fetch.py downloaded.

Usage: python3 build.py DATA_DIR OUT_DIR
Writes into OUT_DIR (normally public/offline/):
  nairobi.pmtiles   vector street map, zoom 9-14 (the app overzooms past 14)
  roads.pack        road graph for offline routing (gzip, format in src/lib/offline/roadGraph.ts)
  places.pack       areas, wards and landmarks for tap-to-identify and search (gzip JSON)
  manifest.json     version, data release, sizes and hashes, attribution
"""
import sys, os, json, gzip, hashlib, math, struct, datetime, collections
import numpy as np
import pyarrow.parquet as pq
import shapely
from shapely import wkb
from shapely.geometry import box, LineString, Point, Polygon, MultiPolygon
from shapely.ops import substring
from shapely.strtree import STRtree
import mapbox_vector_tile
from pmtiles.tile import zxy_to_tileid, TileType, Compression
from pmtiles.writer import Writer
from bbox import BBOX, RELEASE

DATA, OUT = sys.argv[1], sys.argv[2]
os.makedirs(OUT, exist_ok=True)
W, S, E, N = BBOX
MINZOOM, MAXZOOM = 9, 14


def rows(name):
    return pq.read_table(os.path.join(DATA, f'{name}.parquet')).to_pylist()


def primary(names):
    if not names:
        return None
    return names.get('primary') or None


def inside(lng, lat):
    return W <= lng <= E and S <= lat <= N


# ---------------------------------------------------------------- road graph
CLASSES = ['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'unclassified', 'residential',
           'living_street', 'service', 'track', 'unknown', 'path', 'footway', 'steps', 'pedestrian', 'cycleway']
FOOT_ONLY = {'path', 'footway', 'steps', 'pedestrian', 'cycleway'}
NO_FOOT = {'motorway'}
KLAT = 111_320.0
KLNG = 111_320.0 * math.cos(math.radians((S + N) / 2))


def length_m(coords):
    a = np.asarray(coords)
    d = np.diff(a, axis=0)
    return float(np.sum(np.hypot(d[:, 0] * KLNG, d[:, 1] * KLAT)))


def car_directions(restrictions):
    """(forward, backward) allowed for motor vehicles, from Overture access_restrictions."""
    fwd = bwd = True
    for r in restrictions or []:
        if r.get('access_type') != 'denied' or r.get('between'):
            continue
        when = r.get('when') or {}
        if when.get('during') or when.get('using') or when.get('recognized') or when.get('vehicle'):
            continue
        modes = when.get('mode')
        if modes and not ({'motor_vehicle', 'car', 'vehicle'} & set(modes)):
            continue
        h = when.get('heading')
        if h == 'backward':
            bwd = False
        elif h == 'forward':
            fwd = False
        elif h is None and not modes:
            fwd = bwd = False
    return fwd, bwd


segments = rows('segment')
node_ix, node_xy = {}, []
edges = []  # (a, b, length, cls, flags, name, coords)
names, name_ix = [], {}
road_lines = []  # for tiles: (cls, name, LineString lng/lat)

for s in segments:
    g = wkb.loads(s['geometry'])
    if g.geom_type != 'LineString' or g.length == 0:
        continue
    cls = s['class'] or 'unknown'
    if cls not in CLASSES:
        cls = 'unknown'
    nm = primary(s['names'])
    road_lines.append((cls, nm, g))
    conns = sorted(s['connectors'] or [], key=lambda c: c['at'])
    if len(conns) < 2:
        continue
    fwd, bwd = car_directions(s['access_restrictions'])
    car = cls not in FOOT_ONLY
    flags = (1 if car and fwd else 0) | (2 if car and bwd else 0) | (0 if cls in NO_FOOT else 4)
    if nm is not None and nm not in name_ix:
        name_ix[nm] = len(names)
        names.append(nm)
    ni = name_ix.get(nm, 0xFFFF)
    for c0, c1 in zip(conns, conns[1:]):
        if c1['at'] - c0['at'] <= 0:
            continue
        part = substring(g, c0['at'], c1['at'], normalized=True)
        coords = list(part.coords) if part.geom_type == 'LineString' else [part.coords[0], part.coords[0]]
        ids = []
        for cid, xy in ((c0['connector_id'], coords[0]), (c1['connector_id'], coords[-1])):
            if cid not in node_ix:
                node_ix[cid] = len(node_xy)
                node_xy.append(xy)
            ids.append(node_ix[cid])
        if ids[0] == ids[1]:
            continue
        simp = list(LineString(coords).simplify(0.00002).coords) if len(coords) > 2 else coords
        edges.append((ids[0], ids[1], length_m(coords), CLASSES.index(cls), flags, ni, simp[1:-1]))

# Keep only the largest connected piece of the network so every snapped point can reach every other.
parent = list(range(len(node_xy)))


def find(x):
    while parent[x] != x:
        parent[x] = parent[parent[x]]
        x = parent[x]
    return x


for a, b, *_ in edges:
    ra, rb = find(a), find(b)
    if ra != rb:
        parent[ra] = rb
roots = collections.Counter(find(i) for i in range(len(node_xy)))
main = roots.most_common(1)[0][0]
keep_nodes = [i for i in range(len(node_xy)) if find(i) == main]
remap = {old: new for new, old in enumerate(keep_nodes)}
edges = [(remap[a], remap[b], *rest) for a, b, *rest in edges if a in remap and b in remap]
node_xy = [node_xy[i] for i in keep_nodes]
print(f'graph: {len(node_xy)} nodes, {len(edges)} edges, {len(names)} road names '
      f'(dropped {len(roots) - 1} small islands)', flush=True)


def write_graph(path):
    q = lambda v: int(round(v * 1e6))
    nodes = np.array([[q(x), q(y)] for x, y in node_xy], dtype='<i4').ravel()
    e_from = np.array([e[0] for e in edges], dtype='<u4')
    e_to = np.array([e[1] for e in edges], dtype='<u4')
    e_len = np.array([e[2] for e in edges], dtype='<f4')
    geom_start, geom_len, geom = [], [], []
    for e in edges:
        geom_start.append(len(geom) // 2)
        geom_len.append(len(e[6]))
        for x, y in e[6]:
            geom += [q(x), q(y)]
    e_gs = np.array(geom_start, dtype='<u4')
    e_gl = np.array(geom_len, dtype='<u2')
    e_name = np.array([e[5] for e in edges], dtype='<u2')
    e_cls = np.array([e[3] for e in edges], dtype='u1')
    e_flags = np.array([e[4] for e in edges], dtype='u1')
    g = np.array(geom, dtype='<i4')
    name_bytes = '\n'.join(names).encode('utf-8')
    parts = [nodes, e_from, e_to, e_len, e_gs, g, e_gl, e_name, e_cls, e_flags]
    header = struct.pack('<4s5I', b'BRG1', len(node_xy), len(edges), len(g) // 2, len(names), len(name_bytes))
    body = b''.join(p.tobytes() for p in parts)
    raw = header + body
    raw += b'\0' * ((-len(raw)) % 4) + name_bytes
    with open(path, 'wb') as f:
        f.write(gzip.compress(raw, 9, mtime=0))


write_graph(os.path.join(OUT, 'roads.pack'))

# ---------------------------------------------------------------- places index
AREA_KIND = {'macrohood': 0, 'neighborhood': 1, 'microhood': 2, 'locality': 3}
areas = []
for d in rows('division'):
    nm = primary(d['names'])
    k = AREA_KIND.get(d['subtype'])
    if nm is None or k is None:
        continue
    if nm == 'CBD division':
        nm, k = 'CBD', 0  # the city centre has no estate point of its own
    elif k == 3 and (nm.endswith((' ward', ' sublocation', ' location', ' division')) or nm == 'Nairobi'):
        continue
    p = wkb.loads(d['geometry'])
    if inside(p.x, p.y):
        areas.append([nm, round(p.x, 5), round(p.y, 5), k])

REGION_SUFFIX = {' ward': 'ward', ' subcounty': 'subcounty'}
regions = []
for d in rows('division_area'):
    nm = primary(d['names'])
    if nm is None or d['class'] != 'land':
        continue
    if d['subtype'] == 'county':
        kind = 'subcounty' if nm not in ('Nairobi', 'Kiambu', 'Kajiado', 'Machakos') else 'county'
    elif d['subtype'] == 'locality' and nm.endswith(' ward'):
        kind = 'ward'
    else:
        continue
    g = wkb.loads(d['geometry']).simplify(0.0004)
    polys = list(g.geoms) if isinstance(g, MultiPolygon) else [g]
    rings = [[[round(x, 5), round(y, 5)] for x, y in p.exterior.coords] for p in polys if p.area > 0]
    if rings:
        regions.append({'name': nm, 'kind': kind, 'rings': rings})

# Landmarks: well-known, confident places only. Category -> friendly kind.
POI_KIND = {
    'hospital': 'hospital', 'health_care': 'clinic', 'pharmacy_and_drug_store': 'pharmacy', 'dental_clinic': 'clinic',
    'shopping_mall': 'mall', 'shopping': 'shopping', 'warehouse_club_store': 'supermarket', 'food_and_beverage_store': 'supermarket',
    'gas_station': 'fuel', 'bank_or_credit_union': 'bank', 'hotel': 'hotel', 'lodging': 'hotel',
    'restaurant': 'restaurant', 'casual_eatery': 'restaurant', 'cafe': 'cafe', 'bar': 'bar',
    'christian_place_of_worship': 'church', 'religious_organization': 'worship', 'muslim_place_of_worship': 'mosque',
    'place_of_learning': 'school', 'elementary_school': 'school', 'education': 'school', 'college_university': 'college',
    'specialty_school': 'school', 'government_office': 'government', 'police_department': 'police',
    'park': 'park', 'stadium_arena': 'stadium', 'bus_station': 'bus station', 'train_station': 'train station',
    'airport': 'airport', 'museum': 'museum', 'historic_site': 'landmark', 'market': 'market', 'gym': 'gym',
}
pois = []
seen = set()
# Places with no real address are often dropped on one default point (the city centre, an estate's
# centroid). Several unrelated places on exactly the same spot are not trustworthy as landmarks.
stack = collections.Counter()
for p in rows('place'):
    pt = wkb.loads(p['geometry'])
    stack[(round(pt.x, 4), round(pt.y, 4))] += 1
for p in rows('place'):
    kind = POI_KIND.get(p['basic_category'])
    nm = primary(p['names'])
    if not kind or not nm or (p['confidence'] or 0) < 0.75:
        continue
    pt = wkb.loads(p['geometry'])
    if not inside(pt.x, pt.y) or stack[(round(pt.x, 4), round(pt.y, 4))] >= 3:
        continue
    key = (nm.lower(), round(pt.x, 3), round(pt.y, 3))
    if key in seen:
        continue
    seen.add(key)
    pois.append([nm, kind, round(pt.x, 5), round(pt.y, 5)])
print(f'places: {len(areas)} areas, {len(regions)} regions, {len(pois)} landmarks', flush=True)

places = {'v': 1, 'bbox': BBOX, 'areas': areas, 'regions': regions, 'pois': pois}
with open(os.path.join(OUT, 'places.pack'), 'wb') as f:
    f.write(gzip.compress(json.dumps(places, ensure_ascii=False, separators=(',', ':')).encode(), 9, mtime=0))

# ---------------------------------------------------------------- vector tiles
R = 6378137.0


def merc(c):
    x = c[:, 0] * math.pi / 180 * R
    y = np.log(np.tan(math.pi / 4 + c[:, 1] * math.pi / 360)) * R
    return np.column_stack([x, y])


def to_merc(g):
    return shapely.transform(g, merc)


def tile_bounds(z, x, y):
    n = 2 ** z
    size = 2 * math.pi * R / n
    minx = -math.pi * R + x * size
    maxy = math.pi * R - y * size
    return minx, maxy - size, minx + size, maxy


def lnglat_to_tile(lng, lat, z):
    n = 2 ** z
    x = int((lng + 180) / 360 * n)
    y = int((1 - math.log(math.tan(math.radians(lat)) + 1 / math.cos(math.radians(lat))) / math.pi) / 2 * n)
    return x, y


ROAD_KIND = {
    'motorway': ('highway', 9), 'trunk': ('highway', 9), 'primary': ('major_road', 10), 'secondary': ('major_road', 11),
    'tertiary': ('medium_road', 12), 'unclassified': ('minor_road', 13), 'residential': ('minor_road', 13),
    'living_street': ('minor_road', 14), 'unknown': ('minor_road', 14), 'service': ('service', 14), 'track': ('path', 14),
    'path': ('path', 14), 'footway': ('path', 14), 'steps': ('path', 14), 'pedestrian': ('path', 14), 'cycleway': ('path', 14),
}
LANDUSE_KIND = {
    'park': 'park', 'garden': 'park', 'recreation_ground': 'park', 'grass': 'park', 'pitch': 'park', 'golf_course': 'park',
    'fairway': 'park', 'green': 'park', 'meadow': 'park', 'playground': 'park', 'nature_reserve': 'forest', 'forest': 'forest',
    'wood': 'forest', 'national_park': 'forest', 'protected_area': 'forest', 'cemetery': 'park',
    'hospital': 'hospital', 'school': 'school', 'university': 'school', 'college': 'school',
    'industrial': 'industrial', 'works': 'industrial', 'commercial': 'commercial', 'retail': 'commercial',
    'residential': 'residential', 'aerodrome': 'aerodrome', 'airport': 'aerodrome', 'military': 'industrial',
}

features = collections.defaultdict(list)  # layer -> [(min_zoom, merc geom, props)]
for cls, nm, g in road_lines:
    kind, mz = ROAD_KIND[cls]
    props = {'kind': kind}
    if nm:
        props['name'] = nm
    features['roads'].append((mz, to_merc(g), props))
for w in rows('water'):
    g = wkb.loads(w['geometry'])
    if w['subtype'] == 'human_made':
        continue
    kind = 'river' if w['subtype'] in ('river', 'stream', 'canal') else 'water'
    props = {'kind': kind}
    if primary(w['names']):
        props['name'] = primary(w['names'])
    mz = 10 if g.geom_type in ('Polygon', 'MultiPolygon') and g.area > 1e-5 else (12 if w['subtype'] == 'river' else 14)
    features['water'].append((mz, to_merc(g), props))
for u in rows('land_use'):
    kind = LANDUSE_KIND.get(u['class']) or LANDUSE_KIND.get(u['subtype'])
    g = wkb.loads(u['geometry'])
    if not kind or g.geom_type not in ('Polygon', 'MultiPolygon'):
        continue
    props = {'kind': kind}
    if primary(u['names']) and g.area > 2e-6:
        props['name'] = primary(u['names'])
    mz = 10 if g.area > 1e-4 else 12 if g.area > 5e-6 else 14
    features['landuse'].append((mz, to_merc(g), props))
AREA_ZOOM = {0: 12, 1: 13, 2: 14, 3: 11}
for nm, x, y, k in areas:
    features['places'].append((AREA_ZOOM[k], to_merc(Point(x, y)), {'kind': ['macrohood', 'neighbourhood', 'microhood', 'locality'][k], 'name': nm}))

trees = {}
for layer, fs in features.items():
    trees[layer] = (STRtree([g for _, g, _ in fs]), fs)

LAYER_ORDER = ['landuse', 'water', 'roads', 'places']
ROAD_RANK = {'highway': 0, 'major_road': 1, 'medium_road': 2, 'minor_road': 3, 'service': 4, 'path': 5}
tiles = []
for z in range(MINZOOM, MAXZOOM + 1):
    x0, y0 = lnglat_to_tile(W, N, z)
    x1, y1 = lnglat_to_tile(E, S, z)
    px = 2 * math.pi * R / 2 ** z / 4096  # metres per tile unit
    for x in range(x0, x1 + 1):
        for y in range(y0, y1 + 1):
            b = tile_bounds(z, x, y)
            buf = (b[2] - b[0]) * 8 / 256
            clip = box(b[0] - buf, b[1] - buf, b[2] + buf, b[3] + buf)
            layers = []
            for layer in LAYER_ORDER:
                tree, fs = trees[layer]
                out = []
                for i in tree.query(clip):
                    mz, g, props = fs[i]
                    if mz > z:
                        continue
                    if layer != 'places':
                        if z < MAXZOOM:
                            g = g.simplify(px * 1.5)
                        g = g.intersection(clip)
                    elif not clip.contains(g):
                        continue
                    if g.is_empty:
                        continue
                    if layer in ('landuse', 'water') and g.geom_type in ('Polygon', 'MultiPolygon') and g.area < (px * 4) ** 2:
                        continue
                    if g.geom_type == 'GeometryCollection':
                        parts = [p for p in g.geoms if p.geom_type in ('LineString', 'MultiLineString', 'Polygon', 'MultiPolygon')]
                        if not parts:
                            continue
                        g = parts[0]
                    out.append({'geometry': g, 'properties': props})
                if layer == 'roads':
                    out.sort(key=lambda f: -ROAD_RANK[f['properties']['kind']])
                if out:
                    layers.append({'name': layer, 'features': out})
            if not layers:
                continue
            data = mapbox_vector_tile.encode(layers, default_options={'quantize_bounds': b, 'extents': 4096, 'y_coord_down': False})
            tiles.append((zxy_to_tileid(z, x, y), gzip.compress(data, 6, mtime=0)))
    print(f'z{z}: {len(tiles)} tiles so far', flush=True)

tiles.sort()
with open(os.path.join(OUT, 'nairobi.pmtiles'), 'wb') as f:
    w = Writer(f)
    for tid, data in tiles:
        w.write_tile(tid, data)
    w.finalize(
        {'tile_type': TileType.MVT, 'tile_compression': Compression.GZIP, 'min_zoom': MINZOOM, 'max_zoom': MAXZOOM,
         'min_lon_e7': int(W * 1e7), 'min_lat_e7': int(S * 1e7), 'max_lon_e7': int(E * 1e7), 'max_lat_e7': int(N * 1e7),
         'center_zoom': 13, 'center_lon_e7': int(36.8172 * 1e7), 'center_lat_e7': int(-1.2864 * 1e7)},
        {'name': 'Beacon Nairobi', 'attribution': '© OpenStreetMap contributors, Overture Maps Foundation',
         'vector_layers': [{'id': l, 'fields': {}} for l in LAYER_ORDER]},
    )

# ---------------------------------------------------------------- manifest
files = {}
for fn in ('nairobi.pmtiles', 'roads.pack', 'places.pack'):
    p = os.path.join(OUT, fn)
    files[fn] = {'bytes': os.path.getsize(p), 'sha256': hashlib.sha256(open(p, 'rb').read()).hexdigest()[:16]}
version = hashlib.sha256(''.join(v['sha256'] for v in files.values()).encode()).hexdigest()[:10]
manifest = {
    'version': version,
    'built': datetime.date.today().isoformat(),
    'source': f'Overture Maps {RELEASE.rsplit("/", 1)[-1]} (OpenStreetMap data, ODbL)',
    'attribution': '© OpenStreetMap contributors',
    'bbox': BBOX,
    'files': files,
}
with open(os.path.join(OUT, 'manifest.json'), 'w') as f:
    json.dump(manifest, f, indent=2)
print(json.dumps(manifest, indent=2))
