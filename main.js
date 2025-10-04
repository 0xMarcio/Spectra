import * as THREE from './vendor/three.module.js';
import { OrbitControls } from './vendor/OrbitControls.js';
import { STLLoader } from './vendor/STLLoader.js';
import { computeBoundsTree, disposeBoundsTree } from './vendor/three-mesh-bvh.module.js';

THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;

const container = document.getElementById('app');

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0a0a);

const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 500);
camera.position.set(-30, 15, 35);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x080808, 1);
container.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.target.set(0, 5, 0);
controls.update();

const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
scene.add(ambientLight);

const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
dirLight.position.set(-20, 30, 20);
scene.add(dirLight);

const hemiLight = new THREE.HemisphereLight(0x99ccff, 0x0a0a0a, 0.35);
scene.add(hemiLight);

const tunnelLength = 80;
const tunnelWidth = 30;
const tunnelHeight = 20;
const inletX = -tunnelLength * 0.5 + 2;
const outletX = tunnelLength * 0.5 - 2;
const halfWidth = tunnelWidth * 0.5;
const halfHeight = tunnelHeight * 0.5;

const tunnelGeometry = new THREE.BoxGeometry(tunnelLength, tunnelHeight, tunnelWidth);
const tunnelEdges = new THREE.EdgesGeometry(tunnelGeometry);
const tunnelLines = new THREE.LineSegments(
  tunnelEdges,
  new THREE.LineBasicMaterial({ color: 0x888888 })
);
scene.add(tunnelLines);

const loader = new STLLoader();
const carMaterial = new THREE.MeshStandardMaterial({ color: 0x777777, metalness: 0.1, roughness: 0.6 });
let carMesh = null;
let carGeometry = null;
let carTightBounds = null;
let carOuterBounds = null;
const carCenter = new THREE.Vector3();
const carSize = new THREE.Vector3();

loader.load(
  'car.stl',
  geometry => {
    geometry.computeVertexNormals();
    geometry.center();

    if (geometry.index) {
      geometry = geometry.toNonIndexed();
    }

    const rotateZ = new THREE.Matrix4().makeRotationZ(-Math.PI / 2);
    const rotateX = new THREE.Matrix4().makeRotationX(-Math.PI / 2);
    geometry.applyMatrix4(rotateZ);
    geometry.applyMatrix4(rotateX);
    geometry.center();
    geometry.computeBoundingBox();

    if (geometry.boundingBox) {
      geometry.boundingBox.getSize(carSize);
    } else {
      carSize.set(10, 5, 5);
    }

    const fitX = (tunnelLength * 0.45) / Math.max(carSize.x, 1e-3);
    const fitY = (tunnelHeight * 0.5) / Math.max(carSize.y, 1e-3);
    const fitZ = (tunnelWidth * 0.45) / Math.max(carSize.z, 1e-3);
    const fitScale = Math.min(fitX, fitY, fitZ);

    carGeometry = geometry;
    carMesh = new THREE.Mesh(carGeometry, carMaterial);
    carMesh.scale.setScalar(fitScale);
    carMesh.position.set(0, 0, 0);
    scene.add(carMesh);

    carMesh.updateMatrixWorld(true);
    carGeometry.computeVertexNormals();
    carGeometry.computeBoundsTree();

    carTightBounds = new THREE.Box3().setFromObject(carMesh);

    const groundLevel = -halfHeight + 1;
    const offsetY = groundLevel - carTightBounds.min.y;
    carMesh.position.y += offsetY;
    carMesh.updateMatrixWorld(true);
    carTightBounds.setFromObject(carMesh);

    carOuterBounds = carTightBounds.clone().expandByVector(new THREE.Vector3(1.5, 2, 1.8));
    carTightBounds.getCenter(carCenter);

    vortexCenters.length = 0;
    const boundsSize = carTightBounds.getSize(new THREE.Vector3());
    const frontX = carTightBounds.min.x + boundsSize.x * 0.3;
    const rearX = carTightBounds.max.x - boundsSize.x * 0.15;
    const midY = carTightBounds.min.y + boundsSize.y * 0.35;
    const topY = carTightBounds.max.y - boundsSize.y * 0.2;
    const trackZ = boundsSize.z * 0.5 * 0.7;
    vortexCenters.push(
      new THREE.Vector3(frontX, midY, carCenter.z + trackZ),
      new THREE.Vector3(frontX, midY, carCenter.z - trackZ),
      new THREE.Vector3(rearX, topY, carCenter.z + trackZ * 0.8),
      new THREE.Vector3(rearX, topY, carCenter.z - trackZ * 0.8)
    );
    rebuildCarStations();

    console.log('car.stl loaded', carTightBounds.getSize(new THREE.Vector3()));
  },
  xhr => {
    if (xhr.total > 0) {
      console.log(`Loading car: ${((xhr.loaded / xhr.total) * 100).toFixed(0)}%`);
    }
  },
  error => {
    console.error('Failed to load car.stl', error);
  }
);

