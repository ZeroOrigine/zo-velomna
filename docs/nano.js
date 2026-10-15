// VELOMNA Nano renderer: one fragment shader, one draw call, runs on any phone browser.
// Geometry comes from the night's scene genome; palette from its emotion. No images, no assets.
(function () {
  var canvas = document.getElementById('nano');
  var gl = canvas && (canvas.getContext('webgl', { antialias: false, alpha: false, powerPreference: 'high-performance' }) || canvas.getContext('experimental-webgl'));
  var api = { set: function () {}, ok: false };
  window.nano = api;
  if (!gl) return;

  var FS = [
    'precision highp float;',
    'uniform vec2 uRes;uniform float uTime,uSteps,uDisc,uCamR,uCamEl,uFocal,uOut,uHole;uniform vec3 uC1,uC2,uC3;',
    'float hash(vec3 p){p=fract(p*.3183099+.1);p*=17.;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}',
    'float noise(vec3 x){vec3 i=floor(x),f=fract(x);f=f*f*(3.-2.*f);',
    'return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),',
    'mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);}',
    'float fbm(vec3 p){float a=.5,s=0.;for(int i=0;i<4;i++){s+=a*noise(p);p=p*2.03+1.7;a*=.5;}return s;}',
    'vec3 sky(vec3 d){',
    ' float n=fbm(d*2.6+vec3(0.,uTime*.006,0.));float m=fbm(d*6.5-3.1);',
    ' vec3 c=uC1+uC2*pow(n,2.6)*1.8+uC3*pow(m,4.5)*1.5;',
    ' vec3 q=d*140.;float h=hash(floor(q));float st=smoothstep(.992,1.,h);vec3 fp=fract(q)-.5;',
    ' c+=st*exp(-dot(fp,fp)*28.)*vec3(1.,.95,.85)*1.6;return c;}',
    'vec3 disc(vec3 p,vec3 v){',
    ' float r=length(p);float a=atan(p.z,p.x);',
    ' float t=fbm(vec3(r*1.4,a*2.5+uTime*.25/(r*.35),.5));',
    ' float ring=smoothstep(2.4,3.6,r)*smoothstep(12.,6.,r);',
    ' vec3 tn=normalize(vec3(-p.z,0.,p.x));float dop=1.-.55*dot(tn,v);',
    ' float I=ring*(.35+t*1.3)*dop*(3./(r*.55+.6));',
    ' vec3 c=mix(vec3(1.,.86,.62),vec3(1.,.42,.22),smoothstep(3.,11.,r));return c*I;}',
    'void main(){',
    ' vec2 uv=(gl_FragCoord.xy*2.-uRes)/min(uRes.x,uRes.y);',
    ' float ang=uTime*.04;',
    ' vec3 cam=vec3(uCamR*cos(ang)*cos(uCamEl),uCamR*sin(uCamEl),uCamR*sin(ang)*cos(uCamEl));',
    ' vec3 tg=mix(vec3(0.),cam*2.,uOut);',
    ' vec3 fw=normalize(tg-cam);vec3 rt=normalize(cross(fw,vec3(0.,1.,0.)));vec3 up=cross(rt,fw);',
    ' vec3 v=normalize(fw*uFocal+uv.x*rt+uv.y*up);vec3 p=cam;',
    ' vec3 col=vec3(0.);',
    ' if(uHole<.5){ vec3 d=normalize(vec3(uv.x,uv.y*.8+.15,1.6)); d.xz=mat2(cos(ang*.3),-sin(ang*.3),sin(ang*.3),cos(ang*.3))*d.xz; col=sky(d)*.9; }',
    ' else {',
    ' vec3 hv=cross(p,v);float h2=dot(hv,hv);float T=1.;float esc=1.;',
    ' for(int i=0;i<320;i++){',
    '  if(float(i)>=uSteps)break;',
    '  float r2=dot(p,p);float r=sqrt(r2);',
    '  if(r<1.){esc=0.;break;}',
    '  if(r>24.&&dot(p,v)>0.)break;',
    '  float dt=clamp(.1*(r-.9),.012,.6);',
    '  vec3 acc=-1.5*h2*p/(r2*r2*r);',
    '  vec3 np=p+v*dt+.5*acc*dt*dt;v+=acc*dt;',
    '  if(uDisc>.5&&p.y*np.y<0.){float t=p.y/(p.y-np.y);vec3 hp=mix(p,np,t);float hr=length(hp);',
    '   if(hr>2.4&&hr<12.){col+=T*disc(hp,normalize(v));T*=.55;}}',
    '  p=np;}',
    ' col+=esc*T*sky(normalize(v)); }',
    ' col=col/(1.+col);col=pow(col,vec3(.92));',
    ' float w=.5+.5*sin(uTime*.07);col=mix(col,col.gbr*.9+col*.1,.07*w);',
    ' float vg=smoothstep(1.9,.4,length(uv));col*=.35+.65*vg;',
    ' col+=(hash(vec3(gl_FragCoord.xy,fract(uTime)))-.5)*.025;',
    ' gl_FragColor=vec4(col,1.);}'
  ].join('\n');
  var VS = 'attribute vec2 a;void main(){gl_Position=vec4(a,0.,1.);}';
  function sh(t, s) { var o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(o)); return o; }
  var prog;
  try { prog = gl.createProgram(); gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(prog); if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog)); }
  catch (e) { return; }
  gl.useProgram(prog);
  var buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  var a = gl.getAttribLocation(prog, 'a'); gl.enableVertexAttribArray(a); gl.vertexAttribPointer(a, 2, gl.FLOAT, false, 0, 0);
  var U = {}; ['uRes', 'uTime', 'uSteps', 'uDisc', 'uCamR', 'uCamEl', 'uFocal', 'uOut', 'uHole', 'uC1', 'uC2', 'uC3'].forEach(function (n) { U[n] = gl.getUniformLocation(prog, n); });

  var PAL = {
    awe:     [[.03, .02, .07], [.48, .22, .62], [.12, .55, .66]],
    wonder:  [[.03, .02, .07], [.48, .22, .62], [.12, .55, .66]],
    calm:    [[.02, .04, .06], [.18, .42, .50], [.30, .60, .55]],
    peace:   [[.02, .04, .06], [.18, .42, .50], [.30, .60, .55]],
    fear:    [[.05, .01, .02], [.55, .12, .10], [.30, .18, .40]],
    dread:   [[.05, .01, .02], [.55, .12, .10], [.30, .18, .40]],
    anxiety: [[.04, .02, .03], [.50, .20, .18], [.35, .30, .45]],
    grief:   [[.03, .03, .05], [.30, .32, .45], [.25, .30, .35]],
    loss:    [[.03, .03, .05], [.30, .32, .45], [.25, .30, .35]],
    longing: [[.04, .02, .05], [.52, .28, .40], [.20, .35, .55]],
    joy:     [[.05, .03, .02], [.75, .50, .20], [.60, .45, .20]],
    warmth:  [[.05, .03, .02], [.75, .50, .20], [.60, .45, .20]],
    unease:  [[.03, .03, .04], [.40, .30, .50], [.25, .40, .35]]
  };
  var GEO = {
    event_horizon_interior: { hole: 1, camR: 1.12, el: .35, disc: 1, focal: .45, out: 1 },
    lensed_sky:             { hole: 1, camR: 9, el: .95, disc: 0, focal: 1.1, out: 0 },
    wormhole_throat:        { hole: 1, camR: 6, el: .5, disc: 0, focal: .7, out: 0 },
    mars_dusk:              { hole: 0 }, deep_ocean: { hole: 0 }, inside_a_neuron: { hole: 0 },
    ordinary_room: { hole: 0 }, non_euclidean_house: { hole: 0 }, branching_street: { hole: 0 }, backward_hour: { hole: 0 }
  };
  var state = { hole: 0, camR: 13, el: .22, disc: 1, focal: 1.4, out: 0, pal: PAL.awe };
  api.set = function (o) {
    var g = GEO[o.geometry] || { hole: 0 };
    var key = String(o.emotion || 'awe').toLowerCase();
    var pal = PAL.awe; for (var k in PAL) { if (key.indexOf(k) >= 0) { pal = PAL[k]; break; } }
    state = { hole: g.hole, camR: g.camR || 13, el: g.el || .22, disc: g.disc == null ? 1 : g.disc, focal: g.focal || 1.4, out: g.out || 0, pal: pal };
    if (reduced) draw(performance.now());
  };
  api.showHole = function () { api.set({ geometry: 'lensed_sky', emotion: 'awe' }); state.camR = 13; state.el = .22; state.disc = 1; state.focal = 1.4; };
  api.ok = true;

  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var small = Math.min(screen.width, screen.height) < 700 || (navigator.hardwareConcurrency || 4) <= 4;
  var scale = small ? .5 : .75, steps = small ? 110 : 180;
  function resize() { var w = Math.floor(innerWidth * scale), h = Math.floor(innerHeight * scale); if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; gl.viewport(0, 0, w, h); } }
  addEventListener('resize', resize);
  var t0 = performance.now(), frames = 0, ft = t0, checked = false;
  function draw(now) {
    resize();
    gl.uniform2f(U.uRes, canvas.width, canvas.height);
    gl.uniform1f(U.uTime, reduced ? 30 : (now - t0) / 1000);
    gl.uniform1f(U.uSteps, steps); gl.uniform1f(U.uDisc, state.disc); gl.uniform1f(U.uCamR, state.camR);
    gl.uniform1f(U.uCamEl, state.el); gl.uniform1f(U.uFocal, state.focal); gl.uniform1f(U.uOut, state.out); gl.uniform1f(U.uHole, state.hole);
    gl.uniform3fv(U.uC1, state.pal[0]); gl.uniform3fv(U.uC2, state.pal[1]); gl.uniform3fv(U.uC3, state.pal[2]);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    frames++; if (now - ft > 1000) { var fps = Math.round(frames * 1000 / (now - ft)); frames = 0; ft = now;
      if (!checked && now - t0 > 3000) { checked = true; if (fps < 24 && scale > .34) { scale = Math.max(.34, scale * .6); steps = Math.max(80, Math.round(steps * .7)); } }
      api.fps = fps; }
  }
  function loop(now) { if (!document.hidden) draw(now); requestAnimationFrame(loop); }
  if (reduced) draw(performance.now()); else requestAnimationFrame(loop);
})();
