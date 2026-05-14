// FutureFlow — interactive, mouse-reactive WebGL + canvas scenes.
// All animations respond to cursor + scroll. No external libs.

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ============================================================
   1.  WebGL background — animated plasma reacting to mouse
   ============================================================ */
(function bgShader(){
  const canvas = document.getElementById('bg-shader');
  if(!canvas) return;
  const gl = canvas.getContext('webgl', { antialias:false, alpha:true, premultipliedAlpha:false })
          || canvas.getContext('experimental-webgl');
  if(!gl){ console.warn('[bg] WebGL unavailable, using CSS fallback'); return; }

  const vs = `
    attribute vec2 p;
    void main(){ gl_Position = vec4(p,0.0,1.0); }
  `;
  const fs = `
    precision mediump float;
    uniform vec2 u_res;
    uniform float u_t;
    uniform vec2 u_mouse;
    uniform float u_scroll;

    float hash(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
    float noise(vec2 p){
      vec2 i=floor(p), f=fract(p);
      float a=hash(i);
      float b=hash(i+vec2(1.0,0.0));
      float c=hash(i+vec2(0.0,1.0));
      float d=hash(i+vec2(1.0,1.0));
      vec2 u=f*f*(3.0-2.0*f);
      return mix(mix(a,b,u.x), mix(c,d,u.x), u.y);
    }
    float fbm(vec2 p){
      float v=0.0;
      float a=0.5;
      for(int i=0;i<5;i++){ v+=a*noise(p); p*=2.02; a*=0.5; }
      return v;
    }

    void main(){
      vec2 uv = (gl_FragCoord.xy - 0.5*u_res) / u_res.y;
      vec2 m  = (u_mouse - 0.5*u_res) / u_res.y;

      float t = u_t * 0.08;
      float scroll = u_scroll * 0.0008;

      vec2 q = uv * 1.4;
      q += 0.35 * vec2(fbm(q + t), fbm(q - t + 3.7));
      float dist = length(uv - m*0.8);
      q += (m - uv) * exp(-dist*2.0) * 0.25;
      q.y += scroll;

      float n = fbm(q*1.6 + t*0.5);
      n = pow(n, 1.4);

      vec3 c1 = vec3(0.486, 0.361, 1.000);
      vec3 c2 = vec3(0.000, 0.898, 1.000);
      vec3 c3 = vec3(1.000, 0.361, 0.949);
      vec3 col = mix(c1, c2, smoothstep(0.2, 0.8, n));
      col = mix(col, c3, smoothstep(0.6, 1.0, fbm(q*0.8 - t)));

      float vig = smoothstep(1.2, 0.2, length(uv));
      col *= vig * 0.55;

      col += exp(-dist*4.0) * vec3(0.5,0.7,1.0) * 0.25;

      col = mix(vec3(0.02,0.024,0.04), col, 0.85);
      col += (hash(gl_FragCoord.xy + u_t) - 0.5) * 0.025;

      gl_FragColor = vec4(col, 1.0);
    }
  `;

  function sh(type, src){
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if(!gl.getShaderParameter(s, gl.COMPILE_STATUS)){
      console.error('[bg] shader compile failed:', gl.getShaderInfoLog(s));
      return null;
    }
    return s;
  }
  const vsh = sh(gl.VERTEX_SHADER, vs);
  const fsh = sh(gl.FRAGMENT_SHADER, fs);
  if(!vsh || !fsh) return;
  const prog = gl.createProgram();
  gl.attachShader(prog, vsh);
  gl.attachShader(prog, fsh);
  gl.linkProgram(prog);
  if(!gl.getProgramParameter(prog, gl.LINK_STATUS)){
    console.error('[bg] program link failed:', gl.getProgramInfoLog(prog));
    return;
  }
  gl.useProgram(prog);

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, 'p');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

  const uRes    = gl.getUniformLocation(prog, 'u_res');
  const uT      = gl.getUniformLocation(prog, 'u_t');
  const uMouse  = gl.getUniformLocation(prog, 'u_mouse');
  const uScroll = gl.getUniformLocation(prog, 'u_scroll');

  let w=0,h=0,dpr=1;
  function resize(){
    dpr = Math.min(devicePixelRatio || 1, 1.6);
    w = innerWidth || 1280;
    h = innerHeight || 720;
    canvas.width  = Math.max(1, Math.floor(w * dpr));
    canvas.height = Math.max(1, Math.floor(h * dpr));
    gl.viewport(0,0,canvas.width,canvas.height);
  }
  resize();
  addEventListener('resize', resize);

  let mx = innerWidth/2, my = innerHeight/2;
  let tmx = mx, tmy = my;
  addEventListener('pointermove', e => { tmx = e.clientX; tmy = innerHeight - e.clientY; }, {passive:true});

  let scroll = 0;
  addEventListener('scroll', () => { scroll = scrollY; }, {passive:true});

  const start = performance.now();
  function frame(){
    mx += (tmx - mx) * .06;
    my += (tmy - my) * .06;
    gl.uniform2f(uRes, canvas.width, canvas.height);
    gl.uniform1f(uT, (performance.now()-start) * .001);
    gl.uniform2f(uMouse, mx*dpr, my*dpr);
    gl.uniform1f(uScroll, scroll);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    requestAnimationFrame(frame);
  }
  frame();
})();

