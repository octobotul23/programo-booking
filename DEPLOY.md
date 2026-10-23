# Putting Programo online

Pick one way to host it, do the checklist, then build the phone apps for that address.

| Way | For | HTTPS | Who can reach it |
| --- | --- | --- | --- |
| **A. VPS + Docker** (recommended) | real use by a clinic | automatic (Caddy + Let's Encrypt) | anyone with the link |
| **B. Linux without Docker** | same, if you prefer plain services | Caddy | anyone with the link |
| **C. This PC + Tailscale** | private use, only your own devices | `tailscale serve` | only devices on your tailnet |

## Before going live

- **No demo data.** Never run `npm run seed` on the live server. The demo accounts have a password written in the source code. With `NODE_ENV=production` (Docker sets it, and it is in `.env.example`) the seed refuses to run.
- **First account.** Open the site, sign up as a business, then turn on two-step sign-in (Settings → Security).
- **Backups.** Set them up the same day (see [Backups](#backups)), together with a copy of the encryption key.
- **Port 3000 stays closed to the internet.** Only Caddy listens on 80/443; the app answers it alone.
- **Updates.** Keep the server's system updated (`unattended-upgrades` on Ubuntu/Debian).

## A. VPS with Docker

1. Get a small Linux server (1 GB RAM is enough) and a domain. Point an `A` record (and `AAAA` for IPv6) at the server.
2. Install Docker. Then open only the web ports and SSH in the firewall:
   ```bash
   sudo ufw allow OpenSSH && sudo ufw allow 80,443/tcp && sudo ufw allow 443/udp && sudo ufw enable
   ```
3. Put this folder on the server: `git clone` it from your repository, or copy it (without `node_modules`, `data`, `android`, `ios`). Then set it up:
   ```bash
   cp .env.example .env
   nano .env          # DOMAIN=your.domain and PUBLIC_URL=https://your.domain
   chmod 600 .env
   docker compose up -d --build
   ```
4. Open `https://your.domain`. The certificate arrives on the first visit, within a minute.

What you get:
- The app runs as an unprivileged user in a read-only container with every Linux capability removed, and nothing is reachable from outside except Caddy.
- The database and its key live in the `programo-data` volume.

Everyday commands:
```bash
docker compose logs -f app                       # what the server is doing
docker compose exec app node server/backup.js    # backup now (see Backups)
docker compose exec app node server/reset-link.js someone@clinic.ro   # someone locked out
docker compose up -d --build                     # after updating the files (below)
```

To update to a new version: `git pull` if you cloned it; if you copied it, copy the new `client`, `server`, `deploy`, `package.json`, `package-lock.json`, `vite.config.js`, `Dockerfile` and `compose.yaml` over the old ones (keep `.env`). Then run `docker compose up -d --build`. The database stays in its volume.

## B. Linux without Docker

From inside this folder, on the server:
```bash
sudo useradd --system --home /opt/programo --shell /usr/sbin/nologin programo
sudo mkdir -p /opt/programo && sudo cp -r package.json package-lock.json server client vite.config.js /opt/programo/
sudo cp .env.example /opt/programo/.env && sudo nano /opt/programo/.env      # PUBLIC_URL, optional APP_SECRET
sudo chown root:programo /opt/programo/.env && sudo chmod 640 /opt/programo/.env   # readable by the app only
sudo cp deploy/programo.service /etc/systemd/system/
(cd /opt/programo && sudo npm ci --ignore-scripts && sudo npm run build && sudo npm prune --omit=dev)
sudo systemctl enable --now programo
```

Requirements:
- Node 24 at `/usr/bin/node`.
- The service listens only on `127.0.0.1:3000`, stores data in `/var/lib/programo`, and runs under strict systemd sandboxing (see the file).

For HTTPS:
1. Install Caddy.
2. Copy `deploy/Caddyfile` to `/etc/caddy/Caddyfile`.
3. Add `Environment=DOMAIN=your.domain UPSTREAM=127.0.0.1:3000` to Caddy's service (`sudo systemctl edit caddy`).
4. Restart Caddy.

Leave `TRUST_PROXY` empty: a proxy on the same machine is already trusted.

## C. This PC + Tailscale (private)

This is how it runs now, at `https://x237.tail36214d.ts.net:8443`: steps 2 to 4 below are done (the built app with `npm start`, `.env` with `HOST=127.0.0.1`, `tailscale serve` on 8443, the APK built for that address). Only devices signed in to your tailnet can reach it, and WireGuard encrypts the traffic. After a restart of the PC, start it again with `npm start` in this folder; `tailscale serve` comes back by itself.

To make it proper:
1. **Clear out the demo clinic.** This PC's database still holds it, and the demo accounts' password is in the source code. Either start fresh (stop the server, move the `data` folder somewhere else, start again), or change the password of all three demo accounts.
2. **Run the built app, not dev mode. Do this one first.** `npm run dev` is for working on the code: it sends no Content-Security-Policy (the browser's guard against injected scripts), and it hands out the app's source code to anyone who can reach port 3000. Make a file named `.env` in this folder (the server and its tools read it) with:
   ```ini
   NODE_ENV=production
   PUBLIC_URL=http://x237.tail36214d.ts.net:3000
   ```
   Write `.env` in Notepad, and make later changes to it in Notepad too (it saves UTF-8). Don't add lines with PowerShell's `>` or `>>`: Windows PowerShell writes those as UTF-16, and the server refuses a file that mixes the two, naming the line to type again. Then:
   ```bash
   npm run build
   npm start
   ```
   With `NODE_ENV=production` in `.env`, `npm run seed` also refuses to add the demo accounts. (`npm run dev` ignores the `NODE_ENV` line, so the same `.env` still works for development.) If you do keep `npm run dev` running on this PC, add `HOST=127.0.0.1` to `.env` unless you are testing from a phone right now.
3. **Real HTTPS on the same name.** On this PC the plain address (port 443) already serves another program, so give Programo its own HTTPS port; the other program is not touched:
   ```bash
   tailscale serve --bg --https=8443 3000
   ```
   - This serves `https://x237.tail36214d.ts.net:8443` with a real certificate (HTTPS certificates are already on for this tailnet).
   - Afterwards add `HOST=127.0.0.1` to `.env` and change `PUBLIC_URL` to `https://x237.tail36214d.ts.net:8443`, then restart the server. Port 3000 is then only reachable through `tailscale serve`.
   - `tailscale serve status` shows what is served; `tailscale serve --https=8443 off` undoes it.
4. **Point the phone apps at the https address**, then rebuild the APK:
   ```bash
   npm run android:apk -- https://x237.tail36214d.ts.net:8443
   ```
   With https, browsers and the app treat it as a secure site (for example, copying works in the browser too).

The PC must stay on and awake for the app to be reachable.

## Backups

It makes a consistent copy, safe while the server runs, and keeps the newest 14 in the `backups` folder next to the database. It must run with the server's settings: run it in the wrong place and it stops with "No database at …" (it never backs up an empty one).

| Way | Back up now | Daily at 3:00 (`sudo crontab -e`) |
| --- | --- | --- |
| **A. Docker** | `docker compose exec app node server/backup.js` | `0 3 * * * cd /path/to/programo && docker compose exec -T app node server/backup.js >> /var/log/programo-backup.log 2>&1` |
| **B. Linux service** | `cd /opt/programo && sudo -u programo env DATA_DIR=/var/lib/programo /usr/bin/node server/backup.js` | `0 3 * * * cd /opt/programo && sudo -u programo env DATA_DIR=/var/lib/programo /usr/bin/node server/backup.js >> /var/log/programo-backup.log 2>&1` |
| **C. This PC** | `npm run backup` (or `npm run backup -- E:\backups` for another folder) | Task Scheduler (below) |

The log file shows each night's result, so a backup that stopped working gets noticed: `tail /var/log/programo-backup.log`.

On this PC, this PowerShell command (no admin needed) makes the daily task. It runs while you are signed in, which the server needs anyway:
```powershell
$run = New-ScheduledTaskAction -Execute (Get-Command node).Source -Argument 'server\backup.js' -WorkingDirectory 'D:\11111111111'
Register-ScheduledTask -TaskName 'Programo backup' -Action $run -Trigger (New-ScheduledTaskTrigger -Daily -At 3am)
```
Check it the next day in Task Scheduler: "Last Run Result" should be `0x0`. `Start-ScheduledTask 'Programo backup'` runs it right away.

Where they end up: in Docker, inside the `programo-data` volume (get them with `docker compose cp app:/data/backups ./backups`). On the Linux service, in `/var/lib/programo/backups`. On this PC, in `data\backups`.

**Copy the backups off the machine** (another disk, cloud storage). A backup on the same disk dies with it.

**The key.** Two-step sign-in secrets and SMS tokens are encrypted. The key is `APP_SECRET` if you set one, otherwise the `.secret` file next to the database.
- Keep one copy of the key somewhere safe, and **separate** from the backups.
- Without the key those fields can't be read back. With the key and a stolen backup, they can.

**Restore.** The app must be stopped, and the leftover `app.db-wal` / `app.db-shm` files must go with the old database. Otherwise they could be mixed into the restored one. The key (`APP_SECRET` or `.secret`) must be the same one as when the backup was made. Pick the backup by its name (`app-YYYYMMDD-HHMMSS.db`, the time is UTC):
- **A. Docker.** Do it from a one-off container of the same image, so the file belongs to the app's user. Don't use `docker compose cp` into `/data`, because the file would belong to root and the app couldn't open it.
  ```bash
  docker compose stop app
  docker compose run --rm --no-deps app sh -c 'cp /data/backups/app-YYYYMMDD-HHMMSS.db /data/app.db && rm -f /data/app.db-wal /data/app.db-shm'
  docker compose start app
  ```
  For a backup kept outside the server, put it next to `compose.yaml` and make it readable (`chmod 644 app-….db`). Then use `docker compose run --rm --no-deps -v "$PWD/app-YYYYMMDD-HHMMSS.db:/restore.db:ro" app sh -c 'cp /restore.db /data/app.db && rm -f /data/app.db-wal /data/app.db-shm'` instead.
- **B. Linux service:**
  ```bash
  sudo systemctl stop programo
  sudo install -o programo -g programo -m 600 /var/lib/programo/backups/app-YYYYMMDD-HHMMSS.db /var/lib/programo/app.db
  sudo rm -f /var/lib/programo/app.db-wal /var/lib/programo/app.db-shm
  sudo systemctl start programo
  ```
- **C. This PC:** stop the server (Ctrl+C). Copy `data\backups\app-YYYYMMDD-HHMMSS.db` over `data\app.db`, delete `data\app.db-wal` and `data\app.db-shm` if they are there, then start it again.

## Someone is locked out

- **Staff member:** the owner opens Settings → Team → their card → *Make a reset link*, and sends it to them.
- **Owner (or anyone):** on the server, run:
  ```bash
  docker compose exec app node server/reset-link.js owner@clinic.ro      # A. Docker
  cd /opt/programo && sudo -u programo env DATA_DIR=/var/lib/programo /usr/bin/node server/reset-link.js owner@clinic.ro   # B
  npm run reset-link -- owner@clinic.ro    # C. this PC (from this folder)
  ```
  - The link starts with `PUBLIC_URL` from `.env`. Without one, add `--url https://x237.tail36214d.ts.net:8443`.
  - Add `--no-2fa` if they also lost their authenticator.
  - The link works once, for 24 hours.
  - Using it signs out every device of that account.

## Phone apps

Both apps are a secure shell that opens your server's address. Every update to the website is instantly in the apps too, so there's nothing to re-publish. Build them **for the address you host at**, and rebuild if the address changes.

### Android (APK)

**In the cloud, nothing to install:**
1. Put this folder in a GitHub repository.
2. Go to **Actions → Phone apps → Run workflow**, and type the address.
3. After about 10 minutes, download **programo-android** from the finished run. It contains the APK.

**On this PC (already set up):**

```bash
npm run android:apk
```

- Without an address it uses the current one (`capacitor.config.json` → `server.url`). Add `-- https://your.domain` to change it.
- The signed APK lands in the project folder as `Programo-<version>.apk`, and the script prints the signing certificate's fingerprint.
- **It checks the signature.** If the APK is not signed with the certificate in `mobile/local-tools.json` (`expectedCertSha256`), or fails `apksigner verify`, the script deletes it and stops. The last good `Programo-<version>.apk` stays as it was.
- **Version:** it comes from `package.json` (`0.1.0` → version code 100; each part 0–99). Raise it before each new APK, or phones won't install the update.
- **Without a key** you get `Programo-<version>-debug.apk`. It installs as a separate app (`ro.programo.app.debug`), so it can never replace the real one.

The tools live outside the project, and nothing was changed in Windows. `mobile/local-tools.json` (this PC only, never shared) points the build at them:
- `D:\AndroidTools\jdk-21`: Microsoft Build of OpenJDK 21.
- `D:\AndroidTools\sdk`: Android SDK, platform 36, build tools 35.
- `D:\AndroidTools\gradle`: Gradle's download cache.
- `D:\Programo-signing`: the signing key and its password. Read the README there and **back it up**.
  - This PC has other Windows accounts, and the D: drive lets every signed-in user change files. To make the folder yours alone, run this once in a Command Prompt:
    ```bat
    icacls D:\Programo-signing /inheritance:r /grant:r "%USERNAME%:(OI)(CI)F" "SYSTEM:(OI)(CI)F" "Administrators:(OI)(CI)F"
    ```
- **Trying it on the PC:** the Android emulator needs *Windows Hypervisor Platform* (Windows Features), which is off here. Turning it on is your call, and it needs a restart. Testing on a real phone works without it.

**On another computer:**
1. Install Java 21 and the Android SDK (Android Studio brings it).
2. Either set `JAVA_HOME` and `ANDROID_HOME`, or write your own `mobile/local-tools.json` with the same keys.

**Installing it:**
- Copy the APK to the phone and open it.
- Allow "install unknown apps" for your file manager when Android asks.

**Signing (for Google Play, and so new versions install over old ones):**

This PC already has a key, in `D:\Programo-signing`. Use that same key everywhere: an APK signed with a different key can't update the installed app.

To make a key elsewhere (once, then keep it and its password safe forever):
```bash
keytool -genkeypair -v -keystore programo.jks -storetype PKCS12 -alias programo -keyalg RSA -keysize 4096 -validity 10000
```

- **Locally, without `local-tools.json`:** set these, then run `npm run android:apk`:
  - `PROGRAMO_KEYSTORE` (the path to the .jks file);
  - `PROGRAMO_KEYSTORE_PASSWORD`;
  - `PROGRAMO_KEY_PASSWORD`, only if the key has its own password;
  - `PROGRAMO_CERT_SHA256`, optional: the certificate fingerprint the APK must have.
- **On GitHub:**
  - Repository secrets: `ANDROID_KEYSTORE_BASE64` (get it in PowerShell with `[Convert]::ToBase64String([IO.File]::ReadAllBytes('D:\Programo-signing\programo.jks')) | Set-Clipboard`; keep the full path, since .NET ignores `cd`), `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS` (`programo`), and `ANDROID_KEY_PASSWORD` only if the key has its own password. Clear the clipboard afterwards (`Set-Clipboard -Value ' '`).
  - Repository variable `ANDROID_CERT_SHA256`: the fingerprint from `D:\Programo-signing\README.txt`. A run signed with any other key then fails.

  The workflow then builds a signed release APK. The key is only used in a separate step that runs none of the project's code, and every action it uses is pinned to an exact version.

### iPhone

- **No Mac, no fees:**
  1. Open the site in Safari.
  2. Tap Share → **Add to Home Screen**.
  3. It opens full screen with its own icon, like an app.
- **A real iOS app:**
  - The Xcode project is in `ios/`. The cloud workflow checks that it builds.
  - Putting it on iPhones needs an Apple Developer account ($99/year) to sign it, then TestFlight or the App Store. Open `ios/App/App.xcodeproj` on a Mac, choose your team under *Signing & Capabilities*, then *Product → Archive*.
  - With a free Apple ID and a Mac you can install it on your own iPhone, but it expires after 7 days.
  - It needs iOS 16.4 or newer (the first that draws this app's styles correctly).
  - Saving exports, printing and copying use a small Android-only helper. In the iOS app:
    - Exports and backup codes open the iPhone's share sheet when the app uses an https address. Over plain http, iOS allows no share sheet, so the app says it can't save files over this connection and to do it in Safari.
    - Printing and copying do what the web page does.
    - Test these there before relying on them, or use the Safari version.
  - With an https address through `tailscale serve`, a stopped server shows Tailscale's error page in the iOS app instead of the offline page (Android shows the offline page).

### What the apps do on the phone

- **Back** goes to the previous page; only on the first page does it leave the app.
- **Export (CSV), backup codes, Print** work like on a computer: files open the phone's share sheet (Files, Drive, email), Print opens Android printing (including *Save as PDF*).
- **Offline:** if the server can't be reached, a bilingual page shows and tries again every 30 seconds, when the phone gets back online, or on a tap. If a try gets sent to another app (a Wi-Fi sign-in page, say), it waits for a tap instead of sending you there again.
- **Old phones:** the app needs Android 8.0 or newer, and Android System WebView 111 or newer (on Android 8 and 9, Google Chrome plays that part). Any phone that gets updates from Google Play has it. On an older one, the app asks you to update it instead of showing a broken page.
- **Permissions:** internet, and network state (to notice when the phone is back online). Android asks for neither.

### What the apps lock down

- The app can't be backed up off the phone or copied to a new one.
- The recent-apps screen shows a blank card instead of patient data (Android 13+). Screenshots still work.
- Web debugging is off.
- Only your own server can use the app's phone features. Files are shared from one private folder, and only after you pick where they go.
- Plain HTTP is refused. A build for an `http://…ts.net` address allows plain HTTP to that one address only, which Tailscale encrypts, but only while Tailscale is on: with it off, a hostile Wi-Fi could answer for that name and read the sign-in cookie. A build for an `https://` address allows no plain HTTP at all, so use HTTPS (C, step 3).

## Security, honestly

No software is unhackable. This one is built so the usual attacks fail.

Protections in place:
- Strict content security policy, CSRF checks, and rate limits on sign-in, sign-up, bookings and resets.
- Locked accounts after repeated misses, optional two-step sign-in, and per-device sessions you can end.
- Staff see only what their role allows. Every sensitive change is in the activity log.
- Secrets are encrypted at rest. Reset links are stored hashed.

What's left is on you:
- Strong unique passwords and 2FA for owners.
- An updated server.
- Backups and the key kept apart.
- Not sharing accounts.
