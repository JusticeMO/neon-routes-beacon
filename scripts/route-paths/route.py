"""Route each matatu route through its stages (stages.json) over the roads in
segment.parquet and write routes_out.json (paths + stage positions on the road).
Car roads only; the Nairobi Expressway is excluded; major roads are preferred."""
import pyarrow.parquet as pq, shapely, networkx as nx, math, json
from shapely.geometry import LineString
rows=pq.read_table('segment.parquet',columns=['class','names','geometry']).to_pylist()
SKIP={'footway','path','track','steps','cycleway','pedestrian'}
F={'motorway':.8,'trunk':.85,'primary':.9,'secondary':1.0,'tertiary':1.2,'unclassified':1.6,'residential':2.0,'living_street':3,'service':4,'unknown':2.5}
def d(a,b):
    kx=111320*math.cos(math.radians(a[1])); return math.hypot((a[0]-b[0])*kx,(a[1]-b[1])*110540)
G=nx.Graph(); byname={}
for r in rows:
    nm0=(r['names'] or {}).get('primary') or ''
    if r['class'] in SKIP or r['class']=='motorway' or 'xpressway' in nm0: continue
    g=shapely.from_wkb(r['geometry']); cs=[(round(x,7),round(y,7)) for x,y in g.coords]
    nm=(r['names'] or {}).get('primary')
    for a,b in zip(cs,cs[1:]):
        w=d(a,b)*F.get(r['class'],2.5)
        if not G.has_edge(a,b) or G[a][b]['w']>w: G.add_edge(a,b,w=w,len=d(a,b))
    if nm:
        byname.setdefault(nm,set()).update(cs)
print('graph',G.number_of_nodes())
big=max(nx.connected_components(G),key=len); G=G.subgraph(big).copy()
def snap(lat,lng,hint=None):
    p=(lng,lat); cand=[n for n in byname.get(hint,()) if n in G] if hint else []
    if not cand: cand=list(G.nodes)
    return min(cand,key=lambda n:d(n,p))
ROUTES=json.load(open('stages.json'))
out={}
for num,stops in ROUTES.items():
    nodes=[snap(s['lat'],s['lng'],s.get('road')) for s in stops]
    path=[nodes[0]]; total=0
    for a,b in zip(nodes,nodes[1:]):
        sp=nx.shortest_path(G,a,b,weight='w'); path+=sp[1:]
        total+=sum(G[u][v]['len'] for u,v in zip(sp,sp[1:]))
    # Remove spurs and loops (A..B..A): keep the first visit of each node.
    clean=[]; pos={}
    for n in path:
        if n in pos:
            k=pos[n]
            for m in clean[k+1:]: pos.pop(m,None)
            clean=clean[:k+1]
        else:
            pos[n]=len(clean); clean.append(n)
    path=clean
    full=LineString(path)
    ls=full.simplify(0.00003)
    from shapely.geometry import Point
    ds_=[ls.project(Point(s['lng'],s['lat'])) if 0<i<len(stops)-1 else ls.project(Point(n)) for i,(s,n) in enumerate(zip(stops,nodes))]
    for i in range(1,len(ds_)): ds_[i]=max(ds_[i],ds_[i-1]+0.0015)
    ds_=[min(x,ls.length) for x in ds_]
    nodes=[(lambda q:(q.x,q.y))(ls.interpolate(x)) for x in ds_]
    out[num]={'path':[{'lat':round(y,6),'lng':round(x,6)} for x,y in ls.coords],
              'stops':[{'name':s['name'],'lat':round(n[1],6),'lng':round(n[0],6)} for s,n in zip(stops,nodes)],'km':round(total/1000,1)}
    print(num,len(path),'->',len(ls.coords),'pts',round(total/1000,1),'km', [round(d(n,(s['lng'],s['lat']))) for s,n in zip(stops,nodes)])
json.dump(out,open('routes_out.json','w'))
