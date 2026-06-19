import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

// ── Scene setup ──────────────────────────────────────────────
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xf5f5f5);

const camera = new THREE.PerspectiveCamera(45, 2, 0.1, 100);
let camTarget = new THREE.Vector3(0, 1.0, 0);
const camOffset = new THREE.Vector3(-0.18, 0.3, 3.5);
camera.position.copy(camTarget).add(camOffset);
camera.lookAt(camTarget);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(1); // force 1:1 to avoid DPI canvas sizing issues
renderer.shadowMap.enabled = true;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;
document.getElementById('viewer').appendChild(renderer.domElement);
renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault());
renderer.domElement.addEventListener('mousedown', (e) => { if (e.button === 2) e.preventDefault(); });

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.copy(camTarget);
controls.enableDamping = true;
controls.dampingFactor = 0.1;
controls.minDistance = 0.3;
controls.maxDistance = 8;
controls.maxPolarAngle = Math.PI * 0.85;
controls.enablePan = true;
controls.panSpeed = 0.8;
controls.mouseButtons = {
  LEFT: THREE.MOUSE.ROTATE,
  MIDDLE: THREE.MOUSE.PAN,
  RIGHT: null // disabled, conflicts with browser gesture
};
controls.update();

// ── Fly controls ──────────────────────────────────────────────
const flyControls = new PointerLockControls(camera, renderer.domElement);
let flyMode = false;
let flySpeedMul = 1.0;
const keys = { w: false, a: false, s: false, d: false, q: false, e: false, shift: false };
const flyClock = new THREE.Clock();

function enableFly() {
  controls.enabled = false;
  flyControls.enabled = true;
  flyControls.lock();
}

function disableFly() {
  flyMode = false;
  flyControls.enabled = false;
  flyControls.unlock();
  controls.enabled = true;
  document.getElementById('flyBtn').textContent = '飞行模式';
}

flyControls.addEventListener('lock', () => {
  flyMode = true;
  document.getElementById('flyBtn').textContent = '飞行中 (ESC退出)';
  console.log('[Fly] 已锁定 | WASD移动 | 鼠标转向 | Shift加速 | Q/E升降 | ESC退出');
});
flyControls.addEventListener('unlock', () => {
  if (flyMode) disableFly();
});

// Keyboard controls
document.addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  if (k === 'f' && !flyMode && !flyReady) {
    e.preventDefault();
    flyReady = true;
    document.getElementById('flyBtn').textContent = '点击画面进入飞行...';
    return;
  }
  if (flyMode && k in keys) { keys[k] = true; e.preventDefault(); }
});
document.addEventListener('keyup', (e) => {
  const k = e.key.toLowerCase();
  if (k in keys) { keys[k] = false; e.preventDefault(); }
});

// ── Animation ──────────────────────────────────────────────────
let animating = false;
let animTime = 0;

function toggleAnim() {
  animating = !animating;
  animTime = 0;
  const btn = document.getElementById('animBtn');
  btn.textContent = animating ? '停止动画' : '播放动画';
  if (animating) {
    // Set base pose for wave
    const pose = (n, x, y, z) => {
      const b = boneMap.get(n);
      if (b) { if (x != null) b.rotation.x = x; if (y != null) b.rotation.y = y; if (z != null) b.rotation.z = z; }
    };
    pose('Left_shoulder_083', 0.6, -0.3, -0.8);
    pose('Left_elbow_086', 0.4, 0, 0.6);
    pose('Left_wrist_088', 0, 2.0, 0);
    pose('Head_08', 0, -0.2, 0);
    // 右手贴身（默认+滑条偏移）
    const rsDef = boneDefaults.get('Right_shoulder_058');
    const rwDef = boneDefaults.get('Right_wrist_063');
    if (rsDef) { const b = boneMap.get('Right_shoulder_058'); if (b) b.rotation.y = rsDef.y - 0.524; }
    if (rwDef) { const b = boneMap.get('Right_wrist_063'); if (b) b.rotation.x = rwDef.x - 0.297; }
  } else {
    // Reset on stop
    boneDefaults.forEach((d, n) => { const b = boneMap.get(n); if (b) b.rotation.set(d.x, d.y, d.z); });
  }
}

