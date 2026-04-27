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
  { from: 'bg-[#2A2C32]', to: 'bg-muted dark:bg-muted/80' },
  { from: 'border-[#3A3C42]', to: 'border-border' },
  { from: 'bg-black/60', to: 'bg-card/90 dark:bg-black/60' },
  { from: 'bg-black/50', to: 'bg-card/80 dark:bg-black/50' },
  { from: 'bg-black/40', to: 'bg-black/5 dark:bg-black/40' },
  { from: 'bg-black/80', to: 'bg-card dark:bg-black/80' },
  { from: 'bg-[#0A0A0B]', to: 'bg-background' },
  
  // Specific stuff from HotspotsPanel
  { from: 'hover:text-black', to: 'hover:text-primary-foreground dark:hover:text-black' },
  { from: 'hover:border-white', to: 'hover:border-primary shrink-0' }, // fix alignment issues
  
  // Fix white text explicitly defined
  { from: 'text-white', to: 'text-foreground' },
  { from: 'text-black', to: 'text-foreground dark:text-background' },
  { from: 'bg-white', to: 'bg-foreground dark:bg-white' },

  // Network cards
  { from: 'bg-card text-foreground', to: 'bg-card/90 text-foreground' },
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