const slowColor = new THREE.Color(0x1a8cff);
const fastColor = new THREE.Color(0xff4500);
const tempColor = new THREE.Color();
const tempVec = new THREE.Vector3();
const tempVec2 = new THREE.Vector3();
const localPoint = new THREE.Vector3();
const faceNormal = new THREE.Vector3();
const faceNormalLocal = new THREE.Vector3();
const tangent = new THREE.Vector3();
const repositionTarget = new THREE.Vector3();
const hitPointWorld = new THREE.Vector3();
const triA = new THREE.Vector3();
const triB = new THREE.Vector3();
const triC = new THREE.Vector3();
const normalMatrix = new THREE.Matrix3();
const bvhHit = { point: new THREE.Vector3(), distance: 0, faceIndex: -1 };
const bvhHit2 = { point: new THREE.Vector3(), distance: 0, faceIndex: -1 };
const bvhHitSide = { point: new THREE.Vector3(), distance: 0, faceIndex: -1 };
const tmpMat4 = new THREE.Matrix4();
const flowDirection = new THREE.Vector3(1, 0, 0);
const flowDirectionUnit = new THREE.Vector3(1, 0, 0);
const desiredFlow = new THREE.Vector3();
const groundNormal = new THREE.Vector3(0, 1, 0);
const swirlAxis = new THREE.Vector3(0, 1, 0);
const vortexCenters = [];
const carStations = [];
const stationScratch = new THREE.Vector3();
const colorRamp = [
  { t: 0.0, color: new THREE.Color('#0b1aff') },
  { t: 0.2, color: new THREE.Color('#00c2ff') },
  { t: 0.4, color: new THREE.Color('#00ffc8') },
  { t: 0.6, color: new THREE.Color('#f8ff4b') },
  { t: 0.8, color: new THREE.Color('#ff8c37') },
  { t: 1.0, color: new THREE.Color('#ffffff') }
];
const rampColorA = new THREE.Color();
const rampColorB = new THREE.Color();
const diffVec = new THREE.Vector3();
const swirlVec = new THREE.Vector3();
const sideDirWorld = new THREE.Vector3();
const sideNormalWorld = new THREE.Vector3();
const advectionScale = 5;

const maxParticles = 4000;
const trailPoints = 60;
const trailSegmentsPerParticle = trailPoints - 1;

const particles = new Array(maxParticles).fill(null).map(() => ({
  position: new THREE.Vector3(),
  velocity: new THREE.Vector3(),
  acceleration: new THREE.Vector3(),
  color: new THREE.Color(),
  trail: new Float32Array(trailPoints * 3),
  trailLength: 0,
  vorticity: 0,
  deflected: false,
  deflectionScore: 0,
  visible: false,
  active: false
}));

const particlePositions = new Float32Array(maxParticles * 3);
const particleColors = new Float32Array(maxParticles * 3);

const particleGeometry = new THREE.BufferGeometry();
particleGeometry.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3).setUsage(THREE.DynamicDrawUsage));
particleGeometry.setAttribute('color', new THREE.BufferAttribute(particleColors, 3).setUsage(THREE.DynamicDrawUsage));
particleGeometry.setDrawRange(0, 0);

const particleMaterial = new THREE.PointsMaterial({
  size: 0.45,
  sizeAttenuation: true,
  vertexColors: true,
  transparent: true,
  opacity: 0.95,
  depthWrite: false
});
const particleSystem = new THREE.Points(particleGeometry, particleMaterial);
particleSystem.visible = false;
particleSystem.frustumCulled = false;
scene.add(particleSystem);