/* ============================================================
   2.  Custom cursor
   ============================================================ */
(function cursor(){
  const c = document.querySelector('.cursor');
  if(!c) return;
  const ring = c.querySelector('.cursor-ring');
  const dot  = c.querySelector('.cursor-dot');
  let x=innerWidth/2, y=innerHeight/2, rx=x, ry=y;
  addEventListener('pointermove', e => { x=e.clientX; y=e.clientY; dot.style.transform=`translate(${x}px,${y}px) translate(-50%,-50%)`; });
  addEventListener('pointerdown', () => c.classList.add('down'));
  addEventListener('pointerup',   () => c.classList.remove('down'));
  function loop(){
    rx += (x-rx)*.18;
    ry += (y-ry)*.18;
    ring.style.transform = `translate(${rx}px,${ry}px) translate(-50%,-50%)`;
    requestAnimationFrame(loop);
  }
  loop();
  document.querySelectorAll('a, button, [data-magnetic], input').forEach(el => {
    el.addEventListener('pointerenter', () => c.classList.add('hover'));
    el.addEventListener('pointerleave', () => c.classList.remove('hover'));
  });
})();

/* ============================================================
   3.  Magnetic buttons
   ============================================================ */
(function magnetic(){
  document.querySelectorAll('[data-magnetic]').forEach(el => {
    const strength = 18;
    el.addEventListener('pointermove', e => {
      const r = el.getBoundingClientRect();
      const dx = (e.clientX - (r.left + r.width/2)) / (r.width/2);
      const dy = (e.clientY - (r.top  + r.height/2)) / (r.height/2);
      el.style.transform = `translate(${dx*strength}px,${dy*strength}px)`;
    });
    el.addEventListener('pointerleave', () => { el.style.transform = ''; });
  });
})();

/* ============================================================
   4.  Reveal-on-scroll + word split
   ============================================================ */
(function reveal(){
  const items = document.querySelectorAll('.reveal');
  if('IntersectionObserver' in window){
    const io = new IntersectionObserver(entries => {
      entries.forEach(e => { if(e.isIntersecting){ e.target.classList.add('in'); io.unobserve(e.target); } });
    }, { threshold:.08, rootMargin:'0px 0px -40px 0px' });
    items.forEach(el => io.observe(el));
  } else {
    items.forEach(el => el.classList.add('in'));
  }
  // safety net: anything still hidden after 2.5s gets revealed
  setTimeout(() => items.forEach(el => el.classList.add('in')), 2500);

  // hero title line stagger
  document.querySelectorAll('.hero-title .line').forEach((line, i) => {
    setTimeout(() => line.classList.add('in'), 200 + i*150);
  });
})();

