const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('=== 0. Preparing assets (overwriting default Expo icons with real app logo) ===');
const logoSrc = path.join(__dirname, '../VivaFifaLogo.jpeg');
const assetsDir = path.join(__dirname, '../mobile/assets');
if (fs.existsSync(logoSrc) && fs.existsSync(assetsDir)) {
  fs.copyFileSync(logoSrc, path.join(assetsDir, 'icon.png'));
  fs.copyFileSync(logoSrc, path.join(assetsDir, 'splash-icon.png'));
  fs.copyFileSync(logoSrc, path.join(assetsDir, 'favicon.png'));
  fs.copyFileSync(logoSrc, path.join(assetsDir, 'android-icon-foreground.png'));
  console.log('Official logo copied to Expo assets directory successfully!');
}

console.log('=== 1. Exporting Expo Mobile for Web ===');
execSync('npx expo export --platform web', { cwd: path.join(__dirname, '../mobile'), stdio: 'inherit' });

console.log('=== 2. Rebuilding Admin Panel ===');
execSync('npm run build', { cwd: path.join(__dirname, '../admin'), stdio: 'inherit' });

console.log('=== 3. Re-creating public_web directory ===');
const publicWeb = path.join(__dirname, '../public_web');
if (fs.existsSync(publicWeb)) {
  fs.rmSync(publicWeb, { recursive: true, force: true });
}
fs.mkdirSync(publicWeb, { recursive: true });

console.log('=== 4. Copying Mobile Web files ===');
copyFolderSync(path.join(__dirname, '../mobile/dist'), publicWeb);

console.log('=== 5. Copying Admin Web files ===');
const adminDest = path.join(publicWeb, 'admin');
fs.mkdirSync(adminDest, { recursive: true });
copyFolderSync(path.join(__dirname, '../admin/dist'), adminDest);

console.log('=== 6. Creating Web App Manifest ===');
const manifest = {
  name: "VivaFifa2026",
  short_name: "VivaFifa",
  description: "World Cup 2026 Private Betting Arena",
  start_url: "/",
  display: "standalone",
  background_color: "#f1ebd9",
  theme_color: "#f1ebd9",
  orientation: "portrait",
  icons: [
    {
      src: "/icon-192.jpeg",
      sizes: "192x192",
      type: "image/jpeg"
    },
    {
      src: "/icon-512.jpeg",
      sizes: "512x512",
      type: "image/jpeg"
    }
  ]
};
fs.writeFileSync(path.join(publicWeb, 'manifest.json'), JSON.stringify(manifest, null, 2));

console.log('=== 7. Copying Launcher Icons & Favicon ===');
fs.copyFileSync(
  path.join(__dirname, '../VivaFifaLogo.jpeg'),
  path.join(publicWeb, 'icon-192.jpeg')
);
fs.copyFileSync(
  path.join(__dirname, '../VivaFifaLogo.jpeg'),
  path.join(publicWeb, 'icon-512.jpeg')
);
fs.copyFileSync(
  path.join(__dirname, '../VivaFifaLogo.jpeg'),
  path.join(publicWeb, 'VivaFifaLogo.jpeg')
);

console.log('=== 8. Injecting manifest, favicon, title & fixing full-width CSS in index.html ===');
const indexPath = path.join(publicWeb, 'index.html');
let html = fs.readFileSync(indexPath, 'utf8');
if (!html.includes('manifest.json')) {
  html = html.replace('</head>', '  <link rel="manifest" href="/manifest.json" />\n</head>');
}
// Replace standard favicon with VivaFifaLogo
html = html.replace('href="/favicon.ico"', 'type="image/jpeg" href="/VivaFifaLogo.jpeg"');
// Disable user scalable viewport zooming
html = html.replace(
  'content="width=device-width, initial-scale=1, shrink-to-fit=no"',
  'content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, shrink-to-fit=no"'
);
// Replace default title
html = html.replace('<title>mobile</title>', '<title>VivaFifa2026</title>');

const customStyles = `
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&display=swap');
      html, body {
        width: 100% !important;
        height: 100% !important;
        margin: 0 !important;
        padding: 0 !important;
        background-color: #f1ebd9 !important;
        font-family: 'Outfit', -apple-system, BlinkMacSystemFont, sans-serif !important;
      }
      #root {
        width: 100% !important;
        height: 100% !important;
        font-family: 'Outfit', -apple-system, BlinkMacSystemFont, sans-serif !important;
      }
      div, span, p, input, button, textarea, select {
        font-family: 'Outfit', -apple-system, BlinkMacSystemFont, sans-serif !important;
      }
    </style>
`;
html = html.replace('</head>', `${customStyles}\n</head>`);
fs.writeFileSync(indexPath, html, 'utf8');

console.log('=== 9. Deploying to Firebase Hosting ===');
execSync('npx firebase-tools deploy --only hosting --project vivafifa2026', { cwd: path.join(__dirname, '..'), stdio: 'inherit' });

console.log('=== Build and Deploy to Firebase completed! ===');

function copyFolderSync(from, to) {
  if (!fs.existsSync(from)) return;
  const files = fs.readdirSync(from);
  for (const file of files) {
    const fromPath = path.join(from, file);
    const toPath = path.join(to, file);
    const stat = fs.statSync(fromPath);
    if (stat.isDirectory()) {
      fs.mkdirSync(toPath, { recursive: true });
      copyFolderSync(fromPath, toPath);
    } else {
      fs.copyFileSync(fromPath, toPath);
    }
  }
}
