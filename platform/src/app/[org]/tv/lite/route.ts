/**
 * Pantalla de la sala en versión compatible (/<gym>/tv/lite).
 *
 * Para televisores con navegadores viejos (ej. Chrome 72 de 2019) que dejan la pantalla
 * normal en blanco. Es una sola página HTML con JavaScript simple (ES5, XMLHttpRequest, sin
 * React) que usa las mismas direcciones que la pantalla normal:
 *   POST /<gym>/tv/pair   vincular con el código de 6 números
 *   POST /<gym>/tv/feed   datos (gente, clases, ranking, cumpleaños, mensaje)
 *   GET  /api/access/turnstile/slides?org=<gym>   publicidad (imágenes y videos; el video pasa entero, sin sonido)
 * La clave queda guardada igual que en la pantalla normal (localStorage "tv:<gym>").
 *   (la música viene en el mismo pedido de /tv/live, cada 1,5 s; la maneja todo el equipo).
 *   Mientras suenan los pitidos del temporizador, la música baja sola.
 * La hora sale del servidor (server_time de tv_feed), por si el reloj de la TV está mal.
 * Apretando OK (o tocando la pantalla) pasa a pantalla completa.
 *   POST /<gym>/tv/live   pizarra en vivo del profe y música (cada 1,5 s en clase o con algo en uso; abierto 6 s; cerrado 60 s; el profe la maneja desde Mis clases → Pizarra)
 *   Con sonido (se apaga desde la pizarra): pitidos al empezar trabajo/descanso, al terminar y en los
 *   últimos N segundos de cada fase (timer.beep_s, 0 = no; por defecto 3).
 *   El navegador recién deja sonar después de que alguien apriete OK (el mismo OK de pantalla completa).
 *
 * /<gym>/tv redirige acá sola cuando detecta un Chrome anterior al 111.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ org: string }> }) {
  const { org: slug } = await params
  if (!/^[a-z0-9-]{1,60}$/.test(slug)) return new Response('Not found', { status: 404 })
  return new Response(PAGE.split('__SLUG__').join(slug), {
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  })
}

// Ojo: este texto no usa comillas invertidas ni "$" + "{" para poder vivir dentro de un template string.
const PAGE = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<meta name="theme-color" content="#000000">
<title>Pantalla de la sala</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
html,body{height:100%;background:#000;color:#fff;overflow:hidden;cursor:none;font-family:"DM Sans",Roboto,Arial,sans-serif;-webkit-user-select:none;user-select:none}
.hide{display:none!important}
.y{color:#edcc36}.mut{color:#a1a1aa}.dim{color:#71717a}
#pair{position:absolute;top:0;left:0;right:0;bottom:0;display:-webkit-box;display:flex;-webkit-box-align:center;align-items:center;-webkit-box-pack:center;justify-content:center;text-align:center;padding:4vw}
#pair .t{font-size:2.6vw;font-weight:900;letter-spacing:.2em;text-transform:uppercase;color:#edcc36}
#code{font-family:monospace;font-size:11vw;font-weight:900;letter-spacing:.15em;margin:4vh 0}
#pair .h{font-size:2vw;color:#d4d4d8;max-width:70vw;margin:0 auto;line-height:1.35}
#pair .h b{color:#fff}
#pairmsg{margin-top:3vh;font-size:1.6vw;color:#fcd34d}
#screen{position:absolute;top:0;left:0;right:0;bottom:0;display:-webkit-box;display:flex;-webkit-box-orient:vertical;flex-direction:column}
#head{display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #18181b;padding:2vh 3vw}
#gym{font-size:2vw;font-weight:900;letter-spacing:.2em;text-transform:uppercase;color:#edcc36}
#clock{font-size:4.5vw;font-weight:900;line-height:1;text-align:right}
#date{font-size:1.3vw;color:#a1a1aa;text-align:right}
#date:first-letter{text-transform:uppercase}
#content{-webkit-box-flex:1;flex:1;position:relative;padding:4vh 4vw;overflow:hidden}
#foot{display:flex;align-items:center;justify-content:space-between;padding:0 3vw 2.5vh;min-height:4vh}
#dots span{display:inline-block;height:.8vh;width:3vw;border-radius:99px;background:#27272a;margin-right:.8vw}
#dots span.on{background:#edcc36}
#off{font-size:1.2vw;color:#fcd34d}
.fade{height:100%}
.center{display:flex;height:100%;align-items:center;justify-content:center;text-align:center}
.wait{font-size:2.5vw;color:#71717a}
.title{font-size:3.2vw;font-weight:900;margin-bottom:4vh}
.title .ic{color:#edcc36;margin-right:1.2vw}
.now{display:flex;height:100%;align-items:center}
.now .l{width:50%;padding-right:4vw}
.now .r{width:50%;border:1px solid #27272a;background:#09090b;border-radius:2vw;padding:3vw}
.big{font-size:16vw;font-weight:900;line-height:1;color:#edcc36}
.lbl{font-size:2.4vw;font-weight:700;color:#d4d4d8}
.sub{font-size:2.2vw;color:#a1a1aa}
.cap{font-size:1.8vw;font-weight:700;letter-spacing:.15em;text-transform:uppercase;color:#71717a}
.cl{list-style:none}
.cl li{display:flex;align-items:center;border-bottom:1px solid #18181b;padding-bottom:2vh;margin-bottom:2.2vh}
.cl .h{width:14vw;flex-shrink:0;font-size:4vw;font-weight:900}
.cl .bar{height:5vh;width:.6vw;border-radius:99px;margin-right:2.5vw}
.cl .n{-webkit-box-flex:1;flex:1;min-width:0}
.cl .n b{display:block;font-size:3vw;font-weight:900;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cl .n span{display:block;font-size:1.8vw;color:#a1a1aa;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cl .f{font-size:2vw;font-weight:700;text-align:right;padding-left:2vw}
.ok{color:#6ee7b7}.full{color:#fca5a5}
.rk{list-style:none;display:grid;grid-template-columns:1fr 1fr;grid-template-rows:repeat(5,auto);grid-auto-flow:column;grid-column-gap:5vw;grid-row-gap:2vh}
.rk li{display:flex;align-items:center;font-size:2.6vw}
.rk .p{width:4.5vw;height:4.5vw;line-height:4.5vw;border-radius:50%;text-align:center;font-weight:900;background:#18181b;color:#d4d4d8;margin-right:1.5vw;flex-shrink:0}
.rk .p1{background:#edcc36;color:#000}.rk .p2{background:#e4e4e7;color:#000}
.rk .nm{-webkit-box-flex:1;flex:1;min-width:0;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.rk .d{color:#a1a1aa;padding-left:1vw}
.emoji{font-size:7vw;line-height:1}
#ad{position:fixed;top:0;left:0;right:0;bottom:0;z-index:10;background:#000}
#ad img,#ad video{width:100%;height:100%;object-fit:cover;display:block}
#adtx{position:absolute;left:0;right:0;padding:6vh 5vw;text-align:left}
#adtx.bottom{bottom:0;background:linear-gradient(to top,rgba(0,0,0,.85),rgba(0,0,0,0))}
#adtx.top{top:0;background:linear-gradient(to bottom,rgba(0,0,0,.85),rgba(0,0,0,0))}
#adtx.center{top:50%;-webkit-transform:translateY(-50%);transform:translateY(-50%);background:rgba(0,0,0,.45);text-align:center}
#adtx .bd{display:inline-block;background:#edcc36;color:#000;font-weight:900;font-size:1.8vw;padding:.6vh 1.2vw;border-radius:99px;text-transform:uppercase;letter-spacing:.1em;margin-bottom:2vh}
#adtx .tt{font-size:5.5vw;font-weight:900;line-height:1.05}
#fs{position:fixed;left:50%;bottom:2vh;-webkit-transform:translateX(-50%);transform:translateX(-50%);z-index:20;background:#edcc36;color:#000;font-weight:900;font-size:1.6vw;padding:1vh 2vw;border-radius:99px}
#board{position:fixed;top:0;left:0;right:0;bottom:0;z-index:15;background:#000;display:flex;flex-direction:column}
#bhead{display:flex;align-items:center;justify-content:space-between;border-bottom:.5vh solid #edcc36;padding:2vh 3vw}
#btitle{font-size:3.6vw;font-weight:900;text-transform:uppercase;line-height:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#btrainer{font-size:1.6vw;color:#a1a1aa;margin-top:.8vh}
#btime{text-align:right;flex-shrink:0;padding-left:3vw}
#btime .ck{font-family:monospace;font-size:6vw;font-weight:900;line-height:1}
#btime .lb{font-size:1.5vw;font-weight:700;letter-spacing:.15em;text-transform:uppercase;color:#d4d4d8}
#bprog{height:.8vh;background:#18181b}
#bbar{height:100%;width:0;background:#34d399}
#bbody{-webkit-box-flex:1;flex:1;display:flex;padding:3vw;min-height:0}
#btext{-webkit-box-flex:1;flex:1;min-width:0;overflow:hidden;white-space:pre-line;font-weight:700;line-height:1.3}
#bmedia{flex:1.15;min-width:0;position:relative;background:#09090b;border-radius:1vw;overflow:hidden;margin-left:2vw}
#bmedia img,#bmedia video{width:100%;height:100%;object-fit:contain;display:block}
#bcap{position:absolute;left:0;right:0;padding:0 2vw;display:flex}
#bcap.bottom{bottom:4vh}#bcap.top{top:2vh}#bcap.center{top:50%;-webkit-transform:translateY(-50%);transform:translateY(-50%);justify-content:center;text-align:center}
#bcap p{max-width:100%;white-space:pre-line;border-radius:.8vw;padding:1vh 1.5vw;font-weight:900;line-height:1.15}
#bonly{-webkit-box-flex:1;flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center}
#bonly .lb{font-size:6vw;font-weight:900;letter-spacing:.1em;text-transform:uppercase}
#bonly .ck{font-family:monospace;font-size:24vw;font-weight:900;line-height:1}
#bonly .rd{font-size:3.5vw;font-weight:700;color:#d4d4d8;margin-top:2vh}
.t-work{color:#34d399}.t-rest{color:#ef4444}.t-done{color:#edcc36}.t-idle{color:#fff}
#adtx .st{font-size:2.4vw;color:#e4e4e7;margin-top:1.5vh}
</style>
</head>
<body>
<div id="pair" class="hide"><div>
  <p class="t">Vincular esta TV</p>
  <p id="code">··· ···</p>
  <p class="h">En el panel entrá a <b>Pantallas</b> y escribí este código en <b>“TV de la sala”</b>.</p>
  <p id="pairmsg" class="hide">Sin conexión. Reintentando…</p>
</div></div>
<div id="screen" class="hide">
  <div id="head"><p id="gym">Evolution Fitness</p><div><p id="clock">--:--</p><p id="date"></p></div></div>
  <div id="content"><div class="center wait">Cargando…</div></div>
  <div id="foot"><div id="dots"></div><p id="off" class="hide"></p></div>
</div>
<div id="board" class="hide"></div>
<p id="fs" class="hide">Apretá OK en el control para pantalla completa y sonido</p>
<div id="ad" class="hide"><div id="admedia" style="width:100%;height:100%"></div><div id="adtx" class="hide"></div></div>
<script>
(function () {
  var SLUG = '__SLUG__';
  var KEY = 'tv:' + SLUG;
  var TZ = 'America/Argentina/Buenos_Aires';
  var offset = 0; // diferencia entre la hora del servidor y la de la tele
  var token = null, feed = null, ads = [], index = 0, updatedAt = null, rotating = false;
  var LEVEL = { quiet: 'Tranquilo', normal: 'Movimiento normal', full: 'Muy lleno', closed: 'Cerrado' };

  function $(id) { return document.getElementById(id); }
  function show(el, on) { if (on) el.className = el.className.replace(/\\bhide\\b/g, ''); else if (!/\\bhide\\b/.test(el.className)) el.className += ' hide'; }
  function load() { try { return window.localStorage.getItem(KEY); } catch (e) { return null; } }
  function save(v) { try { if (v) window.localStorage.setItem(KEY, v); else window.localStorage.removeItem(KEY); } catch (e) {} }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function color(c) { return /^#[0-9a-fA-F]{3,8}$/.test(c || '') ? c : '#edcc36'; }
  function req(method, url, body, cb) {
    var x = new XMLHttpRequest();
    x.open(method, url, true);
    if (body) x.setRequestHeader('Content-Type', 'application/json');
    x.timeout = 20000;
    var done = false;
    function end(st, j) { if (done) return; done = true; cb(st, j); }
    x.onload = function () { var j = null; try { j = JSON.parse(x.responseText); } catch (e) {} end(x.status, j); };
    x.onerror = function () { end(0, null); };
    x.ontimeout = function () { end(0, null); };
    x.send(body ? JSON.stringify(body) : null);
  }
  function fmt(d, o) {
    o.timeZone = TZ;
    try { return new Intl.DateTimeFormat('es-AR', o).format(d); }
    catch (e) { delete o.timeZone; return new Intl.DateTimeFormat('es-AR', o).format(d); }
  }
  function hm(d) { return fmt(d, { hour: '2-digit', minute: '2-digit', hour12: false }); }

  /* ---------- Vincular con código ---------- */
  function startPair() {
    show($('screen'), false); show($('ad'), false); show($('pair'), true);
    var nonce = null;
    function tick() {
      req('POST', '/' + SLUG + '/tv/pair', nonce ? { nonce: nonce } : {}, function (st, r) {
        if (token) return;
        if (!r) { show($('pairmsg'), true); }
        else if (!nonce) {
          if (r.status === 'ok' && r.code && r.nonce) {
            nonce = r.nonce;
            $('code').textContent = r.code.slice(0, 3) + ' ' + r.code.slice(3);
            show($('pairmsg'), false);
          } else show($('pairmsg'), true);
        } else {
          if (r.status === 'ok' && r.token) { save(r.token); token = r.token; startScreen(); return; }
          if (r.status === 'expired') nonce = null;
        }
        setTimeout(tick, 3000);
      });
    }
    tick();
  }

  /* ---------- Pantalla ---------- */
  function startScreen() {
    show($('pair'), false); show($('screen'), true);
    clock(); setInterval(clock, 5000);
    fetchFeed();
    loadAds(); setInterval(loadAds, 5 * 60000);
    fullscreenSetup();
    pollLive();
  }
  function nowD() { return new Date(Date.now() + offset); }
  function clock() {
    var n = nowD();
    $('clock').textContent = hm(n);
    $('date').textContent = fmt(n, { weekday: 'long', day: 'numeric', month: 'long' });
  }
  function fetchFeed() {
    var sent = Date.now();
    req('POST', '/' + SLUG + '/tv/feed', { k: token }, function (st, j) {
      if (j && j.server_time) {
        var srv = new Date(j.server_time).getTime();
        if (!isNaN(srv)) { offset = srv - (sent + Date.now()) / 2; clock(); }
      }
      if (st === 401) { save(null); token = null; feed = null; window.location.reload(); return; }
      if (st === 200 && j && j.status === 'ok') {
        feed = j; updatedAt = nowD();
        if (j.timezone) TZ = j.timezone;
        if (j.gym) $('gym').textContent = j.gym;
        show($('off'), false);
        setTimeout(fetchFeed, isOpen() ? 60000 : 5 * 60000); // cerrado: los datos generales cada 5 min
      } else {
        if (feed) { $('off').textContent = 'Sin conexión · datos de las ' + (updatedAt ? hm(updatedAt) : '--:--'); show($('off'), true); }
        else $('content').innerHTML = '<div class="center wait">Sin conexión. Reintentando…</div>';
        setTimeout(fetchFeed, 15000);
      }
      if (feed && !rotating) { rotating = true; next(); }
    });
  }
  function loadAds() {
    req('GET', '/api/access/turnstile/slides?org=' + encodeURIComponent(SLUG), null, function (st, j) {
      if (st !== 200 || !j || !j.slides) return;
      var mine = [];
      for (var i = 0; i < j.slides.length; i++) {
        var s = j.slides[i];
        if (s && typeof s.url === 'string' && (s.orientation || 'both') !== 'vertical') { mine.push(s); if (s.type !== 'video') new Image().src = s.url; }
      }
      ads = mine;
    });
  }
  function upcoming() {
    var now = nowD(), out = [], c = (feed && feed.classes) || [];
    for (var i = 0; i < c.length; i++) if (new Date(c[i].ends_at) > now) out.push(c[i]);
    return out;
  }
  function slideList() {
    if (!feed) return [];
    var l = ['now'];
    if (upcoming().length) l.push('classes');
    if (feed.ranking_enabled && feed.ranking && feed.ranking.length) l.push('ranking');
    if (feed.birthdays && feed.birthdays.length) l.push('birthdays');
    if (feed.message) l.push('message');
    if (!ads.length) return l;
    var m = [], a = 0;
    for (var i = 0; i < l.length; i++) { m.push(l[i]); m.push('ad:' + (a % ads.length)); a++; }
    while (a < ads.length) m.push('ad:' + (a++));
    return m;
  }
  function next() {
    var list = slideList();
    if (!list.length) { setTimeout(next, 2000); return; }
    var i = index % list.length, s = list[i];
    index = i + 1;
    var ad = s.indexOf('ad:') === 0 ? ads[Number(s.slice(3))] : null;
    if (live) { nextTimer = setTimeout(next, 5000); return; } // pizarra en la TV: nada abajo
    if (ad) renderAd(ad); else { stopAdVideo(); show($('ad'), false); renderSlide(s); }
    var dots = '';
    if (list.length > 1) for (var k = 0; k < list.length; k++) dots += '<span' + (k === i ? ' class="on"' : '') + '></span>';
    $('dots').innerHTML = dots;
    var wait = ad ? (ad.type === 'video' ? 120000 : ad.title || ad.subtitle ? 8000 : 6000) : 15000;
    nextTimer = setTimeout(next, wait);
  }
  var nextTimer = null;
  function skip() { clearTimeout(nextTimer); next(); }
  function stopAdVideo() {
    var v = $('admedia').firstChild;
    if (v && v.tagName === 'VIDEO') { v.onended = null; v.onerror = null; try { v.pause(); } catch (e) {} v.removeAttribute('src'); try { v.load(); } catch (e) {} }
    $('admedia').innerHTML = '';
  }
  function renderAd(ad) {
    stopAdVideo();
    var box = $('admedia');
    if (ad.type === 'video') {
      box.innerHTML = '<video autoplay muted playsinline></video>';
      var v = box.firstChild;
      v.onended = skip; v.onerror = skip;
      v.src = ad.url;
      try { var pr = v.play(); if (pr && pr.catch) pr.catch(function () {}); } catch (e) {}
    } else {
      box.innerHTML = '<img alt="">';
      box.firstChild.src = ad.url;
    }
    var tx = $('adtx'), h = '';
    if (ad.badge) h += '<span class="bd">' + esc(ad.badge) + '</span>';
    if (ad.title) h += '<p class="tt">' + esc(ad.title) + '</p>';
    if (ad.subtitle) h += '<p class="st">' + esc(ad.subtitle) + '</p>';
    var pos = ad.position === 'top' || ad.position === 'center' ? ad.position : 'bottom';
    tx.innerHTML = '<div class="fade">' + h + '</div>';
    tx.className = h ? pos : pos + ' hide';
    show($('ad'), true);
  }
  function renderSlide(s) {
    var h = '';
    if (s === 'now') {
      var n = feed.occupancy || 0, nx = upcoming()[0];
      var lv = feed.occupancy_level ? (LEVEL[feed.occupancy_level] || '') : (n === 1 ? 'persona en el gimnasio' : 'personas en el gimnasio');
      h = '<div class="now"><div class="l"><p class="lbl"><span class="y">●</span> Entrenando ahora</p><p class="big">' + n + '</p><p class="sub">' + esc(lv) + '</p></div><div class="r">';
      if (nx) h += '<p class="cap">Próxima clase</p><p style="font-size:6vw;font-weight:900;line-height:1;margin-top:1vh">' + hm(new Date(nx.starts_at)) +
        '</p><p style="font-size:3.2vw;font-weight:900;margin-top:1.5vh;color:' + color(nx.color) + '">' + esc(nx.name) +
        '</p><p style="font-size:2vw" class="mut">' + esc(nx.instructor) + ' · ' + esc(nx.room) + '</p>';
      else h += '<p style="font-size:2.6vw;font-weight:700" class="mut">No quedan clases por hoy. ¡A darle a la sala!</p>';
      h += '</div></div>';
    } else if (s === 'classes') {
      var c = upcoming().slice(0, 5);
      h = '<p class="title"><span class="ic">◷</span>Clases de hoy</p><ul class="cl">';
      for (var i = 0; i < c.length; i++) {
        var free = Math.max((c[i].capacity || 0) - (c[i].booked || 0), 0);
        h += '<li><span class="h">' + hm(new Date(c[i].starts_at)) + '</span><span class="bar" style="background:' + color(c[i].color) + '"></span>' +
          '<span class="n"><b>' + esc(c[i].name) + '</b><span>' + esc(c[i].instructor) + ' · ' + esc(c[i].room) + '</span></span>' +
          '<span class="f ' + (free === 0 ? 'full">Completa' : 'ok">' + free + (free === 1 ? ' lugar' : ' lugares')) + '</span></li>';
      }
      h += '</ul>';
    } else if (s === 'ranking') {
      var r = feed.ranking.slice(0, 10);
      h = '<p class="title"><span class="ic">🏆</span>Los más constantes de ' + esc(fmt(nowD(), { month: 'long' })) + '</p><ol class="rk">';
      for (var j = 0; j < r.length; j++) {
        h += '<li><span class="p' + (j === 0 ? ' p1' : j < 3 ? ' p2' : '') + '">' + (j + 1) + '</span><span class="nm">' + esc(r[j].name) +
          '</span><span class="d">' + r[j].days + (r[j].days === 1 ? ' día' : ' días') + '</span></li>';
      }
      h += '</ol>';
    } else if (s === 'birthdays') {
      h = '<div class="center"><div><p class="emoji">🎂</p><p style="font-size:5vw;font-weight:900;margin-top:2vh">¡Feliz cumpleaños!</p>' +
        '<p style="font-size:3.4vw;font-weight:700;margin-top:2vh;color:#f5e38a">' + esc(feed.birthdays.slice(0, 8).join(' · ')) + '</p></div></div>';
    } else if (s === 'message') {
      var t = feed.message || '';
      h = '<div class="center"><div style="max-width:80vw"><p class="emoji">📢</p><p style="font-weight:900;line-height:1.15;margin-top:3vh;font-size:' +
        (t.length > 120 ? '3.4vw' : '4.6vw') + '">' + esc(t) + '</p></div></div>';
    }
    $('content').innerHTML = '<div class="fade">' + h + '</div>';
  }

  /* ---------- Pizarra del profe en vivo (cronómetro / temporizador) ---------- */
  var live = null, liveContent = '', liveState = '', mediaI = 0, mediaTimer = null, tickTimer = null;
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function hms(t) { var h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), x = t % 60; return h ? h + ':' + pad(m) + ':' + pad(x) : pad(m) + ':' + pad(x); }
  function mmss(ms) { return hms(Math.max(0, Math.ceil(ms / 1000))); }
  function elapsed(st) {
    if (!st) return 0;
    var base = Number(st.elapsed_ms) || 0;
    if (!st.running || !st.started_at) return base;
    return base + Math.max(0, Date.now() + offset - new Date(st.started_at).getTime());
  }
  function tview(t, e, run) {
    if (t.mode === 'stopwatch') {
      return { clock: hms(Math.max(0, Math.floor(e / 1000))), label: run ? null : e ? 'PAUSA' : null, tone: run ? 'work' : 'idle', round: null, progress: 0, left: -1, phase: 'sw' };
    }
    if (t.mode === 'countdown') {
      var left = t.total_s * 1000 - e;
      if (left <= 0) return { clock: '00:00', label: '¡TIEMPO!', tone: 'done', round: null, progress: 1, left: 0, phase: 'done' };
      return { clock: mmss(left), label: run ? null : e ? 'PAUSA' : null, tone: run ? 'work' : 'idle', round: null, progress: e / (t.total_s * 1000),
        left: Math.ceil(left / 1000), phase: 'cd' };
    }
    var cycle = (t.work_s + t.rest_s) * 1000, idx = Math.floor(e / cycle);
    var done = { clock: '00:00', label: '¡TERMINADO!', tone: 'done', round: t.rounds + ' de ' + t.rounds + ' rondas', progress: 1, left: 0, phase: 'done' };
    if (idx >= t.rounds) return done;
    var within = e - idx * cycle, working = within < t.work_s * 1000;
    if (!working && idx === t.rounds - 1) return done;
    var phase = working ? t.work_s * 1000 : t.rest_s * 1000, inP = working ? within : within - t.work_s * 1000;
    var idle = !run && e === 0;
    return { clock: mmss(phase - inP), label: idle ? 'LISTOS' : working ? 'TRABAJO' : 'DESCANSO', tone: idle ? 'idle' : working ? 'work' : 'rest',
      round: 'Ronda ' + (idx + 1) + ' de ' + t.rounds, progress: inP / phase,
      left: Math.ceil((phase - inP) / 1000), phase: (working ? 'work' : 'rest') + idx };
  }
  /* Sonido (Web Audio: no hace falta ningún archivo) */
  var actx = null, lastPhase = null, lastLeft = null, lastBoardId = null;
  function audioUnlock() {
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      if (!actx) actx = new AC();
      if (actx.state === 'suspended' && actx.resume) actx.resume();
    } catch (e) {}
    // La música no pudo arrancar sola: con este toque ya puede
    if (mBlocked) { mBlocked = false; if (mPlaying && mAudio && mAudio.paused) mPlay(); fsUpd(); }
  }
  function beep(freq, ms, times) {
    if (!actx || actx.state !== 'running') return;
    // La música queda baja el doble de lo que dura el pitido (así no sube y baja entre el 3, 2, 1)
    duck(((times || 1) * (ms + 120) + 500) * 2);
    for (var n = 0; n < (times || 1); n++) {
      try {
        var t0 = actx.currentTime + n * (ms / 1000 + 0.12);
        var o = actx.createOscillator(), g = actx.createGain();
        o.type = 'square'; o.frequency.value = freq;
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(0.5, t0 + 0.01);
        g.gain.setValueAtTime(0.5, t0 + ms / 1000 - 0.03);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + ms / 1000);
        o.connect(g); g.connect(actx.destination);
        o.start(t0); o.stop(t0 + ms / 1000 + 0.02);
      } catch (e) {}
    }
  }
  function sound(b, v, running) {
    if (b.timer.sound === false) { lastBoardId = b.id; lastPhase = running || v.phase === 'done' ? v.phase : 'paused'; lastLeft = v.left; return; }
    var beepS = typeof b.timer.beep_s === 'number' ? b.timer.beep_s : 3;
    var first = lastBoardId !== b.id;
    lastBoardId = b.id;
    var phase = running || v.phase === 'done' ? v.phase : 'paused';
    if (!first && phase !== lastPhase) {
      if (phase === 'done') beep(1320, 450, 3);
      else if (phase.indexOf('work') === 0 || phase === 'cd' || phase === 'sw') beep(1320, 500, 1);
      else if (phase.indexOf('rest') === 0) beep(660, 600, 1);
    } else if (!first && running && v.left > 0 && v.left <= beepS && v.left !== lastLeft) {
      beep(880, 150, 1);
    }
    lastPhase = phase; lastLeft = v.left;
  }

  /*
   * Cada cuánto pregunta la TV, según el horario del gimnasio (Configuración → Web) y las clases
   * de hoy que cargaron los profes (para no gastar consultas al servidor sin necesidad):
   *   durante una clase (10 min antes a 10 min después), pizarra en la TV, música sonando
   *   o un cambio hace menos de 2 min → 1,5 s
   *   gimnasio abierto sin clase → 6 s (el primer "Reproducir" puede tardar hasta 6 s)
   *   gimnasio cerrado → 60 s
   */
  var lastSig = null, fastUntil = 0;
  var WD = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
  function localNow() {
    // Día de la semana (1 = lunes) y hora "HH:MM" en el horario del gimnasio
    try {
      var parts = new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(nowD());
      var o = {};
      for (var i = 0; i < parts.length; i++) o[parts[i].type] = parts[i].value;
      var h = Number(o.hour) % 24;
      return { wd: WD[o.weekday] || 0, hm: (h < 10 ? '0' : '') + h + ':' + o.minute };
    } catch (e) { return null; }
  }
  function isOpen() {
    var hours = feed && feed.opening_hours;
    if (!hours || !hours.length) return !(feed && feed.occupancy_level === 'closed');
    var n = localNow();
    if (!n) return true;
    for (var i = 0; i < hours.length; i++) {
      var d = hours[i];
      if (Number(d.weekday) === n.wd && n.hm >= String(d.open).slice(0, 5) && n.hm < String(d.close).slice(0, 5)) return true;
    }
    return false;
  }
  function inClass() {
    var c = (feed && feed.classes) || [], t = nowD().getTime(), M10 = 10 * 60000;
    for (var i = 0; i < c.length; i++) {
      var a = new Date(c[i].starts_at).getTime(), b = new Date(c[i].ends_at).getTime();
      if (t >= a - M10 && t <= b + M10) return true;
    }
    return false;
  }
  function pollDelay() {
    if (live || mPlaying || Date.now() < fastUntil || inClass()) return 1500;
    return isOpen() ? 6000 : 60000;
  }
  function pollLive() {
    var sent = Date.now();
    // Un solo pedido cada 1,5 s: pizarra del profe + música
    req('POST', '/' + SLUG + '/tv/live', { k: token, v: mListV, now: mPlaying ? mCurId() : null }, function (st, j) {
      if (st === 200 && j && j.status === 'ok') {
        if (j.server_now) { var srv = new Date(j.server_now).getTime(); if (!isNaN(srv)) offset = srv - (sent + Date.now()) / 2; }
        var sig = JSON.stringify([j.live || null, j.music ? j.music.music : null]);
        if (lastSig !== null && sig !== lastSig) fastUntil = Date.now() + 120000; // algo cambió: 2 minutos rápido
        lastSig = sig;
        setLive(j.live || null);
        if (j.music && j.music.status === 'ok') musicData(j.music);
      }
      setTimeout(pollLive, pollDelay());
    });
  }
  function setLive(b) {
    var content = b ? JSON.stringify([b.id, b.title, b.body, b.trainer, b.media, b.timer]) : '';
    var state = b ? JSON.stringify(b.timer_state || null) : '';
    live = b;
    if (content === liveContent && state === liveState) return;
    var rebuild = content !== liveContent;
    liveContent = content; liveState = state;
    if (!b) {
      lastBoardId = null; lastPhase = null;
      clearTimeout(mediaTimer); clearInterval(tickTimer); tickTimer = null;
      $('board').innerHTML = ''; show($('board'), false); show($('screen'), true);
      return;
    }
    stopAdVideo(); show($('ad'), false);
    if (rebuild) buildBoard(b);
    tickBoard();
    if (b.timer && !tickTimer) tickTimer = setInterval(tickBoard, 500);
    if (!b.timer && tickTimer) { clearInterval(tickTimer); tickTimer = null; }
  }
  function buildBoard(b) {
    clearTimeout(mediaTimer); mediaI = 0;
    var body = (b.body || '').replace(/^\\s+|\\s+$/g, ''), media = b.media || [];
    var timerOnly = !!b.timer && !body && !media.length;
    var hasText = !!body;
    var h = '<div id="bhead"><div style="min-width:0"><p id="btitle">' + esc(b.title) + '</p>' +
      (b.trainer ? '<p id="btrainer">Profesor: ' + esc(b.trainer) + '</p>' : '') + '</div>' +
      (b.timer && !timerOnly ? '<div id="btime"><p class="ck" id="bck"></p><p class="lb" id="blb"></p></div>' : '') + '</div>';
    if (b.timer) h += '<div id="bprog"><div id="bbar"></div></div>';
    if (timerOnly) h += '<div id="bonly"><p class="lb" id="blb"></p><p class="ck" id="bck"></p><p class="rd" id="brd"></p></div>';
    else {
      var lines = body.split('\\n').length, longT = lines > 10 || body.length > 350;
      var fs = media.length ? (longT ? '1.9vw' : '2.6vw') : (longT ? '2.4vw' : '3.4vw');
      h += '<div id="bbody">' + (hasText ? '<div id="btext" data-fs="' + fs + '" style="font-size:' + fs + '">' + esc(body) + '</div>' : '') +
        (media.length ? '<div id="bmedia"' + (hasText ? '' : ' style="margin-left:0"') + '></div>' : '') + '</div>';
    }
    $('board').innerHTML = h;
    last = {};
    show($('board'), true);
    show($('screen'), false); // la pantalla de abajo no se dibuja mientras está la pizarra
    if (media.length) showMedia();
  }
  var CAP_COLORS = { white: '#ffffff', yellow: '#edcc36', black: '#000000', red: '#ef4444', green: '#34d399', blue: '#38bdf8' };
  var CAP_BGS = { dark: 'rgba(0,0,0,0.7)', none: 'transparent', light: 'rgba(255,255,255,0.88)', yellow: '#edcc36' };
  function capStyle(m) {
    var c = CAP_COLORS[m.caption_color] || '#ffffff', bgKey = CAP_BGS[m.caption_bg] ? m.caption_bg : 'dark';
    var shadow = bgKey === 'none' ? (c === '#000000' ? '0 0 6px rgba(255,255,255,0.9)' : '0 2px 8px rgba(0,0,0,0.95)') : '';
    return { color: c, bg: CAP_BGS[bgKey], shadow: shadow };
  }
  function showMedia() {
    var b = live, box = $('bmedia');
    if (!b || !box || !b.media || !b.media.length) return;
    var m = b.media[mediaI % b.media.length], many = b.media.length > 1;
    clearTimeout(mediaTimer);

    function nextM() { mediaI++; showMedia(); }
    if (m.type === 'video') {
      box.innerHTML = '<video autoplay muted playsinline' + (many ? '' : ' loop') + '></video>';
      var v = box.firstChild;
      v.src = m.url;
      if (many) { v.onended = nextM; v.onerror = nextM; }
      try { var pr = v.play(); if (pr && pr.catch) pr.catch(function () {}); } catch (e) {}
    } else {
      box.innerHTML = '<img class="fade" alt="">';
      box.firstChild.src = m.url;
      if (many) mediaTimer = setTimeout(nextM, 10000);
    }
    // Texto de esta imagen, encima (color, fondo y posición que eligió el profe)
    if (m.caption) {
      var cap = document.createElement('div');
      cap.id = 'bcap';
      cap.className = m.caption_pos === 'top' || m.caption_pos === 'center' ? m.caption_pos : 'bottom';
      var cp = document.createElement('p');
      cp.textContent = m.caption;
      var st = capStyle(m);
      cp.style.color = st.color; cp.style.background = st.bg;
      if (st.shadow) cp.style.textShadow = st.shadow;
      cp.style.fontSize = m.caption.length > 80 ? '2.4vw' : '3.6vw';
      cap.appendChild(cp);
      box.appendChild(cap);
    }
  }
  function tickBoard() {
    var b = live;
    if (!b || !b.timer) return;
    var st = b.timer_state || { running: false, elapsed_ms: 0 };
    var v = tview(b.timer, elapsed(st), !!st.running), tone = 't-' + v.tone;
    sound(b, v, !!st.running);
    var ck = $('bck'), lb = $('blb'), rd = $('brd'), bar = $('bbar');
    var lbText = rd ? (v.label || '') : (v.label && v.round ? v.label + ' · ' + v.round : (v.label || v.round || ''));
    var w = Math.round(v.progress * 100) + '%';
    var color = v.tone === 'rest' ? '#ef4444' : v.tone === 'done' ? '#edcc36' : '#34d399';
    // Solo se toca la pantalla cuando algo cambió (la caja de la TV es lenta)
    if (ck && last.clock !== v.clock) ck.textContent = v.clock;
    if (ck && last.tone !== tone) ck.className = 'ck ' + tone;
    if (lb && last.lb !== lbText) lb.textContent = lbText;
    if (rd && last.tone !== tone) lb.className = 'lb ' + tone;
    if (rd && last.round !== v.round) rd.textContent = v.round || '';
    if (bar && last.w !== w) bar.style.width = w;
    if (bar && last.color !== color) bar.style.background = color;
    last = { clock: v.clock, tone: tone, lb: lbText, round: v.round, w: w, color: color };
  }
  var last = {};

  /* ---------- Música (Pantallas → Música; la maneja todo el equipo desde el panel) ---------- */
  var mAudio = null, mPre = null, mPreIdx = -1, mTracks = [], mListV = null, mSeq = null, mCur = -1, mVol = 0.7, mDuck = 1, duckTimer = null;
  var mPlaying = false, mShuffle = false, mBlocked = false;
  function mIndexOf(id) { for (var i = 0; i < mTracks.length; i++) if (mTracks[i].id === id) return i; return -1; }
  function mCurId() { return mCur >= 0 && mTracks[mCur] ? mTracks[mCur].id : null; }
  function mSetVol() { if (mAudio) { try { mAudio.volume = Math.max(0, Math.min(1, mVol * mDuck)); } catch (e) {} } }
  function duck(ms) {
    mDuck = 0.25; mSetVol();
    clearTimeout(duckTimer);
    duckTimer = setTimeout(function () { mDuck = 1; mSetVol(); }, ms);
  }
  // Dos reproductores: el que suena y el que ya va cargando el tema siguiente (así arranca al instante)
  function mNewAudio() {
    var a = new Audio();
    a.preload = 'auto';
    a.onended = function () { if (a === mAudio) mStep(1); };
    a.onerror = function () { if (a === mAudio && mTracks.length > 1) setTimeout(function () { if (a === mAudio) mStep(1); }, 1500); };
    return a;
  }
  function mEnsure() { if (!mAudio) mAudio = mNewAudio(); return mAudio; }
  function mNextIndex(d) {
    var n = mTracks.length, i;
    if (mShuffle && n > 1) { do { i = Math.floor(Math.random() * n); } while (i === mCur); return i; }
    return ((mCur < 0 ? (d > 0 ? -1 : 0) : mCur) + d + n) % n;
  }
  function mPreload(i) {
    if (i < 0 || i >= mTracks.length || (mPre && mPreIdx === i)) return;
    if (!mPre) mPre = mNewAudio();
    mPre.src = mTracks[i].url;
    mPreIdx = i;
    try { mPre.load(); } catch (e) {}
  }
  function mPlay() {
    var a = mEnsure();
    try {
      var pr = a.play();
      if (pr && pr.catch) pr.catch(function () { mBlocked = true; fsUpd(); });
    } catch (e) { mBlocked = true; fsUpd(); }
  }
  function mLoad(i) {
    if (i < 0 || !mTracks.length) return;
    if (mAudio && !mAudio.paused) mAudio.pause();
    if (mPre && mPreIdx === i) { var old = mAudio; mAudio = mPre; mPre = old; mPreIdx = -1; } // ya estaba cargado
    else { mEnsure(); mAudio.src = mTracks[i].url; }
    mCur = i;
    mSetVol();
    if (mPlaying) mPlay();
    if (mTracks.length > 1) mPreload(mNextIndex(1)); // el siguiente se va cargando
  }
  function mStep(d) {
    if (!mTracks.length) return;
    mLoad(d > 0 && mPreIdx >= 0 ? mPreIdx : mNextIndex(d));
  }
  function mApply(m) {
    mVol = (typeof m.volume === 'number' ? m.volume : 70) / 100;
    mShuffle = !!m.shuffle;
    mSetVol();
    var seq = Number(m.seq) || 0;
    mPlaying = !!m.playing;
    if (mSeq === null) mSeq = seq; // al abrir la página no se repite la última orden
    else if (seq !== mSeq) {
      mSeq = seq;
      if (m.cmd === 'next') mStep(1);
      else if (m.cmd === 'prev') mStep(-1);
      else if (m.cmd === 'track') { var t = mIndexOf(m.track_id); if (t >= 0) mLoad(t); }
    }
    if (!mTracks.length) { if (mAudio) mAudio.pause(); return; }
    // En pausa sin tema elegido: se deja cargado el primero, así "Reproducir" arranca al instante
    if (!mPlaying && mCur < 0) mLoad(mShuffle ? Math.floor(Math.random() * mTracks.length) : 0);
    if (mPlaying) {
      if (mCur < 0) mStep(1);
      else if (mAudio && mAudio.paused && !mBlocked) mPlay();
    } else if (mAudio && !mAudio.paused) mAudio.pause();
  }
  function musicData(j) {
    if (j.tracks) {
      var keep = mCurId();
      mTracks = j.tracks; mListV = j.list_v;
      mCur = mIndexOf(keep);
      mPreIdx = -1; // la lista cambió: la precarga se rehace
      if (keep && mCur < 0 && mAudio) { mAudio.pause(); mAudio.removeAttribute('src'); } // borraron el tema que sonaba
      else if (mCur >= 0 && mTracks.length > 1) mPreload(mNextIndex(1));
    }
    mApply(j.music || {});
  }

  /* ---------- Pantalla completa (necesita que alguien apriete OK o toque la pantalla) ---------- */
  function isFull() { return !!(document.fullscreenElement || document.webkitFullscreenElement); }
  function goFull() {
    if (isFull()) return;
    var el = document.documentElement;
    try {
      var r = el.requestFullscreen ? el.requestFullscreen() : el.webkitRequestFullscreen ? el.webkitRequestFullscreen() : null;
      if (r && r.catch) r.catch(function () {});
    } catch (e) {}
  }
  function fsUpd() {
    $('fs').textContent = mBlocked ? 'Apretá OK en el control para habilitar el sonido' : 'Apretá OK en el control para pantalla completa y sonido';
    show($('fs'), !isFull() || mBlocked);
  }
  function fullscreenSetup() {
    var upd = fsUpd;
    var evs = ['keydown', 'click', 'touchend', 'mousedown'];
    for (var i = 0; i < evs.length; i++) {
      document.addEventListener(evs[i], goFull, true);
      document.addEventListener(evs[i], audioUnlock, true);
    }
    document.addEventListener('fullscreenchange', upd);
    document.addEventListener('webkitfullscreenchange', upd);
    upd();
  }

  /* ---------- Arranque ---------- */
  // Compatibilidad con el link viejo (#k=… o ?k=…)
  var m = /[#&?]k=([0-9a-f]{48})/.exec(window.location.hash + '&' + window.location.search);
  if (m) { save(m[1]); try { window.history.replaceState(null, '', window.location.pathname); } catch (e) {} }
  token = load();
  if (token) startScreen(); else startPair();
})();
</script>
</body>
</html>
`
