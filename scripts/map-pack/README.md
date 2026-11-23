# Offline Nairobi map pack

Builds `public/offline/`: everything the app needs to show the Nairobi map, identify a tapped
spot, search and find routes **with no network** (backend plan, section 6A).

| File | What | Size |
| --- | --- | --- |
| `nairobi.pmtiles` | Vector street map, zoom 9–14 (drawn up to 19), roads, water, parks, estate names | ~4.3 MB |
| `roads.pack` | Road graph for A* routing: 148k junctions, 179k road pieces, one-way rules, road names | ~2.7 MB |
| `places.pack` | Estates and neighbourhoods, wards, ~5,000 landmarks for tap-to-identify and search | ~0.15 MB |
| `manifest.json` | Pack version, data release, file sizes and hashes | tiny |

Area covered (`bbox.py`): Kikuyu/Karen to Ruai, Ruiru/Githurai to Rongai/Syokimau.

## Rebuild

```sh
python3 -m venv .venv && .venv/bin/pip install pyarrow shapely mapbox-vector-tile pmtiles numpy
.venv/bin/python fetch.py data          # Overture Maps data from anonymous S3, about 20 s
.venv/bin/python build.py data ../../public/offline   # about 40 s
```

Data comes from [Overture Maps](https://overturemaps.org) (release in `bbox.py`), which
is built from OpenStreetMap: keep "© OpenStreetMap contributors" visible in the app (ODbL).
Bump `RELEASE` in `bbox.py` to refresh the map; the manifest version changes with the data,
so phones download the new pack once and drop the old one.

Notes:
- Only the largest connected road network is kept, so every point the app snaps to can reach every other.
- Landmarks with low confidence, or stacked on one default point with other places, are dropped.
- The CBD has no estate point in the data, so `build.py` names it from the "CBD division" boundary.