const trailPositions = new Float32Array(maxParticles * trailSegmentsPerParticle * 2 * 3);
const trailColors = new Float32Array(maxParticles * trailSegmentsPerParticle * 2 * 3);

const trailGeometry = new THREE.BufferGeometry();
trailGeometry.setAttribute('position', new THREE.BufferAttribute(trailPositions, 3).setUsage(THREE.DynamicDrawUsage));
trailGeometry.setAttribute('color', new THREE.BufferAttribute(trailColors, 3).setUsage(THREE.DynamicDrawUsage));
trailGeometry.setDrawRange(0, 0);

const trailMaterial = new THREE.LineBasicMaterial({
  vertexColors: true,
  transparent: true,
  opacity: 0.95,
  linewidth: 2
});
const trailLines = new THREE.LineSegments(trailGeometry, trailMaterial);
trailLines.frustumCulled = false;
scene.add(trailLines);

const windSpeedInput = document.getElementById('windSpeed');
const densityInput = document.getElementById('particleDensity');
const turbulenceInput = document.getElementById('turbulence');
const thresholdInput = document.getElementById('deflectionThreshold');
const trailLengthInput = document.getElementById('trailLength');
const toggleButton = document.getElementById('toggle');
const resetButton = document.getElementById('reset');

const spawnAreaJitter = new THREE.Vector3(inletX, tunnelHeight * 0.5 - 0.5, tunnelWidth * 0.5 - 0.5);

let activeCount = 0;
let paused = false;
const keys = { ArrowUp: false, ArrowDown: false, ArrowLeft: false, ArrowRight: false, ShiftLeft: false, ShiftRight: false };
const moveSpeed = 10; // units per second
let currentDeflectionThreshold = getDeflectionThreshold();
let trailPointLimit = THREE.MathUtils.clamp(parseInt(trailLengthInput.value, 10) || Math.floor(trailPoints * 0.5), 2, trailPoints);

function getWindSpeed() {
  return parseFloat(windSpeedInput.value);
}

function getTargetCount() {
  return Math.min(maxParticles, parseInt(densityInput.value, 10));
}

function getTurbulenceIntensity() {
  return parseFloat(turbulenceInput.value);
}

function getDeflectionThreshold() {
  return parseFloat(thresholdInput.value) || 0.35;
}

toggleButton.addEventListener('click', () => {
  paused = !paused;
  toggleButton.textContent = paused ? 'Resume' : 'Pause';
});

resetButton.addEventListener('click', () => {
  resetParticles();
});

window.addEventListener('keydown', (e) => {
  if (e.code in keys) keys[e.code] = true;
});
window.addEventListener('keyup', (e) => {
  if (e.code in keys) keys[e.code] = false;
});

function updateCarTransform(delta) {
  if (!carMesh) return;
  const step = moveSpeed * delta;
  const pos = carMesh.position;
  const shifting = keys.ShiftLeft || keys.ShiftRight;
  if (shifting) {
    if (keys.ArrowLeft) pos.x -= step;
    if (keys.ArrowRight) pos.x += step;
  } else {
    if (keys.ArrowUp) pos.y += step;
    if (keys.ArrowDown) pos.y -= step;
    if (keys.ArrowLeft) pos.z -= step;
    if (keys.ArrowRight) pos.z += step;
  }

  pos.x = THREE.MathUtils.clamp(pos.x, inletX + 5, outletX - 5);
  pos.y = THREE.MathUtils.clamp(pos.y, -halfHeight + 1, halfHeight - 1);
  pos.z = THREE.MathUtils.clamp(pos.z, -halfWidth + 1, halfWidth - 1);

  carMesh.updateMatrixWorld(true);
  carTightBounds.setFromObject(carMesh);
  carOuterBounds.copy(carTightBounds).expandByVector(new THREE.Vector3(1.5, 2, 1.8));
  carTightBounds.getCenter(carCenter);
  const boundsSize = carTightBounds.getSize(new THREE.Vector3());
  const frontX = carTightBounds.min.x + boundsSize.x * 0.3;
  const rearX = carTightBounds.max.x - boundsSize.x * 0.15;
  const midY = carTightBounds.min.y + boundsSize.y * 0.35;
  const topY = carTightBounds.max.y - boundsSize.y * 0.2;
  const trackZ = boundsSize.z * 0.5 * 0.7;
  vortexCenters[0]?.set(frontX, midY, carCenter.z + trackZ);
  vortexCenters[1]?.set(frontX, midY, carCenter.z - trackZ);
  vortexCenters[2]?.set(rearX, topY, carCenter.z + trackZ * 0.8);
  vortexCenters[3]?.set(rearX, topY, carCenter.z - trackZ * 0.8);
  rebuildCarStations();
}

