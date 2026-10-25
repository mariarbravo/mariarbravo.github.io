// Interactive NYC skyline. Every project is a landmark; everything else is
// generated procedurally so the page ships no 3D model files.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const root = document.documentElement;
const topbar = document.querySelector('.topbar');
const onScroll = () => topbar.classList.toggle('solid', scrollY > innerHeight * 0.6);
addEventListener('scroll', onScroll, { passive: true });
onScroll();

// Landmark positions roughly follow the real Manhattan map (north is -z).
const LANDMARKS = [
  { id: 'events',     short: 'Event System',    x: -2.1, z: -3,    build: msg },
  { id: 'research',   short: 'Digital Twin AI', x: -3.95, z: -6.8, build: hudsonYards },
  { id: 'capstone',   short: 'Capstone',        x: -0.25, z: -8.4, build: oneVanderbilt },
  { id: 'nutrition',  short: 'Nutrition + AI',  x: -0.25, z: -4,    build: empireState },
  { id: 'social',     short: 'Graph Analyzer',  x: -2.1, z: 19.5,  build: oneWTC },
  { id: 'trains',     short: 'Game of Trains',  x: 1.6,  z: -8.5,  build: chrysler },
  { id: 'fpga',       short: 'FPGA Ping-Pong',  x: -0.25, z: 1.5,   build: flatiron },
  { id: 'srs',        short: 'SRS · 1st place', x: -0.25, z: -15.5, build: park432 },
  { id: 'accounting', short: 'PDF Extractor',   x: 1.6,  z: 16.5,  build: woolworth },
  { id: 'portfolio',  short: 'This site',       x: 3.45, z: -12,   build: citigroup },
];

const TOUR = [
  { text: "Hi, I'm Maria Bravo, a Software Engineering student at the University of Arizona, continuing into the accelerated master's in Electrical and Computer Engineering. Welcome to my city. Every landmark here is something I've built." },
  { id: 'events', text: "Madison Square Garden hosts New York's biggest events, so it's home to my Event Management System. It's a full-stack app built with Spring Boot, React, and PostgreSQL, with REST APIs and JWT authentication." },
  { id: 'nutrition', text: "The Empire State Building is my Nutrition Assistant. It's a Python and Streamlit app with a Pandas ETL pipeline, an OpenAI-powered agent, and a MySQL database on AWS RDS." },
  { id: 'research', text: "From the Edge at Hudson Yards, you can see what's ahead. That fits my research: AI time-series forecasting for digital twins, where I implement and evaluate Chronos-2 models in Python." },
  { id: 'capstone', text: "One Vanderbilt's glass crown plays with light, like my senior capstone: accelerated physics algorithms for optical simulation software. I turn sponsor requirements into the software plan, and I run the team's GitHub and Jira." },
  { id: 'social', text: "One World Trade Center is my Social Network Graph Analyzer, a C++ program that finds the most influential user in a network." },
  { id: 'trains', text: "The Chrysler Building is Game of Trains, a multiplayer card game written in C." },
  { id: 'fpga', text: "The Flatiron is a Ping-Pong game I designed in Verilog on an FPGA board." },
  { id: 'srs', text: "432 Park is the requirements document that won my class first place." },
  { id: 'accounting', text: "The Woolworth Building pulls clean tables out of messy accounting PDFs." },
  { id: 'portfolio', text: "And Citigroup Center is this website, with every building, window, and light generated in code." },
  { text: "I also keep the university running as an IT Analyst. Scroll down for my resume, or say hello through the contact form. Thanks for visiting!" },
];

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const isSmall = Math.min(innerWidth, innerHeight) < 700;

function hasWebGL() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch { return false; }
}

