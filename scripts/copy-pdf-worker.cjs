const fs = require('node:fs');
const path = require('node:path');

const target = path.join(process.cwd(), 'public', 'pdfjs');
fs.mkdirSync(target, { recursive: true });

for (const name of ['pdf.mjs', 'pdf.worker.mjs']) {
  const source = require.resolve(`pdfjs-dist/build/${name}`);
  fs.copyFileSync(source, path.join(target, name));
  console.log(`Copied ${name} to public/pdfjs/`);
}