function resetParticles() {
  activeCount = 0;
  particles.forEach(p => {
    p.active = false;
    p.trailLength = 0;
    p.acceleration.set(0, 0, 0);
    p.vorticity = 0;
    p.deflected = false;
    p.deflectionScore = 0;
    p.visible = false;
  });
  particleGeometry.setDrawRange(0, 0);
  trailGeometry.setDrawRange(0, 0);
  spawnUntilTarget();
}

function rebuildCarStations() {
  if (!carMesh || !carTightBounds) return;
  carStations.length = 0;
  const size = carTightBounds.getSize(stationScratch);
  const min = carTightBounds.min;
  const segments = 6;
  for (let i = 0; i < segments; i++) {
    const t = (i + 0.5) / segments;
    const center = new THREE.Vector3(
      min.x + size.x * t,
      carCenter.y,
      carCenter.z
    );
    const flare = 1 - Math.abs(t - 0.5) * 2;
    carStations.push({
      center,
      radiusY: size.y * THREE.MathUtils.lerp(0.28, 0.55, flare),
      radiusZ: size.z * THREE.MathUtils.lerp(0.32, 0.6, flare),
      halfLength: (size.x / segments) * 0.75
    });
  }
}

function spawnParticle(p) {
  // Random uniform emission across full inlet wall
  const yMin = -halfHeight + 0.5;
  const yMax = halfHeight - 0.5;
  const zMin = -halfWidth + 0.5;
  const zMax = halfWidth - 0.5;

  const y = THREE.MathUtils.lerp(yMin, yMax, Math.random());
  const z = THREE.MathUtils.lerp(zMin, zMax, Math.random());

  p.position.set(
    inletX + Math.random() * 0.4,
    y,
    z
  );

  const speed = getWindSpeed();
  const verticalKick = THREE.MathUtils.randFloatSpread(0.05 * speed);
  const lateralKick = THREE.MathUtils.randFloatSpread(0.12 * speed);
  p.velocity.set(speed, verticalKick, lateralKick);
  p.acceleration.set(0, 0, 0);
  p.vorticity = 0;
  p.deflected = false;
  p.deflectionScore = 0;
  p.visible = false;
  resetTrail(p);
  p.active = true;
}

function spawnUntilTarget() {
  const target = getTargetCount();
  while (activeCount < target) {
    const particle = particles[activeCount];
    spawnParticle(particle);
    activeCount++;
  }
  particleGeometry.setDrawRange(0, 0);
}

function recycleParticle(p) {
  spawnParticle(p);
}

function resetTrail(p) {
  p.trailLength = 1;
  p.trail[0] = p.position.x;
  p.trail[1] = p.position.y;
  p.trail[2] = p.position.z;
}

function activateTrail(p) {
  if (p.visible) return;
  p.visible = true;
  p.deflected = true;
  p.trailLength = 1;
  p.trail[0] = p.position.x;
  p.trail[1] = p.position.y;
  p.trail[2] = p.position.z;
}

function recordTrail(p) {
  // once a particle has crossed the threshold we keep its full history even if
  // the score later decays; otherwise we reset
  if (!p.deflected) {
    p.trailLength = 0;
    return;
  }

  const trail = p.trail;
  const maxEntries = trailPointLimit;
  let currentLength = p.trailLength;

  if (currentLength > maxEntries) {
    currentLength = maxEntries;
    p.trailLength = currentLength;
  }

  if (currentLength < maxEntries) {
    const offset = currentLength * 3;
    trail[offset] = p.position.x;
    trail[offset + 1] = p.position.y;
    trail[offset + 2] = p.position.z;
    p.trailLength++;
  } else {
    trail.copyWithin(0, 3);
    const offset = (maxEntries - 1) * 3;
    trail[offset] = p.position.x;
    trail[offset + 1] = p.position.y;
    trail[offset + 2] = p.position.z;
  }
}

