// Read-only copy inventory for the localization migration. Never reads environment files.
const ts = require('typescript');
const fs = require('node:fs');
const path = require('node:path');
const files = ['app', 'src'].flatMap(dir => fs.readdirSync(dir, { recursive: true }).filter(p => /\.(tsx|ts)$/.test(p)).map(p => path.join(dir, p)));
const found = new Set();
for (const file of files) {
  if (/locale|translations|copy\.ts|theme\.ts/.test(file)) continue;
  const tree = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, file.endsWith('tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  function walk(node) {
    // This one template is executable AudioWorklet source, not user-visible copy.
    if (file === path.join('src', 'caption-pcm.ts') && ts.isVariableDeclaration(node) && node.name.getText(tree) === 'captionWorkletSource') return;
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isJsxText(node)) {
      const text = node.text.trim().replace(/\s+/g, ' ');
      if ((/[A-Z]/.test(text) || /[a-z] [a-z]/.test(text)) && !/^#[A-Fa-f0-9]+$/.test(text) && !/^(import|https?:|[A-Z]+_)/.test(text)) found.add(text);
    }
    ts.forEachChild(node, walk);
  }
  walk(tree);
}
process.stdout.write(JSON.stringify([...found].sort(), null, 2));
