// Applies the saved/system colour theme before first paint (external file for CSP)
(function(){try{var s=localStorage.getItem('ulak_theme');var sys=(window.matchMedia&&window.matchMedia('(prefers-color-scheme: light)').matches)?'light':'dark';var t=(s==='light'||s==='dark')?s:sys;document.documentElement.setAttribute('data-theme',t);}catch(e){}})();
