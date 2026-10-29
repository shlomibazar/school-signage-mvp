const fs = require('node:fs');
const path = require('node:path');
const publicDir = path.join(process.cwd(), 'public');
fs.mkdirSync(publicDir, { recursive: true });
for (const name of ['pdf.min.js', 'pdf.worker.min.js']) {
  const source = require.resolve(`pdfjs-dist/build/${name}`);
  fs.copyFileSync(source, path.join(publicDir, name));
  console.log(`Copied ${name} to public/`);
}
