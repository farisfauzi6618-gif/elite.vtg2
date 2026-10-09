import postcss from 'postcss';
import { readFile, writeFile } from 'node:fs/promises';
for (const [file, section] of [['order', 'order'], ['ongkir', 'shipping']]) {
  const root = postcss.parse(await readFile(new URL('../styles/' + file + '-original.css', import.meta.url), 'utf8'));
  root.walkAtRules(rule => { if (rule.name === 'import' || rule.name === 'theme') rule.remove(); });
  const scope = `body:has([data-section="${section}"])`;
  root.walkRules(rule => {
    for (let parent = rule.parent; parent; parent = parent.parent) if (parent.type === 'atrule' && /keyframes$/.test(parent.name)) return;
    rule.selectors = rule.selectors.map(selector => {
      selector = selector.trim();
      if (selector === ':root' || selector === 'body' || selector === 'html') return scope;
      if (/^(?:body|html)(?=[\s.:#\[])/.test(selector)) return selector.replace(/^(?:body|html)/, scope);
      return scope + ' ' + selector;
    });
  });
  await writeFile(new URL('../styles/' + file + '.css', import.meta.url), root.toString());
}
