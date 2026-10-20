import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const host = document.querySelector('#scene');
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(35, innerWidth / innerHeight, .1, 100);
camera.position.set(0, 0, 7.5);
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
renderer.setSize(innerWidth, innerHeight);
renderer.setClearColor(0x000000);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
host.appendChild(renderer.domElement);

// A studio light rig provides long, curved reflections against a pure black canvas.
const studio = new THREE.Scene();
studio.background = new THREE.Color('#30323a');
function softbox(w, h, color, power, position, rotation = 0) {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(power), side: THREE.DoubleSide }));
  mesh.position.set(...position); mesh.lookAt(0, 0, 0); mesh.rotateZ(rotation); studio.add(mesh);
}
softbox(.8, 7, '#ffffff', 7, [-3, 1, 3], -.35);
softbox(.35, 6, '#b9d9ff', 5, [3, 0, 2], .3);
softbox(5, .8, '#eef5ff', 6, [0, 4, 1]);
softbox(4, 5, '#a2abc9', 1.8, [1, -1, -4], .8);
softbox(3, .4, '#c6e9ed', 3, [0, -3, 2], -.4);
const pmrem = new THREE.PMREMGenerator(renderer);
const environment = pmrem.fromScene(studio, .015); scene.environment = environment.texture;
const glass = new THREE.MeshPhysicalMaterial({ color: '#cdd7e8', metalness: .16, roughness: .025, transmission: .86, thickness: 2.3, ior: 1.46, clearcoat: 1, clearcoatRoughness: .015, envMapIntensity: 1.65, attenuationColor: new THREE.Color('#8492b1'), attenuationDistance: 3.5, iridescence: .15, iridescenceIOR: 1.3, iridescenceThicknessRange: [120, 300] });
const group = new THREE.Group(); group.position.y = .32; scene.add(group);
const formation = { value: 0 };
let browserTarget = 0, formationStart = 0, formationFrom = 0, formationDuration = 1150;
let chatTarget = 0, chatAmount = 0, chatThinking = false;
addEventListener('liquid-chat', event => { chatTarget = event.detail.active ? 1 : 0; chatThinking = event.detail.busy; });
glass.onBeforeCompile = shader => {
  shader.uniforms.uFormation = formation;
  shader.vertexShader = 'uniform float uFormation;\n' + shader.vertexShader;
  shader.vertexShader = shader.vertexShader.replace('#include <morphtarget_vertex>', `#include <morphtarget_vertex>
    vec3 direction = normalize(transformed);
    float longest = max(max(abs(direction.x), abs(direction.y)), abs(direction.z));
    vec3 roundedBox = mix(direction / max(longest, 0.001), direction, 0.14) * 1.12;
    transformed = mix(transformed, roundedBox, uFormation);`);
};
addEventListener('liquid-transform', event => {
  formationFrom = formation.value; browserTarget = event.detail.browser ? 1 : 0;
  formationStart = performance.now(); formationDuration = event.detail.duration;
});
addEventListener('liquid-ripple', () => { pulse = 1; });
let orb, mixer, pulse = 0;
try {
  const gltf = await new GLTFLoader().loadAsync('./assets/liquid-orb.glb');
  gltf.scene.traverse(node => { if (node.isMesh) { node.material = glass; orb = node; } });
  group.add(gltf.scene);
  mixer = new THREE.AnimationMixer(gltf.scene);
  gltf.animations.forEach(clip => mixer.clipAction(clip).play());
  document.body.dataset.loaded = 'true';
} catch (error) {
  document.body.dataset.error = String(error);
  document.querySelector('#state').textContent = 'The Blender orb could not load. Please restart the app.';
  console.error(error);
}
const pointer = new THREE.Vector2();
addEventListener('pointermove', event => { pointer.set((event.clientX / innerWidth - .5) * 2, (event.clientY / innerHeight - .5) * 2); });
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });
document.querySelectorAll('[data-action]').forEach(button => button.addEventListener('click', () => window.desktop?.action(button.dataset.action)));
const clock = new THREE.Clock(); let elapsed = 0;
renderer.setAnimationLoop(() => {
  const delta = Math.min(clock.getDelta(), .05); elapsed += delta;
  const progress = formationDuration ? Math.min(1, (performance.now() - formationStart) / formationDuration) : 1;
  const eased = 1 - Math.pow(1 - progress, 3);
  formation.value = THREE.MathUtils.lerp(formationFrom, browserTarget, eased);
  if (browserTarget === 1 && progress >= 1) return;
  const morph = formation.value;
  chatAmount = THREE.MathUtils.lerp(chatAmount, chatTarget, 1 - Math.exp(-delta * 5));
  if (!reduced) {
    mixer?.update(delta * (1 + pulse * 2 + (chatThinking ? .8 : 0)));
    group.rotation.y = (elapsed * .12 + pointer.x * .11) * (1 - morph);
    group.rotation.z = Math.sin(elapsed * .27) * .085 * (1 - morph);
    group.rotation.x = pointer.y * .07 * (1 - morph);
  }
  group.position.y = THREE.MathUtils.lerp(THREE.MathUtils.lerp(.32, 1.55, chatAmount) + (reduced ? 0 : Math.sin(elapsed * .8) * .045), -.24, morph);
  const fit = Math.min(1, innerWidth / innerHeight * 1.35);
  const base = fit * THREE.MathUtils.lerp(1, .26, chatAmount) * (1 + (reduced ? 0 : Math.sin(pulse * Math.PI * 3) * pulse * .08));
  const visibleHeight = 2 * Math.tan(THREE.MathUtils.degToRad(17.5)) * camera.position.z;
  group.scale.set(THREE.MathUtils.lerp(base, visibleHeight * camera.aspect / 2.24 * .97, morph), THREE.MathUtils.lerp(base, visibleHeight / 2.24 * .78, morph), THREE.MathUtils.lerp(base, .06, morph));
  pulse = Math.max(0, pulse - delta * .6);
  renderer.render(scene, camera);
});
