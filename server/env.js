// Settings from a .env file in the folder the program is started from, read the same way by the server and by
// the command-line tools (backup, reset-link, seed). Import it first, before anything reads process.env.
// Whatever is already set in the environment wins: Docker (env_file) and systemd (EnvironmentFile) set the
// variables themselves, and those are never overridden.
import fs from 'node:fs';
import { parseEnv } from 'node:util';

const stop = (why) => {
  console.error(why);
  process.exit(1);
};
const lineAt = (text, index) => text.slice(0, index).split('\n').length;
// Plain letters added to a UTF-16 file read back two at a time, fused into one character each ("HO" becomes
// U+4F48), and saving the file again as UTF-8 keeps them that way. Two such characters in a row on a setting line
// are that. Comment lines may hold real symbols built the same way (a "══" banner, "……"), so there only a run with
// an "=" in it counts, as every setting has. Returns the line number, or 0.
function fusedLine(text) {
  const plain = (b) => (b >= 0x20 && b < 0x7f) || b === 9 || b === 10 || b === 13;
  const lines = text.split('\n');
  for (let n = 0; n < lines.length; n++) {
    const comment = /^\s*[#;]/.test(lines[n]);
    for (let i = 0, run = 0, eq = false; i < lines[n].length; i++) {
      const c = lines[n].charCodeAt(i);
      if (c >> 8 >= 0x20 && c >> 8 < 0x7f && plain(c & 0xff)) {
        run++;
        eq ||= c >> 8 === 0x3d || (c & 0xff) === 0x3d;
      } else {
        run = 0;
        eq = false;
      }
      if (run >= 2 && (!comment || eq)) return n + 1;
    }
  }
  return 0;
}

let buf = null;
try {
  buf = fs.readFileSync('.env');
} catch (e) {
  // no .env here: the environment alone. One that exists but can't be read stops everything, because running
  // without its APP_SECRET or DATA_DIR would quietly use another key or another database.
  if (e.code !== 'ENOENT') stop(`Cannot read .env (${e.code}): ${e.message}`);
}
if (buf !== null) {
  // Windows writes text three ways: UTF-8 (Notepad), UTF-8 with a byte-order mark (PowerShell's
  // "-Encoding utf8") and UTF-16 (PowerShell 5.1's > and >>). Read all three, rather than quietly finding no
  // settings in a UTF-16 file and starting on 0.0.0.0 without NODE_ENV=production.
  const utf16 = buf[0] === 0xff && buf[1] === 0xfe;
  const bom8 = buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf;
  const text = utf16 ? buf.subarray(2).toString('utf16le') : buf.subarray(bom8 ? 3 : 0).toString('utf8');
  // A line in another encoding than the rest is read as nonsense, and parseEnv would quietly skip it: a zero byte
  // is UTF-16 inside UTF-8 (a line added with > or >>) or UTF-16 without its mark; an odd length or fused letters
  // are plain text inside UTF-16.
  const zero = text.indexOf(String.fromCharCode(0));
  const bad = zero >= 0 ? lineAt(text, zero) : utf16 && buf.length % 2 === 1 ? lineAt(text, text.length) : fusedLine(text);
  const parsed = bad ? null : parseEnv(text);
  // parseEnv reads an indented "# A=1" after another comment, or a "; A=1" comment, as a setting named "# A"
  for (const key of Object.keys(parsed ?? {})) if (/^\s*[#;]/.test(key)) delete parsed[key];
  const odd = Object.keys(parsed ?? {}).find((key) => /[^\x20-\x7e]/.test(key));
  if (bad || odd) {
    const n = bad || text.split('\n').findIndex((line) => line.includes(odd)) + 1;
    stop(
      `.env, line ${n}: written in another text encoding than the rest (for example added with PowerShell > or >>),\n` +
        'so that setting would be lost. Open .env in Notepad, delete that line (it may look garbled or like Chinese\n' +
        'characters), type it again, and save the file as UTF-8.',
    );
  }
  // "npm run dev" stays development whatever .env says (in production mode Vite turns hot reload off)
  const dev = process.argv.includes('--dev');
  for (const [key, value] of Object.entries(parsed)) if (!(dev && key === 'NODE_ENV')) process.env[key] ??= value;
}
