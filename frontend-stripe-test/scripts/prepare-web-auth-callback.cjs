const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(process.argv[2] || 'dist-web');
const shell = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
if (!shell.includes('/_expo/static/js/web/')) throw Error('Expected exported Expo app shell');
const callback = shell.replace('<head>', '<head><meta name="robots" content="noindex,nofollow"><script src="/oauth/normalize-google-return.js"></script>');
fs.mkdirSync(path.join(root, 'oauth/google'), { recursive: true });
fs.writeFileSync(path.join(root, 'oauth/google/index.html'), callback);
console.log('Google callback prepared with current Expo bundle');
