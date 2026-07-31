/* ═══════ SP OS · Safe areas universales + teclado ═══════
   Android WebView (Capacitor) NO expone env(safe-area-inset-*) — devuelve 0 —
   aunque el contenido se dibuje detrás del notch y de la gesture nav. Este script
   mide los insets reales con probes CSS y compensa el teclado con visualViewport.
   Publica en :root las variables:
   · --safe-t / --safe-b  → padding de notch/barra de estado/gesture nav
   · --kb                 → altura del teclado cubriendo el viewport
   Estrategia:
   · Navegador / PWA / iOS: env() da valores reales → se leen con probes.
   · APK Capacitor confinada (fix nativo setDecorFitsSystemWindows): screen.height -
     innerHeight > 0 → los insets web son 0 y los fallbacks CSS quedan bien.
   · APK Capacitor edge-to-edge (APK antigua sin fix nativo): la diferencia es ~0 →
     se aplica heurística por densidad (barra de estado ≈ gesture nav ≈ 24dp).
   · Teclado: innerHeight - visualViewport.height = zona cubierta → --kb (aditivo:
     si el WebView ya redimensiona, da 0 y no cambia nada). */
(function(){
  var s=document.documentElement.style;
  function probe(lado){
    var p=document.createElement('div');
    p.style.cssText='position:fixed;left:0;top:0;width:1px;height:0;visibility:hidden;pointer-events:none;padding-'+lado+':env(safe-area-inset-'+lado+',0px)';
    document.documentElement.appendChild(p);
    var v=p.offsetHeight-p.clientHeight;
    p.remove();
    return v;
  }
  function esNativo(){ return !!(window.Capacitor&&window.Capacitor.isNativePlatform&&window.Capacitor.isNativePlatform()); }
  function aplicar(){
    var top=probe('top'), bottom=probe('bottom');
    if(esNativo()&&!top&&!bottom){
      var dpr=window.devicePixelRatio||1;
      var sys=(window.screen&&window.screen.height)?(window.screen.height-window.innerHeight):0;
      if(sys<30){ top=Math.round(24*dpr); bottom=Math.round(24*dpr); }
    }
    s.setProperty('--safe-t',Math.round(top)+'px');
    s.setProperty('--safe-b',Math.round(bottom)+'px');
  }
  function teclado(){
    var kb=0;
    try{
      if(window.visualViewport){
        var cubierto=window.innerHeight-window.visualViewport.height-window.visualViewport.offsetTop;
        if(cubierto>0) kb=Math.round(cubierto);
      }
    }catch(e){}
    s.setProperty('--kb',kb+'px');
  }
  window.addEventListener('resize',function(){ aplicar(); teclado(); });
  window.addEventListener('orientationchange',function(){ setTimeout(aplicar,180); setTimeout(teclado,180); });
  if(window.visualViewport){
    window.visualViewport.addEventListener('resize',teclado);
    window.visualViewport.addEventListener('scroll',teclado);
  }
  document.addEventListener('focusin',function(){ setTimeout(teclado,300); });
  document.addEventListener('focusout',function(){ setTimeout(teclado,200); });
  aplicar(); teclado();
})();
