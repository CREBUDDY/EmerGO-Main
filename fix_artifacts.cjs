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
  { from: 'bg-black/10 dark:bg-black/5 dark:bg-black/40', to: 'bg-black/10 dark:bg-black/40' },
  { from: 'bg-black/5 dark:bg-foreground dark:bg-white/10', to: 'bg-black/5 dark:bg-white/10' },
  { from: 'bg-black/5 dark:bg-foreground dark:bg-white/5', to: 'bg-black/5 dark:bg-white/5' },
  { from: 'bg-black/10 dark:bg-card/80 dark:bg-black/50', to: 'bg-black/10 dark:bg-black/50' },
  { from: 'hover:bg-black/20 dark:hover:bg-black/5 dark:bg-black/40/10 dark:bg-black/5 dark:bg-black/40', to: 'hover:bg-black/20 dark:hover:bg-black/40' },
  { from: 'hover:bg-black/20 dark:hover:bg-black/5 dark:bg-black/40/5 dark:bg-foreground dark:bg-white/5', to: 'hover:bg-black/10 dark:hover:bg-white/10' },
  { from: 'dark:bg-card/80', to: 'dark:bg-card/80' } // leave if single
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
