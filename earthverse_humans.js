
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';

/*
 EARTHVERSE HUMAN SYSTEM
 Player: 1 Male
 NPCs: 25 Male + 25 Female

 Usage:
 const humans = await createEarthverseHumans({
   THREE, scene, camera, renderer,
   npcCount: 50,
   map: mapGLTF.scene
 });

 Animation:
 humans.update(deltaSeconds);
*/

export async function createEarthverseHumans({
  THREE: T = THREE,
  scene,
  camera,
  renderer,
  map = null,
  maleModelUrl = './assets/citizens/models/Superhero_Male_FullBody.gltf',
  femaleModelUrl = './assets/citizens/models/Superhero_Female_FullBody.gltf',
  npcCount = 50,
  characterHeight = 1.7,
  spawnRadius = 65,
  mapMargin = 8
}) {
  if (!scene || !camera || !renderer) {
    throw new Error('Missing scene, camera or renderer.');
  }

  const loader = new GLTFLoader();

  const [maleGLTF, femaleGLTF] = await Promise.all([
    loader.loadAsync(maleModelUrl),
    loader.loadAsync(femaleModelUrl)
  ]);

  function prepareModel(source) {
    source.updateMatrixWorld(true);

    const bounds = new T.Box3().setFromObject(source);
    const height = Math.max(bounds.max.y - bounds.min.y, 0.001);

    return {
      source,
      scale: characterHeight / height
    };
  }

  const models = {
    male: prepareModel(maleGLTF.scene),
    female: prepareModel(femaleGLTF.scene)
  };

  const world = new T.Group();
  world.name = 'EARTHVERSE_HUMAN_SYSTEM';
  scene.add(world);

  // Get actual map bounds if supplied.
  let mapBounds = null;

  if (map) {
    map.updateMatrixWorld(true);
    mapBounds = new T.Box3().setFromObject(map);
  }

  const mapCenter = mapBounds
    ? mapBounds.getCenter(new T.Vector3())
    : new T.Vector3(0, 0, 0);

  const halfX = mapBounds
    ? Math.max(5, (mapBounds.max.x - mapBounds.min.x) * 0.42)
    : spawnRadius;

  const halfZ = mapBounds
    ? Math.max(5, (mapBounds.max.z - mapBounds.min.z) * 0.42)
    : spawnRadius;

  function randomPosition(index, total, radius = 0) {
    const angle = index * 2.399963229728653 +
      Math.random() * 0.35;

    const distance = radius || Math.sqrt(Math.random()) * 0.85;

    const x = Math.cos(angle) * distance * halfX;
    const z = Math.sin(angle) * distance * halfZ;

    return new T.Vector3(
      mapCenter.x + x,
      0,
      mapCenter.z + z
    );
  }

  function findRig(model) {
    const patterns = {
      leftUpperLeg: /left.*upper.?leg|thigh_l|upperleg_l/i,
      rightUpperLeg: /right.*upper.?leg|thigh_r|upperleg_r/i,
      leftLowerLeg: /left.*lower.?leg|calf_l/i,
      rightLowerLeg: /right.*lower.?leg|calf_r/i,
      leftUpperArm: /left.*upper.?arm|upperarm_l/i,
      rightUpperArm: /right.*upper.?arm|upperarm_r/i,
      spine: /spine/i
    };

    const rig = {};

    model.traverse(object => {
      if (!object.isBone) return;

      for (const key in patterns) {
        if (!rig[key] && patterns[key].test(object.name)) {
          rig[key] = object;
        }
      }
    });

    return rig;
  }

  function createCharacter(gender) {
    const data = models[gender];
    const model = cloneSkeleton(data.source);

    model.scale.setScalar(data.scale);
    model.updateMatrixWorld(true);

    const bounds = new T.Box3().setFromObject(model);
    model.position.y -= bounds.min.y;

    model.traverse(object => {
      if (object.isMesh) {
        object.castShadow = true;
        object.receiveShadow = true;
      }
    });

    const rig = findRig(model);
    const base = {};

    for (const key in rig) {
      base[key] = rig[key].rotation.clone();
    }

    return {
      model,
      rig,
      base,
      gender,
      phase: Math.random() * Math.PI * 2
    };
  }

  function animateCharacter(character, time, walking) {
    const swing = walking
      ? Math.sin(time * 7 + character.phase) * 0.48
      : 0;

    const { rig, base } = character;

    function rotate(key, amount) {
      if (!rig[key] || !base[key]) return;
      rig[key].rotation.x = base[key].x + amount;
    }

    rotate('leftUpperLeg', swing);
    rotate('rightUpperLeg', -swing);

    rotate('leftLowerLeg', Math.max(0, -swing) * 0.6);
    rotate('rightLowerLeg', Math.max(0, swing) * 0.6);

    rotate('leftUpperArm', -swing * 0.7);
    rotate('rightUpperArm', swing * 0.7);

    rotate('spine', walking ? Math.sin(time * 7) * 0.02 : 0);
  }

  // Player.
  const player = new T.Group();
  player.name = 'EARTHVERSE_PLAYER';

  const playerCharacter = createCharacter('male');
  player.add(playerCharacter.model);

  const playerSpawn = randomPosition(0, 1, 0.12);
  player.position.copy(playerSpawn);
  world.add(player);

  // NPCs.
  const npcs = [];
  const npcData = [];

  const totalNPCs = Math.max(0, Math.floor(npcCount));

  for (let i = 0; i < totalNPCs; i++) {
    const gender = i % 2 === 0 ? 'male' : 'female';

    const root = new T.Group();
    root.name = `EARTHVERSE_NPC_${i + 1}`;

    const character = createCharacter(gender);
    root.add(character.model);

    // Golden-angle distribution avoids one crowded spawn point.
    const position = randomPosition(i + 1, totalNPCs);

    root.position.copy(position);
    root.rotation.y = Math.random() * Math.PI * 2;

    world.add(root);

    npcData.push({
      root,
      character,
      home: position.clone(),
      angle: Math.random() * Math.PI * 2,
      speed: 0.35 + Math.random() * 0.45,
      timer: Math.random() * 3,
      phase: Math.random() * Math.PI * 2
    });

    npcs.push(root);
  }

  // Player controls.
  const ui = document.createElement('div');
  ui.id = 'earthverse-human-controls';

  ui.innerHTML = `
  <style>
    #earthverse-human-controls {
      position:fixed;
      inset:0;
      z-index:30;
      pointer-events:none;
    }
    #ev-stick {
      position:absolute;
      left:22px;
      bottom:26px;
      width:116px;
      height:116px;
      border-radius:50%;
      background:#07152299;
      border:2px solid #ffffff88;
      pointer-events:auto;
      touch-action:none;
    }
    #ev-knob {
      position:absolute;
      width:44px;
      height:44px;
      left:34px;
      top:34px;
      border-radius:50%;
      background:#e8f4ff;
      border:2px solid white;
    }
    #ev-hint {
      position:absolute;
      left:22px;
      bottom:150px;
      color:white;
      background:#0009;
      padding:7px;
      border-radius:8px;
      font:12px system-ui;
    }
  </style>
  <div id="ev-hint">MOVE · JOYSTICK · DRAG TO LOOK</div>
  <div id="ev-stick"><div id="ev-knob"></div></div>
  `;

  document.body.appendChild(ui);

  const stick = ui.querySelector('#ev-stick');
  const knob = ui.querySelector('#ev-knob');

  const input = {
    x: 0,
    y: 0,
    yaw: 0,
    keys: {}
  };

  let stickPointer = null;
  let lookPointer = null;
  let lastX = 0;

  function updateStick(event) {
    const rect = stick.getBoundingClientRect();
    const dx = event.clientX - rect.left - rect.width / 2;
    const dy = event.clientY - rect.top - rect.height / 2;

    const max = rect.width * 0.34;
    const length = Math.hypot(dx, dy) || 1;
    const factor = Math.min(1, max / length);

    input.x = dx * factor / max;
    input.y = dy * factor / max;

    knob.style.transform =
      `translate(${input.x * max}px,${input.y * max}px)`;
  }

  stick.addEventListener('pointerdown', event => {
    stickPointer = event.pointerId;
    stick.setPointerCapture(event.pointerId);
    updateStick(event);
  });

  stick.addEventListener('pointermove', event => {
    if (event.pointerId === stickPointer) updateStick(event);
  });

  function releaseStick(event) {
    if (event.pointerId !== stickPointer) return;
    stickPointer = null;
    input.x = 0;
    input.y = 0;
    knob.style.transform = '';
  }

  stick.addEventListener('pointerup', releaseStick);
  stick.addEventListener('pointercancel', releaseStick);

  const onKeyDown = e => input.keys[e.code] = true;
  const onKeyUp = e => input.keys[e.code] = false;

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);

  const canvas = renderer.domElement;

  const onLookDown = e => {
    if (stick.contains(e.target)) return;
    lookPointer = e.pointerId;
    lastX = e.clientX;
  };

  const onLookMove = e => {
    if (e.pointerId !== lookPointer) return;
    input.yaw -= (e.clientX - lastX) * 0.006;
    lastX = e.clientX;
  };

  const onLookUp = e => {
    if (e.pointerId === lookPointer) lookPointer = null;
  };

  canvas.addEventListener('pointerdown', onLookDown);
  window.addEventListener('pointermove', onLookMove);
  window.addEventListener('pointerup', onLookUp);
  window.addEventListener('pointercancel', onLookUp);

  const forward = new T.Vector3();
  const right = new T.Vector3();
  const movement = new T.Vector3();
  const desiredCamera = new T.Vector3();
  const target = new T.Vector3();

  let elapsed = 0;

  function update(deltaTime = 0.016) {
    const dt = Math.min(Math.max(deltaTime || 0.016, 0), 0.05);
    elapsed += dt;

    const x =
      (input.keys.KeyD ? 1 : 0) -
      (input.keys.KeyA ? 1 : 0) +
      input.x;

    const z =
      (input.keys.KeyS ? 1 : 0) -
      (input.keys.KeyW ? 1 : 0) +
      input.y;

    movement.set(x, 0, z);

    if (movement.lengthSq() > 1) movement.normalize();

    forward.set(
      -Math.sin(input.yaw),
      0,
      -Math.cos(input.yaw)
    );

    right.set(
      Math.cos(input.yaw),
      0,
      -Math.sin(input.yaw)
    );

    const worldMove = new T.Vector3()
      .addScaledVector(right, movement.x)
      .addScaledVector(forward, -movement.z);

    const moving = worldMove.lengthSq() > 0.001;

    if (moving) {
      player.position.addScaledVector(worldMove, 3.4 * dt);

      player.rotation.y = Math.atan2(
        worldMove.x,
        worldMove.z
      );
    }

    animateCharacter(playerCharacter, elapsed, moving);

    // NPC wandering around individual home positions.
    for (const npc of npcData) {
      npc.timer -= dt;

      if (npc.timer <= 0) {
        npc.angle += (Math.random() - 0.5) * 2.5;
        npc.timer = 2 + Math.random() * 3;
      }

      const dx = Math.sin(npc.angle) * npc.speed * dt;
      const dz = Math.cos(npc.angle) * npc.speed * dt;

      const nextX = npc.root.position.x + dx;
      const nextZ = npc.root.position.z + dz;

      const homeDX = nextX - npc.home.x;
      const homeDZ = nextZ - npc.home.z;

      if (homeDX * homeDX + homeDZ * homeDZ < 36) {
        npc.root.position.x = nextX;
        npc.root.position.z = nextZ;
      } else {
        npc.angle = Math.atan2(-homeDX, -homeDZ);
      }

      npc.root.rotation.y = npc.angle;
      animateCharacter(npc.character, elapsed, true);
    }

    // Follow camera.
    const c = Math.cos(input.yaw);
    const s = Math.sin(input.yaw);

    desiredCamera.set(
      player.position.x + 6.5 * s,
      player.position.y + 3.1,
      player.position.z + 6.5 * c
    );

    camera.position.lerp(desiredCamera, 1 - Math.exp(-6 * dt));

    target.set(
      player.position.x,
      player.position.y + 1.05,
      player.position.z
    );

    camera.lookAt(target);
  }

  return {
    player,
    npcs,
    update,
    world,
    mapBounds,

    dispose() {
      ui.remove();

      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);

      canvas.removeEventListener('pointerdown', onLookDown);

      window.removeEventListener('pointermove', onLookMove);
      window.removeEventListener('pointerup', onLookUp);
      window.removeEventListener('pointercancel', onLookUp);

      scene.remove(world);
    }
  };
}
