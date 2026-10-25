/**
 * Runs in the browser before the app hydrates.
 *
 * Zod probes for eval with `new Function("")` the first time it parses an
 * object. The strict CSP (P11.20) blocks it, and the browser reports the
 * blocked probe as a violation even though Zod catches the error, so the
 * client schemas run without the JIT.
 */

import { config } from "zod/v4/core"

config({ jitless: true })