// Deterministic randomness so the city looks the same on every visit.
function mulberry32(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(1912);

const time = { value: 0 };
const GLOW = new THREE.Color(0xffb547);

// Standard material plus procedural lit windows computed from world position,
// so windows never stretch no matter how a box is scaled.
function buildingMaterial({ base = 0x161a2c, lit = 0xffc46b, density = 0.32, cell = [0.17, 0.22], seed = 0, flood = 0x000000 } = {}) {
  const mat = new THREE.MeshStandardMaterial({ color: base, roughness: 0.8, metalness: 0.15 });
  const uniforms = {
    uLit: { value: new THREE.Color(lit) },
    uDensity: { value: density },
    uCell: { value: new THREE.Vector2(...cell) },
    uSeed: { value: seed },
    uGlow: { value: 0 },
    uGlowColor: { value: GLOW },
    uFlood: { value: new THREE.Color(flood) },
    uTime: time,
  };
  mat.userData.uniforms = uniforms;
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nvarying vec3 vWNrm;')
      .replace('#include <project_vertex>', `#include <project_vertex>
        vec4 wp = vec4(transformed, 1.0);
        mat3 nm = mat3(modelMatrix);
        #ifdef USE_INSTANCING
          wp = instanceMatrix * wp;
          nm = nm * mat3(instanceMatrix);
        #endif
        wp = modelMatrix * wp;
        vWPos = wp.xyz;
        vWNrm = normalize(nm * objectNormal);`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform vec3 uLit; uniform float uDensity; uniform vec2 uCell; uniform float uSeed;
        uniform float uGlow; uniform vec3 uGlowColor; uniform vec3 uFlood; uniform float uTime;
        varying vec3 vWPos; varying vec3 vWNrm;
        float h3(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        {
          vec3 n = normalize(vWNrm);
          if (abs(n.y) < 0.6) {
            vec2 t = normalize(vec2(-n.z, n.x));
            vec2 uv = vec2(dot(vWPos.xz, t), vWPos.y) / uCell;
            vec2 id = floor(uv);
            vec2 f = fract(uv);
            float win = step(0.2, f.x) * step(f.x, 0.8) * step(0.25, f.y) * step(f.y, 0.78);
            float face = floor(dot(vWPos.xz, n.xz) * 3.0 + 0.5) + uSeed;
            float r = h3(vec3(id, face));
            float on = step(1.0 - uDensity, r);
            vec3 col = mix(uLit, vec3(0.78, 0.86, 1.0), step(0.82, h3(vec3(id.yx, face + 7.3))));
            float flick = 0.8 + 0.2 * h3(vec3(id, floor(uTime * 0.15 + r * 20.0)));
            float ground = smoothstep(0.05, 0.3, vWPos.y);
            totalEmissiveRadiance += col * win * on * flick * ground * (0.45 + r * 0.6);
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.04, 0.06, 0.12), win * (1.0 - on));
          }
          totalEmissiveRadiance += uFlood * (1.0 - smoothstep(0.0, 6.0, vWPos.y)) * 0.6;
          float scan = smoothstep(0.0, 1.0, 1.0 - abs(fract(vWPos.y * 0.25 - uTime * 0.5) - 0.5) * 2.0);
          totalEmissiveRadiance += uGlowColor * uGlow * (0.18 + 0.5 * scan);
        }`);
  };
  return mat;
}

// ---------- geometry helpers ----------
function box(mat, w, h, d, y0 = 0, x = 0, z = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y0 + h / 2, z);
  return new THREE.Mesh(g, mat);
}
function cyl(mat, rTop, rBot, h, y0, seg = 12) {
  const g = new THREE.CylinderGeometry(rTop, rBot, h, seg);
  g.translate(0, y0 + h / 2, 0);
  return new THREE.Mesh(g, mat);
}
const spireMat = new THREE.MeshStandardMaterial({ color: 0xb8bccb, metalness: 0.9, roughness: 0.3, emissive: 0x3a3f58 });
const beaconMat = new THREE.MeshBasicMaterial({ color: 0xff3344, transparent: true });
const beacons = [];
function beacon(group, y, size = 0.07) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(size, 8, 6), beaconMat);
  m.position.y = y;
  group.add(m);
  beacons.push(m);
}

// ---------- landmarks (1 unit ≈ 40 m, so heights are close to real) ----------
function empireState(mat) {
  const g = new THREE.Group();
  g.add(box(mat, 1.6, 1.4, 1.4, 0));
  g.add(box(mat, 1.35, 4.6, 1.1, 1.4));
  g.add(box(mat, 1.1, 2.0, 0.9, 6.0));
  g.add(box(mat, 0.8, 1.4, 0.68, 8.0));
  const crown = new THREE.MeshStandardMaterial({ color: 0x40303a, emissive: 0xff7a9e, emissiveIntensity: 1.1 });
  g.add(box(crown, 0.55, 0.8, 0.45, 9.4));
  g.add(cyl(crown, 0.12, 0.22, 0.7, 10.2, 8));
  g.add(cyl(spireMat, 0.02, 0.05, 1.0, 10.9, 6));
  beacon(g, 11.95);
  return { group: g, height: 12 };
}

function oneWTC(mat) {
  // Square antiprism: square base, smaller top rotated 45°, triangular faces.
  const g = new THREE.Group();
  g.add(box(mat, 1.6, 1.2, 1.6, 0));
  const h = 9.8, y0 = 1.2, rb = 0.8 * Math.SQRT2, rt = 0.62;
  const B = [], T = [];
  for (let k = 0; k < 4; k++) {
    const ab = Math.PI / 4 + (k * Math.PI) / 2;
    const at = ((k + 1) * Math.PI) / 2;
    B.push(new THREE.Vector3(Math.sin(ab) * rb, y0, Math.cos(ab) * rb));
    T.push(new THREE.Vector3(Math.sin(at) * rt, y0 + h, Math.cos(at) * rt));
  }
  const pos = [];
  const tri = (a, b, c) => pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
  for (let k = 0; k < 4; k++) {
    const k1 = (k + 1) % 4, km = (k + 3) % 4;
    tri(B[k1], B[k], T[k]);   // T[k] sits between B[k] and B[k+1]
    tri(B[k], T[km], T[k]);
  }
  tri(T[2], T[1], T[0]); tri(T[3], T[2], T[0]);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.computeVertexNormals();
  g.add(new THREE.Mesh(geo, mat));
  g.add(cyl(spireMat, 0.025, 0.06, 2.6, y0 + h, 6));
  beacon(g, y0 + h + 2.65, 0.08);
  return { group: g, height: y0 + h + 2.6 };
}

function chrysler(mat) {
  const g = new THREE.Group();
  g.add(box(mat, 1.5, 1.2, 1.5, 0));
  g.add(box(mat, 1.15, 4.6, 1.15, 1.2));
  g.add(box(mat, 0.9, 0.9, 0.9, 5.8));
  // Terraced, glowing art-deco crown.
  const ring = new THREE.MeshStandardMaterial({ color: 0xd8dbe6, metalness: 0.9, roughness: 0.25, emissive: 0xfff1d6, emissiveIntensity: 1.2 });
  let y = 6.7, r = 0.6;
  for (let i = 0; i < 5; i++) {
    g.add(cyl(spireMat, r * 0.92, r, 0.32, y, 8));
    g.add(cyl(ring, r * 0.9, r * 0.9, 0.05, y + 0.32, 8));
    y += 0.37; r *= 0.78;
  }
  g.add(cyl(spireMat, 0.01, r, 1.2, y, 8));
  beacon(g, y + 1.22, 0.05);
  return { group: g, height: y + 1.2 };
}

function flatiron(mat) {
  const s = new THREE.Shape();
  s.moveTo(-0.85, -0.8); s.lineTo(0.85, -0.8); s.lineTo(0.85, -0.55);
  s.lineTo(-0.62, 1.25); s.lineTo(-0.85, 1.25); s.closePath();
  const geo = new THREE.ExtrudeGeometry(s, { depth: 2.4, bevelEnabled: false });
  geo.rotateX(-Math.PI / 2);
  const g = new THREE.Group();
  g.add(new THREE.Mesh(geo, mat));
  const cornice = new THREE.ExtrudeGeometry(s, { depth: 0.08, bevelEnabled: false });
  cornice.rotateX(-Math.PI / 2);
  cornice.scale(1.06, 1, 1.06);
  cornice.translate(0, 2.4, 0);
  g.add(new THREE.Mesh(cornice, mat));
  return { group: g, height: 2.5 };
}

function park432(mat) {
  const g = new THREE.Group();
  g.add(box(mat, 0.75, 10.6, 0.75, 0));
  // Open mechanical floors read as dark bands across the facade.
  const band = new THREE.MeshBasicMaterial({ color: 0x05060c });
  for (let y = 1.8; y < 10.5; y += 1.8) g.add(box(band, 0.77, 0.12, 0.77, y));
  beacon(g, 10.7, 0.06);
  return { group: g, height: 10.6 };
}

function woolworth(mat) {
  const g = new THREE.Group();
  g.add(box(mat, 1.7, 2.8, 1.2, 0));
  g.add(box(mat, 0.95, 1.8, 0.95, 2.8));
  g.add(box(mat, 0.75, 0.6, 0.75, 4.6));
  const copper = new THREE.MeshStandardMaterial({ color: 0x3f7f6e, roughness: 0.6, emissive: 0x18493d });
  const roof = new THREE.ConeGeometry(0.58, 1.0, 4);
  roof.rotateY(Math.PI / 4);
  roof.translate(0, 5.7, 0);
  g.add(new THREE.Mesh(roof, copper));
  g.add(cyl(spireMat, 0.01, 0.05, 0.5, 6.15, 6));
  return { group: g, height: 6.6 };
}

function citigroup(mat) {
  const g = new THREE.Group();
  const w = 1.3, lift = 1.0, h = 5.5;
  for (const [x, z] of [[0, w / 2 - 0.12], [0, -w / 2 + 0.12], [w / 2 - 0.12, 0], [-w / 2 + 0.12, 0]]) {
    g.add(box(spireMat, 0.24, lift, 0.24, 0, x, z));
  }
  g.add(box(mat, w, h, w, lift));
  // The famous 45° roof, lit white at night.
  const s = new THREE.Shape();
  s.moveTo(-w / 2, 0); s.lineTo(w / 2, 0); s.lineTo(w / 2, w); s.closePath();
  const geo = new THREE.ExtrudeGeometry(s, { depth: w, bevelEnabled: false });
  geo.rotateY(Math.PI / 2);
  geo.translate(-w / 2, lift + h, 0);
  const roofMat = new THREE.MeshStandardMaterial({ color: 0xdfe4f2, emissive: 0xbfd0ff, emissiveIntensity: 0.55, side: THREE.DoubleSide });
  g.add(new THREE.Mesh(geo, roofMat));
  return { group: g, height: lift + h + w };
}

function msg(mat) {
  const g = new THREE.Group();
  g.add(cyl(mat, 0.85, 0.85, 0.75, 0, 28));
  const led = new THREE.MeshStandardMaterial({ color: 0x2a1030, emissive: 0xff5c8a, emissiveIntensity: 1.3 });
  g.add(cyl(led, 0.87, 0.87, 0.1, 0.62, 28));
  g.add(cyl(spireMat, 0.6, 0.86, 0.14, 0.75, 28));
  return { group: g, height: 0.9 };
}

function hudsonYards(mat) {
  const g = new THREE.Group();
  g.add(box(mat, 1.15, 7.6, 1.0, 0));
  g.add(box(mat, 0.95, 1.0, 0.85, 7.6));
  // The Edge: a triangular deck cantilevered out over the Hudson.
  const s = new THREE.Shape();
  s.moveTo(0, -0.45); s.lineTo(0, 0.45); s.lineTo(-1.0, 0); s.closePath();
  const deck = new THREE.ExtrudeGeometry(s, { depth: 0.08, bevelEnabled: false });
  deck.rotateX(-Math.PI / 2);
  deck.translate(-0.55, 7.3, 0);
  g.add(new THREE.Mesh(deck, new THREE.MeshStandardMaterial({ color: 0x9fd8ff, emissive: 0x7fc8ff, emissiveIntensity: 1.4 })));
  g.add(cyl(spireMat, 0.02, 0.04, 0.6, 8.6, 6));
  beacon(g, 9.25, 0.06);
  return { group: g, height: 9.2 };
}

function oneVanderbilt(mat) {
  const g = new THREE.Group();
  g.add(box(mat, 1.4, 3.6, 1.2, 0));
  g.add(box(mat, 1.2, 2.6, 1.0, 3.6));
  g.add(box(mat, 1.0, 2.2, 0.82, 6.2));
  g.add(box(mat, 0.75, 1.2, 0.62, 8.4));
  // Glass crown
  const crown = new THREE.ConeGeometry(0.48, 1.1, 4);
  crown.rotateY(Math.PI / 4);
  crown.translate(0, 10.15, 0);
  g.add(new THREE.Mesh(crown, new THREE.MeshStandardMaterial({ color: 0xbfe6ff, emissive: 0x9ad4ff, emissiveIntensity: 1.1, metalness: 0.6, roughness: 0.2 })));
  g.add(cyl(spireMat, 0.01, 0.03, 0.8, 10.6, 6));
  beacon(g, 11.45, 0.05);
  return { group: g, height: 11.4 };
}

// ---------- the city ----------
function islandHalfWidth(z) {
  if (z < -44 || z > 28) return 0;
  if (z > 18) return 5.2 * Math.sqrt((28 - z) / 10);
  if (z < -40) return 5.2 * Math.sqrt((z + 44) / 4);
  return 5.2;
}
// Avenues run in the gaps between the 1.85-wide block columns.
const AVENUE0 = -3.03;
const inPark = (x, z) => z > -33 && z < -19 && Math.abs(x) < 2.1;

function init() {
  const container = document.getElementById('city');
  const hero = document.querySelector('.hero');
  const renderer = new THREE.WebGLRenderer({ antialias: !isSmall, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, isSmall ? 1.5 : 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  container.appendChild(renderer.domElement);
  renderer.domElement.style.touchAction = 'pan-y'; // keep vertical page scrolling on phones

  const scene = new THREE.Scene();
  const HORIZON = new THREE.Color(0x2b1d47);
  scene.fog = new THREE.Fog(HORIZON, 40, 150);
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 600);

  // Sky gradient + stars + moon
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(300, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { top: { value: new THREE.Color(0x050714) }, mid: { value: new THREE.Color(0x141838) }, bottom: { value: HORIZON } },
      vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform vec3 top; uniform vec3 mid; uniform vec3 bottom; varying vec3 vP;
        void main(){ float h = vP.y; vec3 c = mix(bottom, mid, smoothstep(-0.02, 0.18, h)); c = mix(c, top, smoothstep(0.18, 0.7, h)); gl_FragColor = vec4(c,1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    })
  );
  scene.add(sky);

  const starPos = [];
  for (let i = 0; i < 900; i++) {
    const th = rand() * Math.PI * 2, y = 0.08 + rand() * 0.92, r = Math.sqrt(1 - y * y);
    starPos.push(Math.cos(th) * r * 280, y * 280, Math.sin(th) * r * 280);
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3));
  scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xcfd6ff, size: 1.4, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.8 })));

  const dot = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const x = c.getContext('2d'), gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,.6)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  })();
  const moon = new THREE.Sprite(new THREE.SpriteMaterial({ map: dot, color: 0xfff3dc, fog: false, depthWrite: false }));
  moon.position.set(-90, 70, -200); moon.scale.setScalar(26);
  scene.add(moon);

  scene.add(new THREE.HemisphereLight(0x6070b0, 0x140e1c, 0.7));
  const moonLight = new THREE.DirectionalLight(0xa9b8ff, 1.1);
  moonLight.position.copy(moon.position);
  scene.add(moonLight);

  // Water and land
  const water = new THREE.Mesh(new THREE.PlaneGeometry(800, 800), new THREE.MeshStandardMaterial({ color: 0x080a18, roughness: 0.85, metalness: 0.1 }));
  water.rotation.x = -Math.PI / 2; water.position.y = -0.3;
  scene.add(water);

  const landMat = new THREE.MeshStandardMaterial({ color: 0x12141f, roughness: 1 });
  const shape = new THREE.Shape();
  shape.moveTo(-islandHalfWidth(-44), 44);
  for (let z = -44; z <= 28; z += 0.5) shape.lineTo(-islandHalfWidth(z), -z);
  for (let z = 28; z >= -44; z -= 0.5) shape.lineTo(islandHalfWidth(z), -z);
  const island = new THREE.Mesh(new THREE.ShapeGeometry(shape), landMat);
  island.rotation.x = -Math.PI / 2;
  scene.add(island);
  for (const [x0, x1, z0, z1] of [[9, 120, -120, 34], [-120, -10, -120, 26]]) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), landMat);
    m.rotation.x = -Math.PI / 2; m.position.set((x0 + x1) / 2, 0, (z0 + z1) / 2);
    scene.add(m);
  }
  const park = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 14), new THREE.MeshStandardMaterial({ color: 0x0f2418, roughness: 1 }));
  park.rotation.x = -Math.PI / 2; park.position.set(0, 0.01, -26);
  scene.add(park);

  // Filler buildings: one instanced mesh for the whole city.
  const blocks = [];
  const nearLandmark = (x, z) => LANDMARKS.some((l) => Math.hypot(l.x - x, l.z - z) < 1.55);
  const manhattanH = (x, z) => {
    const mid = Math.exp(-((z + 8) ** 2) / 70 - (x * x) / 40);
    const down = Math.exp(-((z - 19) ** 2) / 16 - (x * x) / 20);
    return 0.5 + rand() * 1.1 + (mid * 5.2 + down * 5.0) * (0.35 + rand() * 0.8);
  };
  for (let z = -43; z < 27.5; z += 1.15) {
    const hw = islandHalfWidth(z);
    for (let x = -hw + 0.5; x < hw - 0.4; x += 1.85) {
      const n = rand() < 0.5 ? 1 : 2;
      for (let i = 0; i < n; i++) {
        const fw = (1.5 / n) * (0.7 + rand() * 0.28), fd = 0.6 + rand() * 0.3;
        const bx = x + (n === 2 ? (i - 0.5) * 0.75 : 0) + 0.75, bz = z + 0.45;
        if (Math.abs(bx) + fw / 2 > islandHalfWidth(bz) - 0.15 || inPark(bx, bz) || nearLandmark(bx, bz)) continue;
        blocks.push([bx, bz, fw, fd, manhattanH(bx, bz)]);
      }
    }
  }
  const boroughSkip = isSmall ? 0.6 : 0.3;
  const borough = (x0, x1, z0, z1, cx, cz) => {
    for (let z = z0; z < z1; z += 1.3) for (let x = x0; x < x1; x += 1.6) {
      if (rand() < boroughSkip) continue;
      const cluster = Math.exp(-((x - cx) ** 2 + (z - cz) ** 2) / 18);
      const dist = Math.hypot(x, z) / 60;
      blocks.push([x + 0.7, z + 0.5, 0.9 + rand() * 0.5, 0.7 + rand() * 0.4, (0.3 + rand() * 1.1 + cluster * 3.5 * rand()) * (1 - Math.min(dist, 0.6))]);
    }
  };
  borough(9.4, 30, -40, 33, 11.5, 20);   // Brooklyn + Queens
  borough(-28, -11, -40, 25, -12.5, 17); // New Jersey

  const fillerMat = buildingMaterial({ density: 0.24, seed: 3 });
  const unit = new THREE.BoxGeometry(1, 1, 1); unit.translate(0, 0.5, 0);
  const filler = new THREE.InstancedMesh(unit, fillerMat, blocks.length);
  const m4 = new THREE.Matrix4(), col = new THREE.Color();
  blocks.forEach(([x, z, w, d, h], i) => {
    m4.makeScale(w, h, d).setPosition(x, 0, z);
    filler.setMatrixAt(i, m4);
    filler.setColorAt(i, col.setHSL(0.64 + rand() * 0.06, 0.15, 0.5 + rand() * 0.35));
  });
  scene.add(filler);

  // Street lights and moving traffic along the avenues.
  const lampPos = [];
  for (let x = AVENUE0; x <= 4.6; x += 1.85) for (let z = -42; z < 27; z += 0.45) {
    if (Math.abs(x) < islandHalfWidth(z) - 0.2 && !inPark(x, z)) lampPos.push(x, 0.05, z);
  }
  const lampGeo = new THREE.BufferGeometry();
  lampGeo.setAttribute('position', new THREE.Float32BufferAttribute(lampPos, 3));
  scene.add(new THREE.Points(lampGeo, new THREE.PointsMaterial({ map: dot, color: 0xffa94d, size: 0.22, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })));

  const carCount = isSmall ? 220 : 480;
  const carStart = [], carData = [];
  for (let i = 0; i < carCount; i++) {
    const lane = Math.floor(rand() * 5), dir = rand() < 0.5 ? 1 : -1;
    carStart.push(AVENUE0 + lane * 1.85 + dir * 0.08, 0.06, 0);
    carData.push(rand() * 70, dir * (0.8 + rand() * 1.4), dir);
  }
  const carGeo = new THREE.BufferGeometry();
  carGeo.setAttribute('position', new THREE.Float32BufferAttribute(carStart, 3));
  carGeo.setAttribute('aData', new THREE.Float32BufferAttribute(carData, 3));
  const cars = new THREE.Points(carGeo, new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: time, uMap: { value: dot } },
    vertexShader: `attribute vec3 aData; uniform float uTime; varying vec3 vC; varying float vA;
      void main(){
        vec3 p = position;
        p.z = -43.0 + mod(aData.x + uTime * aData.y, 70.0);
        float hw = p.z > 18.0 ? 5.2 * sqrt(max(28.0 - p.z, 0.0) / 10.0) : 5.2;
        vA = step(abs(p.x), hw - 0.3) * (1.0 - step(-33.0, p.z) * step(p.z, -19.0) * step(abs(p.x), 2.1));
        vC = aData.z > 0.0 ? vec3(1.0, 0.22, 0.18) : vec3(1.0, 0.95, 0.85);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = 16.0 / -mv.z * ${(renderer.getPixelRatio() * 10).toFixed(1)};
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `uniform sampler2D uMap; varying vec3 vC; varying float vA;
      void main(){ vec4 t = texture2D(uMap, gl_PointCoord); gl_FragColor = vec4(vC * 1.6, t.a * vA);
        #include <colorspace_fragment>
      }`,
  }));
  cars.frustumCulled = false;
  scene.add(cars);

  // Brooklyn Bridge
  const bridge = new THREE.Group();
  const stone = new THREE.MeshStandardMaterial({ color: 0x6b6068, roughness: 0.9, emissive: 0x2a1f22 });
  bridge.add(box(stone, 0.25, 1.9, 0.55, 0, 6.0, 0), box(stone, 0.25, 1.9, 0.55, 0, 8.4, 0));
  bridge.add(box(spireMat, 5.6, 0.06, 0.34, 0.55, 7.2, 0));
  const cableMat = new THREE.LineBasicMaterial({ color: 0xffd7a1 });
  const bulbs = [];
  for (const zz of [-0.17, 0.17]) {
    const path = new THREE.CurvePath();
    path.add(new THREE.QuadraticBezierCurve3(new THREE.Vector3(4.4, 0.6, zz), new THREE.Vector3(5.6, 0.9, zz), new THREE.Vector3(6.0, 1.9, zz)));
    path.add(new THREE.QuadraticBezierCurve3(new THREE.Vector3(6.0, 1.9, zz), new THREE.Vector3(7.2, 0.2, zz), new THREE.Vector3(8.4, 1.9, zz)));
    path.add(new THREE.QuadraticBezierCurve3(new THREE.Vector3(8.4, 1.9, zz), new THREE.Vector3(8.8, 0.9, zz), new THREE.Vector3(10.0, 0.6, zz)));
    const pts = path.getSpacedPoints(60);
    bridge.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), cableMat));
    pts.forEach((p, i) => i % 3 === 0 && bulbs.push(p.x, p.y, p.z));
  }
  const bulbGeo = new THREE.BufferGeometry();
  bulbGeo.setAttribute('position', new THREE.Float32BufferAttribute(bulbs, 3));
  bridge.add(new THREE.Points(bulbGeo, new THREE.PointsMaterial({ map: dot, color: 0xfff0c8, size: 0.25, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })));
  bridge.position.set(-0.2, 0, 17);
  scene.add(bridge);

  // Statue of Liberty out in the harbor
  const liberty = new THREE.Group();
  const verdigris = new THREE.MeshStandardMaterial({ color: 0x5fa38f, emissive: 0x1f4a40, roughness: 0.7 });
  liberty.add(box(stone, 0.7, 0.5, 0.7, 0), cyl(verdigris, 0.1, 0.16, 0.75, 0.5, 8), cyl(verdigris, 0.03, 0.03, 0.3, 1.2, 6));
  liberty.children[2].position.x = 0.1;
  const torch = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffd27a }));
  torch.position.set(0.1, 1.55, 0);
  liberty.add(torch);
  liberty.position.set(-8.5, 0, 33);
  scene.add(liberty);

  // Project landmarks + labels
  const labelsEl = document.getElementById('labels');
  const cards = Object.fromEntries([...document.querySelectorAll('.card')].map((c) => [c.dataset.id, c]));
  const pickables = [filler];
  LANDMARKS.forEach((l, i) => {
    const mat = buildingMaterial({ base: 0x232741, density: 0.42, seed: 11 + i * 5, flood: 0x6a4a2a });
    const { group, height } = l.build(mat);
    group.position.set(l.x, 0, l.z);
    group.traverse((o) => { o.userData.landmark = l; });
    scene.add(group);
    pickables.push(group);
    Object.assign(l, { mat, height, group, glow: 0, top: new THREE.Vector3(l.x, height + 0.5, l.z) });

    const card = cards[l.id];
    const btn = document.createElement('button');
    btn.className = 'label';
    btn.textContent = l.short;
    btn.setAttribute('aria-label', `Open project: ${card?.querySelector('h3').textContent} (${card?.dataset.landmark})`);
    btn.addEventListener('click', () => select(l));
    btn.addEventListener('mouseenter', () => { hovered = l; });
    btn.addEventListener('mouseleave', () => { if (hovered === l) hovered = null; });
    labelsEl.appendChild(btn);
    l.label = btn;
  });

  // Bloom makes the windows glow; skipped on small devices for performance.
  let composer = null;
  if (!isSmall) {
    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    composer.addPass(new UnrealBloomPass(new THREE.Vector2(256, 256), 0.55, 0.4, 0.7));
    composer.addPass(new OutputPass());
  }

  // ---------- camera orbit (custom so the page can still scroll on touch) ----------
  const view = { target: new THREE.Vector3(0, 3.2, 2), radius: 42, theta: -0.3, phi: 1.2, shiftX: 0, shiftY: 0 };
  let overview = { ...view, target: view.target.clone() };
  let tween = null, selected = null, hovered = null, lastInteract = 0;

  function overviewState() {
    const portrait = camera.aspect < 1;
    return { target: new THREE.Vector3(0, portrait ? 4.5 : 3.2, portrait ? -2 : 2), radius: portrait ? 52 : 42, theta: view.theta, phi: portrait ? 1.28 : 1.2, shiftX: 0, shiftY: portrait ? 0.14 : 0 };
  }
  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
  function flyTo(to, ms = 1400) {
    if (reduceMotion) ms = 0;
    const from = { ...view, target: view.target.clone() };
    // take the short way round
    const dTheta = Math.atan2(Math.sin(to.theta - from.theta), Math.cos(to.theta - from.theta));
    tween = { from, to: { ...to, theta: from.theta + dTheta }, t0: performance.now(), ms };
  }
  function stepTween(now) {
    if (!tween) return;
    const k = tween.ms ? Math.min(1, (now - tween.t0) / tween.ms) : 1, e = ease(k);
    const { from, to } = tween;
    view.target.lerpVectors(from.target, to.target, e);
    for (const key of ['radius', 'theta', 'phi', 'shiftX', 'shiftY']) view[key] = from[key] + (to[key] - from[key]) * e;
    if (k >= 1) tween = null;
  }

  const panel = document.getElementById('panel');
  const panelBody = document.getElementById('panel-body');
  const hint = document.getElementById('hint');
  const heroText = document.querySelector('.hero-text');
  if (matchMedia('(pointer: coarse)').matches) hint.textContent = 'Swipe sideways to look around · tap a building';
  let textBox = null;
  function select(l) {
    if (tour) endTour(false);
    selected = l;
    lastInteract = performance.now();
    const card = cards[l.id];
    panelBody.innerHTML = '';
    const img = card.querySelector('img, .card-art').cloneNode(true);
    img.loading = 'eager';
    const body = card.querySelector('.card-body').cloneNode(true);
    body.querySelector('.skyline-link')?.remove();
    const lm = document.createElement('p');
    lm.className = 'landmark'; lm.textContent = card.dataset.landmark;
    body.prepend(lm);
    panelBody.append(img, body);
    panel.hidden = false;
    hint.hidden = true;
    LANDMARKS.forEach((o) => o.label.classList.toggle('active', o === l));
    const narrow = innerWidth <= 640;
    flyTo({ ...framing(l, view.theta), shiftX: narrow ? 0 : 0.16, shiftY: narrow ? 0.24 : 0 });
  }
  // Camera framing for a landmark; short buildings get viewed from higher up
  // so the towers around them don't block the view.
  function framing(l, theta) {
    const low = l.height < 4;
    return { target: new THREE.Vector3(l.x, low ? 0.6 : l.height * 0.5, l.z), radius: low ? 13 : l.height * 1.3 + 7, theta, phi: low ? 0.85 : 1.3 };
  }
  function deselect() {
    if (!selected) return;
    selected = null;
    panel.hidden = true;
    LANDMARKS.forEach((o) => o.label.classList.remove('active'));
    flyTo(overviewState());
  }
  document.getElementById('panel-close').addEventListener('click', deselect);
  addEventListener('keydown', (e) => { if (e.key === 'Escape') { if (tour) endTour(); else deselect(); } });

  // ---------- guided tour ----------
  const tourBar = document.getElementById('tour-bar');
  const tourCaption = document.getElementById('tour-caption');
  const tourStep = document.getElementById('tour-step');
  let tour = null;

  function playStop(i, fly = true) {
    if (!tour) return;
    if (i >= TOUR.length) { endTour(); return; }
    tour.i = i;
    clearTimeout(tour.timer);
    const stop = TOUR[i];
    const l = stop.id && LANDMARKS.find((o) => o.id === stop.id);
    tourCaption.textContent = stop.text;
    tourStep.textContent = `${i + 1} / ${TOUR.length}`;
    selected = l || null;
    LANDMARKS.forEach((o) => o.label.classList.toggle('active', o === l));
    if (fly) {
      const narrow = innerWidth <= 640;
      if (l) flyTo({ ...framing(l, view.theta + 0.35), shiftX: 0, shiftY: narrow ? 0.16 : 0.08 }, 2000);
      else flyTo({ ...overviewState(), theta: view.theta + 0.4 }, 2400);
    }
    // Give visitors time to read the caption, then move on.
    const words = stop.text.split(/\s+/).length;
    tour.timer = setTimeout(() => playStop(i + 1), Math.max(5000, words * 330));
  }
  function startTour() {
    if (selected) { selected = null; panel.hidden = true; }
    tour = { i: 0, timer: 0 };
    hero.classList.add('touring');
    tourBar.hidden = false;
    hint.hidden = true;
    playStop(0);
  }
  function endTour(fly = true) {
    if (!tour) return;
    clearTimeout(tour.timer);
    tour = null;
    tourBar.hidden = true;
    hero.classList.remove('touring');
    selected = null;
    LANDMARKS.forEach((o) => o.label.classList.remove('active'));
    if (fly) flyTo(overviewState());
  }
  const tourBtn = document.createElement('button');
  tourBtn.type = 'button';
  tourBtn.className = 'btn btn-ghost btn-tour';
  tourBtn.textContent = 'Take the guided tour';
  tourBtn.addEventListener('click', startTour);
  document.getElementById('hero-actions').prepend(tourBtn);
  document.getElementById('tour-next').addEventListener('click', () => tour && playStop(tour.i + 1));
  document.getElementById('tour-stop').addEventListener('click', () => endTour());

  // "See it on the skyline" buttons on the quick-view cards
  LANDMARKS.forEach((l) => {
    const card = cards[l.id];
    let links = card.querySelector('.card-links');
    if (!links) { links = document.createElement('div'); links.className = 'card-links'; card.querySelector('.card-body').append(links); }
    const b = document.createElement('button');
    b.className = 'skyline-link'; b.type = 'button'; b.textContent = 'See it on the skyline ↑';
    b.addEventListener('click', () => { scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' }); select(l); });
    links.prepend(b);
  });

  // Pointer: drag to orbit (horizontal only on touch), tap/click to pick.
  const canvas = renderer.domElement;
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  let drag = null, velTheta = 0, velPhi = 0;
  function landmarkAt(e) {
    const r = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObjects(pickables, true)[0];
    return hit?.object.userData.landmark || null;
  }
  canvas.addEventListener('pointerdown', (e) => {
    drag = { x: e.clientX, y: e.clientY, moved: 0, touch: e.pointerType !== 'mouse' };
    tween = null;
    lastInteract = performance.now();
    if (tour) endTour(false);
  });
  addEventListener('pointermove', (e) => {
    if (drag) {
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      drag.x = e.clientX; drag.y = e.clientY; drag.moved += Math.abs(dx) + Math.abs(dy);
      velTheta = -dx * 0.005;
      velPhi = drag.touch ? 0 : -dy * 0.004;
      view.theta += velTheta; view.phi += velPhi;
      lastInteract = performance.now();
    } else if (e.pointerType === 'mouse' && e.target === canvas) {
      hovered = landmarkAt(e);
      canvas.style.cursor = hovered ? 'pointer' : '';
    } else if (e.pointerType === 'mouse' && !e.target.closest?.('.label')) {
      hovered = null;
    }
  });
  addEventListener('pointerup', (e) => {
    if (drag && drag.moved < 8 && e.target === canvas) {
      const l = landmarkAt(e);
      if (l) select(l); else if (selected) deselect();
    }
    drag = null;
  });
  addEventListener('pointercancel', () => { drag = null; });

  // ---------- render loop ----------
  function resize() {
    const w = container.clientWidth, h = container.clientHeight;
    renderer.setSize(w, h, false);
    composer?.setSize(w, h);
    camera.aspect = w / h;
    camera.fov = camera.aspect < 1 ? 52 : 40;
    camera.updateProjectionMatrix();
    overview = overviewState();
    const hr = hero.getBoundingClientRect(), tr = heroText.getBoundingClientRect();
    textBox = { left: tr.left - hr.left - 12, right: tr.right - hr.left + 12, top: tr.top - hr.top - 8, bottom: tr.bottom - hr.top };
  }
  addEventListener('resize', () => { resize(); if (!selected && !tween) flyTo(overviewState(), 0); });
  resize();

  let visible = true;
  new IntersectionObserver(([en]) => { visible = en.isIntersecting; if (!visible && tour) endTour(false); }).observe(hero);

  // Intro: drift in from high above the harbor.
  Object.assign(view, overview, { target: overview.target.clone(), radius: overview.radius * 1.7, phi: 0.85, theta: overview.theta - 0.6 });
  flyTo(overview, 3200);

  const tmp = new THREE.Vector3();
  let last = performance.now();
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (!visible) return;
    time.value += dt;

    stepTween(now);
    if (!drag && !tween) {
      view.theta += velTheta * 0.5; view.phi += velPhi * 0.5;
      velTheta *= 0.88; velPhi *= 0.88;
      if (!selected && !hovered && !reduceMotion && now - lastInteract > 6000) view.theta += dt * 0.035;
    }
    view.phi = THREE.MathUtils.clamp(view.phi, 0.55, 1.45);

    const s = Math.sin(view.phi);
    camera.position.set(
      view.target.x + view.radius * s * Math.sin(view.theta),
      view.target.y + view.radius * Math.cos(view.phi),
      view.target.z + view.radius * s * Math.cos(view.theta)
    );
    camera.position.y = Math.max(camera.position.y, 0.6);
    camera.lookAt(view.target);
    const w = container.clientWidth, h = container.clientHeight;
    if (view.shiftX || view.shiftY) camera.setViewOffset(w, h, w * view.shiftX, h * view.shiftY, w, h);
    else camera.clearViewOffset();

    const blink = Math.sin(time.value * 3) > 0.2 ? 1 : 0.15;
    beaconMat.opacity = blink;
    torch.scale.setScalar(1 + Math.sin(time.value * 9) * 0.12);

    const shown = [];
    for (const l of LANDMARKS) {
      const goal = l === selected ? 1 : l === hovered ? 0.7 : 0;
      l.glow += (goal - l.glow) * Math.min(1, dt * 6);
      l.mat.userData.uniforms.uGlow.value = l.glow;
      tmp.copy(l.top).project(camera);
      const x = ((tmp.x + 1) / 2) * w, y = ((1 - tmp.y) / 2) * h;
      const underText = !selected && !tour && x > textBox.left && x < textBox.right && y > textBox.top && y < textBox.bottom;
      const off = tmp.z > 1 || Math.abs(tmp.x) > 1.1 || Math.abs(tmp.y) > 1.1 || underText;
      l.label.classList.toggle('hidden', off || (!!selected && selected !== l));
      if (!off) shown.push({ l, x, y });
    }
    // Nudge overlapping labels upward so they stay readable.
    shown.sort((a, b) => b.y - a.y);
    shown.forEach((p, i) => {
      p.w = p.l.labelW ||= p.l.label.offsetWidth;
      for (let j = 0; j < i; j++) {
        const q = shown[j];
        if (Math.abs(p.x - q.x) < (p.w + q.w) / 2 + 4 && Math.abs(p.y - q.y) < 28) p.y = q.y - 28;
      }
      const x = Math.min(Math.max(p.x, p.w / 2 + 8), w - p.w / 2 - 8); // keep labels on screen
      p.l.label.style.transform = `translate(${x}px, ${p.y}px) translate(-50%, -100%)`;
    });

    if (composer) composer.render(); else renderer.render(scene, camera);
  }
  requestAnimationFrame(frame);
  root.classList.remove('no-webgl');
}

if (hasWebGL()) {
  try { init(); } catch (err) { console.error(err); root.classList.add('no-webgl'); }
}
