const fs = require('fs');

const cssContent = `
@import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Roboto:wght@400;500;700&display=swap');
@import "tailwindcss";
@import "tw-animate-css";
@import "shadcn/tailwind.css";

@custom-variant dark (&:is(.dark *));

@theme inline {
  --font-sans: "Roboto", sans-serif;
  --font-mono: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
  --font-heading: "Bebas Neue", sans-serif;
  --radius-lg: 12px;

  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-popover: var(--popover);
  --color-popover-foreground: var(--popover-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive);
  --color-destructive-foreground: var(--destructive-foreground);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);
}

:root {
  /* MATERIAL 3 LIGHT THEME */
  --background: #fdfdfd; 
  --foreground: #1a1c1e;
  --card: #ffffff; /* Surface lowest */
  --card-foreground: #1a1c1e;
  --popover: #f3f3f5;
  --popover-foreground: #1a1c1e;
  
  --primary: #ba1a1a; /* Red/Emergency */
  --primary-foreground: #ffffff;
  --secondary: #e1e2e8; /* Secondary Container */
  --secondary-foreground: #1a1c1e;
  
  --muted: #e1e2e8; /* Surface variant */
  --muted-foreground: #43474e;
  
  --accent: #d7e3ce; /* Greenish/Safe Container */
  --accent-foreground: #111f0f;
  
  --destructive: #ba1a1a;
  --destructive-foreground: #ffffff;
  
  --border: #c4c6d0; /* M3 Outline */
  --input: #c4c6d0;
  --ring: #ba1a1a;
  
  --radius: 0.75rem;

  /* App Specific M3 adaptations */
  --hardware-bg: rgba(255, 255, 255, 0.85);
  --hardware-border: rgba(0, 0, 0, 0.1);
}

.dark {
  /* MATERIAL 3 DARK THEME */
  --background: #111318;
  --foreground: #e2e2e6;
  --card: #191c20; /* Surface lowest / dark */
  --card-foreground: #e2e2e6;
  --popover: #191c20;
  --popover-foreground: #e2e2e6;
  
  --primary: #ffb4ab; /* Primary dark */
  --primary-foreground: #690005;
  --secondary: #44474e; /* Secondary / dark */
  --secondary-foreground: #e2e2e6;
  
  --muted: #43474e; /* Surface variant dark */
  --muted-foreground: #c4c6d0;
  
  --accent: #2c4c3b; /* Greenish dark */
  --accent-foreground: #bdf0b4;
  
  --destructive: #ffb4ab;
  --destructive-foreground: #690005;
  
  --border: #44474e; /* M3 Outline dark */
  --input: #44474e;
  --ring: #ffb4ab;

  /* App Specific M3 adaptations */
  --hardware-bg: rgba(0, 0, 0, 0.6);
  --hardware-border: rgba(255, 255, 255, 0.1);
}

@layer base {
  * {
    @apply border-border outline-ring/50;
  }
  body {
    @apply bg-background text-foreground font-sans;
  }
  html {
    @apply font-sans;
  }
}

/* Custom Hardware Styles */
.hardware-card {
  background: var(--hardware-bg);
  backdrop-filter: blur(12px);
  border: 1px solid var(--hardware-border);
  border-radius: 12px;
  box-shadow: 0 8px 30px rgba(0,0,0,0.15);
  overflow: hidden;
}
.dark .hardware-card {
  box-shadow: 0 8px 30px rgba(0,0,0,0.4);
}

.status-label {
  font-family: var(--font-sans);
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.15em;
  color: var(--muted-foreground);
  opacity: 0.8;
}

.data-value {
  font-family: var(--font-sans);
  font-size: 0.75rem; /* text-xs */
  color: var(--foreground);
}

.radar-glow {
  box-shadow: 0 0 20px rgba(186, 26, 26, 0.2);
}
.dark .radar-glow {
  box-shadow: 0 0 20px rgba(255, 68, 68, 0.2);
}

.is-recording {
  animation: pulse-red 2s infinite;
}

@keyframes pulse-red {
  0% {
    box-shadow: 0 0 0 0 rgba(255, 68, 68, 0.7);
  }
  70% {
    box-shadow: 0 0 0 10px rgba(255, 68, 68, 0);
  }
  100% {
    box-shadow: 0 0 0 0 rgba(255, 68, 68, 0);
  }
}

@keyframes sos-glow {
  0%,
  100% {
    box-shadow:
      0 0 15px rgba(239, 68, 68, 0.4),
      inset 0 0 10px rgba(239, 68, 68, 0.2);
    transform: scale(1);
  }
  50% {
    box-shadow:
      0 0 25px rgba(239, 68, 68, 0.8),
      inset 0 0 20px rgba(239, 68, 68, 0.4);
    transform: scale(1.02);
  }
}

.sos-idle-pulse {
  animation: sos-glow 3s ease-in-out infinite;
}

.btn-interactive {
  transition: transform 300ms cubic-bezier(0.4, 0, 0.2, 1);
}
.btn-interactive:hover {
  transform: scale(1.02);
}
.btn-interactive:active {
  transform: scale(0.98);
}

.risk-bar-transition {
  transition: transform 500ms cubic-bezier(0.4, 0, 0.2, 1), background-color 500ms ease-in-out;
  transform-origin: left;
}

@keyframes pulse {
  0% {
    box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.7);
  }
  70% {
    box-shadow: 0 0 0 15px rgba(239, 68, 68, 0);
  }
  100% {
    box-shadow: 0 0 0 0 rgba(239, 68, 68, 0);
  }
}

@keyframes scan {
  from {
    transform: translateY(-100%);
  }
  to {
    transform: translateY(100vh);
  }
}

.custom-scrollbar::-webkit-scrollbar {
  width: 4px;
}
.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background: var(--muted);
  border-radius: 4px;
}
.custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background: var(--muted-foreground);
}

.custom-popup .leaflet-popup-content-wrapper {
  background: var(--card);
  color: var(--foreground);
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.2);
}
.dark .custom-popup .leaflet-popup-content-wrapper {
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.5);
}
.custom-popup .leaflet-popup-tip {
  background: var(--card);
}

.marker-cluster {
  background-clip: padding-box;
  border-radius: 20px;
}
.marker-cluster div {
  width: 30px;
  height: 30px;
  margin-left: 5px;
  margin-top: 5px;
  text-align: center;
  border-radius: 15px;
  font: 12px "Helvetica Neue", Arial, Helvetica, sans-serif;
  color: black;
}
.marker-cluster span {
  line-height: 30px;
}
.marker-cluster-small {
  background-color: rgba(181, 226, 140, 0.6);
}
.marker-cluster-small div {
  background-color: rgba(110, 204, 57, 0.6);
}
.marker-cluster-medium {
  background-color: rgba(241, 211, 87, 0.6);
}
.marker-cluster-medium div {
  background-color: rgba(240, 194, 12, 0.6);
}
.marker-cluster-large {
  background-color: rgba(253, 156, 115, 0.6);
}
.marker-cluster-large div {
  background-color: rgba(241, 128, 23, 0.6);
}
`;

fs.writeFileSync('./src/index.css', cssContent);
console.log('Updated index.css');