function writeTrailSegments(p, cursor) {
  const length = p.trailLength;
  if (!p.deflected || length < 2) return cursor;

  const trail = p.trail;
  const color = p.color;

  for (let j = 1; j < length; j++) {
    const prevIndex = (j - 1) * 3;
    const currentIndex = j * 3;
    const base = cursor * 6;

    const fadePrev = (j - 1) / (length - 1);
    const fadeCurr = j / (length - 1);

    trailPositions[base] = trail[prevIndex];
    trailPositions[base + 1] = trail[prevIndex + 1];
    trailPositions[base + 2] = trail[prevIndex + 2];
    trailPositions[base + 3] = trail[currentIndex];
    trailPositions[base + 4] = trail[currentIndex + 1];
    trailPositions[base + 5] = trail[currentIndex + 2];

    trailColors[base] = color.r * fadePrev;
    trailColors[base + 1] = color.g * fadePrev;
    trailColors[base + 2] = color.b * fadePrev;
    trailColors[base + 3] = color.r * fadeCurr;
    trailColors[base + 4] = color.g * fadeCurr;
    trailColors[base + 5] = color.b * fadeCurr;

    cursor++;
  }

  return cursor;
}

function sampleColorRamp(t, target) {
  const clamped = THREE.MathUtils.clamp(t, 0, 1);
  for (let i = 1; i < colorRamp.length; i++) {
    const prev = colorRamp[i - 1];
    const next = colorRamp[i];
    if (clamped <= next.t) {
      const localT = (clamped - prev.t) / (next.t - prev.t);
      return target.copy(prev.color).lerp(next.color, THREE.MathUtils.clamp(localT, 0, 1));
    }
  }
  return target.copy(colorRamp[colorRamp.length - 1].color);
}

function colorForParticle(speed, baseSpeed, vorticity, target) {
  const normalizedSpeed = THREE.MathUtils.clamp(speed / (baseSpeed * 1.2 + 1e-6), 0, 1);
  const swirlInfluence = THREE.MathUtils.clamp(Math.abs(vorticity) * 0.8, 0, 0.5);
  return sampleColorRamp(normalizedSpeed + swirlInfluence, target);
}

function applyFreestream(p, baseSpeed) {
  desiredFlow.set(baseSpeed, 0, 0);
  diffVec.copy(desiredFlow).sub(p.velocity);
  p.acceleration.addScaledVector(diffVec, 2.2);
}

function applyGroundEffect(p) {
  const groundY = -halfHeight + 0.2;
  const dist = p.position.y - groundY;
  if (dist < 0.4) {
    const strength = (0.4 - dist) * 12;
    p.acceleration.y += strength;
    p.velocity.y = Math.max(p.velocity.y, -0.4 * dist);
  }
  const ceilingY = halfHeight - 0.2;
  const headroom = ceilingY - p.position.y;
  if (headroom < 0.6) {
    p.acceleration.y -= (0.6 - headroom) * 6;
  }
}

function applyPotentialInfluence(p, baseSpeed) {
  if (carStations.length === 0) return;
  desiredFlow.set(baseSpeed, 0, 0);

  for (let i = 0; i < carStations.length; i++) {
    const station = carStations[i];
    const dx = p.position.x - station.center.x;
    const ax = Math.abs(dx);
    if (ax > station.halfLength * 1.8) continue;

    const dy = p.position.y - station.center.y;
    const dz = p.position.z - station.center.z;
    const ny = dy / (station.radiusY * station.radiusY + 1e-4);
    const nz = dz / (station.radiusZ * station.radiusZ + 1e-4);
    const radial = Math.sqrt(
      (dy * dy) / (station.radiusY * station.radiusY + 1e-4) +
      (dz * dz) / (station.radiusZ * station.radiusZ + 1e-4)
    );
    if (radial > 3) continue;

    faceNormal.set(0, ny, nz);
    if (faceNormal.lengthSq() < 1e-6) continue;
    faceNormal.normalize();

    const influence = Math.exp(-ax / (station.halfLength * 1.2)) * Math.max(0, 1 - radial / 3);
    if (influence < 1e-3) continue;

    tangent.copy(desiredFlow).projectOnPlane(faceNormal);
    if (tangent.lengthSq() < 1e-6) {
      tangent.copy(p.velocity).projectOnPlane(faceNormal);
    }
    if (tangent.lengthSq() < 1e-6) {
      tangent.crossVectors(faceNormal, groundNormal);
    }
    tangent.normalize();

    const preferredSpeed = baseSpeed * (0.7 + 0.3 * Math.min(radial, 1));
    diffVec.copy(tangent).multiplyScalar(preferredSpeed).sub(p.velocity);
    p.acceleration.addScaledVector(diffVec, influence * 5.5);

    const sign = dx < 0 ? 1 : -0.5;
    p.acceleration.addScaledVector(faceNormal, influence * baseSpeed * 0.9 * sign);

    const response = influence * (diffVec.length() / (preferredSpeed + 1e-4));
    p.deflectionScore += response * 0.35;
    if (!p.deflected && p.deflectionScore > currentDeflectionThreshold) {
      p.deflected = true;
    }
  }
}

