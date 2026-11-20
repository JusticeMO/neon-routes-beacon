# Route paths

`src/data/routes.ts` paths follow real Nairobi roads. They were made offline:

1. `pip install pyarrow shapely networkx`
2. `python3 fetch_roads.py roads` downloads Overture Maps road segments (built from OpenStreetMap, ODbL) for Nairobi into `segment.parquet` (about 8 MB, anonymous S3, no key).
3. Edit `stages.json` (stage name, rough position, and optionally the road it is on).
4. `python3 route.py` writes `routes_out.json`: each route's road path, its length, and each stage moved onto that path. Copy the paths and stages into `src/data/routes.ts`.

Routing is undirected (it ignores one-way rules), so check new routes on a map before shipping.
