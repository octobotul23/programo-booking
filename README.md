# Programo

Appointments and bookings for clinics, gyms, salons and any schedule-based business. Interface in English and Romanian.

## Run it

```bash
npm install
npm run seed      # optional demo clinic (accounts listed at the top of server/seed.js)
npm run dev       # http://localhost:3000
```

`npm run seed -- --reset` rebuilds the demo data.

## Host it

```bash
npm run build
npm start
```

One Node 24 process serves the API and the built app. The database is a single SQLite file in `./data`; set `DATA_DIR` to put it on a persistent disk and `PORT` to change the port. Put it behind HTTPS.

**[DEPLOY.md](DEPLOY.md)** has the full guide: Docker + Caddy (`compose.yaml`), a hardened systemd service (`deploy/`), Tailscale, backups (`npm run backup`), lock-outs (`npm run reset-link`) and the Android / iPhone apps (`npm run android:apk`, or GitHub Actions → *Phone apps*).

## How it's laid out

- `server/` – Express API, SQLite (`node:sqlite`), availability and booking rules in `model.js`, business-type presets in `presets.js`
- `client/` – React + Tailwind (ONE design system tokens in `src/styles.css`), translations in `src/lib/i18n.jsx`
