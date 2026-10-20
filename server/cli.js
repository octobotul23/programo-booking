// For the command-line tools (backup, reset-link): the same settings and database as the running server, and a
// clear stop instead of quietly working on an empty one. Import it first: it runs before db.js opens app.db
// (which would create a new, empty database in the wrong folder).
import './env.js';
import fs from 'node:fs';
import path from 'node:path';

export const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');

const database = path.join(DATA_DIR, 'app.db');
if (!fs.existsSync(database)) {
  const script = `server/${path.basename(process.argv[1] || 'backup.js')}`;
  console.error(
    `No database at ${database}, so nothing was done.\n` +
      'Run this with the same DATA_DIR as the server. For the Linux service (DEPLOY.md, way B):\n' +
      `  cd /opt/programo && sudo -u programo env DATA_DIR=/var/lib/programo /usr/bin/node ${script} …\n` +
      `With Docker: docker compose exec app node ${script} …`,
  );
  process.exit(1);
}
