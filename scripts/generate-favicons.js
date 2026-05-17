const path = require('path');
const fs = require('fs');
const sharp = require('sharp');

const svgPath = path.join(__dirname, '..', 'public', 'img', 'icon.svg');
const outDir = path.join(__dirname, '..', 'public', 'img');

async function main() {
  const svg = fs.readFileSync(svgPath);
  const sizes = [48, 96, 192, 512];

  for (const size of sizes) {
    const out = path.join(outDir, `icon-${size}.png`);
    await sharp(svg, { density: 300 })
      .resize(size, size, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } })
      .png()
      .toFile(out);
    console.log('wrote', out);
  }

  const faviconIco = path.join(__dirname, '..', 'public', 'favicon.ico');
  await sharp(svg, { density: 300 })
    .resize(48, 48, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } })
    .png()
    .toFile(faviconIco.replace('.ico', '-48-temp.png'));

  await fs.promises.copyFile(
    path.join(outDir, 'icon-48.png'),
    path.join(__dirname, '..', 'public', 'favicon.png')
  );
  console.log('wrote public/favicon.png');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