// Click canvas to lock when in fly-ready state
let flyReady = false;
renderer.domElement.addEventListener('click', () => {
  if (flyReady && !flyMode) {
    flyReady = false;
    enableFly();
  }
});

// ── Lighting ─────────────────────────────────────────────────
scene.add(new THREE.AmbientLight(0xffffff, 0.6));
const key = new THREE.DirectionalLight(0xffffff, 2.5);
key.position.set(5, 8, 5);
scene.add(key);
const fill = new THREE.DirectionalLight(0x8899cc, 0.8);
fill.position.set(-3, 2, -3);
scene.add(fill);
const rim = new THREE.DirectionalLight(0xffccaa, 1.2);
rim.position.set(0, 0.5, -5);
scene.add(rim);

// Grid floor
const grid = new THREE.GridHelper(6, 20, 0xcccccc, 0xe8e8e8);
grid.position.y = -0.01;
scene.add(grid);

// ── State ────────────────────────────────────────────────────
let modelGroup = null;
let skeleton = null;
const boneMap = new Map();        // name → THREE.Bone
const boneDefaults = new Map();   // name → { rotation: Euler }
const skeletonHelperGroup = new THREE.Group();
scene.add(skeletonHelperGroup);

// ── GLTF Loader ──────────────────────────────────────────────
const loader = new GLTFLoader();
loader.load(
  '/SilverWolf/scene.gltf',
  (gltf) => {
    modelGroup = gltf.scene;

    // Center model in world space
    scene.add(modelGroup);
    modelGroup.updateWorldMatrix(true, true);
    const box = new THREE.Box3().setFromObject(modelGroup);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    console.log(`[SilverWolf] BBox center: ${center.x.toFixed(3)}, ${center.y.toFixed(3)}, ${center.z.toFixed(3)}`);
    console.log(`[SilverWolf] BBox size: ${size.x.toFixed(3)}, ${size.y.toFixed(3)}, ${size.z.toFixed(3)}`);

    modelGroup.position.set(-center.x, -box.min.y, -center.z);
    camTarget.set(0, (box.max.y - box.min.y) / 2, 0);
    controls.target.copy(camTarget);
    camera.position.copy(camTarget).add(camOffset);
    controls.update();
    // Apply cel-shading with toon ramp textures
    const texLoader = new THREE.TextureLoader();
    const toonRamp = texLoader.load('/SilverWolf/textures/toon_ramp1.png');
    toonRamp.minFilter = THREE.NearestFilter;
    toonRamp.magFilter = THREE.NearestFilter;

    gltf.scene.traverse((child) => {
      if (child.isMesh && child.material) {
        const mats = Array.isArray(child.material) ? child.material : [child.material];
        mats.forEach((mat, i) => {
          if (mat.isMeshStandardMaterial || mat.isMeshPhongMaterial || mat.isMeshBasicMaterial) {
            const oldMap = mat.map;
            const newMat = new THREE.MeshToonMaterial({
              map: oldMap,
              gradientMap: toonRamp,
              color: mat.color || new THREE.Color(1, 1, 1),
            });
            if (Array.isArray(child.material)) {
              child.material[i] = newMat;
            } else {
              child.material = newMat;
            }
          }
        });
      }
    });
    console.log('[SilverWolf] Cel-shading applied');

    window.__modelGroup = modelGroup;
    window.__camera = camera;
    window.__controls = controls;
    window.__camTarget = camTarget;
    window.__camOffset = camOffset;
    window.__bones = boneMap;
    window.__pose = (name, x, y, z) => {
      const b = boneMap.get(name);
      if (b) { if (x != null) b.rotation.x = x; if (y != null) b.rotation.y = y; if (z != null) b.rotation.z = z; }
    };
    window.__resetPose = () => boneDefaults.forEach((d, n) => { const b = boneMap.get(n); if (b) b.rotation.set(d.x, d.y, d.z); });

    // Extract skeleton from SkinnedMesh
    gltf.scene.traverse((child) => {
      if (child.isSkinnedMesh && child.skeleton) {
        skeleton = child.skeleton;
        // Collect all bones
        skeleton.bones.forEach((bone) => {
          boneMap.set(bone.name, bone);
          boneDefaults.set(bone.name, {
            x: bone.rotation.x,
            y: bone.rotation.y,
            z: bone.rotation.z,
          });
        });
      }
    });

    if (skeleton) {
      console.log(`[SilverWolf] Loaded skeleton with ${skeleton.bones.length} bones`);
      buildBoneHelper();
      buildUI();
    }

    document.getElementById('info').textContent =
      `骨骼数: ${boneMap.size} | 左键旋转 | 中键平移 | 滚轮缩放`;

    const resetCamBtn = document.getElementById('resetCamBtn');
    resetCamBtn.style.display = '';
    resetCamBtn.onclick = () => {
      controls.target.copy(camTarget);
      camera.position.copy(camTarget).add(camOffset);
      controls.update();
    };

    // Panel toggle
    const toggleBtn = document.getElementById('toggleBtn');
    const panel = document.getElementById('panel');
    toggleBtn.style.display = '';
    toggleBtn.textContent = '☰';
    toggleBtn.title = '打开骨骼控制面板';

    // Fly mode button
    const flyBtn = document.getElementById('flyBtn');
    flyBtn.style.display = '';
    flyBtn.onclick = () => {
      if (flyMode) { disableFly(); return; }
      flyReady = !flyReady;
      flyBtn.textContent = flyReady ? '点击画面进入飞行...' : '飞行模式';
    };

    // Fly speed slider
    const flySpeedDiv = document.getElementById('flySpeed');
    const flySpeedSlider = document.getElementById('flySpeedSlider');
    const flySpeedVal = document.getElementById('flySpeedVal');
    flySpeedDiv.style.display = '';
    flySpeedSlider.oninput = () => {
      flySpeedMul = parseFloat(flySpeedSlider.value);
      flySpeedVal.textContent = flySpeedMul.toFixed(1);
    };

    // Animation button
    const animBtn = document.getElementById('animBtn');
    animBtn.style.display = '';
    animBtn.onclick = toggleAnim;

    toggleBtn.onclick = () => {
      const visible = panel.classList.toggle("visible");
      toggleBtn.textContent = visible ? "✕" : "☰";
      toggleBtn.title = visible ? "关闭骨骼控制面板" : "打开骨骼控制面板";
      // Resize renderer after panel show/hide
    };
  },
  (progress) => {
    const pct = progress.total ? Math.round(progress.loaded / progress.total * 100) : 0;
    document.getElementById('info').textContent = `加载中... ${pct}%`;
  },
  (err) => {
    document.getElementById('info').textContent = '加载失败: ' + err.message;
    console.error(err);
  }
);

