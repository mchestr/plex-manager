// Render mockups to PNG at device scale 1. Usage: node shots.js [filter]
const path = require('path')
const { chromium } = require('/home/user/plex-manager/node_modules/@playwright/test')
const D = '/home/user/plex-manager/.agents/planning/2026-10-17-app-audit-and-rewind-2026/design/mockups/ui'
const JOBS = [
  ['home.html', 'home--desktop.png', 1440, 900],
  ['home.html', 'home--mobile.png', 390, 844],
  ['home.html?theme=light', 'home--desktop-light.png', 1440, 900],
  ['admin-users.html', 'admin-users--desktop.png', 1440, 900],
  ['admin-users.html', 'admin-users--mobile.png', 390, 844],
  ['admin-users.html?theme=light', 'admin-users--desktop-light.png', 1440, 900],
  ['admin-settings.html', 'admin-settings--desktop.png', 1440, 900],
  ['admin-settings.html', 'admin-settings--mobile.png', 390, 844],
  ['onboarding.html', 'onboarding--mobile.png', 390, 844],
  ['setup.html', 'setup--desktop.png', 1440, 900],
  ['setup.html?step=claim', 'setup-claim--desktop.png', 1440, 900],
  ['setup.html?step=plex', 'setup-plex--desktop.png', 1440, 900],
  ['setup.html?step=plex', 'setup-plex--mobile.png', 390, 844],
  ['setup.html?step=plex-start', 'setup-plex-start--mobile.png', 390, 844],
  ['invite.html', 'invite--desktop.png', 1440, 900],
  ['screens.html', 'screens--board.png', 1440, 900],
  ['components.html', 'components--desktop.png', 1440, 900],
]
;(async () => {
  const filter = process.argv[2]
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
  for (const [src, out, w, h] of JOBS) {
    if (filter && !out.startsWith(filter)) continue
    const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 })
    await page.goto('file://' + path.join(D, src.split('?')[0]) + (src.includes('?') ? '?' + src.split('?')[1] : ''), { waitUntil: 'load' })
    await page.evaluate(() => document.fonts.ready)
    await page.waitForTimeout(300)
    const sw = await page.evaluate(() => document.documentElement.scrollWidth)
    const minFont = await page.evaluate(() => { let m = 99, el = null; for (const n of document.querySelectorAll('body *')) { if (n.closest('svg') || n.closest('.sr-only') || n.closest('[data-illustration]')) continue; const t = [...n.childNodes].some(c => c.nodeType === 3 && c.textContent.trim()); if (!t) continue; const r = n.getBoundingClientRect(); if (!r.width) continue; const fs = parseFloat(getComputedStyle(n).fontSize); if (fs < m) { m = fs; el = n.className + ':' + n.textContent.trim().slice(0, 20) } } return m + ' ' + el })
    await page.screenshot({ path: path.join(D, 'png', out), fullPage: true })
    console.log(out, 'scrollWidth', sw, sw > w ? 'OVERFLOW' : 'ok', 'min font', minFont)
    await page.close()
  }
  await browser.close()
})().catch((e) => { console.error(e); process.exit(1) })
