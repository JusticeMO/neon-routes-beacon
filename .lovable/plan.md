# BEACON commuter pilot experience

## What to build
- Make the public home screen answer the commuter's core question: whether a participating vehicle is recently reported near a selected Nairobi stage and serving the chosen route/direction.
- Let people choose a stage or open a stage-specific link (`?stage=...`) without signing in, installing anything, or sharing their location.
- Show plain-language status, last report freshness, route/destination, direction, and the last observed stage. Do not present demo data as live or imply guaranteed arrival times.
- Keep the familiar interactive map as supporting context, with route, stops, and vehicle markers, and make the selected stage/status useful without needing to read the map.
- Add optional, short commuter feedback on whether a vehicle arrived and whether the information helped; keep the interaction no-account and clearly label any prototype-only storage.
- Preserve existing SACCO onboarding/admin access and the bright/dark/live map themes.

## Technical details
- Implement this as a focused update to the existing React home screen and route/map components; do not introduce a new backend schema or request commuter GPS permissions.
- Use existing route and stop data for the prototype and label its freshness/status as sample information unless connected vehicle data is already available.
- Validate the public flow, stage deep link, map rendering, feedback interaction, and preview diagnostics.