/* ============================================================
   5.  Animated counters
   ============================================================ */
(function counters(){
  const els = document.querySelectorAll('[data-count]');
  const io = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if(!e.isIntersecting) return;
      const el = e.target;
      const target = parseFloat(el.dataset.count);
      const start = performance.now();
      const dur = 1600;
      function tick(t){
        const p = Math.min(1, (t-start)/dur);
        const eased = 1 - Math.pow(1-p, 3);
        el.textContent = Math.round(target * eased);
        if(p<1) requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);
      io.unobserve(el);
    });
  }, {threshold:.4});
  els.forEach(el => io.observe(el));
})();

/* ============================================================
   6.  3D tilt on cards (also drives radial glow via CSS vars)
   ============================================================ */
(function tilt(){
  document.querySelectorAll('[data-tilt]').forEach(card => {
    let raf=0, tx=0,ty=0, mx=50,my=50;
    card.addEventListener('pointermove', e => {
      const r = card.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width;
      const py = (e.clientY - r.top)  / r.height;
      tx = (py - .5) * -10;
      ty = (px - .5) *  10;
      mx = px*100; my = py*100;
      card.style.setProperty('--mx', mx+'%');
      card.style.setProperty('--my', my+'%');
      if(!raf) raf = requestAnimationFrame(apply);
    });
    card.addEventListener('pointerleave', () => {
      tx=0; ty=0;
      card.style.transform = '';
      if(!raf) raf = requestAnimationFrame(apply);
    });
    function apply(){
      card.style.transform = `perspective(900px) rotateX(${tx}deg) rotateY(${ty}deg)`;
      raf = 0;
    }
  });
})();

/* ============================================================
   7.  Canvas scenes for cards + cases
   ============================================================ */
function setupCanvas(canvas){
  const ctx = canvas.getContext('2d');
  let w=0,h=0,dpr=1;
  function size(){
    dpr = Math.min(devicePixelRatio||1, 2);
    const r = canvas.getBoundingClientRect();
    w = Math.max(1, r.width  || canvas.parentElement?.clientWidth  || 300);
    h = Math.max(1, r.height || canvas.parentElement?.clientHeight || 200);
    canvas.width  = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    ctx.setTransform(dpr,0,0,dpr,0,0);
  }
  size();
  if('ResizeObserver' in window) new ResizeObserver(size).observe(canvas);
  addEventListener('resize', size);
  // re-measure once layout settles
  setTimeout(size, 0);
  setTimeout(size, 300);
  return {ctx, get w(){return w}, get h(){return h}};
}

function trackPointer(el){
  const p = { x:0.5, y:0.5, tx:0.5, ty:0.5, inside:false };
  el.addEventListener('pointermove', e => {
    const r = el.getBoundingClientRect();
    p.tx = (e.clientX - r.left)/r.width;
    p.ty = (e.clientY - r.top )/r.height;
    p.inside = true;
  });
  el.addEventListener('pointerleave', () => { p.tx=.5; p.ty=.5; p.inside=false; });
  function lerp(){ p.x += (p.tx-p.x)*.08; p.y += (p.ty-p.y)*.08; requestAnimationFrame(lerp); }
  lerp();
  return p;
}