// ── Skeleton visualizer ──────────────────────────────────────
function buildBoneHelper() {
  skeletonHelperGroup.clear();
  if (!skeleton) return;

  const boneMat = new THREE.MeshBasicMaterial({ color: 0xe94560, depthTest: false });
  const boneGeo = new THREE.SphereGeometry(0.008, 6, 6);
  const lineMat = new THREE.LineBasicMaterial({ color: 0xcc3355, transparent: true, opacity: 0.6, depthTest: false });

  skeleton.bones.forEach((bone) => {
    if (!bone.parent || !skeleton.bones.includes(bone.parent)) return;
    const worldPos = new THREE.Vector3();
    const parentWorldPos = new THREE.Vector3();
    bone.getWorldPosition(worldPos);
    bone.parent.getWorldPosition(parentWorldPos);

    const lineGeo = new THREE.BufferGeometry().setFromPoints([parentWorldPos, worldPos]);
    skeletonHelperGroup.add(new THREE.Line(lineGeo, lineMat));

    const dot = new THREE.Mesh(boneGeo, boneMat);
    dot.position.copy(worldPos);
    skeletonHelperGroup.add(dot);
  });

  console.log('[SilverWolf] Bone helper built');
}

// ── UI Builder ───────────────────────────────────────────────
function buildUI() {
  const panel = document.getElementById('panel');
  panel.innerHTML = '';

  // Title
  const title = document.createElement('h2');
  title.textContent = '银狼 · 骨骼驱动';
  panel.appendChild(title);

  // Reset all button
  const resetBtn = document.createElement('button');
  resetBtn.textContent = '重置全部骨骼';
  resetBtn.className = 'reset';
  resetBtn.onclick = resetAllBones;
  panel.appendChild(resetBtn);

  // Toggle skeleton viz
  const vizBtn = document.createElement('button');
  vizBtn.textContent = '切换骨骼显示';
  vizBtn.onclick = () => {
    skeletonHelperGroup.visible = !skeletonHelperGroup.visible;
    vizBtn.textContent = skeletonHelperGroup.visible ? '隐藏骨骼' : '显示骨骼';
  };
  panel.appendChild(vizBtn);

  // Reset camera button
  const camBtn = document.createElement('button');
  camBtn.textContent = '视角归位';
  camBtn.className = 'reset';
  camBtn.onclick = () => {
    controls.target.copy(camTarget);
    camera.position.copy(camTarget).add(camOffset);
    controls.update();
  };
  panel.appendChild(camBtn);

  // Bone groups to expose
  const groups = [
    { name: '头部', bones: ['Head_08', 'Neck_07'] },
    { name: '躯干', bones: ['Spine_05', 'Chest_06', 'Hips_04'] },
    { name: '右臂', bones: ['Right_shoulder_058', 'Right_arm_059', 'Right_elbow_061', 'Right_wrist_063'] },
    { name: '左臂', bones: ['Left_shoulder_083', 'Left_arm_084', 'Left_elbow_086', 'Left_wrist_088'] },
    { name: '右手指', bones: [
      'MiddleFinger1_R_064', 'MiddleFinger2_R_065', 'MiddleFinger3_R_066',
      'IndexFinger1_R_067', 'IndexFinger2_R_068', 'IndexFinger3_R_069',
      'Thumb0_R_070', 'Thumb1_R_071', 'Thumb2_R_072',
      'RingFinger1_R_073', 'RingFinger2_R_074', 'RingFinger3_R_075',
      'LittleFinger1_R_076', 'LittleFinger2_R_077', 'LittleFinger3_R_078',
    ]},
    { name: '左手指', bones: [
      'MiddleFinger1_L_089', 'MiddleFinger2_L_090', 'MiddleFinger3_L_091',
      'IndexFinger1_L_092', 'IndexFinger2_L_093', 'IndexFinger3_L_094',
      'Thumb0_L_095', 'Thumb1_L_096', 'Thumb2_L_097',
      'RingFinger1_L_098', 'RingFinger2_L_099', 'RingFinger3_L_0100',
      'LittleFinger1_L_0101', 'LittleFinger2_L_0102', 'LittleFinger3_L_0103',
    ]},
    { name: '右腿', bones: ['Right_leg_0126', 'Right_knee_0127', 'Right_ankle_0128', 'Right_toe_0129'] },
    { name: '左腿', bones: ['Left_leg_0131', 'Left_knee_0132', 'Left_ankle_0133', 'Left_toe_0134'] },
    { name: '头发', bones: ['HairFA1_JNT_012','HairFA2_JNT_013','HairFA3_JNT_014','HairFB1_JNT_015','HairFB2_JNT_016','HairFB3_JNT_017','HairFC1_JNT_018','HairFC2_JNT_019','HairFC3_JNT_020','HairRA1_JNT_021','HairRA2_JNT_022','HairRA3_JNT_023','HairRB1_JNT_024','HairRB2_JNT_025','HairRB3_JNT_026','HairRB4_JNT_027','HairRC1_JNT_028','HairRC2_JNT_029','HairRC3_JNT_030','HairLA1_JNT_031','HairLA2_JNT_032','HairLA3_JNT_033','HairLB1_JNT_034','HairLB2_JNT_035','HairLB3_JNT_036','HairLC1_JNT_038','HairLC2_JNT_039','HairLD1_JNT_037','HairUA1_JNT_040','HairUA2_JNT_041','HairUA3_JNT_042','HairUB1_JNT_043','HairUB2_JNT_044','HairUB3_JNT_045'] },
    { name: '辫子', bones: ['Bz_0_1_046','Bz_1_1_047','Bz_2_1_048','Bz_3_1_049','Bz_4_1_050','Bz_5_1_051','Bz_6_1_052','Bz_7_1_053','Bz_8_1_054','Bz_9_1_055','Bz_10_1_056','Bz_11_1_057'] },
    { name: '裙子', bones: ['QZ_0_0_0137','QZ_0_1_0143','QZ_0_2_0149','QZ_0_3_0155','QZ_0_4_0162','QZ_0_5_00','QZ_0_6_0174','QZ_0_7_0180','QZ_0_8_0186','QZ_0_9_0189','QZ_0_10_0178','QZ_0_11_0201','QZ_0_12_0207','QZ_1_0_0138','QZ_1_1_0144','QZ_1_2_0150','QZ_1_3_0156','QZ_1_4_0163','QZ_1_5_0169','QZ_1_6_0175','QZ_1_7_0181','QZ_1_8_0187','QZ_1_9_0190','QZ_1_10_0196','QZ_1_11_0202','QZ_1_12_0208','QZ_2_0_0139','QZ_2_1_0145','QZ_2_2_0151','QZ_2_3_0157','QZ_2_4_0164','QZ_2_5_0170','QZ_2_6_0176','QZ_2_7_0182','QZ_2_8_01','QZ_2_9_0191','QZ_2_10_0197','QZ_2_11_0203','QZ_2_12_0209','QZ_3_0_0140','QZ_3_1_0146','QZ_3_2_0152','QZ_3_3_0159','QZ_3_4_0165','QZ_3_5_0171','QZ_3_6_0177','QZ_3_7_0183','QZ_3_8_02','QZ_3_9_0192','QZ_3_10_0198','QZ_3_11_0204','QZ_3_12_0210','QZ_4_4_0166','QZ_4_5_0172','QZ_4_6_0158','QZ_4_7_0184','QZ_4_8_03','QZ_4_9_0193','QZ_4_10_0199','QZ_4_11_0205','QZ_4_12_0211','QZ_5_0_0141','QZ_5_1_0147','QZ_5_2_0153','QZ_5_3_0160','QZ_5_4_0167','QZ_5_8_0188','QZ_5_9_0194','QZ_5_10_0200','QZ_5_11_0206','QZ_5_12_0212','QZ_6_0_0142','QZ_6_1_0148','QZ_6_2_0154','QZ_6_3_0161','QZ_6_4_0168','QZ_6_5_0173','QZ_6_6_0179','QZ_6_7_0185'] },
    { name: '衣物', bones: ['QH_0_1_0217','QH_0_2_0229','QH_0_3_0241','QH_0_4_0252','QH_0_5_0262','QH_0_6_0272','QH_0_7_0280','QH_0_8_0288','QH_0_9_0275','QH_1_1_0218','QH_1_2_0230','QH_1_3_0242','QH_1_4_0253','QH_1_5_0263','QH_1_6_0273','QH_1_7_0281','QH_1_8_0289','QH_1_9_0296','QH_2_1_0219','QH_2_2_0231','QH_2_3_0243','QH_2_4_0254','QH_2_5_0264','QH_2_6_0274','QH_2_7_0282','QH_2_8_0290','QH_2_9_0297','QH_3_1_0220','QH_3_2_0232','QH_3_3_0244','QH_3_4_0235','QH_3_5_0265','QH_3_6_0255','QH_3_7_0283','QH_3_8_0291','QH_3_9_0298','QH_4_1_0221','QH_4_2_0233','QH_4_3_0245','QH_4_4_0256','QH_4_5_0266','QH_4_6_0276','QH_4_7_0284','QH_4_8_0292','QH_4_9_0299','QH_5_1_0222','QH_5_2_0234','QH_5_3_0246','QH_5_4_0257','QH_5_5_0267','QH_5_6_0277','QH_5_7_0285','QH_5_8_0293','QH_5_9_0300','QH_6_1_0223','QH_6_2_0215','QH_6_3_0247','QH_6_4_0258','QH_6_5_0268','QH_6_6_0278','QH_6_7_0286','QH_6_8_0294','QH_6_9_0301','QH_7_1_0224','QH_7_2_0236','QH_7_3_0248','QH_7_4_0259','QH_7_5_0269','QH_7_6_0279','QH_7_7_0287','QH_8_0_0213','QH_8_1_0225','QH_8_2_0237','QH_8_3_0249','QH_8_4_0260','QH_8_5_0270','QH_9_0_0214','QH_9_1_0226','QH_9_2_0238','QH_9_3_0250','QH_9_4_0261','QH_9_5_0271','QH_10_0_0195','QH_10_1_0227','QH_10_2_0239','QH_10_3_0251','QH_11_0_0216','QH_11_1_0228','QH_11_2_0240'] },
    { name: '衣摆', bones: ['YD1_0302','YD2_0303','YD3_0304','YD4_0305','YD5_0306','YD6_0307','YD7_0308','YD8_0309','YD9_0310','YD10_0311','YD11_0312','YD12_0313','YD13_0314','YD14_0295','YD15_0315','YD16_0316','YD17_0317','LD1_0117','LD2_0118','LD3_0119','LD4_0120','LD5_0121','LD6_0122','LD7_0123','LD8_0124','LD9_0125'] },
    { name: '配饰', bones: ['BeltA1_JNT_0114','BeltB1_JNT_0105','BeltB2_JNT_0106','BeltC1_JNT_0104','BeltD1_JNT_080','BeltD2_JNT_081','BeltE1_JNT_079','BeltF1_JNT_0107','BeltG1_JNT_082','BeltH1_JNT_0116','BeltK1_JNT_0115','ButtonA_JNT_0108','ButtonB_JNT_0109','ButtonA1_JNT_0136','BreastUpper2_L_0110','BreastUpper2_R_0111','Breast_L_0113','Breast_R_0112','Glass_JNT_011','Eye_L_010','Eye_R_09','Dao_0130','PhoneA1_JNT_0135'] },
  ];

  groups.forEach((group) => {
    const header = document.createElement('h3');
    header.textContent = group.name;
    header.onclick = () => {
      const div = header.nextElementSibling;
      if (div) div.style.display = div.style.display === 'none' ? '' : 'none';
    };
    panel.appendChild(header);

    const container = document.createElement('div');
    container.className = 'bone-group';

    group.bones.forEach((boneName) => {
      if (!boneMap.has(boneName)) return;

      const axes = ['X', 'Y', 'Z'];
      axes.forEach((axis) => {
        const row = document.createElement('div');
        row.className = 'bone-row';

        const label = document.createElement('label');
        label.textContent = (axis === 'X' ? simplifyName(boneName) : '');
        row.appendChild(label);

        const axisSpan = document.createElement('span');
        axisSpan.className = 'axis';
        axisSpan.textContent = axis;
        row.appendChild(axisSpan);

        const slider = document.createElement('input');
        slider.type = 'range';
        slider.min = -Math.PI;
        slider.max = Math.PI;
        slider.step = 0.01;
        slider.value = 0;
        slider.dataset.bone = boneName;
        slider.dataset.axis = axis.toLowerCase();
        row.appendChild(slider);

        const valSpan = document.createElement('span');
        valSpan.className = 'val';
        valSpan.textContent = '0°';
        row.appendChild(valSpan);

        slider.addEventListener('input', () => {
          const bone = boneMap.get(boneName);
          if (!bone) return;
          const val = parseFloat(slider.value);
          const def = boneDefaults.get(boneName);
          bone.rotation[axis.toLowerCase()] = def[axis.toLowerCase()] + val;
          valSpan.textContent = Math.round(val * 180 / Math.PI) + '°';

          // Update skeleton helper
          if (skeletonHelperGroup.visible) buildBoneHelper();
        });

        container.appendChild(row);
      });
    });

    panel.appendChild(container);
  });

  // Info: how to use
  const info = document.createElement('p');
  info.style.cssText = 'font-size:10px;color:#666;margin-top:12px;line-height:1.5;';
  info.innerHTML = '左键旋转 | 中键平移<br>滚轮缩放 | 滑块控制骨骼';
  panel.appendChild(info);
}

