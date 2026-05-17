const fs = require('fs');
const path = require('path');

const publicDir = path.join(__dirname, '..', 'public');
const oldBlock = `    <link rel="icon" href="/img/icon.svg" type="image/svg+xml">
    <link rel="shortcut icon" href="/img/icon.svg" type="image/svg+xml">
    <link rel="apple-touch-icon" href="/img/icon.svg">
    <link rel="manifest" href="/site.webmanifest">
    <meta property="og:image" content="/img/icon.svg">
    <meta name="twitter:image" content="/img/icon.svg">`;

const newBlock = `    <link rel="icon" type="image/png" sizes="48x48" href="/img/icon-48.png">
    <link rel="icon" type="image/png" sizes="192x192" href="/img/icon-192.png">
    <link rel="icon" href="/img/icon.svg" type="image/svg+xml">
    <link rel="shortcut icon" href="/favicon.png" type="image/png">
    <link rel="apple-touch-icon" sizes="192x192" href="/img/icon-192.png">
    <link rel="manifest" href="/site.webmanifest">
    <meta property="og:image" content="https://stud.kg/img/icon-192.png">
    <meta property="og:image:type" content="image/png">
    <meta property="og:image:width" content="192">
    <meta property="og:image:height" content="192">
    <meta name="twitter:image" content="https://stud.kg/img/icon-192.png">`;

const jsonLd = `
    <script type="application/ld+json">
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      "name": "stud.kg",
      "url": "https://stud.kg/",
      "description": "Платформа для подготовки к экзаменам",
      "publisher": {
        "@type": "Organization",
        "name": "stud.kg",
        "url": "https://stud.kg/",
        "logo": {
          "@type": "ImageObject",
          "url": "https://stud.kg/img/icon-192.png",
          "width": 192,
          "height": 192
        }
      }
    }
    </script>`;

function walk(dir) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) {
      walk(full);
      continue;
    }
    if (!name.endsWith('.html')) continue;
    let html = fs.readFileSync(full, 'utf8');
    if (!html.includes(oldBlock) && !html.includes('icon-48.png')) {
      console.warn('skip (no block)', full);
      continue;
    }
    if (html.includes(oldBlock)) {
      html = html.replace(oldBlock, newBlock);
    }
    if (full.endsWith(`${path.sep}index.html`) && !html.includes('application/ld+json')) {
      html = html.replace('</head>', `${jsonLd}\n</head>`);
    }
    fs.writeFileSync(full, html, 'utf8');
    console.log('updated', full);
  }
}

walk(publicDir);