function applyWakeForces(p, baseSpeed, turbulence, time) {
  if (!carOuterBounds || vortexCenters.length === 0) return;
  const wakeStart = carOuterBounds.max.x;
  if (p.position.x < wakeStart) {
    p.vorticity *= 0.92;
    return;
  }

  let accumulated = 0;
  let influenced = false;
  for (let i = 0; i < vortexCenters.length; i++) {
    diffVec.copy(p.position).sub(vortexCenters[i]);
    diffVec.x *= 0.7; // stretch downstream
    const distSq = diffVec.lengthSq();
    const radius = 4 + i * 0.6;
    const falloff = Math.exp(-distSq / (radius * radius));
    if (falloff > 0.08) {
      swirlVec.crossVectors(swirlAxis, diffVec).normalize();
      const swirlStrength = baseSpeed * 0.9 * falloff;
      p.acceleration.addScaledVector(swirlVec, swirlStrength);
      accumulated += swirlStrength;
      influenced = true;
    }
  }

  if (influenced) {
const noise = Math.sin(p.position.z * 1.1 + time * 2.5) + Math.cos(p.position.y * 0.9 - time * 1.4);
p.acceleration.y += noise * turbulence * 1.2;
p.acceleration.z += Math.cos(p.position.x * 0.6 + time * 2.1) * turbulence * 0.9;
p.vorticity = THREE.MathUtils.lerp(p.vorticity, accumulated * 0.18, 0.35);
p.deflectionScore += accumulated * 0.15;
  } else {
    p.vorticity *= 0.95;
  }

  if (!p.deflected && p.deflectionScore > currentDeflectionThreshold) {
    p.deflected = true;
  }
}

function computeFaceNormal(faceIndex, target) {
  if (!carGeometry) return target.set(0, 1, 0);
  const posAttr = carGeometry.attributes.position;
  const i3 = faceIndex * 3;
  triA.fromBufferAttribute(posAttr, i3);
  triB.fromBufferAttribute(posAttr, i3 + 1);
  triC.fromBufferAttribute(posAttr, i3 + 2);
  triB.sub(triA);
  triC.sub(triA);
  return target.copy(triB.cross(triC)).normalize();
}

function worldDirToLocal(mesh, dirWorld, out) {
  tmpMat4.copy(mesh.matrixWorld).invert();
  out.copy(dirWorld).transformDirection(tmpMat4);
  return out;
}
function localDirToWorld(mesh, dirLocal, out) {
  out.copy(dirLocal).transformDirection(mesh.matrixWorld);
  return out;
}