function simplifyName(name) {
  return name
    .replace(/_/g, ' ')
    .replace(/Right /g, 'R.')
    .replace(/Left /g, 'L.')
    .replace(/MiddleFinger/g, 'Mid')
    .replace(/IndexFinger/g, 'Idx')
    .replace(/LittleFinger/g, 'Lit')
    .replace(/RingFinger/g, 'Rng')
    .replace(/Finger/g, '')
    .replace(/shoulder/g, 'Shldr')
    .replace(/elbow/g, 'Elbw')
    .replace(/wrist/g, 'Wrst')
    .replace(/ankle/g, 'Ankl')
    .replace(/knee/g, 'Knee')
    .replace(/ _/g, ' ')
    .trim();
}

function resetAllBones() {
  boneDefaults.forEach((def, name) => {
    const bone = boneMap.get(name);
    if (bone) {
      bone.rotation.set(def.x, def.y, def.z);
    }
  });
  // Reset all sliders
  document.querySelectorAll('input[type="range"]').forEach((s) => {
    s.value = 0;
    const valSpan = s.parentElement?.querySelector('.val');
    if (valSpan) valSpan.textContent = '0°';
  });
  if (skeletonHelperGroup.visible) buildBoneHelper();
  console.log('[SilverWolf] All bones reset');
}

