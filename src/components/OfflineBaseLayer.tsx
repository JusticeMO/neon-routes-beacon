import type L from 'leaflet';
import { useEffect, useState } from 'react';
import { TileLayer, useMap } from 'react-leaflet';
import { useTheme } from '@/contexts/ThemeContext';
import { loadTiles, offlineLayer } from '@/lib/offline/basemap';

const ONLINE_TILES = {
  bright: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
  dark: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
  live: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
};

/**
 * Street map drawn from the offline Nairobi map pack, so it works with no network.
 * Falls back to online CARTO tiles only if the pack can't be loaded at all.
 */
const OfflineBaseLayer = () => {
  const map = useMap();
  const { theme } = useTheme();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let layer: L.GridLayer | null = null;
    let cancelled = false;
    loadTiles()
      .then(tiles => {
        if (cancelled) return;
        layer = offlineLayer(tiles, theme);
        layer.addTo(map);
        layer.bringToBack();
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
      if (layer) map.removeLayer(layer);
    };
  }, [map, theme]);

  if (!failed) return null;
  return <TileLayer key={theme} url={ONLINE_TILES[theme]} attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>' />;
};

export default OfflineBaseLayer;
