// =====================================================================
//  ESCAPE ROOM 3D – Complete Game (v2 – Gameplay Overhaul)
// =====================================================================

// ============= CONSTANTS =============
const ADMIN_NAME = 'admin-louai';
const PUZZLE_DIGITS = ['7', '3', '7', '1', '4', '8'];
const ROOM_W = 10, ROOM_H = 3.5, ROOM_D = 8;
const PLAYER_HEIGHT = 1.6;
const MOVE_SPEED = 7.0;
const RADIO_TARGET_A = 52;  // dial A target (0-100)
const RADIO_TARGET_B = 73;  // dial B target (0-100)
const RADIO_TOLERANCE = 5;

// ============= GAME STATE =============
const state = {
    playerName: '', roomNumber: '',
    timerStart: null, timerInterval: null, elapsed: 0,
    gameStarted: false, gameEnded: false,
    isAdmin: false, overlayOpen: false,
    lockActivated: false,
    solvedPuzzles: [false, false, false, false, false, false],
    lockDigits: ['_', '_', '_', '_', '_', '_'],
    mirrorsPlaced: [false, false, false],
    mirrorsFound: [false, false, false],
    // Held items system (replaces inventory)
    heldItems: [],          // items collected by player
    activeItemIndex: -1,    // which item is currently shown in hand
    // Puzzle states
    paperBurned: false,
    paperPickedUp: false,
    lighterPickedUp: false,
    burningInProgress: false,
    phonePickedUp: false,
    filterPickedUp: false,
    filterApplied: false,
    cupPlaced: false,
    coffeeBrewing: false,
    coffeeRevealed: false,
    sculptureOnX: false,
    lampOn: false,
    radioFound: false,
    lightBeamActive: true,
    diamondHit: false,
};

// ============= THREE.JS GLOBALS =============
let scene, camera, renderer, clock;
let moveForward = false, moveBackward = false, moveLeft = false, moveRight = false;
let velocity, direction;
let raycaster, centerRay;
let interactiveObjects = [];
let isPointerLocked = false;
let isMobile = false;
let joystickData = { active: false, dx: 0, dy: 0 };
let lookData = { active: false, lastX: 0, lastY: 0 };
let euler;
let currentHover = null;

// 3D object references
let lightBeamLine, diamondMesh;
let mirrorBases = [], mirrorMeshes = [];
let paperMesh, lighterMesh, phoneMesh, filterMesh, paintingMesh;
let cupMesh, coffeeMachineMesh, sculptureMesh, deskLampMesh, xMarkMesh;
let radioMesh, doorMesh, lockScreenMesh;
let lightSpotlight;
let gltfLoader, texLoader;

// Mirror beam segments
let beamSegments = [];

// Audio context for sounds
let audioCtx;

// First-person held item system
let heldItemGroup;       // Group attached to camera for held items
let heldItemMesh = null; // Current mesh displayed in hand
let handMesh = null;     // The hand/arm mesh

// Phone camera system (in-hand)
let phoneCameraRT, phoneCameraObj, uvNumberMesh;
let phoneInHandActive = false;

// Painting textures
let paintingNormalTex, paintingRedTex;

// ============= START GAME =============
function startGame() {
    const name = document.getElementById('playerName').value.trim();
    const room = document.getElementById('roomNumber').value.trim();
    if (!name || !room) return;

    state.playerName = name;
    state.roomNumber = room;

    if (name === ADMIN_NAME) {
        state.isAdmin = true;
        document.getElementById('startScreen').classList.add('hidden');
        document.getElementById('adminPanel').classList.remove('hidden');
        loadAdminData();
        return;
    }

    document.getElementById('startScreen').classList.add('hidden');
    sendPlayerInfo();
    init3D();
    state.gameStarted = true;
    state.timerStart = Date.now();
    state.timerInterval = setInterval(updateTimer, 100);
    document.getElementById('timerDisplay').classList.remove('hidden');
    document.getElementById('heldItemsHUD').classList.remove('hidden');
    document.getElementById('lockScreenHUD').classList.remove('hidden');
    document.getElementById('crosshair').classList.remove('hidden');

    if (isMobile) {
        document.getElementById('mobileControls').classList.remove('hidden');
    }

    updateHeldItemsUI();
    updateLockUI();
}

// ============= ADMIN =============
async function loadAdminData() {
    try {
        const [rRes, pRes] = await Promise.all([
            fetch('/api/results').then(r => r.json()),
            fetch('/api/pinfo').then(r => r.json()),
        ]);
        const rb = document.getElementById('resultsBody');
        rb.innerHTML = '';
        (rRes.results || []).forEach(r => {
            const tr = document.createElement('tr');
            tr.innerHTML = `<td>${r.name}</td><td>${r.room}</td><td>${r.time}</td><td>${r.date || ''}</td>`;
            rb.appendChild(tr);
        });
        const pb = document.getElementById('playersBody');
        pb.innerHTML = '';
        (pRes.players || []).forEach(p => {
            const tr = document.createElement('tr');
            tr.innerHTML = `<td>${p.name}</td><td>${p.room}</td><td>${p.device||''}</td><td>${p.platform||''}</td><td>${p.joinTime||''}</td>`;
            pb.appendChild(tr);
        });
    } catch (e) { console.error(e); }
}

function showAdminTab(tab) {
    document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
    document.getElementById('adminResults').classList.add('hidden');
    document.getElementById('adminPlayers').classList.add('hidden');
    if (tab === 'results') {
        document.getElementById('adminResults').classList.remove('hidden');
        document.querySelectorAll('.admin-tab')[0].classList.add('active');
    } else {
        document.getElementById('adminPlayers').classList.remove('hidden');
        document.querySelectorAll('.admin-tab')[1].classList.add('active');
    }
}

// ============= PLAYER INFO =============
async function sendPlayerInfo() {
    try {
        await fetch('/api/pinfo', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: state.playerName,
                room: state.roomNumber,
                device: isMobile ? 'mobile' : 'desktop',
                platform: navigator.platform || '',
                language: navigator.language || '',
                screenWidth: screen.width,
                screenHeight: screen.height,
            }),
        });
    } catch (e) { console.error(e); }
}