function deflectVelocity(p, baseSpeed, delta) {
  if (!carMesh || !carOuterBounds || !carGeometry || !carGeometry.boundsTree) return;
  if (!carOuterBounds.containsPoint(p.position)) return;

  // Closest point and surface normal
  localPoint.copy(p.position);
  carMesh.worldToLocal(localPoint);
  const hit = carGeometry.boundsTree.closestPointToPoint(localPoint, bvhHit);
  if (!hit || bvhHit.faceIndex === null || bvhHit.faceIndex === undefined) return;

  hitPointWorld.copy(bvhHit.point);
  carMesh.localToWorld(hitPointWorld);
  const distance = hitPointWorld.distanceTo(p.position);
  const R = 2.4; // influence radius (extended a bit for far-field bending)
  if (distance > R) return;

  normalMatrix.getNormalMatrix(carMesh.matrixWorld);
  computeFaceNormal(bvhHit.faceIndex, faceNormalLocal);
  faceNormal.copy(faceNormalLocal).applyMatrix3(normalMatrix).normalize();

  // Remove only inward normal velocity (no-through condition)
  const vn = p.velocity.dot(faceNormal);
  if (vn < 0) {
    p.acceleration.addScaledVector(faceNormal, -vn * 6);
    p.deflectionScore += Math.min(Math.abs(vn), 3) * 0.15;
    activateTrail(p);
  }

  // Tangent direction guided by free-stream
  desiredFlow.set(baseSpeed, 0, 0);
  tangent.copy(desiredFlow).projectOnPlane(faceNormal);
  if (tangent.lengthSq() < 1e-8) tangent.copy(p.velocity).projectOnPlane(faceNormal);
  if (tangent.lengthSq() < 1e-8) tangent.crossVectors(faceNormal, new THREE.Vector3(0, 1, 0));
  tangent.normalize();

  // Curvature anticipation: sample normal slightly along tangent
  const step = Math.min(0.25, Math.max(0.05, distance * 0.5));
  const tLocal = worldDirToLocal(carMesh, tangent, tempVec);
  stationScratch.copy(bvhHit.point).addScaledVector(tLocal, step);
  const hit2 = carGeometry.boundsTree.closestPointToPoint(stationScratch, bvhHit2);
  if (hit2 && bvhHit2.faceIndex !== null && bvhHit2.faceIndex !== undefined) {
    const n2 = computeFaceNormal(bvhHit2.faceIndex, faceNormalLocal).applyMatrix3(normalMatrix).normalize();
    tempVec2.copy(tangent).projectOnPlane(n2).normalize();
    tangent.lerp(tempVec2, 0.7).normalize();
  }

  sideDirWorld.copy(tangent).cross(faceNormal);
  if (sideDirWorld.lengthSq() > 1e-8) {
    sideDirWorld.normalize();
    const sideLocal = worldDirToLocal(carMesh, sideDirWorld, tempVec);
    stationScratch.copy(bvhHit.point).addScaledVector(sideLocal, step * 0.6);
    const hitSide = carGeometry.boundsTree.closestPointToPoint(stationScratch, bvhHitSide);
    if (hitSide && bvhHitSide.faceIndex !== null && bvhHitSide.faceIndex !== undefined) {
      computeFaceNormal(bvhHitSide.faceIndex, faceNormalLocal).applyMatrix3(normalMatrix).normalize();
      sideNormalWorld.copy(sideDirWorld).projectOnPlane(faceNormalLocal);
      if (sideNormalWorld.lengthSq() > 1e-6) {
        sideNormalWorld.normalize();
        tangent.lerp(sideNormalWorld, 0.3).normalize();
      }
    }
  }

  // Boundary-layer sliding with speed reduced near wall
  const s = THREE.MathUtils.clamp(distance / R, 0, 1);
  const smooth = s * s * (3 - 2 * s);
  const targetSpeed = THREE.MathUtils.lerp(baseSpeed * 0.35, baseSpeed, smooth);
  const desired = tangent.multiplyScalar(targetSpeed);
  diffVec.copy(desired).sub(p.velocity);
  const align = 2.5 + 4 * (1 - smooth);
  if (diffVec.lengthSq() > 1e-6) {
    p.acceleration.addScaledVector(diffVec, align);
    p.deflectionScore += Math.min(diffVec.length(), baseSpeed) * 0.08;
  }

  // Maintain a small stand-off distance to avoid sticking
  const minOffset = 0.12;
  if (!p.visible && distance < minOffset * 1.8) {
    activateTrail(p);
  }
  if (distance < minOffset) {
    p.position.copy(hitPointWorld).addScaledVector(faceNormal, minOffset + 1e-3);
    p.velocity.addScaledVector(faceNormal, (minOffset - distance) * 4);
    p.deflectionScore += (minOffset - distance) * 0.5;
  } else {
    repositionTarget.copy(hitPointWorld).addScaledVector(faceNormal, minOffset);
    diffVec.copy(repositionTarget).sub(p.position);
    p.acceleration.addScaledVector(diffVec, 3 * (1 - smooth));
    if (diffVec.lengthSq() > 1e-6) {
      p.deflectionScore += Math.min(diffVec.length(), 1.5) * 0.12;
    }
  }

  if (!p.deflected && p.deflectionScore > currentDeflectionThreshold) {
    activateTrail(p);
  }
}

