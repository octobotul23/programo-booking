// Builds the Android app on this computer: npm run android:apk [-- https://your.server]
// Needs Java 21 and the Android SDK: from JAVA_HOME / ANDROID_HOME, or from mobile/local-tools.json
// (this machine only, not shared — see DEPLOY.md). With a signing key you get a release APK; without, a debug APK.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LOCAL = path.join(ROOT, 'mobile/local-tools.json');

const fail = (message) => {
  console.error(`\n${message}`);
  process.exit(1);
};

let local = {};
if (fs.existsSync(LOCAL)) {
  try {
    // without the byte-order mark Windows PowerShell's "-Encoding utf8" puts in front
    local = JSON.parse(fs.readFileSync(LOCAL, 'utf8').replace(/^\uFEFF/, ''));
  } catch (e) {
    fail(`mobile/local-tools.json is not valid JSON: ${e.message}`);
  }
}
const env = { ...process.env };
env.JAVA_HOME ||= local.javaHome;
env.ANDROID_HOME ||= env.ANDROID_SDK_ROOT || local.androidHome;
if (local.gradleHome && !env.GRADLE_USER_HOME) env.GRADLE_USER_HOME = local.gradleHome;

const missing = [];
if (!env.JAVA_HOME || !fs.existsSync(path.join(env.JAVA_HOME, 'bin'))) missing.push('Java 21 (JAVA_HOME, or "javaHome" in mobile/local-tools.json)');
if (!env.ANDROID_HOME || !fs.existsSync(path.join(env.ANDROID_HOME, 'platforms'))) missing.push('the Android SDK (ANDROID_HOME, or "androidHome" in mobile/local-tools.json)');
if (missing.length) fail(`Cannot build yet. Set up:\n  - ${missing.join('\n  - ')}\nOr build in the cloud instead: GitHub → Actions → "Phone apps".`);

// signing key: the environment wins; otherwise a key and password file kept outside the project
if (!env.PROGRAMO_KEYSTORE && local.keystore) {
  if (!fs.existsSync(local.keystore) || !fs.existsSync(local.keystorePasswordFile || '')) {
    fail(`Signing key or its password file not found (${local.keystore}). Fix mobile/local-tools.json or remove "keystore" for a debug build.`);
  }
  const password = fs.readFileSync(local.keystorePasswordFile, 'utf8').trim();
  Object.assign(env, { PROGRAMO_KEYSTORE: local.keystore, PROGRAMO_KEYSTORE_PASSWORD: password });
  if (local.keyAlias) env.PROGRAMO_KEY_ALIAS = local.keyAlias;
}
// the certificate the APK must be signed with (it is public: every APK shows it): 64 hex digits, or as keytool and
// README.txt print it ("SHA-256: 26:DC:…")
const fingerprint = (text) => {
  // the last 32 pairs of a colon run, so the "256" of a label written as "SHA256:26:DC:…" is not taken for part of it
  const m = text.match(/[0-9a-f]{2}(?::[0-9a-f]{2}){31}(?![0-9a-f:])/i) || text.match(/\b[0-9a-f]{64}\b/i);
  return m ? m[0].replace(/:/g, '').toLowerCase() : '';
};
const expectedText = env.PROGRAMO_CERT_SHA256 || local.expectedCertSha256 || '';
const expected = fingerprint(expectedText);
if (expectedText && !expected) fail(`The expected certificate fingerprint is not a SHA-256 (64 hex digits): ${expectedText}`);

// Runs a program with an argument list, never a shell string. Windows starts a .bat only through cmd.exe, which
// gets the whole line quoted (/s) so folders with spaces work. Tools go by full path: Windows may refuse to run
// programs from the current folder (NoDefaultCurrentDirectoryInExePath).
const quote = (a) => (/[\s"&|<>^()%!,;=]/.test(a) ? `"${a.replace(/"/g, '""')}"` : a);
const run = (file, args, opts) =>
  process.platform === 'win32' && /\.(bat|cmd)$/i.test(file)
    ? execFileSync('cmd.exe', ['/d', '/s', '/c', `"${[file, ...args].map(quote).join(' ')}"`], { ...opts, windowsVerbatimArguments: true })
    : execFileSync(file, args, opts);

execFileSync(process.execPath, [path.join(ROOT, 'mobile/configure.mjs'), ...process.argv.slice(2)], { stdio: 'inherit' });
const release = !!env.PROGRAMO_KEYSTORE;
const ANDROID = path.join(ROOT, 'android');
run(path.join(ANDROID, process.platform === 'win32' ? 'gradlew.bat' : 'gradlew'), ['--no-daemon', release ? 'assembleRelease' : 'assembleDebug'], {
  cwd: ANDROID,
  stdio: 'inherit',
  env,
});

// exactly the file this build made (Gradle lists it), never a leftover from an earlier one
const out = path.join(ANDROID, 'app/build/outputs/apk', release ? 'release' : 'debug');
const made = JSON.parse(fs.readFileSync(path.join(out, 'output-metadata.json'), 'utf8')).elements?.[0]?.outputFile;
if (!made || !fs.existsSync(path.join(out, made))) fail(`Gradle did not report the APK it built (in ${out}).`);
const built = path.join(out, made);
// An APK that fails a check is deleted, not just left uncopied: it never gets the release name, so it can't
// replace the last good one, and no wrongly signed file is left in Gradle's folder to be picked up by mistake.
const reject = (message) => {
  fs.rmSync(built, { force: true });
  fail(`${message} The APK was deleted.`);
};
if (release && made.includes('-unsigned')) reject('The release APK came out unsigned: check the signing key settings.');

// who signed it, checked on Gradle's own output. apksigner's jar runs on the same Java, directly: its .bat
// wrapper would go through cmd.exe, where a "%" in a folder name breaks the path.
const tools = path.join(env.ANDROID_HOME, 'build-tools');
const latest = fs.existsSync(tools) && fs.readdirSync(tools).sort((a, b) => a.localeCompare(b, 'en', { numeric: true })).pop();
const signer = latest && path.join(tools, latest, 'lib', 'apksigner.jar');
if (!signer || !fs.existsSync(signer)) {
  if (release) reject('apksigner (Android SDK build-tools) not found, so the signature cannot be checked.');
} else {
  const java = path.join(env.JAVA_HOME, 'bin', process.platform === 'win32' ? 'java.exe' : 'java');
  let certs;
  try {
    certs = execFileSync(java, ['-Xmx1024M', '-Xss1m', '-jar', signer, 'verify', '--print-certs', built], { env, encoding: 'utf8' });
  } catch {
    reject('The APK does not pass apksigner verify.');
  }
  const sha = certs.match(/SHA-256 digest: ([0-9a-f]+)/)?.[1];
  console.log(`\nSigned by certificate SHA-256 ${sha ? sha.match(/../g).join(':').toUpperCase() : '(unknown)'}`);
  if (release && !sha) reject('Could not read the signing certificate.');
  if (release && expected && sha !== expected) reject(`This is not the expected signing certificate (expected ${expected}).`);
  if (release && !expected) console.log('Tip: put this fingerprint in mobile/local-tools.json as "expectedCertSha256" to have it checked.');
}

const { version } = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const target = path.join(ROOT, `Programo-${version}${release ? '' : '-debug'}.apk`);
fs.copyFileSync(built, target);
console.log(`APK ready: ${target}`);
