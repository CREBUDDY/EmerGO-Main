const fs = require('fs');
const path = require('path');

const walkSync = (dir, filelist = []) => {
  fs.readdirSync(dir).forEach(file => {
    const dirFile = path.join(dir, file);
    try {
      filelist = fs.statSync(dirFile).isDirectory() ? walkSync(dirFile, filelist) : filelist.concat(dirFile);
    } catch (err) {
      if (err.code === 'ENOENT' || err.code === 'EACCES') return;
    }
  });
  return filelist;
};

const map = [
  { from: 'bg-foreground dark:bg-white text-foreground dark:text-background', to: 'bg-foreground text-background' },
  { from: 'bg-foreground dark:bg-white', to: 'bg-foreground' },
  { from: 'hover:text-primary-foreground dark:hover:text-foreground dark:text-background', to: 'hover:text-primary-foreground' },
  { from: 'text-foreground dark:text-background', to: 'text-background' }
];

const files = walkSync('./src').filter(f => f.endsWith('.tsx') || f.endsWith('.ts'));

files.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  let changed = false;
  
  map.forEach(({from, to}) => {
    if (content.includes(from)) {
      content = content.replace(new RegExp(from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), to);
      changed = true;
    }
  });

  if (changed) {
    fs.writeFileSync(file, content);
    console.log(`Updated ${file}`);
  }
});
