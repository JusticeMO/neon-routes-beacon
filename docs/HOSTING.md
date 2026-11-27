# Hosting Beacon at beacon.sakafind.com

Beacon is a static site. It is hosted on Firebase Hosting as a second site in Sakafind's
Firebase project (`jengasafe-9508b`), so it needs no new account or bill. The workflow in
`.github/workflows/deploy.yml` builds and tests every push, and deploys `main` once the
steps below are done.

## One-time setup (about 15 minutes)

1. **Add the site.** Firebase console > project jengasafe-9508b > Hosting > *Add another site*.
   Site ID: `sakafind-beacon`. (If that ID is taken, pick another and change it in `.firebaserc`.)
2. **Add the domain.** On the new site, *Add custom domain* > `beacon.sakafind.com`.
   Firebase shows one or two DNS records (a TXT to prove ownership, then A records or a
   CNAME). Add them where sakafind.com's DNS is managed. The HTTPS certificate follows on
   its own, usually within an hour.
3. **Give this repository the deploy key.** GitHub > neon-routes-beacon > Settings >
   Secrets and variables > Actions > *New repository secret*. Name `FIREBASE_SERVICE_ACCOUNT`,
   value: the same service-account JSON the Sakafind repository uses for its own deploy.
4. **Deploy.** Actions > *Deploy Beacon* > *Run workflow* on `main` (or push to `main`).
   Until then Beacon is also reachable at https://sakafind-beacon.web.app.

## What stays off

Wallet fares ("Continue with Sakafind") stay off: the build has no `VITE_SAKAFIND_URL`, so
inside Sakafind's Matatus tab the card is hidden, and on Beacon's own page it is a labelled
demo where no money moves. To switch it on later, when JiPay is live: set the repository
variables `VITE_SAKAFIND_URL=https://sakafind.com` and `VITE_SAKAFIND_API=<Sakafind API>/api`
here, and `BEACON_CONNECT_ENABLED=true` with `BEACON_REDIRECT_URIS` on Sakafind's server.

## Which sites may show Beacon in a frame

`firebase.json` only lets Beacon itself, sakafind.com, jengasafe.com and the Firebase
addresses of the Sakafind site frame it. Add any new Sakafind domain there.
