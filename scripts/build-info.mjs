/**
 * Deja constancia de cuándo corrió el build.
 *
 * Los cuatro auditores corren en cada build, así que «cuándo corrieron» es
 * «cuándo se buildeó». Sin esto la pantalla de estado tendría que inventar una
 * fecha o no decir ninguna.
 */
import { writeFileSync } from 'fs'
import { execSync } from 'child_process'

function git(cmd) {
  try { return execSync(cmd, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() }
  catch { return null }
}

const info = {
  construido_at: new Date().toISOString(),
  commit: process.env.VERCEL_GIT_COMMIT_SHA ?? git('git rev-parse HEAD'),
  mensaje: process.env.VERCEL_GIT_COMMIT_MESSAGE ?? git('git log -1 --pretty=%s'),
  rama: process.env.VERCEL_GIT_COMMIT_REF ?? git('git rev-parse --abbrev-ref HEAD'),
}

writeFileSync('lib/os/build-info.json', JSON.stringify(info, null, 2) + '\n')
console.log(`build-info: ${info.construido_at} · ${(info.commit ?? '').slice(0, 7)}`)
