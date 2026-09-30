const fs = require('fs');
// UI-14 regression guard: every Carbon component used by the app must have
// its styles present in the built CSS. Run after build (called from perf
// verification, not the build pipeline).
const cssFile = fs.readdirSync('.next/static/css').filter((x) => x.endsWith('.css'))
  .map((x) => '.next/static/css/' + x)
  .sort((a, b) => fs.statSync(b).size - fs.statSync(a).size)[0];
const css = fs.readFileSync(cssFile, 'utf8');
console.log('css:', cssFile, (css.length / 1024).toFixed(0) + 'kB raw');
const required = [
  '.cds--btn', '.cds--tile', '.cds--tag', '.cds--modal', '.cds--dialog',
  '.cds--text-input', '.cds--select', '.cds--list-box', '.cds--tabs',
  '.cds--overflow-menu', '.cds--menu', '.cds--popover', '.cds--side-nav',
  '.cds--header', '.cds--data-table', '.cds--file', '.cds--progress',
  '.cds--toggle', '.cds--search', '.cds--number-input', '.cds--checkbox',
  '.cds--inline-notification', '.cds--inline-loading', '.cds--copy-btn',
  '.cds--number', '.cds--content', 'IBM Plex Sans Arabic',
];
let failed = 0;
for (const sel of required) {
  if (!css.includes(sel)) {
    console.error('MISSING: ' + sel);
    failed += 1;
  }
}
// Brand tokens must resolve teal (hex or `teal` keyword — same color).
const teal = (css.match(/#008080|:\s*teal[;}]/g) || []).length;
console.log('teal token occurrences:', teal);
if (teal === 0) {
  console.error('MISSING: teal brand tokens');
  failed += 1;
}
if (failed > 0) {
  console.error('check-css: FAIL (' + failed + ' missing)');
  process.exit(1);
}
console.log('check-css: PASS (' + required.length + ' selectors + brand tokens present)');
