"""Download the Overture Maps data (built from OpenStreetMap, ODbL) that the offline
Nairobi map pack is made from. Anonymous S3, no key needed.

Usage: python3 fetch.py OUT_DIR
Writes OUT_DIR/{segment,connector,place,division,division_area,water,land_use,land_cover}.parquet
"""
import sys, os, time
import pyarrow.dataset as ds, pyarrow.fs as pfs, pyarrow.parquet as pq
from bbox import BBOX, RELEASE

out = sys.argv[1] if len(sys.argv) > 1 else 'data'
os.makedirs(out, exist_ok=True)
fs = pfs.S3FileSystem(anonymous=True, region='us-west-2')
W, S, E, N = BBOX
f = (ds.field('bbox', 'xmin') < E) & (ds.field('bbox', 'xmax') > W) & (ds.field('bbox', 'ymin') < N) & (ds.field('bbox', 'ymax') > S)

def get(theme, typ, cols, extra=None):
    t = time.time()
    d = ds.dataset(f'{RELEASE}/theme={theme}/type={typ}/', filesystem=fs, format='parquet')
    cols = [c for c in cols if c in d.schema.names]
    tb = d.to_table(columns=cols, filter=f if extra is None else f & extra)
    pq.write_table(tb, os.path.join(out, f'{typ}.parquet'))
    print(typ, tb.num_rows, f'{time.time() - t:.0f}s', flush=True)

jobs = {
    'segment': lambda: get('transportation', 'segment', ['id', 'class', 'subtype', 'names', 'geometry', 'connectors', 'access_restrictions', 'road_flags'], ds.field('subtype') == 'road'),
    'place': lambda: get('places', 'place', ['names', 'categories', 'basic_category', 'confidence', 'geometry']),
    'division': lambda: get('divisions', 'division', ['names', 'subtype', 'class', 'geometry', 'population']),
    'division_area': lambda: get('divisions', 'division_area', ['names', 'subtype', 'class', 'geometry']),
    'water': lambda: get('base', 'water', ['names', 'class', 'subtype', 'geometry']),
    'land_use': lambda: get('base', 'land_use', ['names', 'class', 'subtype', 'geometry']),
}
for name in (sys.argv[2:] or jobs):
    jobs[name]()
