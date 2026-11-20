import { useCallback, useState } from 'react';
import LeafletMap from './GoogleMapView';
import GoogleTrafficMap, { type MapProps } from './GoogleTrafficMap';
import { GOOGLE_MAPS_KEY } from '@/lib/tracking/snapRoutes';


/**
 * Google Maps with live traffic when VITE_GOOGLE_MAPS_API_KEY is set,
 * otherwise (or if Google fails to load) the free Leaflet/OpenStreetMap map.
 */
const BeaconMap = (props: MapProps) => {
  const [failed, setFailed] = useState(false);
  const onError = useCallback(() => setFailed(true), []);
  if (GOOGLE_MAPS_KEY && !failed) return <GoogleTrafficMap onError={onError} {...props} />;
  return <LeafletMap {...props} />;
};

export default BeaconMap;
