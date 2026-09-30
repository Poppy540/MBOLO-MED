import { chromium } from '@playwright/test';
import { AxeBuilder } from '@axe-core/playwright';
const b = await chromium.launch();
const p = await (await b.newContext()).newPage();
for (const html of ['<html><body><img src="x.png"><button></button><p style="color:#ccc;background:#fff">gris</p></body></html>']) {
  await p.setContent(html);
  const r = await new AxeBuilder({ page: p }).withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa']).analyze();
  console.log('page fautive : violations', r.violations.map(v=>v.id).join(','));
}
await b.close();
const b2 = await chromium.launch();
const p2 = await (await b2.newContext()).newPage();
await p2.goto('http://127.0.0.1:5173/').catch(()=>{});