// ── Render loop ──────────────────────────────────────────────
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(flyClock.getDelta(), 0.1); // cap to avoid jumps

  if (flyMode) {
    const speed = (keys.shift ? 4 : 1.6) * flySpeedMul;
    const dir = new THREE.Vector3();
    if (keys.w) camera.getWorldDirection(dir), camera.position.addScaledVector(dir, speed * dt);
    if (keys.s) camera.getWorldDirection(dir), camera.position.addScaledVector(dir, -speed * dt);
    if (keys.a) camera.getWorldDirection(dir), dir.cross(camera.up).normalize(), camera.position.addScaledVector(dir, -speed * dt);
    if (keys.d) camera.getWorldDirection(dir), dir.cross(camera.up).normalize(), camera.position.addScaledVector(dir, speed * dt);
    if (keys.q) camera.position.y -= speed * dt;
    if (keys.e) camera.position.y += speed * dt;
  } else {
    controls.update();
  }

  // Wave animation
  if (animating) {
    animTime += dt;
    const wave = Math.sin(animTime * 6); // ~1Hz oscillation
    const pose = (n, x, y, z) => {
      const b = boneMap.get(n);
      if (b) { if (x != null) b.rotation.x = x; if (y != null) b.rotation.y = y; if (z != null) b.rotation.z = z; }
    };
    // Oscillate elbow bend and wrist
    pose('Left_elbow_086', 0.4 + wave * 0.15, 0, 0.6);
    pose('Left_wrist_088', 0, 2.0 + wave * 0.3, 0);
    // Slight shoulder bob
    pose('Left_shoulder_083', 0.6 + wave * 0.05, -0.3, -0.8 + wave * 0.08);
  }

  renderer.render(scene, camera);
}

// ── Resize ───────────────────────────────────────────────────
function resize() {
  const viewer = document.getElementById('viewer');
  const w = viewer.clientWidth;
  const h = viewer.clientHeight;
  renderer.setSize(w, h, true);
  camera.aspect = w / Math.max(h, 1);
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

animate();
console.log('[SilverWolf] App started. Open DevTools console for logs.');