const scenes = {
  // 01 — orbiting nodes
  orbit({ctx,w,h,p,t}){
    ctx.clearRect(0,0,w,h);
    const cx = w*(.5 + (p.x-.5)*.2);
    const cy = h*(.5 + (p.y-.5)*.2);
    for(let r=40;r<Math.max(w,h);r+=32){
      ctx.beginPath(); ctx.arc(cx,cy,r,0,Math.PI*2);
      ctx.strokeStyle = `rgba(124,92,255,${.18 + .25*Math.sin(t*.001 + r*.02)})`;
      ctx.lineWidth = 1; ctx.stroke();
    }
    for(let i=0;i<14;i++){
      const ang = t*.0008 + i*(Math.PI*2/14);
      const rad = 50 + i*13;
      const x = cx + Math.cos(ang)*rad;
      const y = cy + Math.sin(ang)*rad;
      const grad = ctx.createRadialGradient(x,y,0,x,y,22);
      grad.addColorStop(0,'rgba(0,229,255,1)');
      grad.addColorStop(.4,'rgba(0,229,255,.6)');
      grad.addColorStop(1,'rgba(0,229,255,0)');
      ctx.fillStyle = grad;
      ctx.beginPath(); ctx.arc(x,y,22,0,Math.PI*2); ctx.fill();
    }
    // center glow
    const cg = ctx.createRadialGradient(cx,cy,0,cx,cy,60);
    cg.addColorStop(0,'rgba(255,92,242,.6)');
    cg.addColorStop(1,'rgba(255,92,242,0)');
    ctx.fillStyle = cg;
    ctx.beginPath(); ctx.arc(cx,cy,60,0,Math.PI*2); ctx.fill();
  },

  // 02 — sine wave field
  wave({ctx,w,h,p,t}){
    ctx.clearRect(0,0,w,h);
    const lines = 22;
    for(let i=0;i<lines;i++){
      ctx.beginPath();
      const yOff = (h/lines)*i;
      for(let x=0;x<=w;x+=4){
        const k = x/w;
        const amp = 26 + (p.x*48);
        const y = yOff + Math.sin(k*8 + t*.002 + i*.3 + p.y*4) * amp * (.5 + p.x);
        x===0 ? ctx.moveTo(x,y) : ctx.lineTo(x,y);
      }
      const a = .25 + .35 * Math.abs(Math.sin(t*.001 + i*.3));
      const hueShift = i/lines;
      ctx.strokeStyle = `rgba(${Math.round(124-hueShift*124)},${Math.round(92+hueShift*137)},${Math.round(255-hueShift*13)},${a})`;
      ctx.lineWidth = 1.4;
      ctx.stroke();
    }
  },

  // 03 — perspective grid
  grid({ctx,w,h,p,t}){
    ctx.clearRect(0,0,w,h);
    const hz = h*.45 + (p.y-.5)*40;
    ctx.strokeStyle = 'rgba(0,229,255,.8)';
    ctx.lineWidth = 1.1;
    // horizontal scrolling grid
    const speed = (t*.0006) % 1;
    for(let i=0;i<18;i++){
      const k = (i/18 + speed) % 1;
      const y = hz + Math.pow(k,2.2) * (h - hz);
      ctx.globalAlpha = .25 + k*.55;
      ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(w,y); ctx.stroke();
    }
    // vertical converging
    const vx = w*(.5 + (p.x-.5)*.25);
    ctx.strokeStyle = 'rgba(124,92,255,.6)';
    for(let i=-12;i<=12;i++){
      ctx.globalAlpha = .35;
      ctx.beginPath();
      ctx.moveTo(vx + i*28, hz);
      ctx.lineTo(vx + i*200, h);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    // sun
    const sg = ctx.createRadialGradient(vx,hz,0,vx,hz,160);
    sg.addColorStop(0,'rgba(255,92,242,.85)');
    sg.addColorStop(.5,'rgba(124,92,255,.4)');
    sg.addColorStop(1,'rgba(255,92,242,0)');
    ctx.fillStyle = sg;
    ctx.beginPath(); ctx.arc(vx,hz,160,0,Math.PI*2); ctx.fill();
  },

  // 04 — particle cloud
  particles({ctx,w,h,p,t,state}){
    if(!state.pts || state.lastW !== w){
      state.lastW = w;
      state.pts = Array.from({length:80}, () => ({
        x: Math.random()*w, y: Math.random()*h,
        vx: (Math.random()-.5)*.4, vy:(Math.random()-.5)*.4,
        r: 1.4 + Math.random()*2.5
      }));
    }
    ctx.clearRect(0,0,w,h);
    const mx = p.x*w, my = p.y*h;
    state.pts.forEach(pt => {
      const dx = mx - pt.x, dy = my - pt.y;
      const d2 = dx*dx + dy*dy;
      const f = p.inside ? Math.min(1.2, 12000/(d2+200)) : 0;
      pt.vx += dx*f*.0006; pt.vy += dy*f*.0006;
      pt.vx *= .94; pt.vy *= .94;
      pt.x += pt.vx + Math.sin(t*.001 + pt.y*.01)*.15;
      pt.y += pt.vy + Math.cos(t*.001 + pt.x*.01)*.15;
      if(pt.x<0) pt.x+=w; if(pt.x>w) pt.x-=w;
      if(pt.y<0) pt.y+=h; if(pt.y>h) pt.y-=h;
      const a = .7 + f*.3;
      ctx.fillStyle = `rgba(0,229,255,${a})`;
      ctx.shadowColor = 'rgba(0,229,255,.6)';
      ctx.shadowBlur = 8;
      ctx.beginPath(); ctx.arc(pt.x,pt.y,pt.r,0,Math.PI*2); ctx.fill();
    });
    ctx.shadowBlur = 0;
    // connecting lines
    ctx.strokeStyle = 'rgba(124,92,255,.5)';
    ctx.lineWidth = .8;
    for(let i=0;i<state.pts.length;i++){
      for(let j=i+1;j<state.pts.length;j++){
        const a=state.pts[i], b=state.pts[j];
        const d = Math.hypot(a.x-b.x, a.y-b.y);
        if(d<90){ ctx.globalAlpha = (1 - d/90)*.8; ctx.beginPath(); ctx.moveTo(a.x,a.y); ctx.lineTo(b.x,b.y); ctx.stroke(); }
      }
    }
    ctx.globalAlpha = 1;
  },

  // hero-orb : large pulsing AI sphere
  'hero-orb'({ctx,w,h,p,t}){
    ctx.clearRect(0,0,w,h);
    const cx = w*(.5 + (p.x-.5)*.2);
    const cy = h*(.5 + (p.y-.5)*.2);
    const R = Math.min(w,h)*.32;
    // outer rings
    for(let i=0;i<5;i++){
      const r = R + 18 + i*22 + Math.sin(t*.001 + i)*4;
      ctx.beginPath(); ctx.arc(cx,cy,r,0,Math.PI*2);
      ctx.strokeStyle = `rgba(0,229,255,${.18-i*.03})`;
      ctx.lineWidth = 1; ctx.stroke();
    }
    // core
    const g = ctx.createRadialGradient(cx-R*.3, cy-R*.3, 0, cx,cy,R);
    g.addColorStop(0,'rgba(255,92,242,.9)');
    g.addColorStop(.5,'rgba(124,92,255,.7)');
    g.addColorStop(1,'rgba(0,229,255,.05)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(cx,cy,R,0,Math.PI*2); ctx.fill();
    // orbiting dot
    for(let i=0;i<3;i++){
      const a = t*.0008 + i*Math.PI*2/3;
      const ox = cx + Math.cos(a)*(R+30);
      const oy = cy + Math.sin(a)*(R+30);
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(ox,oy,3,0,Math.PI*2); ctx.fill();
    }
  },

  // hero-lines : flowing data ribbons
  'hero-lines'({ctx,w,h,p,t}){
    ctx.clearRect(0,0,w,h);
    const N = 50;
    for(let i=0;i<N;i++){
      const k = i/N;
      const y0 = h*k;
      ctx.beginPath();
      for(let x=0;x<=w;x+=4){
        const u = x/w;
        const y = y0
                + Math.sin(u*4 + t*.0015 + k*8) * 30
                + Math.sin(u*9 + t*.0008) * 12 * (p.x+.2);
        x===0 ? ctx.moveTo(x,y) : ctx.lineTo(x,y);
      }
      const hue = (i*4 + t*.02) % 360;
      ctx.strokeStyle = `hsla(${200+hue%80},100%,65%,.25)`;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    // cursor highlight
    const r = 80;
    const cg = ctx.createRadialGradient(p.x*w,p.y*h,0,p.x*w,p.y*h,r);
    cg.addColorStop(0,'rgba(255,255,255,.18)');
    cg.addColorStop(1,'rgba(255,255,255,0)');
    ctx.fillStyle = cg;
    ctx.beginPath(); ctx.arc(p.x*w,p.y*h,r,0,Math.PI*2); ctx.fill();
  },

  // hero-mesh : interactive mesh that bends toward cursor
  'hero-mesh'({ctx,w,h,p,t,state}){
    if(!state.nodes){
      const cols=18, rows=12;
      state.cols=cols; state.rows=rows;
      state.nodes = [];
      for(let y=0;y<rows;y++) for(let x=0;x<cols;x++){
        state.nodes.push({ ox:x/(cols-1), oy:y/(rows-1), x:0, y:0 });
      }
    }
    ctx.clearRect(0,0,w,h);
    const mx = p.x*w, my = p.y*h;
    const cols=state.cols, rows=state.rows;
    state.nodes.forEach(n => {
      const bx = n.ox*w, by = n.oy*h;
      const dx = mx-bx, dy = my-by;
      const d  = Math.hypot(dx,dy)+.01;
      const force = Math.min(1, 9000/(d*d+200));
      const tx = bx + (dx/d)*force*40 + Math.sin(t*.0008 + n.ox*4)*4;
      const ty = by + (dy/d)*force*40 + Math.cos(t*.0008 + n.oy*4)*4;
      n.x += (tx-n.x)*.12; n.y += (ty-n.y)*.12;
    });
    ctx.strokeStyle = 'rgba(0,229,255,.35)';
    ctx.lineWidth = 1;
    // horizontal
    for(let y=0;y<rows;y++){
      ctx.beginPath();
      for(let x=0;x<cols;x++){
        const n = state.nodes[y*cols+x];
        x===0 ? ctx.moveTo(n.x,n.y) : ctx.lineTo(n.x,n.y);
      }
      ctx.stroke();
    }
    // vertical
    for(let x=0;x<cols;x++){
      ctx.beginPath();
      for(let y=0;y<rows;y++){
        const n = state.nodes[y*cols+x];
        y===0 ? ctx.moveTo(n.x,n.y) : ctx.lineTo(n.x,n.y);
      }
      ctx.stroke();
    }
    // dots
    ctx.fillStyle = 'rgba(255,255,255,.7)';
    state.nodes.forEach(n => { ctx.beginPath(); ctx.arc(n.x,n.y,1.4,0,Math.PI*2); ctx.fill(); });
  }
};

(function mountCanvases(){
  const all = document.querySelectorAll('[data-canvas]');
  // default: assume visible so first paint happens
  const visible = new WeakSet();
  all.forEach(c => visible.add(c));
  if('IntersectionObserver' in window){
    const io = new IntersectionObserver(entries => {
      entries.forEach(e => e.isIntersecting ? visible.add(e.target) : visible.delete(e.target));
    }, {threshold:0, rootMargin:'200px'});
    all.forEach(canvas => io.observe(canvas));
  }

  all.forEach(canvas => {
    const kind = canvas.dataset.canvas;
    const render = scenes[kind];
    if(!render){ console.warn('[canvas] unknown scene:', kind); return; }
    const env = setupCanvas(canvas);
    const p = trackPointer(canvas);
    const state = {};
    function loop(t){
      try{
        if(visible.has(canvas) && !reduceMotion && env.w>0 && env.h>0){
          render({ ctx:env.ctx, w:env.w, h:env.h, p, t, state });
        }
      } catch(err){ console.error('[canvas '+kind+']', err); }
      requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);
  });
})();
