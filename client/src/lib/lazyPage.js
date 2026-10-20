import { lazy } from 'react';

const FLAG = 'programo-chunk-reload';

/**
 * A page loaded only when it is first opened, so phones download the app in small pieces.
 * After a new version is deployed, an open tab still asks for the old file names; those are
 * gone, so the page reloads once to fetch the new ones instead of showing an error.
 */
export function lazyPage(load, name = 'default') {
  return lazy(() =>
    load().then(
      (mod) => {
        try {
          sessionStorage.removeItem(FLAG);
        } catch {
          /* storage blocked: nothing to clear */
        }
        return { default: mod[name] };
      },
      (err) => {
        let reloaded = false;
        try {
          reloaded = sessionStorage.getItem(FLAG) === '1';
          if (!reloaded) sessionStorage.setItem(FLAG, '1');
        } catch {
          reloaded = true; // cannot remember the reload: do not risk a loop
        }
        if (!reloaded) {
          window.location.reload();
          return new Promise(() => {}); // the reload takes over
        }
        throw err;
      },
    ),
  );
}
