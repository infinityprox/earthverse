
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';

/*
  EARTHVERSE HUMAN SYSTEM

  Player: 1 Male
  NPCs: 50 (25 Male + 25 Female)

  Male model:
  ./assets/citizens/models/Superhero_Male_FullBody.gltf

  Female model:
  ./assets/citizens/models/Superhero_Female_FullBody.gltf

  Usage:
  const humans = await createEarthverseHumans({
    THREE, scene, camera, renderer,
    npcCount: 50
  });

  Animation loop:
  humans.update(deltaSeconds);
*/

export async function createEarthverseHumans({
  THREE: T = THREE,
  scene,
  camera,
  renderer,
  maleModelUrl = './assets/citizens/models/Superhero_Male_FullBody.gltf',
  femaleModelUrl = './assets/citizens/models/Superhero_Female_FullBody.gltf',
  npcCount = 50
}) {
  if (!scene || !camera || !renderer) {
    throw new Error('Earthverse requires scene, camera and renderer.');
  }

  const loader = new GLTFLoader();

  // Load both character models.
  const [maleGLTF, femaleGLTF] = await Promise.all([
    loader.loadAsync(maleModelUrl),
    loader.loadAsync(femaleModelUrl)
  ]);

  // Prepare source models.
  function prepareModel(source) {
    const bounds = new T.Box3().setFromObject(source);
    const size = bounds.getSize(new T.Vector3());
    const height = Math.max(size.y, 0.001);

    return {
      source,
      scale: 1.72 / height
    };
  }

  const models = {
    male: prepareModel(maleGLTF.scene),
    female: prepareModel(femaleGLTF.scene)
  };

  // Identify common humanoid bones.
  function findRig(model) {
    const rig = {};

    const patterns = {
      hips: /hips|pelvis/i,
      spine: /spine/i,
      chest: /chest|upper.?body/i,
      leftUpperArm: /left.*upper.?arm|upper.?arm.*left|upperarm_l/i,
      rightUpperArm: /right.*upper.?arm|upper.?arm.*right|upperarm_r/i,
      leftLowerArm: /left.*forearm|forearm.*left|lowerarm_l/i,
      rightLowerArm: /right.*forearm|forearm.*right|lowerarm_r/i,
      leftUpperLeg: /left.*upper.?leg|upper.?leg.*left|thigh_l/i,
      rightUpperLeg: /right.*upper.?leg|upper.?leg.*right|thigh_r/i,
      leftLowerLeg: /left.*lower.?leg|lower.?leg.*left|calf_l/i,
      rightLowerLeg: /right.*lower.?leg|lower.?leg.*right|calf_r/i
    };

    model.traverse(object => {
      if (!object.isBone) return;

      const name = object.name.replace(/[\s.-]/g, '_');

      for (const [key, pattern] of Object.entries(patterns)) {
        if (!rig[key] && pattern.test(name)) {
          rig[key] = object;
        }
      }
    });

    return rig;
  }

  // Store original bone rotations.
  function createCharacter(gender) {
    const data = models[gender];
    const model = cloneSkeleton(data.source);

    model.scale.setScalar(data.scale);

    model.traverse(object => {
      if (object.isMesh) {
        object.castShadow = true;
        object.receiveShadow = true;
        object.frustumCulled = true;
      }
    });

    model.updateMatrixWorld(true);

    const bounds = new T.Box3().setFromObject(model);
    model.position.y -= bounds.min.y;

    const rig = findRig(model);
    const baseRotations = {};

    for (const [key, bone] of Object.entries(rig)) {
      baseRotations[key] = {
        x: bone.rotation.x,
        y: bone.rotation.y,
        z: bone.rotation.z
      };
    }

    return {
      model,
      rig,
      baseRotations,
      gender,
      phase: Math.random() * Math.PI * 2
    };
  }

  // Animate legs and arms procedurally.
  function animateCharacter(character, time, walking) {
    const { rig, baseRotations, phase } = character;
    const amount = walking ? 0.65 : 0;
    const swing = Math.sin(time * 8 + phase) * amount;

    function rotate(key, x, y = 0, z = 0) {
      const bone = rig[key];
      const base = baseRotations[key];

      if (!bone || !base) return;

      bone.rotation.x = base.x + x;
      bone.rotation.y = base.y + y;
      bone.rotation.z = base.z + z;
    }

    // Opposite arm and leg movement.
    rotate('leftUpperLeg', swing);
    rotate('rightUpperLeg', -swing);

    rotate('leftLowerLeg', Math.max(0, -swing) * 0.7);
    rotate('rightLowerLeg', Math.max(0, swing) * 0.7);

    rotate('leftUpperArm', -swing * 0.75);
    rotate('rightUpperArm', swing * 0.75);

    rotate('leftLowerArm', 0);
    rotate('rightLowerArm', 0);

    rotate('spine', 0, 0, walking ? Math.sin(time * 8 + phase) * 0.025 : 0);
    rotate('chest', 0, 0, 0);
  }

  // Main human world.
  const world = new T.Group();
  world.name = 'EARTHVERSE_HUMAN_SYSTEM';
  scene.add(world);

  // Player character.
  const player = new T.Group();
  player.name = 'EARTHVERSE_PLAYER';

  const playerCharacter = createCharacter('male');
  player.add(playerCharacter.model);
  world.add(player);

  player.position.set(0, 0, 4);

  // NPC citizens.
  const npcs = [];
  const npcData = [];

  const totalNPCs = Math.max(0, Math.floor(npcCount));

  for (let i = 0; i < totalNPCs; i++) {
    const gender = i % 2 === 0 ? 'male' : 'female';

    const root = new T.Group();
    root.name = `EARTHVERSE_AI_CITIZEN_${i + 1}`;

    const character = createCharacter(gender);
    root.add(character.model);

    const column = i % 10;
    const row = Math.floor(i / 10);

    root.position.set(
      (column - 4.5) * 3.2,
      0,
      -8 - row * 5
    );

    world.add(root);

    const npc = {
      root,
      character,
      gender,
      home: root.position.clone(),
      angle: Math.random() * Math.PI * 2,
      speed: 0.45 + Math.random() * 0.35,
      changeIn: 1 + Math.random() * 3,
      walking: true,
      phase: Math.random() * Math.PI * 2
    };

    npcs.push(root);
    npcData.push(npc);
  }

  // Mobile joystick interface.
  const ui = document.createElement('div');
  ui.id = 'earthverse-human-controls';

  ui.innerHTML = `
    <style>
      #earthverse-human-controls {
        position: fixed;
        inset: 0;
        z-index: 30;
        pointer-events: none;
        font-family: system-ui, sans-serif;
      }

      #ev-stick {
        position: absolute;
        left: 22px;
        bottom: 26px;
        width: 116px;
        height: 116px;
        border-radius: 50%;
        background: #07152288;
        border: 2px solid #ffffff66;
        pointer-events: auto;
        touch-action: none;
      }

      #ev-knob {
        position: absolute;
        left: 34px;
        top: 34px;
        width: 44px;
        height: 44px;
        border-radius: 50%;
        background: #dceeffdd;
        border: 2px solid white;
        box-shadow: 0 2px 12px #0008;
      }

      #ev-hint {
        position: absolute;
        left: 22px;
        bottom: 148px;
        color: white;
        background: #07152299;
        padding: 5px 9px;
        border-radius: 8px;
        font-size: 11px;
      }

      @media(min-width:900px) {
        #ev-stick {
          width: 130px;
          height: 130px;
        }

        #ev-knob {
          left: 39px;
          top: 39px;
        }
      }
    </style>

    <div id="ev-hint">
      MOVE · WASD / JOYSTICK · DRAG TO LOOK
    </div>

    <div id="ev-stick">
      <div id="ev-knob"></div>
    </div>
  `;

  document.body.appendChild(ui);

  const stick = ui.querySelector('#ev-stick');
  const knob = ui.querySelector('#ev-knob');

  const input = {
    x: 0,
    y: 0,
    keys: Object.create(null),
    yaw: 0
  };

  let stickPointer = null;
  let lookPointer = null;
  let lastX = 0;

  const center = () => ({
    x: stick.clientWidth / 2,
    y: stick.clientHeight / 2
  });

  function stickMove(event) {
    const rect = stick.getBoundingClientRect();
    const c = center();

    const dx = event.clientX - rect.left - c.x;
    const dy = event.clientY - rect.top - c.y;

    const max = rect.width * 0.34;
    const length = Math.hypot(dx, dy) || 1;
    const factor = Math.min(1, max / length);

    input.x = dx * factor / max;
    input.y = dy * factor / max;

    knob.style.transform =
      `translate(${input.x * max}px, ${input.y * max}px)`;
  }

  stick.addEventListener('pointerdown', event => {
    stickPointer = event.pointerId;
    stick.setPointerCapture(event.pointerId);
    stickMove(event);
  });

  stick.addEventListener('pointermove', event => {
    if (event.pointerId === stickPointer) {
      stickMove(event);
    }
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

  // Keyboard controls.
  const onKeyDown = event => {
    input.keys[event.code] = true;
  };

  const onKeyUp = event => {
    input.keys[event.code] = false;
  };

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);

  // Camera drag controls.
  const canvas = renderer.domElement;

  const onLookDown = event => {
    if (stick.contains(event.target)) return;

    lookPointer = event.pointerId;
    lastX = event.clientX;
  };

  const onLookMove = event => {
    if (event.pointerId !== lookPointer) return;

    input.yaw -= (event.clientX - lastX) * 0.006;
    lastX = event.clientX;
  };

  const onLookUp = event => {
    if (event.pointerId === lookPointer) {
      lookPointer = null;
    }
  };

  canvas.addEventListener('pointerdown', onLookDown);
  window.addEventListener('pointermove', onLookMove);
  window.addEventListener('pointerup', onLookUp);
  window.addEventListener('pointercancel', onLookUp);

  // Camera and movement variables.
  const clock = new T.Clock();

  const desired = new T.Vector3();
  const lookAt = new T.Vector3();
  const forward = new T.Vector3();
  const right = new T.Vector3();
  const move = new T.Vector3();
  const worldMove = new T.Vector3();

  const cameraOffset = new T.Vector3(0, 3.1, 6.5);

  let elapsed = 0;

  // Main update function.
  function update(deltaTime) {
    let dt = Number.isFinite(deltaTime)
      ? deltaTime
      : clock.getDelta();

    dt = Math.min(Math.max(dt, 0), 0.05);
    elapsed += dt;

    // Read player input.
    const kx =
      (input.keys.KeyD || input.keys.ArrowRight ? 1 : 0) -
      (input.keys.KeyA || input.keys.ArrowLeft ? 1 : 0) +
      input.x;

    const ky =
      (input.keys.KeyS || input.keys.ArrowDown ? 1 : 0) -
      (input.keys.KeyW || input.keys.ArrowUp ? 1 : 0) +
      input.y;

    move.set(kx, 0, ky);

    if (move.lengthSq() > 1) {
      move.normalize();
    }

    const heading = input.yaw;

    forward.set(
      -Math.sin(heading),
      0,
      -Math.cos(heading)
    );

    right.set(
      Math.cos(heading),
      0,
      -Math.sin(heading)
    );

    worldMove.set(0, 0, 0)
      .addScaledVector(right, move.x)
      .addScaledVector(forward, -move.z);

    const playerMoving = worldMove.lengthSq() > 0.0001;

    // Move player.
    if (playerMoving) {
      const speed = 3.4;

      player.position.addScaledVector(worldMove, speed * dt);

      player.rotation.y = Math.atan2(
        worldMove.x,
        worldMove.z
      );
    }

    animateCharacter(
      playerCharacter,
      elapsed,
      playerMoving
    );

    // NPC AI movement and walking.
    for (const npc of npcData) {
      npc.changeIn -= dt;

      if (npc.changeIn <= 0) {
        npc.angle += (Math.random() - 0.5) * 2.4;
        npc.changeIn = 2 + Math.random() * 4;
      }

      const nx = Math.sin(npc.angle);
      const nz = Math.cos(npc.angle);

      npc.root.position.x += nx * npc.speed * dt;
      npc.root.position.z += nz * npc.speed * dt;

      const dx = npc.root.position.x - npc.home.x;
      const dz = npc.root.position.z - npc.home.z;

      // Keep NPCs near their home positions.
      if (dx * dx + dz * dz > 100) {
        npc.angle = Math.atan2(-dx, -dz);
      }

      npc.root.rotation.y = Math.atan2(nx, nz);

      animateCharacter(
        npc.character,
        elapsed,
        true
      );
    }

    // Third-person follow camera.
    const c = Math.cos(heading);
    const s = Math.sin(heading);

    desired.set(
      player.position.x + cameraOffset.x * c + cameraOffset.z * s,
      player.position.y + cameraOffset.y,
      player.position.z - cameraOffset.x * s + cameraOffset.z * c
    );

    camera.position.lerp(
      desired,
      1 - Math.exp(-6 * dt)
    );

    lookAt.set(
      player.position.x,
      player.position.y + 1.05,
      player.position.z
    );

    camera.lookAt(lookAt);
  }

  // Return system API.
  return {
    player,
    npcs,
    update,

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
