const path = require('path')
const { chromium } = require('/home/user/plex-manager/node_modules/@playwright/test')
const AxeBuilder = require('/home/user/plex-manager/node_modules/@axe-core/playwright').default
const D = '/home/user/plex-manager/.agents/planning/2026-10-17-app-audit-and-rewind-2026/design/mockups/ui'
const files = ['home.html','admin-users.html','admin-settings.html','onboarding.html','setup.html','invite.html','screens.html','components.html']
;(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
  for (const f of files) for (const [w,h] of [[1440,900],[390,844]]) for (const q of ['', '?theme=light', '?step=claim', '?step=plex', '?step=plex-start']) {
    if (q.startsWith('?theme') && !['home.html','admin-users.html'].includes(f)) continue
    if (q.startsWith('?step') && f !== 'setup.html') continue
    const ctx = await browser.newContext({ viewport: { width: w, height: h } }); const page = await ctx.newPage()
    await page.goto('file://' + path.join(D, f) + q)
    await page.evaluate(() => document.fonts.ready)
    const r = await new AxeBuilder({ page }).withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa']).analyze()
    const v = r.violations.map(x => `${x.id}(${x.impact})x${x.nodes.length}: ${x.nodes.slice(0,3).map(n=>n.target.join(' ')).join(' | ')}`)
    const inc = r.incomplete.filter(x=>x.id==='color-contrast').map(x=>x.nodes.length)
    console.log(f+q, w, v.length ? v.join('\n   ') : 'no violations', inc.length? ' contrast-incomplete '+inc : '')
    await ctx.close()
  }
  await browser.close()
})().catch(e => { console.error(e); process.exit(1) })
