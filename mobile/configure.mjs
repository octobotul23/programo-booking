// Points the phone apps at your server, then copies the settings into the Android and iOS projects.
//
//   npm run mobile -- https://programo.example.com
//   npm run mobile -- http://my-pc.tailnet.ts.net:3000     (private: only phones on your Tailscale)
//
// Plain http is allowed only for Tailscale names (*.ts.net) and this computer: Tailscale already
// encrypts everything end to end, while it is on. Any other address must be https. The phone's network rules
// are written from the address: plain http to that one name only, and with https none at all.
import { execSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONFIG = path.join(ROOT, 'capacitor.config.json');
const config = JSON.parse(fs.readFileSync(CONFIG, 'utf8'));
const arg = process.argv[2] || process.env.APP_URL || config.server.url;

let url;
try {
  url = new URL(arg);
} catch {
  console.error(`Not a web address: ${arg}`);
  process.exit(1);
}
const tailnet = url.hostname.endsWith('.ts.net') || url.hostname === 'localhost';
if (url.protocol !== 'https:' && !(url.protocol === 'http:' && tailnet)) {
  console.error('Use an https:// address (plain http only works for Tailscale *.ts.net names).');
  process.exit(1);
}
const origin = url.origin; // no path, no trailing slash
// the oldest WebView (Chrome) the built web app works on: Tailwind 4 needs 111 (color-mix, @layer, @property).
// Older phones get the offline page, which then asks for a WebView update instead of retrying.
const MIN_WEBVIEW = 111;

config.server.url = origin;
config.android = { ...config.android, minWebViewVersion: MIN_WEBVIEW };
fs.writeFileSync(CONFIG, JSON.stringify(config, null, 2) + '\n');

const xml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const plain = url.protocol === 'http:';
// Android: https only, with the phone's own trusted certificates (no user-installed ones, so a "monitoring"
// profile cannot read the traffic); plain http only to this exact name.
const NSC = path.join(ROOT, 'android/app/src/main/res/xml/network_security_config.xml');
if (fs.existsSync(path.dirname(NSC))) {
  const allow = plain
    ? `
    <domain-config cleartextTrafficPermitted="true">
        <domain includeSubdomains="false">${xml(url.hostname)}</domain>
    </domain-config>`
    : '';
  const nsc = `<?xml version="1.0" encoding="utf-8"?>
<!-- Written by mobile/configure.mjs from the server address (not repeated here: an XML comment may not hold
     two hyphens in a row, and every international domain name has them). https only, with the phone's own
     trusted certificates (no user-installed ones, so a "monitoring" profile cannot read the traffic).${plain ? `
     Plain http only to this one Tailscale name, which WireGuard encrypts while Tailscale is on.` : ''} -->
<network-security-config>
    <base-config cleartextTrafficPermitted="false">
        <trust-anchors>
            <certificates src="system" />
        </trust-anchors>
    </base-config>${allow}
</network-security-config>
`;
  // caught here, not halfway through the Android build
  if ([...nsc.matchAll(/<!--([\s\S]*?)-->/g)].some((m) => m[1].includes('--'))) {
    console.error('network_security_config.xml: a comment contains "--", which XML does not allow.');
    process.exit(1);
  }
  fs.writeFileSync(NSC, nsc);
}
// iOS: the same rule, between the markers in Info.plist
const PLIST = path.join(ROOT, 'ios/App/App/Info.plist');
if (fs.existsSync(PLIST)) {
  const plist = fs.readFileSync(PLIST, 'utf8');
  const ats = plain
    ? `<key>NSAppTransportSecurity</key>
	<dict>
		<key>NSExceptionDomains</key>
		<dict>
			<key>${xml(url.hostname)}</key>
			<dict>
				<key>NSExceptionAllowsInsecureHTTPLoads</key>
				<true/>
			</dict>
		</dict>
	</dict>`
    : `<key>NSAppTransportSecurity</key>
	<dict/>`;
  const marked = /(<!-- programo:ats[^>]*-->\s*)[\s\S]*?(\s*<!-- \/programo:ats -->)/;
  if (!marked.test(plist)) {
    console.error('ios/App/App/Info.plist is missing the <!-- programo:ats --> … <!-- /programo:ats --> markers.');
    process.exit(1);
  }
  fs.writeFileSync(PLIST, plist.replace(marked, (_, a, b) => a + ats + b));
}
if (plain) {
  console.warn(
    `Note: ${origin} is plain http. That is private only while Tailscale is on on the phone; for real protection use\n` +
      'HTTPS (tailscale serve --bg --https=8443 3000, then: npm run mobile -- https://<pc>.<tailnet>.ts.net:8443).',
  );
}
// the forwarding page needs to know where to go
fs.writeFileSync(path.join(ROOT, 'mobile/www/server.js'), `window.PROGRAMO_URL = ${JSON.stringify(origin)};\n`);
// The offline page must be self-contained: while the app points at a server, Capacitor serves only that one file.
// The address goes in its <meta>, and its policy allows exactly its one inline script, by hash. The hash is taken
// after turning CRLF into LF, as browsers do before hashing, so a Windows checkout can't break it.
const OFFLINE = path.join(ROOT, 'mobile/www/offline.html');
let page = fs.readFileSync(OFFLINE, 'utf8');
const attr = origin.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
for (const [name, value] of [['programo-url', attr], ['programo-min-webview', String(MIN_WEBVIEW)]]) {
  const tag = new RegExp(`(<meta name="${name}" content=")[^"]*(")`);
  if (!tag.test(page)) {
    console.error(`mobile/www/offline.html is missing <meta name="${name}" content="…" />.`);
    process.exit(1);
  }
  page = page.replace(tag, (_, a, b) => a + value + b);
}
const scripts = [...page.matchAll(/<script>([\s\S]*?)<\/script>/g)];
if (scripts.length !== 1 || /<script\s+src/i.test(page)) {
  console.error('mobile/www/offline.html must have exactly one inline <script> and no script files.');
  process.exit(1);
}
const hash = crypto.createHash('sha256').update(scripts[0][1].replace(/\r\n?/g, '\n'), 'utf8').digest('base64');
page = page.replace(/script-src '[^']*'/, () => `script-src 'sha256-${hash}'`);
fs.writeFileSync(OFFLINE, page);
console.log(`Phone apps now open ${origin}`);

const platforms = ['android', 'ios'].filter((p) => fs.existsSync(path.join(ROOT, p)));
if (platforms.length) execSync(`npx cap sync ${platforms.length === 1 ? platforms[0] : ''}`.trim(), { cwd: ROOT, stdio: 'inherit' });
