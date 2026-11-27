/**
 * Pantalla de la sala en versión compatible (/<gym>/tv/lite).
 *
 * Para televisores con navegadores viejos (ej. Chrome 72 de 2019) que dejan la pantalla
 * normal en blanco. Es una sola página HTML con JavaScript simple (ES5, XMLHttpRequest, sin
 * React) que usa las mismas direcciones que la pantalla normal:
 *   POST /<gym>/tv/pair   vincular con el código de 6 números
 *   POST /<gym>/tv/feed   datos (gente, clases, ranking, cumpleaños, mensaje)
 *   GET  /api/access/turnstile/slides?org=<gym>   publicidad
 * La clave queda guardada igual que en la pantalla normal (localStorage "tv:<gym>").
 * No incluye la pizarra en vivo del profe.
 *
 * /<gym>/tv redirige acá sola cuando detecta un Chrome anterior al 111.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ org: string }> }) {
  const { org: slug } = await params
  if (!/^[a-z0-9-]{1,60}$/.test(slug)) return new Response('Not found', { status: 404 })
  return new Response(PAGE.split('__SLUG__').join(slug), {
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=300' },
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
.fade{-webkit-animation:tvfade .8s ease-out;animation:tvfade .8s ease-out;height:100%}
@-webkit-keyframes tvfade{from{opacity:0;-webkit-transform:translateY(1.5vh)}to{opacity:1;-webkit-transform:none}}
@keyframes tvfade{from{opacity:0;transform:translateY(1.5vh)}to{opacity:1;transform:none}}
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
#ad img{width:100%;height:100%;object-fit:cover;display:block}
#adtx{position:absolute;left:0;right:0;padding:6vh 5vw;text-align:left}
#adtx.bottom{bottom:0;background:linear-gradient(to top,rgba(0,0,0,.85),rgba(0,0,0,0))}
#adtx.top{top:0;background:linear-gradient(to bottom,rgba(0,0,0,.85),rgba(0,0,0,0))}
#adtx.center{top:50%;-webkit-transform:translateY(-50%);transform:translateY(-50%);background:rgba(0,0,0,.45);text-align:center}
#adtx .bd{display:inline-block;background:#edcc36;color:#000;font-weight:900;font-size:1.8vw;padding:.6vh 1.2vw;border-radius:99px;text-transform:uppercase;letter-spacing:.1em;margin-bottom:2vh}
#adtx .tt{font-size:5.5vw;font-weight:900;line-height:1.05}
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
<div id="ad" class="hide"><img id="adimg" alt=""><div id="adtx" class="hide"></div></div>
<script>
(function () {
  var SLUG = '__SLUG__';
  var KEY = 'tv:' + SLUG;
  var TZ = 'America/Argentina/Buenos_Aires';
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
    // Recarga preventiva cada 6 h (solo con internet)
    setInterval(function () { if (navigator.onLine !== false) window.location.reload(); }, 6 * 3600000);
  }
  function clock() {
    var n = new Date();
    $('clock').textContent = hm(n);
    $('date').textContent = fmt(n, { weekday: 'long', day: 'numeric', month: 'long' });
  }
  function fetchFeed() {
    req('POST', '/' + SLUG + '/tv/feed', { k: token }, function (st, j) {
      if (st === 401) { save(null); token = null; feed = null; window.location.reload(); return; }
      if (st === 200 && j && j.status === 'ok') {
        feed = j; updatedAt = new Date();
        if (j.timezone) TZ = j.timezone;
        if (j.gym) $('gym').textContent = j.gym;
        show($('off'), false);
        setTimeout(fetchFeed, 60000);
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
        if (s && typeof s.url === 'string' && (s.orientation || 'both') !== 'vertical') { mine.push(s); new Image().src = s.url; }
      }
      ads = mine;
    });
  }
  function upcoming() {
    var now = new Date(), out = [], c = (feed && feed.classes) || [];
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
    if (ad) renderAd(ad); else { show($('ad'), false); renderSlide(s); }
    var dots = '';
    if (list.length > 1) for (var k = 0; k < list.length; k++) dots += '<span' + (k === i ? ' class="on"' : '') + '></span>';
    $('dots').innerHTML = dots;
    setTimeout(next, ad ? (ad.title || ad.subtitle ? 8000 : 6000) : 15000);
  }
  function renderAd(ad) {
    $('adimg').src = ad.url;
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
      h = '<p class="title"><span class="ic">🏆</span>Los más constantes de ' + esc(fmt(new Date(), { month: 'long' })) + '</p><ol class="rk">';
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
