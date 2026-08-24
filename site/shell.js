"use strict";
(function () {
  function ready(fn){ if(document.readyState!=="loading"){fn();} else {document.addEventListener("DOMContentLoaded",fn);} }
  function isUnlocked(){ return !document.body.classList.contains("is-access-locked"); }
  function workspaceButtons(){ return Array.prototype.slice.call(document.querySelectorAll("#workspaceNav button[data-open]")); }
  function currentName(){ var b = document.querySelector("#workspaceNav button.is-active, #workspaceNav button[aria-current]"); if (b) return b.getAttribute("data-open")||"home"; return "home"; }
  function tickClock(){ var el = document.getElementById("mdbClock"); if (!el) return; var d = new Date(); function pad(n){ return (n<10?"0":"")+n; } el.textContent = pad(d.getHours())+":"+pad(d.getMinutes()); }
  function updateCrumbs(){ var el = document.getElementById("mdbCrumbs"); if(!el) return; el.textContent = currentName(); }
  function buildTitlebar(){
    if (document.querySelector(".mdb-titlebar")) return;
    var bar = document.createElement("div"); bar.className = "mdb-titlebar";
    bar.innerHTML = "<div class=mdb-tb-brand><span class=dot></span>Mobile Drill Brain</div><div class=mdb-tb-crumbs id=mdbCrumbs>Home</div><div class=mdb-tb-spacer></div><div class=mdb-tb-status id=mdbStatus>Public Sandbox</div><div class=mdb-tb-clock id=mdbClock></div>";
    var install = document.createElement("button"); install.className="mdb-install"; install.id="mdbInstall"; install.type="button"; install.textContent="Install App";
    install.addEventListener("click", function(){ var ev = window.deferredMDBPrompt; if (ev && ev.prompt){ ev.prompt(); ev.userChoice.then(function(){ window.deferredMDBPrompt=null; install.style.display="none"; }); } else { install.textContent="Use browser menu: Install app"; setTimeout(function(){ install.textContent="Install App"; },2600); } });
    bar.appendChild(install);
    document.body.insertBefore(bar, document.body.firstChild);
    tickClock(); setInterval(tickClock, 30000);
    var pill = document.querySelector(".demo-pill"); if (pill){ var s=document.getElementById("mdbStatus"); if(s) s.textContent = pill.textContent.trim(); }
    updateCrumbs();
  }
  var items = []; var activeIndex = 0;
  function refreshItems(){
    items = [];
    workspaceButtons().forEach(function(b){ items.push({label:b.textContent.trim(), kind:"Workspace", run:function(){ b.click(); }}); });
    var adv = document.getElementById("advancedSearchButton"); if (adv) items.push({label:"Advanced Search", kind:"Action", run:function(){ adv.click(); }});
    var home = document.getElementById("homeButton"); if (home) items.push({label:"Home", kind:"Action", run:function(){ home.click(); }});
  }
  function renderList(){
    var list = document.getElementById("mdbPaletteList"); if(!list) return;
    var q = (document.getElementById("mdbPaletteInput").value||"").toLowerCase();
    var filtered = items.filter(function(it){ return !q || it.label.toLowerCase().indexOf(q)>-1; });
    activeIndex = Math.min(activeIndex, Math.max(0, filtered.length-1));
    list.innerHTML = "";
    filtered.forEach(function(it, i){
      var li = document.createElement("li"); li.className = "mdb-palette-item" + (i===activeIndex?" active":"");
      li.innerHTML = "<span>"+it.label+"</span><span class=k>"+it.kind+"</span>";
      li.addEventListener("click", function(){ it.run(); closePalette(); });
      list.appendChild(li);
    });
    list._filtered = filtered;
  }
  function onInputKey(e){
    var list = document.getElementById("mdbPaletteList"); var filtered = list._filtered||[];
    if (e.key==="ArrowDown"){ e.preventDefault(); activeIndex=Math.min(activeIndex+1, filtered.length-1); renderList(); }
    else if (e.key==="ArrowUp"){ e.preventDefault(); activeIndex=Math.max(activeIndex-1,0); renderList(); }
    else if (e.key==="Enter"){ e.preventDefault(); var it=filtered[activeIndex]; if(it){ it.run(); closePalette(); } }
    else if (e.key==="Escape"){ e.preventDefault(); closePalette(); }
    var act = list.querySelector && list.querySelector(".mdb-palette-item.active"); if(act) act.scrollIntoView({block:"nearest"});
  }
  function openPalette(){ refreshItems(); var ov=document.getElementById("mdbPalette"); if(!ov) return; ov.classList.add("open"); var i=document.getElementById("mdbPaletteInput"); activeIndex=0; if(i){ i.value=""; i.focus(); } renderList(); }
  function closePalette(){ var ov=document.getElementById("mdbPalette"); if(ov) ov.classList.remove("open"); }
  function buildPalette(){
    if (document.querySelector(".mdb-palette")) return;
    var ov = document.createElement("div"); ov.className="mdb-palette"; ov.id="mdbPalette";
    ov.innerHTML = "<div class=mdb-palette-card><input class=mdb-palette-input id=mdbPaletteInput placeholder="Jump to a workspace or action" autocomplete=off><ul class=mdb-palette-list id=mdbPaletteList></ul><div class=mdb-palette-hint>Up/Down navigate, Enter select, Esc close</div></div>";
    document.body.appendChild(ov);
    ov.addEventListener("mousedown", function(e){ if(e.target===ov) closePalette(); });
    var input = document.getElementById("mdbPaletteInput"); input.addEventListener("input", renderList); input.addEventListener("keydown", onInputKey);
  }
  function onKey(e){
    if ((e.ctrlKey||e.metaKey) && (e.key==="k"||e.key==="p")){ e.preventDefault(); var ov=document.getElementById("mdbPalette"); if(ov && ov.classList.contains("open")) closePalette(); else openPalette(); return; }
    if (e.key==="Escape"){ closePalette(); return; }
    if (e.altKey && /^[1-9]$/.test(e.key)){
      var tag=(e.target&&e.target.tagName)||""; if (tag==="INPUT"||tag==="TEXTAREA"||tag==="SELECT") return;
      var idx=parseInt(e.key,10)-1; var btns=workspaceButtons(); if(btns[idx]){ e.preventDefault(); btns[idx].click(); }
    }
  }
  function start(){
    buildTitlebar(); buildPalette(); document.addEventListener("keydown", onKey);
    workspaceButtons().forEach(function(b){ b.addEventListener("click", function(){ setTimeout(updateCrumbs, 30); }); });
    var adv=document.getElementById("advancedSearchButton"); if(adv) adv.addEventListener("click", function(){ setTimeout(updateCrumbs,30); });
    var nav=document.getElementById("workspaceNav");
    if (nav && "MutationObserver" in window){ new MutationObserver(function(){ updateCrumbs(); }).observe(nav,{attributes:true,subtree:true,attributeFilter:["class","aria-current"]}); }
    updateCrumbs();
  }
  function boot(){
    if (!isUnlocked()){ var obs = new MutationObserver(function(){ if(isUnlocked()){ obs.disconnect(); start(); } }); obs.observe(document.body,{attributes:true,attributeFilter:["class"]}); return; }
    start();
  }
  window.addEventListener("beforeinstallprompt", function(e){ e.preventDefault(); window.deferredMDBPrompt = e; var btn=document.getElementById("mdbInstall"); if(btn) btn.style.display=""; });
  window.addEventListener("appinstalled", function(){ var btn=document.getElementById("mdbInstall"); if(btn) btn.style.display="none"; });
  ready(boot);
})();