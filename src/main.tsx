import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { applyCachedRoadPaths } from './lib/tracking/roadPaths'
import { snapRoutesToRoads } from './lib/tracking/snapRoutes'

// Use road-following route lines from earlier visits, then refresh them in the background.
applyCachedRoadPaths();
void snapRoutesToRoads();

createRoot(document.getElementById("root")!).render(<App />);
