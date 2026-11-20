"""Download Overture Maps roads (from OpenStreetMap) around Nairobi into segment.parquet.
Usage: python3 fetch_roads.py roads"""
import pyarrow.dataset as ds, pyarrow.fs as pfs, pyarrow.parquet as pq, time, sys
fs=pfs.S3FileSystem(anonymous=True, region='us-west-2')
R='overturemaps-us-west-2/release/2026-11-18.0'
f=(ds.field('bbox','xmin')<36.94)&(ds.field('bbox','xmax')>36.67)&(ds.field('bbox','ymin')<-1.19)&(ds.field('bbox','ymax')>-1.38)
def get(theme,typ,cols,extra=None):
    t=time.time()
    d=ds.dataset(f'{R}/theme={theme}/type={typ}/',filesystem=fs,format='parquet')
    flt=f if extra is None else f&extra
    tb=d.to_table(columns=cols,filter=flt)
    pq.write_table(tb,f'{typ}.parquet'); print(typ,tb.num_rows,round(time.time()-t),flush=True)
which=sys.argv[1]
if which=='roads': get('transportation','segment',['id','class','subtype','names','geometry','connectors'],ds.field('subtype')=='road')
elif which=='places': get('places','place',['names','basic_category','geometry'])
elif which=='building': get('buildings','building',['geometry'])
else: get('base',which,['class','subtype','geometry'])
