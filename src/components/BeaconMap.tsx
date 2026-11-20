import { useCallback, useState } from 'react';
import LeafletMap from './GoogleMapView';
import GoogleTrafficMap, { type MapProps } from './GoogleTrafficMap';

const GOOGLE_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;

/**
 * Google Maps with live traffic when VITE_GOOGLE_MAPS_API_KEY is set,
 * otherwise (or if Google fails to load) the free Leaflet/OpenStreetMap map.
 */
const BeaconMap = (props: MapProps) => {
  const [failed, setFailed] = useState(false);
  const onError = useCallback(() => setFailed(true), []);
  if (GOOGLE_KEY && !failed) return <GoogleTrafficMap apiKey={GOOGLE_KEY} onError={onError} {...props} />;
  return <LeafletMap {...props} />;
};

export default BeaconMap;
