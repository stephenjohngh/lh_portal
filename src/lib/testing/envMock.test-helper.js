// src/lib/testing/envMock.test-helper.js — a mock of $app/env/public or
// $app/env/private with the REAL module's shape.
//
// SvelteKit 3's env modules export every variable declared in src/env.js, as
// undefined when it is unset. A vitest mock is stricter: reading a name the
// factory did not return THROWS. So a mock that lists only the variables a
// test cares about fails on code that checks an unset one — a test fault, not
// an app fault. This builds the whole shape from src/env.js and lays the
// test's values over it:
//
//   vi.mock('$app/env/private', async () =>
//     (await import('#lib/testing/envMock.test-helper.js')).envModule('private', { SUPABASE_SERVICE_ROLE_KEY: 'svc' }));
//
// (An async factory with a dynamic import, because vi.mock factories are
// hoisted above the file's own imports.)
import { variables } from '../../env.js';

/**
 * @param {'public'|'private'} which
 * @param {Record<string, any>} [values]
 */
export function envModule(which, values = {}) {
  /** @type {Record<string, any>} */
  const out = {};
  for (const [name, config] of Object.entries(variables)) {
    if (!!config.public === (which === 'public')) out[name] = undefined;
  }
  for (const name of Object.keys(values)) {
    if (!(name in out)) throw new Error(`${name} is not a declared ${which} variable in src/env.js`);
  }
  return { ...out, ...values };
}
