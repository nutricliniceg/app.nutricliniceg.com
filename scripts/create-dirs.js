const fs = require('fs');
const path = require('path');

const dirs = [
  'app/(public)',
  'app/(auth)',
  'app/dashboard',
  'app/admin',
  'app/portal',
  'app/print',
  'lib/db/repositories',
  'lib/security',
  'lib/nutrition',
  'lib/ai',
  'lib/email',
  'lib/files',
  'lib/i18n',
  'messages',
  'prisma',
  'scripts',
  'docs',
  'tests'
];

dirs.forEach(dir => {
  const fullPath = path.join(__dirname, '..', dir);
  if (!fs.existsSync(fullPath)) {
    fs.mkdirSync(fullPath, { recursive: true });
    console.log(`Created directory: ${dir}`);
  }
  const gitkeepPath = path.join(fullPath, '.gitkeep');
  if (!fs.existsSync(gitkeepPath) && dir !== 'prisma' && dir !== 'scripts') {
    fs.writeFileSync(gitkeepPath, '');
    console.log(`Created .gitkeep in ${dir}`);
  }
});