// ============= TIMER =============
function updateTimer() {
    if (state.gameEnded) return;
    state.elapsed = Date.now() - state.timerStart;
    const s = Math.floor(state.elapsed / 1000);
    const m = Math.floor(s / 60);
    const sec = s % 60;
    const txt = `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
    document.getElementById('timerText').textContent = txt;
}

function getTimeString() {
    const s = Math.floor(state.elapsed / 1000);
    const m = Math.floor(s / 60);
    return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

// ============= 3D INITIALIZATION =============
function init3D() {
    isMobile = /Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || ('ontouchstart' in window);

    velocity = new THREE.Vector3();
    direction = new THREE.Vector3();
    euler = new THREE.Euler(0, 0, 0, 'YXZ');

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0e0e18);
    scene.fog = new THREE.FogExp2(0x0e0e18, 0.025);

    camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 100);
    camera.position.set(0, PLAYER_HEIGHT, 3);

    renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('gameCanvas'), antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    renderer.outputEncoding = THREE.sRGBEncoding;

    clock = new THREE.Clock();
    raycaster = new THREE.Raycaster();
    raycaster.far = 4;
    centerRay = new THREE.Vector2(0, 0);

    gltfLoader = new THREE.GLTFLoader();
    texLoader = new THREE.TextureLoader();

    // Preload painting textures
    paintingNormalTex = texLoader.load('/static/painting_normal.jpg');
    paintingRedTex = texLoader.load('/static/painting_red.jpg');
    paintingNormalTex.encoding = THREE.sRGBEncoding;
    paintingRedTex.encoding = THREE.sRGBEncoding;

    buildRoom();
    buildFurniture();
    buildPuzzleObjects();
    buildRedHerrings();
    setupLights();
    setupControls();
    setupHeldItemSystem();
    setupPhoneCamera();

    window.addEventListener('resize', onResize);
    animate();
}

// ============= FIRST-PERSON HELD ITEM SYSTEM =============
function setupHeldItemSystem() {
    heldItemGroup = new THREE.Group();
    heldItemGroup.renderOrder = 999;
    camera.add(heldItemGroup);
    scene.add(camera);

    // Create a simple hand/arm mesh
    const skinMat = new THREE.MeshStandardMaterial({ color: 0xd4a574, roughness: 0.6, metalness: 0.05 });
    // Forearm
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.25, 0.06), skinMat);
    arm.position.set(0.35, -0.45, -0.4);
    arm.rotation.x = -0.3;
    arm.rotation.z = 0.1;
    heldItemGroup.add(arm);
    // Hand
    const hand = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.04, 0.08), skinMat);
    hand.position.set(0.35, -0.32, -0.52);
    hand.rotation.x = -0.5;
    heldItemGroup.add(hand);
    handMesh = hand;
}

function getActiveItem() {
    if (state.activeItemIndex >= 0 && state.activeItemIndex < state.heldItems.length) {
        return state.heldItems[state.activeItemIndex];
    }
    return null;
}

function getActiveItemName() {
    const item = getActiveItem();
    return item ? item.name : null;
}

function showItemInHand(itemName) {
    // Remove previous held item mesh
    if (heldItemMesh) {
        heldItemGroup.remove(heldItemMesh);
        heldItemMesh = null;
    }

    if (!itemName) return;

    const group = new THREE.Group();
    group.position.set(0.32, -0.25, -0.55);

    switch (itemName) {
        case 'ورقة': {
            const paper = new THREE.Mesh(
                new THREE.PlaneGeometry(0.12, 0.16),
                new THREE.MeshStandardMaterial({ color: 0xf5f0e0, roughness: 0.9, side: THREE.DoubleSide })
            );
            paper.rotation.x = -0.3;
            group.add(paper);
            break;
        }
        case 'ولاعة': {
            const body = new THREE.Mesh(
                new THREE.BoxGeometry(0.03, 0.06, 0.02),
                new THREE.MeshStandardMaterial({ color: 0xb8b8b8, metalness: 0.7, roughness: 0.2 })
            );
            group.add(body);
            const top = new THREE.Mesh(
                new THREE.BoxGeometry(0.03, 0.015, 0.02),
                new THREE.MeshStandardMaterial({ color: 0x888888, metalness: 0.8 })
            );
            top.position.y = 0.038;
            group.add(top);
            break;
        }
        case 'هاتف': {
            const phoneBody = new THREE.Mesh(
                new THREE.BoxGeometry(0.06, 0.005, 0.11),
                new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.15, metalness: 0.7 })
            );
            group.add(phoneBody);
            // Phone screen - will be updated with camera feed
            const phoneScreen = new THREE.Mesh(
                new THREE.PlaneGeometry(0.05, 0.085),
                new THREE.MeshBasicMaterial({ color: 0x112244 })
            );
            phoneScreen.position.y = 0.003;
            phoneScreen.rotation.x = -Math.PI / 2;
            phoneScreen.name = 'phoneScreen';
            group.add(phoneScreen);
            // Camera lens
            const lens = new THREE.Mesh(
                new THREE.CylinderGeometry(0.003, 0.003, 0.003, 8),
                new THREE.MeshStandardMaterial({ color: 0x222233, metalness: 0.9 })
            );
            lens.position.set(-0.015, 0.004, -0.04);
            lens.rotation.x = Math.PI / 2;
            group.add(lens);
            group.position.set(0.25, -0.2, -0.45);
            group.rotation.x = -0.8;
            break;
        }
        case 'فلتر أحمر': {
            const filter = new THREE.Mesh(
                new THREE.PlaneGeometry(0.1, 0.13),
                new THREE.MeshStandardMaterial({ color: 0xff2222, transparent: true, opacity: 0.5, side: THREE.DoubleSide })
            );
            filter.rotation.x = -0.3;
            group.add(filter);
            break;
        }
        case 'كوب': {
            const cupBody = new THREE.Mesh(
                new THREE.CylinderGeometry(0.025, 0.02, 0.06, 12),
                new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.3 })
            );
            group.add(cupBody);
            const cupHandle = new THREE.Mesh(
                new THREE.TorusGeometry(0.013, 0.003, 6, 8, Math.PI),
                new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.3 })
            );
            cupHandle.position.set(0.028, 0, 0);
            cupHandle.rotation.z = Math.PI / 2;
            group.add(cupHandle);
            break;
        }
        case 'مجسم': {
            const mat = new THREE.MeshStandardMaterial({ color: 0x888888, metalness: 0.7, roughness: 0.3 });
            const sBase = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.01, 8), mat);
            sBase.position.y = -0.02;
            group.add(sBase);
            const sV = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.08, 0.012), mat);
            sV.position.y = 0.02;
            group.add(sV);
            const sH = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.012, 0.012), mat);
            sH.position.set(0.01, 0.05, 0);
            sH.rotation.z = 0.3;
            group.add(sH);
            break;
        }
        case 'مرآة': {
            // Handheld mirror
            const handle = new THREE.Mesh(
                new THREE.CylinderGeometry(0.008, 0.01, 0.1, 8),
                new THREE.MeshStandardMaterial({ color: 0x6b4a30, roughness: 0.5 })
            );
            handle.position.y = -0.06;
            group.add(handle);
            const frame = new THREE.Mesh(
                new THREE.CylinderGeometry(0.045, 0.045, 0.008, 16),
                new THREE.MeshStandardMaterial({ color: 0x8b6914, metalness: 0.5, roughness: 0.3 })
            );
            frame.position.y = 0.01;
            frame.rotation.x = Math.PI / 2;
            group.add(frame);
            const glass = new THREE.Mesh(
                new THREE.CylinderGeometry(0.04, 0.04, 0.005, 16),
                new THREE.MeshStandardMaterial({ color: 0xccddff, metalness: 1.0, roughness: 0.02, envMapIntensity: 2.0 })
            );
            glass.position.y = 0.01;
            glass.rotation.x = Math.PI / 2;
            group.add(glass);
            break;
        }
        default: {
            // Generic item
            const generic = new THREE.Mesh(
                new THREE.BoxGeometry(0.04, 0.04, 0.04),
                new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.5 })
            );
            group.add(generic);
            break;
        }
    }

    heldItemGroup.add(group);
    heldItemMesh = group;
}

function cycleHeldItem(direction) {
    if (state.heldItems.length === 0) return;
    state.activeItemIndex = (state.activeItemIndex + direction + state.heldItems.length) % state.heldItems.length;
    showItemInHand(state.heldItems[state.activeItemIndex].name);
    updateHeldItemsUI();

    // Handle phone camera when switching items
    if (state.heldItems[state.activeItemIndex].name === 'هاتف') {
        phoneInHandActive = true;
    } else {
        phoneInHandActive = false;
    }
}

// ============= HELD ITEMS MANAGEMENT =============
function hasItem(name) {
    return state.heldItems.some(it => it.name === name);
}

function addHeldItem(name) {
    if (hasItem(name)) return;
    state.heldItems.push({ name });
    state.activeItemIndex = state.heldItems.length - 1;
    showItemInHand(name);
    updateHeldItemsUI();

    // Check for auto-burn (lighter + paper)
    if ((name === 'ولاعة' || name === 'ورقة') && hasItem('ولاعة') && hasItem('ورقة') && !state.paperBurned && !state.burningInProgress) {
        startBurnAnimation();
    }

    // Activate phone camera when picking up phone
    if (name === 'هاتف') {
        phoneInHandActive = true;
    }
}

function removeHeldItem(name) {
    const idx = state.heldItems.findIndex(it => it.name === name);
    if (idx === -1) return;
    state.heldItems.splice(idx, 1);
    if (state.activeItemIndex >= state.heldItems.length) {
        state.activeItemIndex = state.heldItems.length - 1;
    }
    const active = getActiveItem();
    showItemInHand(active ? active.name : null);
    updateHeldItemsUI();
    if (name === 'هاتف') phoneInHandActive = false;
}

function pickupItem(mesh, data) {
    addHeldItem(data.invName);
    mesh.visible = false;
    const idx = interactiveObjects.indexOf(mesh);
    if (idx > -1) interactiveObjects.splice(idx, 1);
    showNotification(`التقطت: ${data.invName}`);
}

function updateHeldItemsUI() {
    const container = document.getElementById('heldItemsList');
    if (!container) return;
    container.innerHTML = '';
    state.heldItems.forEach((item, i) => {
        const slot = document.createElement('div');
        slot.className = 'held-item-slot' + (i === state.activeItemIndex ? ' active' : '');
        slot.textContent = item.name;
        slot.onclick = () => {
            state.activeItemIndex = i;
            showItemInHand(item.name);
            updateHeldItemsUI();
            if (item.name === 'هاتف') {
                phoneInHandActive = true;
            } else {
                phoneInHandActive = false;
            }
        };
        container.appendChild(slot);
    });
}

// ============= PROCEDURAL TEXTURES =============
function makeCanvasTex(w, h, drawFn) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    drawFn(ctx, w, h);
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    return tex;
}

function wallTex() {
    return makeCanvasTex(256, 256, (ctx, w, h) => {
        ctx.fillStyle = '#5a5060';
        ctx.fillRect(0, 0, w, h);
        for (let i = 0; i < 400; i++) {
            ctx.fillStyle = `rgba(${140 + Math.random() * 60},${130 + Math.random() * 50},${150 + Math.random() * 60},0.12)`;
            ctx.fillRect(Math.random() * w, Math.random() * h, 2 + Math.random() * 4, 2 + Math.random() * 4);
        }
    });
}

function floorTex() {
    return makeCanvasTex(512, 512, (ctx, w, h) => {
        ctx.fillStyle = '#3a3025';
        ctx.fillRect(0, 0, w, h);
        const tileSize = 64;
        for (let x = 0; x < w; x += tileSize) {
            for (let y = 0; y < h; y += tileSize) {
                const b = 45 + Math.random() * 20;
                ctx.fillStyle = `rgb(${b + 10},${b + 5},${b})`;
                ctx.fillRect(x + 1, y + 1, tileSize - 2, tileSize - 2);
            }
        }
    });
}

function ceilTex() {
    return makeCanvasTex(256, 256, (ctx, w, h) => {
        ctx.fillStyle = '#4a4a58';
        ctx.fillRect(0, 0, w, h);
    });
}

function woodTex() {
    return makeCanvasTex(256, 256, (ctx, w, h) => {
        const grad = ctx.createLinearGradient(0, 0, w, h);
        grad.addColorStop(0, '#6b4a30');
        grad.addColorStop(0.5, '#5a3d28');
        grad.addColorStop(1, '#7a5535');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);
        for (let i = 0; i < 50; i++) {
            const y = Math.random() * h;
            ctx.strokeStyle = `rgba(90,60,35,${0.2 + Math.random() * 0.3})`;
            ctx.lineWidth = 0.5 + Math.random() * 1.5;
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.bezierCurveTo(w * 0.3, y + (Math.random() - 0.5) * 4, w * 0.7, y + (Math.random() - 0.5) * 4, w, y);
            ctx.stroke();
        }
        for (let i = 0; i < 3; i++) {
            const kx = Math.random() * w, ky = Math.random() * h;
            ctx.fillStyle = `rgba(80,50,30,0.3)`;
            ctx.beginPath();
            ctx.ellipse(kx, ky, 3 + Math.random() * 5, 2 + Math.random() * 3, Math.random() * Math.PI, 0, Math.PI * 2);
            ctx.fill();
        }
    });
}

// ============= TEXTURE HELPERS =============
function loadPBRTexture(basePath, repeatX, repeatY) {
    const diff = texLoader.load('/static/textures/' + basePath + '_diff.jpg');
    const nor = texLoader.load('/static/textures/' + basePath + '_nor.jpg');
    diff.wrapS = diff.wrapT = THREE.RepeatWrapping;
    nor.wrapS = nor.wrapT = THREE.RepeatWrapping;
    if (repeatX && repeatY) {
        diff.repeat.set(repeatX, repeatY);
        nor.repeat.set(repeatX, repeatY);
    }
    diff.encoding = THREE.sRGBEncoding;
    const props = { map: diff, normalMap: nor, normalScale: new THREE.Vector2(0.8, 0.8) };
    const rough = texLoader.load('/static/textures/' + basePath + '_rough.jpg');
    if (rough) {
        rough.wrapS = rough.wrapT = THREE.RepeatWrapping;
        if (repeatX && repeatY) rough.repeat.set(repeatX, repeatY);
        props.roughnessMap = rough;
    }
    return props;
}

// ============= ROOM GEOMETRY =============
function buildRoom() {
    const floorProps = loadPBRTexture('floor', 4, 3);
    const wallProps = loadPBRTexture('wall', 3, 1.5);
    const ceilProps = loadPBRTexture('ceil', 3, 2);
    const woodProps = loadPBRTexture('wood', 2, 2);

    const floor = new THREE.Mesh(
        new THREE.PlaneGeometry(ROOM_W, ROOM_D),
        new THREE.MeshStandardMaterial({ ...floorProps, roughness: 0.8 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    const ceil = new THREE.Mesh(
        new THREE.PlaneGeometry(ROOM_W, ROOM_D),
        new THREE.MeshStandardMaterial({ ...ceilProps, roughness: 0.9, color: 0x888888 })
    );
    ceil.rotation.x = Math.PI / 2;
    ceil.position.y = ROOM_H;
    scene.add(ceil);

    const wallMat = new THREE.MeshStandardMaterial({ ...wallProps, roughness: 0.7, color: 0x999999 });

    const backWall = new THREE.Mesh(new THREE.PlaneGeometry(ROOM_W, ROOM_H), wallMat);
    backWall.position.set(0, ROOM_H / 2, -ROOM_D / 2);
    backWall.receiveShadow = true;
    scene.add(backWall);

    const frontWall = new THREE.Mesh(new THREE.PlaneGeometry(ROOM_W, ROOM_H), wallMat.clone());
    frontWall.position.set(0, ROOM_H / 2, ROOM_D / 2);
    frontWall.rotation.y = Math.PI;
    frontWall.receiveShadow = true;
    scene.add(frontWall);
    frontWall.userData = { type: 'uvWall' };
    interactiveObjects.push(frontWall);

    const leftWall = new THREE.Mesh(new THREE.PlaneGeometry(ROOM_D, ROOM_H), wallMat.clone());
    leftWall.position.set(-ROOM_W / 2, ROOM_H / 2, 0);
    leftWall.rotation.y = Math.PI / 2;
    leftWall.receiveShadow = true;
    scene.add(leftWall);

    const rightWall = new THREE.Mesh(new THREE.PlaneGeometry(ROOM_D, ROOM_H), wallMat.clone());
    rightWall.position.set(ROOM_W / 2, ROOM_H / 2, 0);
    rightWall.rotation.y = -Math.PI / 2;
    rightWall.receiveShadow = true;
    scene.add(rightWall);

    const doorWoodProps = loadPBRTexture('wood', 1, 2);
    const doorFrameMat = new THREE.MeshStandardMaterial({ ...doorWoodProps, roughness: 0.4, metalness: 0.1, color: 0x664422 });
    const doorW = 1.0, doorH = 2.2;
    doorMesh = new THREE.Mesh(
        new THREE.BoxGeometry(doorW, doorH, 0.08),
        new THREE.MeshStandardMaterial({ ...doorWoodProps, roughness: 0.35, metalness: 0.05, color: 0x553318 })
    );
    doorMesh.position.set(2, doorH / 2, -ROOM_D / 2 + 0.05);
    doorMesh.castShadow = true;
    scene.add(doorMesh);

    const df1 = new THREE.Mesh(new THREE.BoxGeometry(0.08, doorH + 0.1, 0.12), doorFrameMat);
    df1.position.set(2 - doorW / 2 - 0.04, doorH / 2, -ROOM_D / 2 + 0.05);
    scene.add(df1);
    const df2 = df1.clone();
    df2.position.x = 2 + doorW / 2 + 0.04;
    scene.add(df2);
    const df3 = new THREE.Mesh(new THREE.BoxGeometry(doorW + 0.16, 0.08, 0.12), doorFrameMat);
    df3.position.set(2, doorH + 0.04, -ROOM_D / 2 + 0.05);
    scene.add(df3);

    lockScreenMesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.4, 0.3, 0.05),
        new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0x000000, roughness: 0.3, metalness: 0.5 })
    );
    lockScreenMesh.position.set(2 + doorW / 2 + 0.35, 1.3, -ROOM_D / 2 + 0.06);
    lockScreenMesh.userData = { type: 'lockScreen', promptText: 'شاشة القفل' };
    lockScreenMesh.castShadow = true;
    scene.add(lockScreenMesh);
    interactiveObjects.push(lockScreenMesh);

    const diamondGeo = new THREE.OctahedronGeometry(0.15, 0);
    diamondMesh = new THREE.Mesh(diamondGeo, new THREE.MeshStandardMaterial({
        color: 0x88ccff, roughness: 0.1, metalness: 0.8, transparent: true, opacity: 0.8
    }));
    diamondMesh.position.set(2, doorH + 0.35, -ROOM_D / 2 + 0.12);
    diamondMesh.rotation.y = Math.PI / 4;
    scene.add(diamondMesh);
}

// ============= GLTF MODEL HELPER =============
function loadModel(path, position, scale, rotation, callback) {
    gltfLoader.load('/static/models/' + path, (gltf) => {
        const model = gltf.scene;
        model.position.set(position.x, position.y, position.z);
        if (typeof scale === 'number') {
            model.scale.setScalar(scale);
        } else {
            model.scale.set(scale.x, scale.y, scale.z);
        }
        if (rotation) {
            model.rotation.set(rotation.x || 0, rotation.y || 0, rotation.z || 0);
        }
        model.traverse(child => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
            }
        });
        scene.add(model);
        if (callback) callback(model);
    }, undefined, (err) => {
        console.warn('Model load failed:', path, err);
        if (callback) callback(null);
    });
}

// ============= DECORATIVE BOOKS =============
function addBooksToBookshelf(bsX, bsZ) {
    const bookColors = [0xaa2222, 0x2244aa, 0x22aa44, 0xaa8822, 0x7722aa, 0x22aaaa, 0xaa4400, 0x6644aa, 0x884422, 0x224488];
    const shelfYs = [0.08, 0.55, 1.05, 1.55];
    shelfYs.forEach((baseY, shelfIdx) => {
        const numBooks = 5 + Math.floor(Math.random() * 4);
        let bx = -0.55;
        for (let i = 0; i < numBooks; i++) {
            const bw = 0.04 + Math.random() * 0.04;
            const bh = 0.22 + Math.random() * 0.15;
            const bd = 0.16 + Math.random() * 0.06;
            const color = bookColors[(i + shelfIdx * 3) % bookColors.length];
            const book = new THREE.Mesh(
                new THREE.BoxGeometry(bw, bh, bd),
                new THREE.MeshStandardMaterial({ color: color, roughness: 0.7, metalness: 0.05 })
            );
            book.position.set(bsX, baseY + bh / 2 + 0.02, bsZ + bx);
            book.rotation.z = (Math.random() - 0.5) * 0.06;
            book.castShadow = true;
            scene.add(book);
            bx += bw + 0.008;
        }
    });
}

// ============= FURNITURE =============
function buildFurniture() {
    loadModel('round_wooden_table_01/round_wooden_table_01.gltf',
        { x: -2.5, y: 0, z: -1 }, 0.8, { y: 0 });

    loadModel('drawer_cabinet/drawer_cabinet.gltf',
        { x: 3.5, y: 0, z: 1.5 }, 0.45, { y: Math.PI / 2 }, (model) => {
            if (model) {
                const drawerHitbox = new THREE.Mesh(
                    new THREE.BoxGeometry(0.5, 0.3, 0.4),
                    new THREE.MeshStandardMaterial({ visible: false })
                );
                drawerHitbox.position.set(3.5, 0.4, 1.5);
                drawerHitbox.userData = { type: 'drawer', promptText: 'درج المكتب', hasLighter: true };
                scene.add(drawerHitbox);
                interactiveObjects.push(drawerHitbox);
            }
        });

    loadModel('small_wooden_table_01/small_wooden_table_01.gltf',
        { x: -ROOM_W / 2 + 0.5, y: 0, z: -1.5 }, 1.8, { y: Math.PI / 2 });

    loadModel('small_wooden_table_01/small_wooden_table_01.gltf',
        { x: -3.5, y: 0, z: -3 }, 1.5, { y: 0 });

    loadModel('small_wooden_table_01/small_wooden_table_01.gltf',
        { x: 3, y: 0, z: 3 }, 1.4, { y: Math.PI / 4 });

    loadModel('round_wooden_table_01/round_wooden_table_01.gltf',
        { x: ROOM_W / 2 - 0.8, y: 0, z: -0.5 }, 0.75, { y: 0 });

    loadModel('wooden_bookshelf_worn/wooden_bookshelf_worn.gltf',
        { x: -ROOM_W / 2 + 0.35, y: 0, z: 2.5 }, 1.0, { y: Math.PI / 2 }, (model) => {
            if (model) {
                addBooksToBookshelf(-ROOM_W / 2 + 0.35, 2.5);
                const bookHitbox = new THREE.Mesh(
                    new THREE.BoxGeometry(0.15, 0.25, 0.2),
                    new THREE.MeshStandardMaterial({ visible: false })
                );
                bookHitbox.position.set(-ROOM_W / 2 + 0.4, 1.3, 2.5);
                bookHitbox.userData = { type: 'bookWithMirror', promptText: 'كتاب مثير للاهتمام', mirrorIndex: 1 };
                scene.add(bookHitbox);
                interactiveObjects.push(bookHitbox);
            }
        });

    const uvWallHitbox = new THREE.Mesh(
        new THREE.PlaneGeometry(3, 2.5),
        new THREE.MeshStandardMaterial({ visible: false, side: THREE.DoubleSide })
    );
    uvWallHitbox.position.set(0, 1.5, ROOM_D / 2 - 0.05);
    uvWallHitbox.rotation.y = Math.PI;
    uvWallHitbox.userData = { type: 'uvWall', promptText: 'حائط... ربما يخفي شيئاً' };
    scene.add(uvWallHitbox);
    interactiveObjects.push(uvWallHitbox);
}

// ============= PUZZLE OBJECTS =============
function buildPuzzleObjects() {
    // === Light source for mirror puzzle ===
    const lightHousing = new THREE.Mesh(
        new THREE.CylinderGeometry(0.08, 0.1, 0.15, 8),
        new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.6 })
    );
    lightHousing.position.set(-3, 0.08, -ROOM_D / 2 + 0.5);
    scene.add(lightHousing);
    buildLightBeam();

    // === Mirror bases ===
    const baseMat = new THREE.MeshStandardMaterial({ color: 0x444444, metalness: 0.4, roughness: 0.4 });
    const basePositions = [
        { x: -3, z: -2, rotY: Math.PI / 4 },
        { x: 0, z: -2.5, rotY: Math.PI / 3 },
        { x: 2, z: -3.2, rotY: Math.PI / 6 },
    ];
    basePositions.forEach((bp, i) => {
        const base = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.06, 8), baseMat);
        base.position.set(bp.x, 0.03, bp.z);
        base.userData = { type: 'mirrorBase', index: i, promptText: 'قاعدة مرآة', rotY: bp.rotY };
        scene.add(base);
        interactiveObjects.push(base);
        mirrorBases.push(base);
    });

    // Mirror 0: in desk drawer (found when opening)
    // Mirror 1: behind book on bookshelf
    // Mirror 2: under shelf
    const hiddenMirror = new THREE.Mesh(
        new THREE.BoxGeometry(0.12, 0.01, 0.08),
        new THREE.MeshStandardMaterial({ color: 0xaaccee, metalness: 0.9, roughness: 0.1 })
    );
    hiddenMirror.position.set(-ROOM_W / 2 + 0.5, 0.99, -1.3);
    hiddenMirror.userData = { type: 'hiddenMirror', mirrorIndex: 2, promptText: 'مرآة صغيرة' };
    scene.add(hiddenMirror);
    interactiveObjects.push(hiddenMirror);

    // === Puzzle 1: Paper on table ===
    paperMesh = new THREE.Mesh(
        new THREE.PlaneGeometry(0.2, 0.28),
        new THREE.MeshStandardMaterial({ color: 0xf5f0e0, roughness: 0.9, side: THREE.DoubleSide })
    );
    paperMesh.position.set(-2.5, 0.82, -1);
    paperMesh.rotation.x = -Math.PI / 2;
    paperMesh.userData = { type: 'paper', promptText: 'ورقة بيضاء', pickable: true, invName: 'ورقة' };
    paperMesh.castShadow = true;
    scene.add(paperMesh);
    interactiveObjects.push(paperMesh);

    // === Puzzle 2: Phone on desk ===
    const phoneGroup = new THREE.Group();
    const phoneBody = new THREE.Mesh(
        new THREE.BoxGeometry(0.07, 0.008, 0.14),
        new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.15, metalness: 0.7 })
    );
    phoneGroup.add(phoneBody);
    const phoneScreen2 = new THREE.Mesh(
        new THREE.PlaneGeometry(0.06, 0.11),
        new THREE.MeshStandardMaterial({ color: 0x0a0a1e, emissive: 0x112244, emissiveIntensity: 0.5, roughness: 0.05 })
    );
    phoneScreen2.position.y = 0.005;
    phoneScreen2.rotation.x = -Math.PI / 2;
    phoneGroup.add(phoneScreen2);
    const phoneCam = new THREE.Mesh(
        new THREE.CylinderGeometry(0.004, 0.004, 0.003, 8),
        new THREE.MeshStandardMaterial({ color: 0x222233, metalness: 0.9 })
    );
    phoneCam.position.set(-0.02, 0.005, -0.06);
    phoneCam.rotation.x = Math.PI / 2;
    phoneGroup.add(phoneCam);
    phoneGroup.position.set(3.3, 0.87, 1.5);
    phoneGroup.castShadow = true;
    scene.add(phoneGroup);
    phoneMesh = phoneGroup;
    phoneMesh.userData = { type: 'phone', promptText: 'هاتف ذكي', pickable: true, invName: 'هاتف' };
    interactiveObjects.push(phoneMesh);

    // === Puzzle 3: Abstract painting on wall – uses real images ===
    loadModel('fancy_picture_frame_01/fancy_picture_frame_01.gltf',
        { x: -ROOM_W / 2 + 0.05, y: 1.8, z: 0.5 }, 1.5, { y: Math.PI / 2 });

    paintingMesh = new THREE.Mesh(
        new THREE.PlaneGeometry(0.65, 0.50),
        new THREE.MeshStandardMaterial({ map: paintingNormalTex, roughness: 0.8 })
    );
    paintingMesh.position.set(-ROOM_W / 2 + 0.06, 1.8, 0.5);
    paintingMesh.rotation.y = Math.PI / 2;
    paintingMesh.userData = { type: 'painting', promptText: 'لوحة تجريدية' };
    scene.add(paintingMesh);
    interactiveObjects.push(paintingMesh);

    // Red filter – placed on bookshelf area
    filterMesh = new THREE.Mesh(
        new THREE.PlaneGeometry(0.15, 0.2),
        new THREE.MeshStandardMaterial({ color: 0xff2222, transparent: true, opacity: 0.5, side: THREE.DoubleSide })
    );
    filterMesh.position.set(-ROOM_W / 2 + 0.4, 1.1, 2.3);
    filterMesh.rotation.x = -Math.PI / 2;
    filterMesh.userData = { type: 'redFilter', promptText: 'ورقة بلاستيكية حمراء', pickable: true, invName: 'فلتر أحمر' };
    filterMesh.castShadow = true;
    scene.add(filterMesh);
    interactiveObjects.push(filterMesh);

    // === Puzzle 4: Black cup and coffee machine ===
    const cmGroup = new THREE.Group();
    const cmBody = new THREE.Mesh(
        new THREE.BoxGeometry(0.25, 0.32, 0.2),
        new THREE.MeshStandardMaterial({ color: 0x0e0e0e, roughness: 0.15, metalness: 0.6 })
    );
    cmBody.position.y = 0.16;
    cmGroup.add(cmBody);
    const cmTop = new THREE.Mesh(
        new THREE.BoxGeometry(0.26, 0.02, 0.21),
        new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.1, metalness: 0.7 })
    );
    cmTop.position.set(0, 0.33, 0);
    cmGroup.add(cmTop);
    const cmTank = new THREE.Mesh(
        new THREE.BoxGeometry(0.16, 0.12, 0.1),
        new THREE.MeshStandardMaterial({ color: 0x335577, roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.6 })
    );
    cmTank.position.set(0, 0.4, -0.02);
    cmGroup.add(cmTank);
    const cmTray = new THREE.Mesh(
        new THREE.BoxGeometry(0.2, 0.012, 0.15),
        new THREE.MeshStandardMaterial({ color: 0x444444, metalness: 0.8, roughness: 0.15 })
    );
    cmTray.position.set(0, 0.006, 0.03);
    cmGroup.add(cmTray);
    const nozzle = new THREE.Mesh(
        new THREE.CylinderGeometry(0.012, 0.018, 0.06, 10),
        new THREE.MeshStandardMaterial({ color: 0x777777, metalness: 0.9, roughness: 0.1 })
    );
    nozzle.position.set(0, 0.06, 0.03);
    cmGroup.add(nozzle);
    const cmBtn = new THREE.Mesh(
        new THREE.CylinderGeometry(0.012, 0.012, 0.008, 12),
        new THREE.MeshStandardMaterial({ color: 0x22cc22, emissive: 0x116611, emissiveIntensity: 0.8, metalness: 0.3 })
    );
    cmBtn.position.set(0.08, 0.25, 0.101);
    cmBtn.rotation.x = Math.PI / 2;
    cmGroup.add(cmBtn);
    const cmSide = new THREE.Mesh(
        new THREE.PlaneGeometry(0.18, 0.25),
        new THREE.MeshStandardMaterial({ color: 0x151515, metalness: 0.4, roughness: 0.3 })
    );
    cmSide.position.set(0.126, 0.16, 0);
    cmSide.rotation.y = Math.PI / 2;
    cmGroup.add(cmSide);
    cmGroup.position.set(-3.5, 0.80, -3);
    cmGroup.castShadow = true;
    scene.add(cmGroup);
    coffeeMachineMesh = cmGroup;
    coffeeMachineMesh.userData = { type: 'coffeeMachine', promptText: 'آلة صنع قهوة' };
    interactiveObjects.push(coffeeMachineMesh);

    cupMesh = createCup(-3.2, 0.80, -3);
    cupMesh.userData = { type: 'cup', promptText: 'كوب أسود', pickable: true, invName: 'كوب' };
    interactiveObjects.push(cupMesh);

    // === Puzzle 5: Metal sculpture, desk lamp, X mark ===
    xMarkMesh = new THREE.Mesh(
        new THREE.PlaneGeometry(0.15, 0.15),
        new THREE.MeshStandardMaterial({ color: 0xff0000, transparent: true, opacity: 0.6, side: THREE.DoubleSide })
    );
    xMarkMesh.position.set(ROOM_W / 2 - 0.8, 0.76, -0.5);
    xMarkMesh.rotation.x = -Math.PI / 2;
    scene.add(xMarkMesh);

    const xCanvas = document.createElement('canvas');
    xCanvas.width = 64; xCanvas.height = 64;
    const xCtx = xCanvas.getContext('2d');
    xCtx.strokeStyle = '#ff0000';
    xCtx.lineWidth = 4;
    xCtx.beginPath(); xCtx.moveTo(10, 10); xCtx.lineTo(54, 54); xCtx.stroke();
    xCtx.beginPath(); xCtx.moveTo(54, 10); xCtx.lineTo(10, 54); xCtx.stroke();
    xMarkMesh.material.map = new THREE.CanvasTexture(xCanvas);
    xMarkMesh.material.color = new THREE.Color(0xffffff);
    xMarkMesh.material.needsUpdate = true;

    sculptureMesh = createSculpture(ROOM_W / 2 - 1.5, 0.76, 0.5);
    sculptureMesh.userData = { type: 'sculpture', promptText: 'مجسم معدني', pickable: true, invName: 'مجسم' };
    interactiveObjects.push(sculptureMesh);

    loadModel('desk_lamp_arm_01/desk_lamp_arm_01.gltf',
        { x: ROOM_W / 2 - 0.5, y: 0.75, z: -0.8 }, 0.35, { y: Math.PI }, (model) => {
            if (model) {
                deskLampMesh = model;
                deskLampMesh.userData = { type: 'deskLamp', promptText: 'مصباح مكتب' };
                interactiveObjects.push(deskLampMesh);
            }
        });
    const lampHitbox = new THREE.Mesh(
        new THREE.BoxGeometry(0.2, 0.3, 0.2),
        new THREE.MeshStandardMaterial({ visible: false })
    );
    lampHitbox.position.set(ROOM_W / 2 - 0.5, 1.0, -0.8);
    lampHitbox.userData = { type: 'deskLamp', promptText: 'مصباح مكتب' };
    scene.add(lampHitbox);
    interactiveObjects.push(lampHitbox);
    deskLampMesh = lampHitbox;

    // === Puzzle 6: Radio ===
    loadModel('vintage_radio_transceiver/vintage_radio_transceiver.gltf',
        { x: 3, y: 0.75, z: 3 }, 2.0, { y: 0 }, (model) => {
            if (model) {
                radioMesh = model;
                radioMesh.userData = { type: 'radio', promptText: 'راديو كلاسيكي' };
                interactiveObjects.push(radioMesh);
            }
        });
    const radioHitbox = new THREE.Mesh(
        new THREE.BoxGeometry(0.3, 0.2, 0.15),
        new THREE.MeshStandardMaterial({ visible: false })
    );
    radioHitbox.position.set(3, 0.85, 3);
    radioHitbox.userData = { type: 'radio', promptText: 'راديو كلاسيكي' };
    scene.add(radioHitbox);
    interactiveObjects.push(radioHitbox);
    radioMesh = radioHitbox;

    // FM hint note
    const hintCanvas = document.createElement('canvas');
    hintCanvas.width = 128; hintCanvas.height = 64;
    const hCtx = hintCanvas.getContext('2d');
    hCtx.fillStyle = '#f5f0c0';
    hCtx.fillRect(0, 0, 128, 64);
    hCtx.fillStyle = '#333';
    hCtx.font = '18px Arial';
    hCtx.textAlign = 'center';
    hCtx.fillText('FM 104.5', 64, 38);
    const hintNote = new THREE.Mesh(
        new THREE.PlaneGeometry(0.12, 0.06),
        new THREE.MeshStandardMaterial({ map: new THREE.CanvasTexture(hintCanvas), roughness: 0.9, side: THREE.DoubleSide })
    );
    hintNote.position.set(ROOM_W / 2 - 0.02, 1.0, 2);
    hintNote.rotation.y = -Math.PI / 2;
    hintNote.userData = { type: 'fmHint', promptText: 'ملاحظة' };
    scene.add(hintNote);
    interactiveObjects.push(hintNote);
}

function createCup(x, y, z) {
    const group = new THREE.Group();
    const body = new THREE.Mesh(
        new THREE.CylinderGeometry(0.035, 0.03, 0.09, 12),
        new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.3 })
    );
    body.position.y = 0.045;
    group.add(body);
    const handle = new THREE.Mesh(
        new THREE.TorusGeometry(0.02, 0.005, 6, 8, Math.PI),
        new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.3 })
    );
    handle.position.set(0.04, 0.045, 0);
    handle.rotation.z = Math.PI / 2;
    group.add(handle);
    group.position.set(x, y, z);
    group.castShadow = true;
    scene.add(group);
    return group;
}

function createSculpture(x, y, z) {
    const group = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0x888888, metalness: 0.7, roughness: 0.3 });
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.02, 8), mat);
    base.position.y = 0.01;
    group.add(base);
    const v1 = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.15, 0.02), mat);
    v1.position.set(0, 0.085, 0);
    group.add(v1);
    const v2 = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.02, 0.02), mat);
    v2.position.set(0.02, 0.12, 0);
    v2.rotation.z = 0.3;
    group.add(v2);
    const v3 = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.06, 0.02), mat);
    v3.position.set(0.04, 0.08, 0);
    group.add(v3);
    group.position.set(x, y, z);
    group.castShadow = true;
    group.traverse(c => { if (c.isMesh) c.castShadow = true; });
    scene.add(group);
    return group;
}

// ============= LIGHT BEAM =============
function buildLightBeam() {
    updateBeamVisualization();
}

function updateBeamVisualization() {
    beamSegments.forEach(s => scene.remove(s));
    beamSegments = [];
    if (!state.lightBeamActive) return;

    const points = [new THREE.Vector3(-3, 0.15, -ROOM_D / 2 + 0.5)];
    const mirrorPositions = [
        new THREE.Vector3(-3, 0.15, -2),
        new THREE.Vector3(0, 0.15, -2.5),
        new THREE.Vector3(2, 0.15, -3.2),
    ];

    let lastPoint = points[0];
    for (let i = 0; i < 3; i++) {
        if (state.mirrorsPlaced[i]) {
            const mp = mirrorPositions[i].clone();
            mp.y = 0.15;
            points.push(mp);
            lastPoint = mp;
        } else {
            const dir = mirrorPositions[i].clone().sub(lastPoint).normalize();
            points.push(lastPoint.clone().add(dir.multiplyScalar(0.5)));
            break;
        }
    }

    if (state.mirrorsPlaced[0] && state.mirrorsPlaced[1] && state.mirrorsPlaced[2]) {
        points.push(diamondMesh.position.clone());
    }

    const beamMat = new THREE.LineBasicMaterial({ color: 0xffffff, linewidth: 2, transparent: true, opacity: 0.8 });
    for (let i = 0; i < points.length - 1; i++) {
        const geo = new THREE.BufferGeometry().setFromPoints([points[i], points[i + 1]]);
        const line = new THREE.Line(geo, beamMat);
        scene.add(line);
        beamSegments.push(line);
    }
}

// ============= RED HERRINGS =============
function buildRedHerrings() {
    const items = [
        { geo: new THREE.CylinderGeometry(0.03, 0.025, 0.08, 8), color: 0x888888, pos: [-2.3, 0.84, -0.8], name: 'كوب فارغ' },
        { geo: new THREE.BoxGeometry(0.02, 0.08, 0.06), color: 0xccaa00, pos: [3.6, 0.88, 1.3], name: 'مفتاح قديم' },
        { geo: new THREE.BoxGeometry(0.15, 0.01, 0.2), color: 0x4444aa, pos: [-2.2, 0.82, -1.2], name: 'مجلد فارغ' },
        { geo: new THREE.BoxGeometry(0.06, 0.08, 0.04), color: 0x228822, pos: [3.8, 0.88, 1.7], name: 'علبة صغيرة' },
        { geo: new THREE.SphereGeometry(0.03, 8, 8), color: 0xff4444, pos: [-3.3, 0.85, -2.8], name: 'كرة زجاجية' },
        { geo: new THREE.CylinderGeometry(0.015, 0.015, 0.12, 6), color: 0x333333, pos: [-2.7, 0.82, -1], name: 'قلم' },
    ];

    items.forEach(item => {
        const mesh = new THREE.Mesh(
            item.geo,
            new THREE.MeshStandardMaterial({ color: item.color, roughness: 0.5 })
        );
        mesh.position.set(...item.pos);
        mesh.userData = { type: 'redHerring', promptText: item.name, pickable: true, invName: item.name };
        mesh.castShadow = true;
        scene.add(mesh);
        interactiveObjects.push(mesh);
    });
}

// ============= LIGHTS =============
function setupLights() {
    const ambient = new THREE.AmbientLight(0x443322, 0.6);
    scene.add(ambient);

    const hemi = new THREE.HemisphereLight(0x8b7355, 0x2a2a3a, 0.5);
    scene.add(hemi);

    const ceiling = new THREE.PointLight(0xffaa55, 1.2, 12);
    ceiling.position.set(0, ROOM_H - 0.2, 0);
    ceiling.castShadow = true;
    ceiling.shadow.mapSize.set(512, 512);
    ceiling.shadow.bias = -0.002;
    scene.add(ceiling);

    const bulbMat = new THREE.MeshStandardMaterial({ emissive: 0xffaa44, emissiveIntensity: 4, color: 0xffffcc, transparent: true, opacity: 0.9 });
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 12), bulbMat);
    bulb.position.copy(ceiling.position);
    scene.add(bulb);

    const ceil2 = new THREE.PointLight(0xffaa55, 0.6, 8);
    ceil2.position.set(-2, ROOM_H - 0.3, -2.5);
    scene.add(ceil2);

    const ceil3 = new THREE.PointLight(0xffaa55, 0.4, 8);
    ceil3.position.set(2, ROOM_H - 0.3, 2);
    scene.add(ceil3);

    const deskSpot = new THREE.SpotLight(0xffcc88, 0.8, 6, Math.PI / 6, 0.5);
    deskSpot.position.set(3.5, ROOM_H - 0.3, 1.5);
    deskSpot.target.position.set(3.5, 0, 1.5);
    scene.add(deskSpot);
    scene.add(deskSpot.target);

    loadModel('vintage_oil_lamp/vintage_oil_lamp.gltf',
        { x: -2.5, y: 0.80, z: -0.7 }, 0.4, { y: 0 });
    const oilLampLight = new THREE.PointLight(0xff8833, 0.5, 4);
    oilLampLight.position.set(-2.5, 1.1, -0.7);
    scene.add(oilLampLight);

    lightSpotlight = new THREE.SpotLight(0xffffff, 1.5, 8, Math.PI / 8, 0.3);
    lightSpotlight.position.set(-3, 0.5, -ROOM_D / 2 + 0.5);
    lightSpotlight.target.position.set(-3, 0, -2);
    lightSpotlight.castShadow = true;
    lightSpotlight.shadow.mapSize.set(512, 512);
    scene.add(lightSpotlight);
    scene.add(lightSpotlight.target);
}

// ============= CONTROLS =============
function setupControls() {
    const canvas = renderer.domElement;

    if (!isMobile) {
        canvas.addEventListener('click', () => {
            if (!state.overlayOpen && state.gameStarted && !state.gameEnded) {
                canvas.requestPointerLock();
            }
        });

        document.addEventListener('pointerlockchange', () => {
            isPointerLocked = document.pointerLockElement === canvas;
        });

        document.addEventListener('mousemove', (e) => {
            if (!isPointerLocked) return;
            euler.setFromQuaternion(camera.quaternion);
            euler.y -= e.movementX * 0.002;
            euler.x -= e.movementY * 0.002;
            euler.x = Math.max(-Math.PI / 2.1, Math.min(Math.PI / 2.1, euler.x));
            camera.quaternion.setFromEuler(euler);
        });

        // W=forward, S=backward, A/Q=left, D=right
        document.addEventListener('keydown', (e) => {
            if (state.overlayOpen) return;
            switch (e.code) {
                case 'KeyW': case 'KeyZ': moveForward = true; break;
                case 'KeyS': moveBackward = true; break;
                case 'KeyA': case 'KeyQ': moveLeft = true; break;
                case 'KeyD': moveRight = true; break;
                case 'KeyE': case 'Space': tryInteract(); break;
                case 'Tab':
                    e.preventDefault();
                    cycleHeldItem(1);
                    break;
            }
        });

        document.addEventListener('keyup', (e) => {
            switch (e.code) {
                case 'KeyW': case 'KeyZ': moveForward = false; break;
                case 'KeyS': moveBackward = false; break;
                case 'KeyA': case 'KeyQ': moveLeft = false; break;
                case 'KeyD': moveRight = false; break;
            }
        });

        // Scroll wheel to cycle items
        document.addEventListener('wheel', (e) => {
            if (state.overlayOpen) return;
            cycleHeldItem(e.deltaY > 0 ? 1 : -1);
        });

        canvas.addEventListener('mousedown', (e) => {
            if (isPointerLocked && e.button === 0) tryInteract();
        });
    } else {
        setupMobileControls();
    }
}

function setupMobileControls() {
    const joystickBase = document.getElementById('joystickBase');
    const joystickKnob = document.getElementById('joystickKnob');
    const joystickZone = document.getElementById('joystickZone');
    const lookZone = document.getElementById('lookZone');
    const interactBtn = document.getElementById('mobileInteractBtn');

    let joystickTouch = null;
    let lookTouch = null;
    const baseRect = () => joystickBase.getBoundingClientRect();
    const maxDist = 40;

    joystickZone.addEventListener('touchstart', (e) => {
        e.preventDefault();
        joystickTouch = e.changedTouches[0].identifier;
        joystickData.active = true;
    }, { passive: false });

    joystickZone.addEventListener('touchmove', (e) => {
        e.preventDefault();
        for (const t of e.changedTouches) {
            if (t.identifier === joystickTouch) {
                const rect = baseRect();
                const cx = rect.left + rect.width / 2;
                const cy = rect.top + rect.height / 2;
                let dx = t.clientX - cx;
                let dy = t.clientY - cy;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist > maxDist) { dx = dx / dist * maxDist; dy = dy / dist * maxDist; }
                joystickKnob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
                joystickData.dx = dx / maxDist;
                joystickData.dy = dy / maxDist;
            }
        }
    }, { passive: false });

    const resetJoystick = () => {
        joystickTouch = null;
        joystickData.active = false;
        joystickData.dx = 0;
        joystickData.dy = 0;
        joystickKnob.style.transform = 'translate(-50%, -50%)';
    };
    joystickZone.addEventListener('touchend', resetJoystick);
    joystickZone.addEventListener('touchcancel', resetJoystick);

    lookZone.addEventListener('touchstart', (e) => {
        e.preventDefault();
        const t = e.changedTouches[0];
        lookTouch = t.identifier;
        lookData.active = true;
        lookData.lastX = t.clientX;
        lookData.lastY = t.clientY;
    }, { passive: false });

    lookZone.addEventListener('touchmove', (e) => {
        e.preventDefault();
        for (const t of e.changedTouches) {
            if (t.identifier === lookTouch) {
                const dx = t.clientX - lookData.lastX;
                const dy = t.clientY - lookData.lastY;
                lookData.lastX = t.clientX;
                lookData.lastY = t.clientY;
                euler.setFromQuaternion(camera.quaternion);
                euler.y -= dx * 0.004;
                euler.x -= dy * 0.004;
                euler.x = Math.max(-Math.PI / 2.1, Math.min(Math.PI / 2.1, euler.x));
                camera.quaternion.setFromEuler(euler);
            }
        }
    }, { passive: false });

    lookZone.addEventListener('touchend', () => { lookTouch = null; lookData.active = false; });
    lookZone.addEventListener('touchcancel', () => { lookTouch = null; lookData.active = false; });
    interactBtn.addEventListener('touchstart', (e) => { e.preventDefault(); tryInteract(); }, { passive: false });
}

// ============= INTERACTION =============
function tryInteract() {
    if (!currentHover || state.overlayOpen || state.gameEnded) return;
    const obj = currentHover;
    const data = obj.userData;
    const activeItem = getActiveItemName();

    switch (data.type) {
        case 'paper':
            if (data.pickable) {
                pickupItem(obj, data);
            }
            break;
        case 'phone':
            if (data.pickable && !hasItem('هاتف')) {
                pickupItem(obj, data);
            }
            break;
        case 'redFilter':
            if (data.pickable && !hasItem('فلتر أحمر')) {
                pickupItem(obj, data);
            }
            break;
        case 'cup':
            if (data.pickable && !hasItem('كوب')) {
                pickupItem(obj, data);
            }
            break;
        case 'sculpture':
            if (data.pickable && !hasItem('مجسم')) {
                pickupItem(obj, data);
            }
            break;
        case 'drawer':
            if (data.hasLighter && !state.mirrorsFound[0]) {
                state.mirrorsFound[0] = true;
                addHeldItem('مرآة');
                setTimeout(() => addHeldItem('ولاعة'), 300);
                showNotification('وجدت مرآة وولاعة في الدرج!');
                data.hasLighter = false;
            } else if (data.hasLighter) {
                addHeldItem('ولاعة');
                showNotification('وجدت ولاعة في الدرج!');
                data.hasLighter = false;
            }
            break;
        case 'bookWithMirror':
            if (!state.mirrorsFound[data.mirrorIndex]) {
                state.mirrorsFound[data.mirrorIndex] = true;
                addHeldItem('مرآة');
                showNotification('وجدت مرآة خلف الكتاب!');
            }
            break;
        case 'hiddenMirror':
            if (!state.mirrorsFound[data.mirrorIndex]) {
                state.mirrorsFound[data.mirrorIndex] = true;
                addHeldItem('مرآة');
                showNotification('وجدت مرآة صغيرة!');
                obj.visible = false;
            }
            break;
        case 'mirrorBase':
            placeMirrorOnBase(data.index);
            break;
        case 'painting':
            interactPainting();
            break;
        case 'coffeeMachine':
            interactCoffeeMachine();
            break;
        case 'deskLamp':
            interactDeskLamp();
            break;
        case 'radio':
            openRadio();
            break;
        case 'lockScreen':
            openDoorLock();
            break;
        case 'fmHint':
            showNotification('FM 104.5');
            break;
        case 'uvWall':
            if (hasItem('هاتف')) {
                // Switch to phone in hand
                const phoneIdx = state.heldItems.findIndex(it => it.name === 'هاتف');
                if (phoneIdx !== -1) {
                    state.activeItemIndex = phoneIdx;
                    showItemInHand('هاتف');
                    phoneInHandActive = true;
                    updateHeldItemsUI();
                    showNotification('استخدم الهاتف لمسح هذا الحائط');
                }
            }
            break;
        case 'redHerring':
            if (data.pickable) {
                pickupItem(obj, data);
            }
            break;
    }
}

// ============= MIRROR PUZZLE (Step Zero) =============
function placeMirrorOnBase(index) {
    if (!hasItem('مرآة')) {
        showNotification('تحتاج مرآة لوضعها هنا');
        return;
    }

    if (state.mirrorsPlaced[index]) {
        showNotification('المرآة موضوعة بالفعل');
        return;
    }

    state.mirrorsPlaced[index] = true;
    removeHeldItem('مرآة');

    const base = mirrorBases[index];
    const mirrorGroup = new THREE.Group();
    const mirrorGlass = new THREE.Mesh(
        new THREE.PlaneGeometry(0.09, 0.11),
        new THREE.MeshStandardMaterial({ color: 0xccddff, metalness: 1.0, roughness: 0.02, envMapIntensity: 2.0 })
    );
    mirrorGroup.add(mirrorGlass);
    const frameGeo = new THREE.BoxGeometry(0.11, 0.13, 0.012);
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x3a2a18, roughness: 0.5, metalness: 0.1 });
    const mirrorFrame = new THREE.Mesh(frameGeo, frameMat);
    mirrorFrame.position.z = -0.003;
    mirrorGroup.add(mirrorFrame);
    const mirrorBack = new THREE.Mesh(
        new THREE.PlaneGeometry(0.11, 0.13),
        new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.8 })
    );
    mirrorBack.position.z = -0.01;
    mirrorBack.rotation.y = Math.PI;
    mirrorGroup.add(mirrorBack);
    mirrorGroup.position.set(base.position.x, 0.12, base.position.z);
    mirrorGroup.rotation.y = base.userData.rotY;
    scene.add(mirrorGroup);
    mirrorMeshes.push(mirrorGroup);

    showNotification('تم وضع المرآة!');
    updateBeamVisualization();

    if (state.mirrorsPlaced[0] && state.mirrorsPlaced[1] && state.mirrorsPlaced[2]) {
        activateDiamond();
    }
}

function activateDiamond() {
    state.diamondHit = true;
    state.lockActivated = true;
    diamondMesh.material.emissive = new THREE.Color(0x44aaff);
    diamondMesh.material.emissiveIntensity = 2;
    lockScreenMesh.material.emissive = new THREE.Color(0x004444);
    lockScreenMesh.material.emissiveIntensity = 0.5;
    updateLockUI();
    playSound(800, 0.3, 'sine');
    setTimeout(() => playSound(1000, 0.3, 'sine'), 200);
    setTimeout(() => playSound(1200, 0.3, 'sine'), 400);
    showNotification('تم تفعيل شاشة القفل!');
}

// ============= PUZZLE 1: Paper + Lighter (Auto-burn) =============
function startBurnAnimation() {
    if (state.burningInProgress || state.paperBurned) return;
    state.burningInProgress = true;

    // Switch to show paper in hand
    const paperIdx = state.heldItems.findIndex(it => it.name === 'ورقة');
    if (paperIdx !== -1) {
        state.activeItemIndex = paperIdx;
        showItemInHand('ورقة');
        updateHeldItemsUI();
    }

    showNotification('الورقة تشتعل...');
    playSound(200, 1.5, 'sawtooth');

    // Create fire particles on the held item
    let burnProgress = 0;
    const burnInterval = setInterval(() => {
        burnProgress += 0.02;

        if (heldItemMesh) {
            // Change paper color to burning
            heldItemMesh.traverse(child => {
                if (child.isMesh && child.material) {
                    const r = 0.96 - burnProgress * 0.6;
                    const g = 0.94 - burnProgress * 0.9;
                    const b = 0.88 - burnProgress * 0.85;
                    child.material.color.setRGB(Math.max(0.1, r), Math.max(0.05, g), Math.max(0, b));
                    child.material.emissive = new THREE.Color(
                        Math.min(1, burnProgress * 2),
                        Math.min(0.3, burnProgress * 0.6),
                        0
                    );
                    child.material.emissiveIntensity = burnProgress * 2;
                }
            });
        }

        if (burnProgress >= 1) {
            clearInterval(burnInterval);
            state.paperBurned = true;
            state.solvedPuzzles[0] = true;
            state.burningInProgress = false;

            removeHeldItem('ورقة');
            removeHeldItem('ولاعة');

            showNotification(`الورقة احترقت... ظهر الرقم ${PUZZLE_DIGITS[0]}!`);
            playPuzzleSolvedSound();
            fillLockDigit(0, PUZZLE_DIGITS[0]);
        }
    }, 50);
}

// ============= PUZZLE 2: Phone Camera (In-Hand) =============
function setupPhoneCamera() {
    phoneCameraRT = new THREE.WebGLRenderTarget(256, 192);
    phoneCameraObj = new THREE.PerspectiveCamera(60, 256 / 192, 0.1, 20);
}

function updatePhoneInHand() {
    if (!phoneInHandActive || !phoneCameraRT || !heldItemMesh) return;

    // Position phone camera at player position
    phoneCameraObj.position.copy(camera.position);
    phoneCameraObj.quaternion.copy(camera.quaternion);

    // Show UV number on wall when phone is active
    if (!uvNumberMesh) {
        const uvCanvas = document.createElement('canvas');
        uvCanvas.width = 256; uvCanvas.height = 256;
        const ctx = uvCanvas.getContext('2d');
        ctx.clearRect(0, 0, 256, 256);
        ctx.fillStyle = 'rgba(0,255,100,0.9)';
        ctx.font = 'bold 200px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = '#00ff44';
        ctx.shadowBlur = 20;
        ctx.fillText(PUZZLE_DIGITS[1], 128, 128);
        uvNumberMesh = new THREE.Mesh(
            new THREE.PlaneGeometry(1.5, 1.5),
            new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(uvCanvas), transparent: true, side: THREE.DoubleSide, depthWrite: false })
        );
        uvNumberMesh.position.set(0, 1.8, ROOM_D / 2 - 0.03);
        uvNumberMesh.rotation.y = Math.PI;
        uvNumberMesh.visible = false;
        scene.add(uvNumberMesh);
    }
    uvNumberMesh.visible = true;

    // Render phone camera view
    renderer.setRenderTarget(phoneCameraRT);
    renderer.render(scene, phoneCameraObj);
    renderer.setRenderTarget(null);

    // Update phone screen texture in hand
    const phoneScreen = heldItemMesh.getObjectByName('phoneScreen');
    if (phoneScreen) {
        // Create UV-filtered texture from render target
        const w = phoneCameraRT.width, h = phoneCameraRT.height;
        const pixels = new Uint8Array(w * h * 4);
        renderer.readRenderTargetPixels(phoneCameraRT, 0, 0, w, h, pixels);

        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        const imgData = ctx.createImageData(w, h);

        for (let i = 0; i < pixels.length; i += 4) {
            const row = Math.floor((i / 4) / w);
            const col = (i / 4) % w;
            const flippedIdx = ((h - 1 - row) * w + col) * 4;
            const r = pixels[flippedIdx], g = pixels[flippedIdx + 1], b = pixels[flippedIdx + 2];
            const brightness = (r * 0.3 + g * 0.6 + b * 0.1);
            imgData.data[i] = 0;
            imgData.data[i + 1] = Math.min(255, brightness * 1.2 + 20);
            imgData.data[i + 2] = 0;
            imgData.data[i + 3] = 255;
        }
        ctx.putImageData(imgData, 0, 0);

        // Scan lines
        ctx.fillStyle = 'rgba(0,0,0,0.05)';
        for (let y = 0; y < h; y += 3) {
            ctx.fillRect(0, y, w, 1);
        }

        if (phoneScreen.material.map) phoneScreen.material.map.dispose();
        phoneScreen.material.map = new THREE.CanvasTexture(canvas);
        phoneScreen.material.needsUpdate = true;
    }

    // Check if looking at UV wall to solve puzzle
    if (!state.solvedPuzzles[1]) {
        const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
        const uvWallDir = new THREE.Vector3(0, 0, 1).normalize();
        const dot = forward.dot(uvWallDir);
        const distToWall = Math.abs(camera.position.z - (ROOM_D / 2));
        if (dot > 0.5 && distToWall < 5) {
            if (!state._phoneUVTimer) {
                state._phoneUVTimer = Date.now();
            } else if (Date.now() - state._phoneUVTimer > 2000) {
                state.solvedPuzzles[1] = true;
                showNotification(`كشفت كاميرا الهاتف عن الرقم ${PUZZLE_DIGITS[1]}!`);
                playPuzzleSolvedSound();
                fillLockDigit(1, PUZZLE_DIGITS[1]);
            }
        } else {
            state._phoneUVTimer = null;
        }
    }
}

// ============= PUZZLE 3: Painting + Red Filter =============
function interactPainting() {
    const activeItem = getActiveItemName();
    if (activeItem === 'فلتر أحمر' && !state.solvedPuzzles[2]) {
        state.filterApplied = true;
        state.solvedPuzzles[2] = true;
        removeHeldItem('فلتر أحمر');

        // Switch painting to red-filtered image
        paintingMesh.material.map = paintingRedTex;
        paintingMesh.material.needsUpdate = true;

        showNotification(`ظهر الرقم ${PUZZLE_DIGITS[2]} في اللوحة!`);
        playPuzzleSolvedSound();
        fillLockDigit(2, PUZZLE_DIGITS[2]);
    } else if (!hasItem('فلتر أحمر') && !state.solvedPuzzles[2]) {
        showNotification('لوحة بخطوط فوضوية... ربما تحتاج شيئاً لكشف السر');
    }
}

// ============= PUZZLE 4: Thermal Cup =============
function interactCoffeeMachine() {
    const activeItem = getActiveItemName();
    if (activeItem === 'كوب' && !state.solvedPuzzles[3]) {
        state.cupPlaced = true;
        removeHeldItem('كوب');
        cupMesh.position.set(-3.5, 0.80, -3 + 0.12);
        cupMesh.visible = true;
        showNotification('يتم تحضير القهوة...');
        state.coffeeBrewing = true;

        let progress = 0;
        const brewInterval = setInterval(() => {
            progress += 0.02;
            if (progress >= 1) {
                clearInterval(brewInterval);
                state.coffeeRevealed = true;
                state.solvedPuzzles[3] = true;
                cupMesh.traverse(child => {
                    if (child.isMesh && child.geometry.type === 'CylinderGeometry') {
                        const tc = document.createElement('canvas');
                        tc.width = 128; tc.height = 64;
                        const tctx = tc.getContext('2d');
                        tctx.fillStyle = '#ffffff';
                        tctx.fillRect(0, 0, 128, 64);
                        tctx.fillStyle = '#333';
                        tctx.font = 'bold 40px Arial';
                        tctx.textAlign = 'center';
                        tctx.textBaseline = 'middle';
                        tctx.fillText(PUZZLE_DIGITS[3], 64, 32);
                        child.material = new THREE.MeshStandardMaterial({
                            map: new THREE.CanvasTexture(tc),
                            roughness: 0.4
                        });
                    }
                });
                showNotification(`ظهر الرقم ${PUZZLE_DIGITS[3]} على الكوب!`);
                playPuzzleSolvedSound();
                fillLockDigit(3, PUZZLE_DIGITS[3]);
            } else {
                cupMesh.traverse(child => {
                    if (child.isMesh && child.geometry.type === 'CylinderGeometry') {
                        const c = new THREE.Color().lerpColors(
                            new THREE.Color(0x111111),
                            new THREE.Color(0xffffff),
                            progress
                        );
                        child.material.color = c;
                    }
                });
            }
        }, 100);
    } else if (!hasItem('كوب') && !state.cupPlaced) {
        showNotification('تحتاج كوباً لصنع القهوة');
    }
}

// ============= PUZZLE 5: Shadow =============
function interactDeskLamp() {
    if (!state.lampOn) {
        state.lampOn = true;
        const shadowLight = new THREE.SpotLight(0xffeecc, 2, 5, Math.PI / 6, 0.3);
        shadowLight.position.set(ROOM_W / 2 - 0.5, 1.2, -0.8);
        shadowLight.target.position.set(ROOM_W / 2 - 0.8, 0.5, -0.5);
        shadowLight.castShadow = true;
        shadowLight.shadow.mapSize.set(1024, 1024);
        scene.add(shadowLight);
        scene.add(shadowLight.target);

        const glow = new THREE.PointLight(0xffeecc, 0.5, 3);
        glow.position.set(ROOM_W / 2 - 0.5, 1.05, -0.8);
        scene.add(glow);

        showNotification('تم تشغيل المصباح');
        if (state.sculptureOnX) solvePuzzle5();
    }
}

function solvePuzzle5() {
    if (state.solvedPuzzles[4]) return;
    state.solvedPuzzles[4] = true;

    const shadowCanvas = document.createElement('canvas');
    shadowCanvas.width = 128; shadowCanvas.height = 128;
    const sCtx = shadowCanvas.getContext('2d');
    sCtx.clearRect(0, 0, 128, 128);
    sCtx.fillStyle = 'rgba(0,0,0,0.6)';
    sCtx.font = 'bold 80px Arial';
    sCtx.textAlign = 'center';
    sCtx.textBaseline = 'middle';
    sCtx.fillText(PUZZLE_DIGITS[4], 64, 64);

    const shadowPlane = new THREE.Mesh(
        new THREE.PlaneGeometry(0.4, 0.4),
        new THREE.MeshBasicMaterial({
            map: new THREE.CanvasTexture(shadowCanvas),
            transparent: true, side: THREE.DoubleSide, depthWrite: false
        })
    );
    shadowPlane.position.set(ROOM_W / 2 - 0.01, 1.2, -0.5);
    shadowPlane.rotation.y = -Math.PI / 2;
    scene.add(shadowPlane);

    showNotification(`الظل يُشكّل الرقم ${PUZZLE_DIGITS[4]}!`);
    playPuzzleSolvedSound();
    fillLockDigit(4, PUZZLE_DIGITS[4]);
}

// ============= PUZZLE 6: Radio (Two Dials) =============
function openRadio() {
    if (state.overlayOpen) return;
    state.overlayOpen = true;
    document.getElementById('radioOverlay').classList.remove('hidden');
    if (isPointerLocked) document.exitPointerLock();

    document.getElementById('radioDialA').value = 50;
    document.getElementById('radioDialB').value = 50;
    document.getElementById('radioDisplay').textContent = 'FM --.-';
    document.getElementById('radioMessage').textContent = '';
    updateRadioDisplay();
}

function updateRadioDisplay() {
    const valA = parseInt(document.getElementById('radioDialA').value);
    const valB = parseInt(document.getElementById('radioDialB').value);

    const diffA = Math.abs(valA - RADIO_TARGET_A);
    const diffB = Math.abs(valB - RADIO_TARGET_B);
    const totalDiff = diffA + diffB;

    // Map dial positions to a frequency for display
    const freq = (88 + (valA + valB) / 10).toFixed(1);
    document.getElementById('radioDisplay').textContent = `FM ${freq}`;

    // Update dial indicators
    const indA = document.getElementById('dialIndicatorA');
    const indB = document.getElementById('dialIndicatorB');
    if (indA) indA.style.background = diffA <= RADIO_TOLERANCE ? '#0f0' : (diffA <= 15 ? '#ff0' : '#f00');
    if (indB) indB.style.background = diffB <= RADIO_TOLERANCE ? '#0f0' : (diffB <= 15 ? '#ff0' : '#f00');

    const msgEl = document.getElementById('radioMessage');

    if (diffA <= RADIO_TOLERANCE && diffB <= RADIO_TOLERANCE) {
        msgEl.textContent = 'إشارة واضحة! الدائرتان متوازنتان';
        msgEl.style.color = '#0f0';
        if (!state.solvedPuzzles[5]) {
            state.solvedPuzzles[5] = true;
            setTimeout(() => {
                showNotification(`الراديو يعرض الرقم ${PUZZLE_DIGITS[5]}!`);
                playPuzzleSolvedSound();
                fillLockDigit(5, PUZZLE_DIGITS[5]);
            }, 500);
        }
    } else if (totalDiff < 25) {
        msgEl.textContent = 'إشارة قريبة... وازن الدائرتين';
        msgEl.style.color = '#ff0';
    } else if (totalDiff < 50) {
        msgEl.textContent = 'تشويش... حاول ضبط الدائرتين';
        msgEl.style.color = '#f80';
    } else {
        msgEl.textContent = 'لا إشارة';
        msgEl.style.color = '#888';
    }
}

// ============= LOCK SYSTEM =============
function fillLockDigit(index, digit) {
    state.lockDigits[index] = digit;
    updateLockUI();
    playSound(1400, 0.15, 'sine');
}

function updateLockUI() {
    for (let i = 0; i < 6; i++) {
        const slot = document.getElementById(`lockSlot${i}`);
        if (slot) {
            slot.textContent = state.lockDigits[i];
            slot.classList.toggle('filled', state.lockDigits[i] !== '_');
        }
    }

    const statusEl = document.getElementById('lockStatus');
    if (statusEl) {
        if (state.lockActivated) {
            statusEl.textContent = 'مفعّلة';
            statusEl.classList.add('active');
        } else {
            statusEl.textContent = 'غير مفعّلة';
            statusEl.classList.remove('active');
        }
    }
}

function openDoorLock() {
    if (state.overlayOpen) return;
    state.overlayOpen = true;
    document.getElementById('doorLockOverlay').classList.remove('hidden');
    if (isPointerLocked) document.exitPointerLock();

    const bodyEl = document.getElementById('doorLockBody');
    const offEl = document.getElementById('doorLockOff');

    if (state.lockActivated) {
        bodyEl.classList.remove('hidden');
        offEl.classList.add('hidden');
        for (let i = 0; i < 6; i++) {
            const slot = document.getElementById(`dlSlot${i}`);
            if (slot) {
                slot.textContent = state.lockDigits[i];
                slot.classList.toggle('filled', state.lockDigits[i] !== '_');
            }
        }
    } else {
        bodyEl.classList.add('hidden');
        offEl.classList.remove('hidden');
    }
}

function confirmDoorCode() {
    const allFilled = state.lockDigits.every(d => d !== '_');
    const msgEl = document.getElementById('doorLockMsg');

    if (!allFilled) {
        msgEl.textContent = 'لم تكتمل جميع الأرقام بعد!';
        msgEl.style.color = '#f44';
        return;
    }

    msgEl.textContent = 'الرمز صحيح!';
    msgEl.style.color = '#0f0';
    playSound(600, 0.2, 'sine');
    setTimeout(() => playSound(800, 0.2, 'sine'), 150);
    setTimeout(() => playSound(1000, 0.3, 'sine'), 300);

    setTimeout(() => {
        closeOverlay('doorLockOverlay');
        winGame();
    }, 1000);
}

// ============= WIN =============
function winGame() {
    state.gameEnded = true;
    clearInterval(state.timerInterval);

    const doorAnim = setInterval(() => {
        doorMesh.rotation.y += 0.05;
        if (doorMesh.rotation.y >= Math.PI / 2) {
            clearInterval(doorAnim);
        }
    }, 30);

    setTimeout(() => {
        const timeStr = getTimeString();
        document.getElementById('winTime').textContent = timeStr;
        document.getElementById('winPlayer').textContent = state.playerName;
        document.getElementById('winScreen').classList.remove('hidden');

        fetch('/api/results', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: state.playerName,
                room: state.roomNumber,
                time: timeStr,
                elapsed_ms: state.elapsed,
            }),
        }).catch(console.error);
    }, 1500);
}

// ============= OVERLAY MANAGEMENT =============
function closeOverlay(id) {
    document.getElementById(id).classList.add('hidden');
    state.overlayOpen = false;
}

// ============= NOTIFICATION =============
function showNotification(text) {
    const el = document.getElementById('notification');
    document.getElementById('notifText').textContent = text;
    el.classList.remove('hidden');
    clearTimeout(el._timeout);
    el._timeout = setTimeout(() => el.classList.add('hidden'), 3000);
}

// ============= SOUND =============
function playSound(freq, duration, type) {
    try {
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = type || 'sine';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + duration);
    } catch (e) { }
}

function playPuzzleSolvedSound() {
    playSound(523, 0.15, 'sine');
    setTimeout(() => playSound(659, 0.15, 'sine'), 100);
    setTimeout(() => playSound(784, 0.2, 'sine'), 200);
    setTimeout(() => playSound(1047, 0.3, 'sine'), 300);
}

// ============= ANIMATION LOOP =============
function animate() {
    requestAnimationFrame(animate);
    if (state.gameEnded && !doorMesh) return;

    const delta = Math.min(clock.getDelta(), 0.1);

    if (state.gameStarted && !state.gameEnded && !state.overlayOpen) {
        velocity.x -= velocity.x * 8.0 * delta;
        velocity.z -= velocity.z * 8.0 * delta;

        if (!isMobile) {
            direction.z = Number(moveForward) - Number(moveBackward);
            direction.x = Number(moveRight) - Number(moveLeft);
        } else {
            direction.z = -joystickData.dy;
            direction.x = joystickData.dx;
        }
        direction.normalize();

        if (direction.z !== 0) velocity.z += direction.z * MOVE_SPEED * delta;
        if (direction.x !== 0) velocity.x += direction.x * MOVE_SPEED * delta;

        const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
        forward.y = 0; forward.normalize();
        const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
        right.y = 0; right.normalize();

        const move = new THREE.Vector3();
        move.addScaledVector(forward, velocity.z * delta);
        move.addScaledVector(right, velocity.x * delta);

        const newPos = camera.position.clone().add(move);

        const margin = 0.3;
        newPos.x = Math.max(-ROOM_W / 2 + margin, Math.min(ROOM_W / 2 - margin, newPos.x));
        newPos.z = Math.max(-ROOM_D / 2 + margin, Math.min(ROOM_D / 2 - margin, newPos.z));
        newPos.y = PLAYER_HEIGHT;

        camera.position.copy(newPos);

        // Raycasting for interaction
        raycaster.setFromCamera(centerRay, camera);
        const intersects = raycaster.intersectObjects(interactiveObjects, true);

        let foundInteractive = null;
        for (const hit of intersects) {
            let obj = hit.object;
            while (obj && !obj.userData.type) obj = obj.parent;
            if (obj && obj.userData.type) {
                foundInteractive = obj;
                break;
            }
        }

        const promptEl = document.getElementById('interactPrompt');
        const promptText = document.getElementById('promptText');
        const mobileBtn = document.getElementById('mobileInteractBtn');

        if (foundInteractive && foundInteractive !== currentHover) {
            currentHover = foundInteractive;
            promptText.textContent = foundInteractive.userData.promptText || 'تفاعل';
            promptEl.classList.remove('hidden');
            if (isMobile && mobileBtn) mobileBtn.classList.remove('hidden');
        } else if (!foundInteractive && currentHover) {
            currentHover = null;
            promptEl.classList.add('hidden');
            if (isMobile && mobileBtn) mobileBtn.classList.add('hidden');
        }

        // Auto-place sculpture on X mark
        if (getActiveItemName() === 'مجسم' && !state.sculptureOnX) {
            const xPos = new THREE.Vector3(ROOM_W / 2 - 0.8, PLAYER_HEIGHT, -0.5);
            const dist = camera.position.distanceTo(xPos);
            if (dist < 2.0) {
                state.sculptureOnX = true;
                removeHeldItem('مجسم');
                sculptureMesh.position.set(ROOM_W / 2 - 0.8, 0.76, -0.5);
                sculptureMesh.visible = true;
                scene.add(sculptureMesh);
                showNotification('وضعت المجسم على علامة X');
                if (state.lampOn) solvePuzzle5();
            }
        }

        // Subtle hand bob when moving
        if (heldItemGroup && (direction.z !== 0 || direction.x !== 0)) {
            const bobTime = Date.now() * 0.006;
            heldItemGroup.position.y = Math.sin(bobTime) * 0.008;
            heldItemGroup.position.x = Math.cos(bobTime * 0.5) * 0.003;
        } else if (heldItemGroup) {
            heldItemGroup.position.y *= 0.9;
            heldItemGroup.position.x *= 0.9;
        }
    }

    // Diamond rotation
    if (diamondMesh) {
        diamondMesh.rotation.y += delta * 0.5;
        if (state.diamondHit) {
            diamondMesh.material.emissiveIntensity = 1.5 + Math.sin(Date.now() * 0.003) * 0.5;
        }
    }

    // Update phone camera if active
    updatePhoneInHand();

    renderer.render(scene, camera);
}

function onResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// ============= CONTROLS INFO =============
document.addEventListener('DOMContentLoaded', () => {
    const isMob = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || ('ontouchstart' in window);
    const info = document.getElementById('controlsInfo');
    if (info) {
        info.textContent = isMob
            ? 'التحكم: عصا افتراضية للحركة + سحب للنظر'
            : 'التحكم: W/S للأمام/الخلف | A/D للجانب | الماوس للنظر | سكرول لتبديل الأدوات';
    }
    isMobile = isMob;

    document.addEventListener('keydown', (e) => {
        if (e.code === 'KeyF' && getActiveItemName() === 'مجسم' && !state.sculptureOnX) {
            const xPos = new THREE.Vector3(ROOM_W / 2 - 0.8, PLAYER_HEIGHT, -0.5);
            if (camera.position.distanceTo(xPos) < 2.5) {
                state.sculptureOnX = true;
                removeHeldItem('مجسم');
                sculptureMesh.position.set(ROOM_W / 2 - 0.8, 0.77, -0.5);
                sculptureMesh.visible = true;
                showNotification('تم وضع المجسم على العلامة!');
                if (state.lampOn) solvePuzzle5();
            }
        }
    });
});

// Make functions accessible from HTML
window.startGame = startGame;
window.closeOverlay = closeOverlay;
window.updateRadioDisplay = updateRadioDisplay;
window.confirmDoorCode = confirmDoorCode;
window.showAdminTab = showAdminTab;
window.tryInteract = tryInteract;
