import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';

function deg(value) {
  return THREE.MathUtils.degToRad(value);
}

function disposeObject(object) {
  if (object.geometry) object.geometry.dispose();
  const { material } = object;
  if (Array.isArray(material)) material.forEach(item => item?.dispose?.());
  else material?.dispose?.();
}

export function createRobotArmScene(mount, twin, onFrame = () => {}) {
  mount.replaceChildren();
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  mount.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x080d10);
  scene.fog = new THREE.Fog(0x080d10, 6, 14);
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 70);
  camera.position.set(6.2, 3.55, 6.25);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.075;
  controls.target.set(-0.8, 1.1, 0);
  controls.minDistance = 3.7;
  controls.maxDistance = 10.5;
  controls.maxPolarAngle = Math.PI * 0.49;

  const materials = {
    metal: new THREE.MeshStandardMaterial({ color: 0xb9c1c2, roughness: 0.38, metalness: 0.68 }),
    light: new THREE.MeshStandardMaterial({ color: 0xe5ebe7, roughness: 0.34, metalness: 0.55 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x090b0c, roughness: 0.47, metalness: 0.62 }),
    rubber: new THREE.MeshStandardMaterial({ color: 0x050607, roughness: 0.76, metalness: 0.06 }),
    accent: new THREE.MeshStandardMaterial({ color: 0x7cf7c8, roughness: 0.32, metalness: 0.22, emissive: 0x1a6d55, emissiveIntensity: 0.16 }),
    floor: new THREE.MeshStandardMaterial({ color: 0x111819, roughness: 0.92, metalness: 0.04 })
  };
  const edgeMaterial = new THREE.LineBasicMaterial({ color: 0xf2f7f3, transparent: true, opacity: 0.18 });

  function addEdges(mesh, threshold = 28) {
    mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry, threshold), edgeMaterial));
  }
  const importedModelRoot = new THREE.Group();
  importedModelRoot.name = 'Imported CAD model';
  scene.add(importedModelRoot);

  function clearImportedModel() {
    importedModelRoot.traverse(disposeObject);
    importedModelRoot.clear();
  }
  function fitImportedModel(object) {
    const bounds = new THREE.Box3().setFromObject(object);
    const size = bounds.getSize(new THREE.Vector3());
    const center = bounds.getCenter(new THREE.Vector3());
    const maxAxis = Math.max(size.x, size.y, size.z, 0.001);
    const scale = 2.6 / maxAxis;
    object.position.sub(center);
    object.scale.multiplyScalar(scale);
    object.position.x -= 2.7;
    object.position.y += 0.08;
  }
  function setImportedModel(url, format) {
    clearImportedModel();
    const normalizedFormat = String(format || url.split('.').at(-1)).toLowerCase();
    if (normalizedFormat === 'glb' || normalizedFormat === 'gltf') {
      const loader = new GLTFLoader();
      loader.load(url, (gltf) => {
        fitImportedModel(gltf.scene);
        importedModelRoot.add(gltf.scene);
      });
      return;
    }
    if (normalizedFormat === 'stl') {
      const loader = new STLLoader();
      loader.load(url, (geometry) => {
        geometry.computeVertexNormals();
        const mesh = new THREE.Mesh(geometry, materials.metal.clone());
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        fitImportedModel(mesh);
        importedModelRoot.add(mesh);
      });
    }
  }
  function box(parent, size, position, material, options = {}) {
    const geometry = options.radius
      ? new RoundedBoxGeometry(size[0], size[1], size[2], options.segments ?? 3, options.radius)
      : new THREE.BoxGeometry(size[0], size[1], size[2]);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(...position);
    if (options.rotation) mesh.rotation.set(...options.rotation);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    addEdges(mesh);
    parent.add(mesh);
    return mesh;
  }
  function cylinder(parent, radius, depth, position, material, axis = 'y', options = {}) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, depth, options.radialSegments ?? 48), material);
    mesh.position.set(...position);
    if (axis === 'x') mesh.rotation.z = Math.PI / 2;
    if (axis === 'z') mesh.rotation.x = Math.PI / 2;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    addEdges(mesh);
    parent.add(mesh);
    return mesh;
  }
  function bolt(parent, position, axis = 'z') {
    return cylinder(parent, 0.025, 0.018, position, materials.dark, axis, { radialSegments: 24 });
  }
  function bar2d(parent, start, end, z, thickness, depth, material) {
    const dx = end[0] - start[0];
    const dy = end[1] - start[1];
    const length = Math.hypot(dx, dy);
    const angle = Math.atan2(dy, dx);
    return box(parent, [length, thickness, depth], [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2, z], material, { radius: thickness * 0.25, rotation: [0, 0, angle] });
  }

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(18, 18), materials.floor);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);
  const grid = new THREE.GridHelper(14, 28, 0x6a8077, 0x24302d);
  grid.material.transparent = true;
  grid.material.opacity = 0.23;
  scene.add(grid);

  const robot = new THREE.Group();
  robot.position.set(1.0, 0.02, 0);
  robot.rotation.y = -0.16;
  robot.scale.setScalar(0.83);
  scene.add(robot);

  box(robot, [0.74, 0.16, 0.64], [0, 0.08, 0], materials.light, { radius: 0.035 });
  box(robot, [0.5, 0.42, 0.42], [0, 0.37, 0], materials.metal, { radius: 0.025 });
  cylinder(robot, 0.32, 0.12, [0, 0.64, 0], materials.dark);
  cylinder(robot, 0.25, 0.08, [0, 0.72, 0], materials.light);
  [[-0.25,0.168,-0.21],[0.25,0.168,-0.21],[-0.25,0.168,0.21],[0.25,0.168,0.21]].forEach(p => bolt(robot, p, 'y'));

  const baseYaw = new THREE.Group();
  baseYaw.position.set(0, 0.72, 0);
  robot.add(baseYaw);
  box(baseYaw, [0.42, 0.28, 0.12], [-0.04, 0.16, -0.33], materials.dark, { radius: 0.03 });
  box(baseYaw, [0.42, 0.28, 0.12], [-0.04, 0.16, 0.33], materials.dark, { radius: 0.03 });
  box(baseYaw, [0.24, 0.22, 0.52], [-0.18, 0.08, 0], materials.light, { radius: 0.025 });

  const shoulderPitch = new THREE.Group();
  shoulderPitch.position.set(-0.12, 0.22, 0);
  baseYaw.add(shoulderPitch);
  cylinder(shoulderPitch, 0.24, 0.74, [0, 0, 0], materials.dark, 'z');
  cylinder(shoulderPitch, 0.18, 0.82, [0, 0, 0], materials.light, 'z');

  const lowerLen = 1.72;
  const lowerLink = new THREE.Group();
  shoulderPitch.add(lowerLink);
  box(lowerLink, [0.14, lowerLen * 0.78, 0.1], [-0.08, lowerLen * 0.46, -0.18], materials.metal, { radius: 0.03 });
  box(lowerLink, [0.14, lowerLen * 0.78, 0.1], [-0.08, lowerLen * 0.46, 0.18], materials.metal, { radius: 0.03 });
  cylinder(lowerLink, 0.025, lowerLen * 0.78, [0.08, lowerLen * 0.46, -0.25], materials.light);
  cylinder(lowerLink, 0.025, lowerLen * 0.78, [0.08, lowerLen * 0.46, 0.25], materials.light);
  box(lowerLink, [0.36, 0.23, 0.58], [-0.02, 0.04, 0], materials.dark, { radius: 0.035 });
  box(lowerLink, [0.38, 0.22, 0.58], [-0.02, lowerLen, 0], materials.dark, { radius: 0.04 });
  for (let i = 0; i < 5; i += 1) {
    bolt(lowerLink, [-0.085, 0.35 + i * 0.24, -0.238], 'z');
    bolt(lowerLink, [-0.085, 0.35 + i * 0.24, 0.238], 'z');
  }

  const elbowPivot = new THREE.Group();
  elbowPivot.position.set(0, lowerLen, 0);
  lowerLink.add(elbowPivot);
  cylinder(elbowPivot, 0.26, 0.7, [0, 0, 0], materials.dark, 'z');
  cylinder(elbowPivot, 0.18, 0.77, [0, 0, 0], materials.light, 'z');
  box(elbowPivot, [0.28, 0.34, 0.42], [-0.26, 0, 0], materials.dark, { radius: 0.035 });

  const upperArm = new THREE.Group();
  elbowPivot.add(upperArm);
  const upperLen = 2.28;
  box(upperArm, [0.38, 0.4, 0.54], [-0.05, 0, 0], materials.dark, { radius: 0.04 });
  box(upperArm, [0.34, 0.36, 0.52], [-upperLen, 0, 0], materials.dark, { radius: 0.04 });
  box(upperArm, [upperLen - 0.56, 0.16, 0.1], [-upperLen / 2 - 0.02, 0.12, -0.17], materials.metal, { radius: 0.025 });
  box(upperArm, [upperLen - 0.56, 0.16, 0.1], [-upperLen / 2 - 0.02, -0.12, 0.17], materials.metal, { radius: 0.025 });
  box(upperArm, [upperLen - 0.9, 0.08, 0.08], [-upperLen / 2 - 0.08, 0, 0], materials.light, { radius: 0.015 });

  const wristGroup = new THREE.Group();
  wristGroup.position.set(-upperLen, 0, 0);
  upperArm.add(wristGroup);
  cylinder(wristGroup, 0.25, 0.58, [0, 0, 0], materials.dark, 'z');
  box(wristGroup, [0.26, 0.44, 0.56], [-0.24, 0, 0], materials.light, { radius: 0.025 });
  cylinder(wristGroup, 0.17, 0.42, [-0.44, 0, 0], materials.dark, 'x');

  const gripperRoot = new THREE.Group();
  gripperRoot.position.set(-0.64, 0, 0);
  wristGroup.add(gripperRoot);
  box(gripperRoot, [0.48, 0.36, 0.52], [-0.18, 0, 0], materials.light, { radius: 0.025 });
  cylinder(gripperRoot, 0.18, 0.56, [-0.42, 0, 0], materials.dark, 'x');
  box(gripperRoot, [0.78, 0.08, 0.58], [-0.22, 0.62, 0], materials.light, { radius: 0.025, rotation: [0, 0, deg(-10)] });

  [-0.33, 0.33].forEach((z) => {
    bar2d(gripperRoot, [-0.98, 0.23], [0.12, 0.23], z, 0.075, 0.08, materials.light);
    bar2d(gripperRoot, [-0.98, -0.35], [0.1, -0.35], z, 0.075, 0.08, materials.light);
    bar2d(gripperRoot, [-1.0, -0.35], [-1.0, 0.23], z, 0.075, 0.08, materials.light);
    bar2d(gripperRoot, [-0.88, -0.32], [-0.25, 0.14], z, 0.06, 0.075, materials.metal);
    bolt(gripperRoot, [-0.98, 0.23, z], 'z');
    bolt(gripperRoot, [0.1, -0.35, z], 'z');
  });

  const jawRoot = new THREE.Group();
  jawRoot.position.set(-0.48, -0.02, 0);
  gripperRoot.add(jawRoot);
  const jaws = {
    left: box(jawRoot, [0.15, 0.75, 0.1], [-0.24, -0.34, -0.2], materials.light, { radius: 0.025, rotation: [0, 0, deg(-10)] }),
    center: box(jawRoot, [0.14, 0.62, 0.1], [-0.34, -0.33, 0], materials.metal, { radius: 0.025 }),
    right: box(jawRoot, [0.15, 0.75, 0.1], [-0.24, -0.34, 0.2], materials.light, { radius: 0.025, rotation: [0, 0, deg(10)] })
  };
  Object.values(jaws).forEach((jaw) => box(jaw, [0.15, 0.05, 0.12], [0, -0.4, 0], materials.rubber, { radius: 0.012 }));

  const lights = [new THREE.HemisphereLight(0xcbd7d5, 0x141615, 1.25), new THREE.DirectionalLight(0xffffff, 3.2), new THREE.DirectionalLight(0x98ddff, 1.2)];
  lights[1].position.set(3.6, 5.4, 3.8);
  lights[1].castShadow = true;
  lights[1].shadow.mapSize.set(2048, 2048);
  lights[2].position.set(-4.2, 2.8, -3.2);
  lights.forEach(light => scene.add(light));

  const state = Object.fromEntries(twin.joints.map(joint => [joint.id, joint.value]));
  let targets = Object.fromEntries(twin.joints.map(joint => [joint.id, joint.target]));
  let autoAnimate = false;

  function setTargets(nextTargets) {
    targets = { ...targets, ...nextTargets };
  }
  function setAutoAnimate(value) {
    autoAnimate = Boolean(value);
  }
  function update(delta, elapsed) {
    if (autoAnimate) {
      setTargets({
        base: 18 + Math.sin(elapsed * 0.46) * 36,
        shoulder: 36 + Math.sin(elapsed * 0.72 + 0.4) * 14,
        elbow: -62 + Math.sin(elapsed * 0.63 + 1.1) * 18,
        wrist: -12 + Math.sin(elapsed * 0.9 + 2.1) * 24,
        gripper: 18 + (Math.sin(elapsed * 1.45) * 0.5 + 0.5) * 24
      });
    }
    const smooth = 1 - Math.pow(0.0005, delta);
    for (const key of Object.keys(state)) state[key] = THREE.MathUtils.lerp(state[key], targets[key], smooth);
    baseYaw.rotation.y = deg(state.base);
    shoulderPitch.rotation.z = deg(state.shoulder);
    elbowPivot.rotation.z = deg(state.elbow);
    wristGroup.rotation.z = deg(state.wrist);
    gripperRoot.rotation.x = deg(Math.sin(elapsed * 0.6) * 3);
    jaws.left.rotation.z = deg(-10 - state.gripper * 0.24);
    jaws.center.rotation.z = deg(Math.sin(elapsed * 0.8) * 1.2);
    jaws.right.rotation.z = deg(10 + state.gripper * 0.24);
    onFrame({ ...state }, { ...targets });
  }

  const resizeObserver = new ResizeObserver(() => {
    const rect = mount.getBoundingClientRect();
    renderer.setSize(rect.width, rect.height, false);
    camera.aspect = rect.width / Math.max(rect.height, 1);
    camera.fov = rect.width < 620 ? 52 : 42;
    camera.updateProjectionMatrix();
    controls.update();
  });
  resizeObserver.observe(mount);
  const clock = new THREE.Clock();
  renderer.setAnimationLoop(() => {
    const delta = clock.getDelta();
    const elapsed = clock.elapsedTime;
    update(delta, elapsed);
    controls.update();
    renderer.render(scene, camera);
  });

  return {
    setTargets,
    setAutoAnimate,
    setImportedModel,
    clearImportedModel,
    dispose() {
      renderer.setAnimationLoop(null);
      resizeObserver.disconnect();
      controls.dispose();
      scene.traverse(disposeObject);
      renderer.dispose();
      mount.replaceChildren();
    }
  };
}
