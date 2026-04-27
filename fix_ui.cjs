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
  // Backgrounds
  { from: 'bg-black/40', to: 'bg-black/10 dark:bg-black/40' },
  { from: 'bg-black/50', to: 'bg-black/10 dark:bg-black/50' },
  { from: 'bg-white/10', to: 'bg-black/5 dark:bg-white/10' },
  { from: 'bg-white/5', to: 'bg-black/5 dark:bg-white/5' },
  { from: 'hover:bg-white/5', to: 'hover:bg-black/5 dark:hover:bg-white/5' },

  // Borders
  { from: 'border-white/5', to: 'border-black/5 dark:border-white/5' },
  { from: 'border-white/10', to: 'border-black/10 dark:border-white/10' },
  { from: 'border-white/20', to: 'border-black/20 dark:border-white/20' },
  
  // Specific known UI issues
  { from: 'text-white/90', to: 'text-foreground/90' },
  
  // Text White replacements (contextual)
  { from: 'text-white tracking-wide', to: 'text-foreground tracking-wide' },
  { from: 'text-white tracking-tight', to: 'text-foreground tracking-tight' },
  { from: 'text-white tracking-widest', to: 'text-foreground tracking-widest' },
  { from: 'text-white drop-shadow-', to: 'text-foreground drop-shadow-' },
  { from: 'text-white hover:bg-black', to: 'text-foreground hover:bg-black/20 dark:hover:bg-black/40' },
  
  // Replace text-white in specific hardware-cards, or generic backgrounds (not buttons)
  { from: 'className="text-white border-red-500', to: 'className="text-foreground border-red-500' },
  { from: 'className="text-white border-green-500', to: 'className="text-foreground border-green-500' },
  { from: 'className="text-white font-mono', to: 'className="text-foreground font-mono' },
  
  // Modal texts:
  { from: 'className="bg-card text-white', to: 'className="bg-card text-foreground' },
  { from: 'text-sm font-bold text-white', to: 'text-sm font-bold text-foreground' },
  { from: 'text-xs font-bold text-white', to: 'text-xs font-bold text-foreground' },
  
  // SOS text
  { from: 'h1 className="text-2xl font-bold text-white', to: 'h1 className="text-2xl font-bold text-foreground' },
  { from: 'h2 className="text-xl md:text-2xl font-bold tracking-tight text-white', to: 'h2 className="text-xl md:text-2xl font-bold tracking-tight text-foreground' },
  { from: 'h2 className="text-xl font-bold text-white', to: 'h2 className="text-xl font-bold text-foreground' },
  
  { from: 'className="font-bold text-white tracking-', to: 'className="font-bold text-foreground tracking-' },

  // Form inputs
  { from: 'text-white outline-none', to: 'text-foreground outline-none' },
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

// For MapDisplay specifically, we need to toggle light/dark map tiles.
const mapFile = './src/components/MapDisplay.tsx';
if (fs.existsSync(mapFile)) {
    let mapContent = fs.readFileSync(mapFile, 'utf8');
    
    // Add useTheme 
    if (!mapContent.includes('useTheme')) {
        mapContent = mapContent.replace("import React, {", "import React, {");
        mapContent = `import { useTheme } from 'next-themes';\n` + mapContent;
    }
    
    // Inside MapDisplay component
    if (!mapContent.includes('const { theme, resolvedTheme } = useTheme();')) {
      mapContent = mapContent.replace("export const MapDisplay = React.memo(() => {", "export const MapDisplay = React.memo(() => {\n  const { theme, resolvedTheme } = useTheme();");
    }
    
    // Changing the tile layer
    const oldTile = '<TileLayer\n              attribution=""\n              url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"\n            />';
    
    const newTile = `<TileLayer
              attribution=""
              url={resolvedTheme === 'light' || theme === 'light' 
                ? "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
                : "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"}
            />`;
            
    if (mapContent.includes(oldTile)) {
        mapContent = mapContent.replace(oldTile, newTile);
        fs.writeFileSync(mapFile, mapContent);
        console.log('Updated MapDisplay TileLayer');
    } else {
        // Also fix the public tracking view in App.tsx
        const appFile = './src/App.tsx';
        let appContent = fs.readFileSync(appFile, 'utf8');
        if (appContent.includes(oldTile)) {
            // Need to add useTheme to App.tsx? Not necessarily, it's not wrapped in ThemeProvider there.
            // Oh right, ThemeProvider is wrapped in main.tsx.
            if (!appContent.includes("import { useTheme } from 'next-themes'")) {
               appContent = `import { useTheme } from 'next-themes';\n` + appContent;
            }
            if (!appContent.includes('const { theme, resolvedTheme } = useTheme()') && appContent.includes('function PublicTrackingView')) {
              appContent = appContent.replace("function PublicTrackingView({ trackId }: { trackId: string }) {", "function PublicTrackingView({ trackId }: { trackId: string }) {\n  const { theme, resolvedTheme } = useTheme();");
              appContent = appContent.replace(oldTile, `<TileLayer
              attribution=""
              url={(resolvedTheme || theme) === 'light' ? "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png" : "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"}
            />`);
              fs.writeFileSync(appFile, appContent);
              console.log('Updated App.tsx map tiles');
            }
        }
    }
}
