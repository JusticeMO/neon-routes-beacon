import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { applyCachedRoadPaths } from './lib/tracking/roadPaths'
import { snapRoutesToRoads } from './lib/tracking/snapRoutes'
import { registerOfflineSupport } from './lib/offline/serviceWorker'
import { announceReady } from './lib/embed'

// Use road-following route lines from earlier visits, then refresh them in the background.
applyCachedRoadPaths();
void snapRoutesToRoads();

createRoot(document.getElementById("root")!).render(<App />);

// Inside Sakafind's Matatus tab: tell the page Beacon has started.
announceReady();

// Keep the app and the offline Nairobi map pack on the phone (production builds only).
registerOfflineSupport();