function applyTurbulence(p, time, intensity) {
  const wakeStart = carOuterBounds ? carOuterBounds.max.x + 1.5 : 5;
  if (p.position.x <= wakeStart || !p.deflected) return;

  const noiseA = Math.sin(p.position.z * 1.3 + time * 3.2);
  const noiseB = Math.cos(p.position.y * 1.1 - time * 1.8);
  p.acceleration.y += noiseA * intensity * 0.9;
  p.acceleration.z += noiseB * intensity * 0.7;
  p.deflectionScore += (Math.abs(noiseA) + Math.abs(noiseB)) * 0.08;
  if (!p.deflected && p.deflectionScore > currentDeflectionThreshold) {
    p.deflected = true;
  }
}

function updateParticles(delta, time) {
  const target = getTargetCount();
  const baseSpeed = getWindSpeed();
  const turbulence = getTurbulenceIntensity();
  currentDeflectionThreshold = getDeflectionThreshold();
  trailPointLimit = THREE.MathUtils.clamp(parseInt(trailLengthInput.value, 10) || trailPointLimit, 2, trailPoints);

  if (activeCount > target) {
    for (let i = target; i < activeCount; i++) {
      particles[i].active = false;
      particles[i].trailLength = 0;
      particles[i].acceleration.set(0, 0, 0);
      particles[i].vorticity = 0;
      particles[i].deflected = false;
      particles[i].deflectionScore = 0;
      particles[i].visible = false;
    }
    activeCount = target;
    particleGeometry.setDrawRange(0, 0);
  } else if (activeCount < target) {
    spawnUntilTarget();
  }

  let trailSegmentCursor = 0;

  const subSteps = 2;
  const subDelta = delta / subSteps;

  for (let i = 0; i < activeCount; i++) {
    const particle = particles[i];
    if (!particle.active) {
      recycleParticle(particle);
    }

    for (let step = 0; step < subSteps; step++) {
      if (!particle.deflected) {
        particle.deflectionScore = Math.max(0, particle.deflectionScore - 0.12 * subDelta);
      }
      particle.acceleration.set(0, 0, 0);
      applyFreestream(particle, baseSpeed);
      applyGroundEffect(particle);
      applyPotentialInfluence(particle, baseSpeed);
      deflectVelocity(particle, baseSpeed, subDelta);
      applyWakeForces(particle, baseSpeed, turbulence, time);
      applyTurbulence(particle, time, turbulence);

      particle.velocity.addScaledVector(particle.acceleration, subDelta);
      particle.velocity.multiplyScalar(0.997);

      particle.position.addScaledVector(particle.velocity, subDelta * advectionScale);
    }

    if (particle.position.x > outletX ||
        particle.position.y > halfHeight || particle.position.y < -halfHeight ||
        particle.position.z > halfWidth || particle.position.z < -halfWidth) {
      recycleParticle(particle);
    }

    if (!particle.visible) {
      continue;
    }

    const speed = particle.velocity.length();
    colorForParticle(speed, baseSpeed, particle.vorticity, particle.color);

    recordTrail(particle);
    trailSegmentCursor = writeTrailSegments(particle, trailSegmentCursor);
  }

  particleGeometry.setDrawRange(0, 0);

  trailGeometry.setDrawRange(0, trailSegmentCursor * 2);
  trailGeometry.attributes.position.needsUpdate = true;
  trailGeometry.attributes.color.needsUpdate = true;
  if (trailSegmentCursor > 0) {
    trailGeometry.computeBoundingSphere();
  }
}

let lastTime = performance.now();

function animate(now) {
  requestAnimationFrame(animate);

  const delta = Math.min((now - lastTime) / 1000, 0.05);
  lastTime = now;

  if (!paused) {
    updateCarTransform(delta);
    updateParticles(delta, now / 1000);
  }

  controls.update();
  renderer.render(scene, camera);
}

spawnUntilTarget();
updateParticles(0.016, 0);
animate(performance.now());

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

window.__airflowSim = {
  getStats: () => {
    const size = carTightBounds ? carTightBounds.getSize(new THREE.Vector3()).toArray() : null;
    return {
      activeCount,
      carLoaded: !!carMesh,
      carBoundsSize: size,
      trailSegments: trailGeometry.drawRange.count / 2,
      carMinY: carTightBounds ? carTightBounds.min.y : null
    };
  }
};
