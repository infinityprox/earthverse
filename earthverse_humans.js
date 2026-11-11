import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

/*
 EARTHVERSE Human Integration
 Call after your Three.js scene, camera and renderer are created:
 const humans = await createEarthverseHumans({ THREE, scene, camera, renderer });
 In your existing animation loop call: humans.update(deltaSeconds);
*/
export async function createEarthverseHumans({ THREE: T = THREE, scene, camera, renderer,
  modelUrl = './assets/jane_doe_blender_release_optimized.glb', npcCount = 5 }) {
  const loader = new GLTFLoader();
  const gltf = await loader.loadAsync(modelUrl);
  const source = gltf.scene;

  // Fit the supplied model to a nominal 1.72 m character height.
  const sourceBox = new T.Box3().setFromObject(source);
  const sourceSize = sourceBox.getSize(new T.Vector3());
  const sourceHeight = Math.max(sourceSize.y, 0.001);
  const fitScale = 1.72 / sourceHeight;

  function makeCharacter() {
    const model = source.clone(true);
    model.scale.setScalar(fitScale);
    model.traverse(o => {
      if (o.isMesh) {
        o.castShadow = false;
        o.receiveShadow = false;
        o.frustumCulled = true;
        if (o.material) {
          const mats = Array.isArray(o.material) ? o.material : [o.material];
          for (const m of mats) {
            m.side = T.FrontSide;
            m.needsUpdate = true;
          }
        }
      }
    });
    // Normalize the model's bottom to ground level.
    const b = new T.Box3().setFromObject(model);
    model.position.y -= b.min.y;
    return model;
  }

  const world = new T.Group();
  world.name = 'EARTHVERSE_HUMAN_SYSTEM';
  scene.add(world);

  const player = new T.Group();
  player.name = 'EARTHVERSE_PLAYER';
  player.add(makeCharacter());
  world.add(player);
  player.position.set(0, 0, 4);

  const npcs = [];
  for (let i = 0; i < Math.max(0, npcCount); i++) {
    const root = new T.Group();
    root.name = `EARTHVERSE_AI_CITIZEN_${i + 1}`;
    root.add(makeCharacter());
    root.position.set((i % 3 - 1) * 5, 0, -7 - Math.floor(i / 3) * 5);
    world.add(root);
    npcs.push({
      root,
      home: root.position.clone(),
      angle: Math.random() * Math.PI * 2,
      speed: 0.45 + Math.random() * 0.25,
      changeIn: 1 + Math.random() * 3
    });
  }

  // Mobile touch joystick + keyboard controls; self-contained overlay.
  const ui = document.createElement('div');
  ui.id = 'earthverse-human-controls';
  ui.innerHTML = `
    <style>
      #earthverse-human-controls{position:fixed;inset:0;z-index:30;pointer-events:none;font-family:system-ui,sans-serif}
      #ev-stick{position:absolute;left:22px;bottom:26px;width:116px;height:116px;border-radius:50%;
        background:#07152288;border:2px solid #ffffff66;pointer-events:auto;touch-action:none}
      #ev-knob{position:absolute;left:34px;top:34px;width:44px;height:44px;border-radius:50%;
        background:#dceeffdd;border:2px solid #fff;box-shadow:0 2px 12px #0008}
      #ev-hint{position:absolute;left:22px;bottom:148px;color:#fff;background:#07152299;
        padding:5px 9px;border-radius:8px;font-size:11px}
      @media(min-width:900px){#ev-stick{width:130px;height:130px}#ev-knob{left:39px;top:39px}}
    </style>
    <div id="ev-hint">MOVE · WASD / JOYSTICK · DRAG TO LOOK</div>
    <div id="ev-stick"><div id="ev-knob"></div></div>`;
  document.body.appendChild(ui);
  const stick = ui.querySelector('#ev-stick');
  const knob = ui.querySelector('#ev-knob');
  const input = { x: 0, y: 0, keys: Object.create(null), yaw: 0 };
  let stickPointer = null, lookPointer = null, lastX = 0;
  const center = () => ({ x: stick.clientWidth / 2, y: stick.clientHeight / 2 });
  function stickMove(e) {
    const r = stick.getBoundingClientRect(), c = center();
    const dx = e.clientX - r.left - c.x, dy = e.clientY - r.top - c.y;
    const max = r.width * 0.34, len = Math.hypot(dx, dy) || 1;
    const k = Math.min(1, max / len);
    input.x = dx * k / max; input.y = dy * k / max;
    knob.style.transform = `translate(${input.x * max}px,${input.y * max}px)`;
  }
  stick.addEventListener('pointerdown', e => {
    stickPointer = e.pointerId; stick.setPointerCapture(e.pointerId); stickMove(e);
  });
  stick.addEventListener('pointermove', e => { if (e.pointerId === stickPointer) stickMove(e); });
  function releaseStick(e) {
    if (e.pointerId !== stickPointer) return;
    stickPointer = null; input.x = 0; input.y = 0; knob.style.transform = '';
  }
  stick.addEventListener('pointerup', releaseStick);
  stick.addEventListener('pointercancel', releaseStick);

  const onKeyDown = e => { input.keys[e.code] = true; };
  const onKeyUp = e => { input.keys[e.code] = false; };
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);

  // Drag on the canvas to orbit the third-person camera.
  const canvas = renderer?.domElement;
  const onLookDown = e => { if (e.target === stick || stick.contains(e.target)) return;
    lookPointer = e.pointerId; lastX = e.clientX; };
  const onLookMove = e => { if (e.pointerId !== lookPointer) return;
    input.yaw -= (e.clientX - lastX) * 0.006; lastX = e.clientX; };
  const onLookUp = e => { if (e.pointerId === lookPointer) lookPointer = null; };
  canvas?.addEventListener('pointerdown', onLookDown);
  window.addEventListener('pointermove', onLookMove);
  window.addEventListener('pointerup', onLookUp);

  const clock = new T.Clock();
  const cameraOffset = new T.Vector3(0, 3.1, 6.5);
  const desired = new T.Vector3();
  const lookAt = new T.Vector3();
  const forward = new T.Vector3(), right = new T.Vector3();
  const move = new T.Vector3();
  let elapsed = 0;

  function update(dt) {
    dt = Math.min(Math.max(dt || clock.getDelta(), 0), 0.05);
    elapsed += dt;
    const kx = (input.keys.KeyD || input.keys.ArrowRight ? 1 : 0)
             - (input.keys.KeyA || input.keys.ArrowLeft ? 1 : 0) + input.x;
    const ky = (input.keys.KeyS || input.keys.ArrowDown ? 1 : 0)
             - (input.keys.KeyW || input.keys.ArrowUp ? 1 : 0) + input.y;
    move.set(kx, 0, ky);
    if (move.lengthSq() > 1) move.normalize();

    const speed = 3.4;
    const heading = input.yaw;
    forward.set(-Math.sin(heading), 0, -Math.cos(heading));
    right.set(Math.cos(heading), 0, -Math.sin(heading));
    const worldMove = new T.Vector3()
      .addScaledVector(right, move.x)
      .addScaledVector(forward, -move.z);

    if (worldMove.lengthSq() > 0.0001) {
      player.position.addScaledVector(worldMove, speed * dt);
      player.rotation.y = Math.atan2(worldMove.x, worldMove.z);
    }

    // Simple body bob is a placeholder, not a skeletal walk animation.
    const moving = worldMove.lengthSq() > 0.0001;
    player.children[0].position.y = moving ? Math.abs(Math.sin(elapsed * 9)) * 0.035 : 0;

    // Lightweight AI citizen roaming around their spawn point.
    for (const npc of npcs) {
      npc.changeIn -= dt;
      if (npc.changeIn <= 0) {
        npc.angle += (Math.random() - 0.5) * 2.4;
        npc.changeIn = 2 + Math.random() * 4;
      }
      const nx = Math.sin(npc.angle), nz = Math.cos(npc.angle);
      npc.root.position.x += nx * npc.speed * dt;
      npc.root.position.z += nz * npc.speed * dt;
      const dx = npc.root.position.x - npc.home.x, dz = npc.root.position.z - npc.home.z;
      if (dx * dx + dz * dz > 100) npc.angle = Math.atan2(-dx, -dz);
      npc.root.rotation.y = Math.atan2(nx, nz);
    }

    // Third-person follow camera.
    const c = Math.cos(heading), s = Math.sin(heading);
    desired.set(
      player.position.x + cameraOffset.x * c + cameraOffset.z * s,
      player.position.y + cameraOffset.y,
      player.position.z - cameraOffset.x * s + cameraOffset.z * c
    );
    camera.position.lerp(desired, 1 - Math.exp(-6 * dt));
    lookAt.set(player.position.x, player.position.y + 1.05, player.position.z);
    camera.lookAt(lookAt);
  }

  return {
    player, npcs: npcs.map(n => n.root), update,
    dispose() {
      ui.remove();
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      canvas?.removeEventListener('pointerdown', onLookDown);
      window.removeEventListener('pointermove', onLookMove);
      window.removeEventListener('pointerup', onLookUp);
      scene.remove(world);
    }
  };
}
