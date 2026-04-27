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

const map = {
  'bg-[#0A0A0B]': 'bg-background',
  'bg-[#0A0A0B]/': 'bg-background/',
  'bg-[#151619]': 'bg-card',
  'bg-[#151619]/': 'bg-card/',
  'border-[#2A2C32]': 'border-border',
  'text-[#FFFFFF]': 'text-foreground',
  'text-[#8E9299]': 'text-muted-foreground',
};

const files = walkSync('./src').filter(f => f.endsWith('.tsx') || f.endsWith('.ts'));

files.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  let changed = false;
  
  // Custom manual replacements that need caution
  // For text-white, only replace if not inside a colored button. Too risky? 
  // We'll just replace the main ones.
  Object.keys(map).forEach(key => {
    if (content.includes(key)) {
      content = content.replace(new RegExp(key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), map[key]);
      changed = true;
    }
  });

  if (changed) {
    fs.writeFileSync(file, content);
    console.log(`Updated ${file}`);
  }
});
