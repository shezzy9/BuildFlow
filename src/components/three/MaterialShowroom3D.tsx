import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { ChevronDown, ChevronUp, RotateCcw, Layers, Eye } from 'lucide-react';

export type CameraPresetKey = 'iso' | 'masonry' | 'steel' | 'top';
export type MaterialFocusKey = 'all' | 'bricks' | 'cement' | 'steel' | 'pipes' | 'timber' | 'cmu';

interface MaterialShowroom3DProps {
  variant?: 'hero' | 'login';
  onSelectCategory?: (category: string) => void;
}

const CAMERA_PRESETS: Record<
  CameraPresetKey,
  { pos: [number, number, number]; target: [number, number, number]; label: string }
> = {
  iso: {
    pos: [4.2, 3.0, 4.7],
    target: [0, 0.12, 0],
    label: 'Studio View',
  },
  masonry: {
    pos: [-3.3, 2.3, 4.0],
    target: [-0.85, 0.25, 0.3],
    label: 'Masonry & Cement',
  },
  steel: {
    pos: [3.8, 2.2, -3.4],
    target: [0.75, 0.22, -0.3],
    label: 'Steel & Timber',
  },
  top: {
    pos: [0.01, 7.2, 0.7],
    target: [0, 0.15, 0],
    label: 'Plan View',
  },
};

const FOCUS_TARGETS: Record<
  MaterialFocusKey,
  { pos: [number, number, number]; target: [number, number, number]; label: string; spec: string }
> = {
  all: {
    pos: [4.2, 3.0, 4.7],
    target: [0, 0.12, 0],
    label: 'Complete Assembly',
    spec: '6 Core Material Families · Architectural Grade Specimens',
  },
  bricks: {
    pos: [-3.2, 2.3, 3.6],
    target: [-1.25, 0.55, 0.85],
    label: 'Kilned Clay Bricks',
    spec: '215×102.5×65mm · 3-Core Perforated Wirecut Terracotta',
  },
  cement: {
    pos: [-3.0, 2.5, -3.2],
    target: [-1.15, 0.65, -0.85],
    label: 'Portland Cement 52.5N',
    spec: '50kg Multi-Wall Kraft · EN 197-1 Structural Binder',
  },
  steel: {
    pos: [3.4, 2.2, 3.5],
    target: [1.15, 0.45, 0.9],
    label: 'Ribbed Steel Rebar',
    spec: 'BS 4449 Grade B500B · 16mm Carbon Steel Bundle',
  },
  pipes: {
    pos: [3.5, 2.3, -3.1],
    target: [1.2, 0.5, -0.85],
    label: 'Schedule-80 UPVC Pipes',
    spec: '110mm SN8 Conduit · Integral EPDM Bell Socket',
  },
  timber: {
    pos: [0.2, 2.8, 4.2],
    target: [0.0, 0.55, 0.05],
    label: 'Structural Timber C24',
    spec: 'Kiln-Dried Douglas Fir · 47×200mm Regularized Joists',
  },
  cmu: {
    pos: [0.4, 2.5, -3.8],
    target: [0.1, 0.5, -1.1],
    label: 'Hollow Concrete CMU',
    spec: '390×190×190mm · 10.4 N/mm² Twin-Core Masonry Unit',
  },
};

// Pre-allocated math scratch objects outside render loop (Zero GC rule)
const _targetCameraPos = new THREE.Vector3();
const _targetLookAt = new THREE.Vector3();
const _scratchVec = new THREE.Vector3();

function createContactShadowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(128, 128, 18, 128, 128, 124);
  grad.addColorStop(0, 'rgba(37, 41, 35, 0.52)');
  grad.addColorStop(0.55, 'rgba(37, 41, 35, 0.22)');
  grad.addColorStop(1, 'rgba(37, 41, 35, 0.0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(canvas);
  return tex;
}

function createNoiseBumpTexture(size = 128, contrast = 28): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(size, size);
  let seed = 1337;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
  for (let i = 0; i < img.data.length; i += 4) {
    const v = Math.floor(128 + (rand() - 0.5) * contrast * 2);
    img.data[i] = v;
    img.data[i + 1] = v;
    img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function createCementBagTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  // Kraft paper base
  ctx.fillStyle = '#D5C5B0';
  ctx.fillRect(0, 0, 512, 512);

  // Subtle fiber lines
  ctx.strokeStyle = 'rgba(145, 125, 102, 0.16)';
  ctx.lineWidth = 2;
  for (let y = 0; y < 512; y += 8) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(512, y);
    ctx.stroke();
  }

  // Architectural green brand band
  ctx.fillStyle = '#315744';
  ctx.fillRect(36, 150, 440, 145);

  // Terracotta accent stripe
  ctx.fillStyle = '#BD704F';
  ctx.fillRect(36, 305, 440, 26);

  // Typography on bag
  ctx.fillStyle = '#F7F6F2';
  ctx.font = 'bold 42px sans-serif';
  ctx.fillText('BUILDFLOW', 64, 215);
  ctx.font = '600 26px monospace';
  ctx.fillText('CEM I 52.5N · 50 KG', 64, 262);

  ctx.fillStyle = '#252923';
  ctx.font = 'bold 22px monospace';
  ctx.fillText('PORTLAND STRUCTURAL', 64, 375);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

function createWoodGrainTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#C99B64';
  ctx.fillRect(0, 0, 256, 256);

  for (let i = 0; i < 60; i++) {
    ctx.fillStyle = i % 2 === 0 ? 'rgba(150, 104, 54, 0.18)' : 'rgba(222, 182, 128, 0.15)';
    ctx.fillRect(0, i * 4.2, 256, 2.2);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

export const MaterialShowroom3D: React.FC<MaterialShowroom3DProps> = ({
  variant = 'hero',
  onSelectCategory,
}) => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [webglFailed, setWebglFailed] = useState(false);
  const [activePreset, setActivePreset] = useState<CameraPresetKey>('iso');
  const [activeFocus, setActiveFocus] = useState<MaterialFocusKey>('all');
  const [explodedRatio, setExplodedRatio] = useState<number>(0);
  const [dockCollapsed, setDockCollapsed] = useState<boolean>(false);
  const [hoveredMaterialLabel, setHoveredMaterialLabel] = useState<string | null>(null);

  // Store mutable control targets in refs so React UI updates never recreate WebGLRenderer
  const stateRef = useRef({
    targetCamPos: new THREE.Vector3(...CAMERA_PRESETS.iso.pos),
    targetLookAt: new THREE.Vector3(...CAMERA_PRESETS.iso.target),
    explodedTarget: 0,
    currentExploded: 0,
    isCameraTransitioning: false,
    focusKey: 'all' as MaterialFocusKey,
    presetKey: 'iso' as CameraPresetKey,
    requestRenderFn: () => {},
  });

  const onSelectCategoryRef = useRef(onSelectCategory);
  onSelectCategoryRef.current = onSelectCategory;

  const handlePresetChange = (presetKey: CameraPresetKey) => {
    setActivePreset(presetKey);
    setActiveFocus('all');
    const p = CAMERA_PRESETS[presetKey];
    stateRef.current.targetCamPos.set(...p.pos);
    stateRef.current.targetLookAt.set(...p.target);
    stateRef.current.focusKey = 'all';
    stateRef.current.presetKey = presetKey;
    stateRef.current.isCameraTransitioning = true;
    stateRef.current.requestRenderFn();
  };

  const handleFocusChange = (focusKey: MaterialFocusKey) => {
    setActiveFocus(focusKey);
    const f = FOCUS_TARGETS[focusKey];
    stateRef.current.targetCamPos.set(...f.pos);
    stateRef.current.targetLookAt.set(...f.target);
    stateRef.current.focusKey = focusKey;
    stateRef.current.isCameraTransitioning = true;
    stateRef.current.requestRenderFn();
    if (onSelectCategoryRef.current) {
      const catMap: Record<MaterialFocusKey, string> = {
        all: 'All',
        bricks: 'Bricks',
        cement: 'Cement',
        steel: 'Steel',
        pipes: 'Pipes',
        timber: 'Timber',
        cmu: 'Aggregates',
      };
      onSelectCategoryRef.current(catMap[focusKey]);
    }
  };

  const handleExplodedChange = (val: number) => {
    setExplodedRatio(val);
    stateRef.current.explodedTarget = val;
    stateRef.current.requestRenderFn();
  };

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    // 1. Software WebGL detection from GPU renderer string
    const isSoftwareGl = (() => {
      try {
        const probeCanvas = document.createElement('canvas');
        const gl = probeCanvas.getContext('webgl2') || probeCanvas.getContext('webgl');
        if (!gl) return true;
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
        const gpu = String(gl.getParameter(param));
        gl.getExtension('WEBGL_lose_context')?.loseContext();
        return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
      } catch {
        return true;
      }
    })();

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: !isSoftwareGl,
        powerPreference: 'high-performance',
        alpha: false,
      });
    } catch {
      setWebglFailed(true);
      return;
    }

    const width = Math.max(container.clientWidth, 320);
    const height = Math.max(container.clientHeight, 320);

    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    container.innerHTML = '';
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const bgColor = new THREE.Color(0xF7F6F2);
    scene.background = bgColor;
    scene.fog = new THREE.Fog(0xF7F6F2, 11, 24);

    // 2. Mandatory RoomEnvironment via PMREMGenerator
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const envTexture = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTexture;
    pmremGenerator.dispose();

    // Camera & OrbitControls
    const camera = new THREE.PerspectiveCamera(36, width / height, 0.1, 50);
    camera.position.set(...CAMERA_PRESETS.iso.pos);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(...CAMERA_PRESETS.iso.target);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.07;
    controls.maxPolarAngle = Math.PI / 2 - 0.04;
    controls.minDistance = 2.6;
    controls.maxDistance = 12.5;
    controls.update();

    // 3. Balanced 3-Point Studio Lighting Rig (Warm Key + Cool Hemisphere Fill + Rim)
    const hemiLight = new THREE.HemisphereLight(0xF7F6F2, 0xD6D1C4, 0.95);
    hemiLight.position.set(0, 12, 0);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xFFF5E4, 2.1);
    keyLight.position.set(6.5, 9.5, 5.5);
    keyLight.castShadow = !isSoftwareGl;
    const d = 4.2;
    keyLight.shadow.camera.left = -d;
    keyLight.shadow.camera.right = d;
    keyLight.shadow.camera.top = d;
    keyLight.shadow.camera.bottom = -d;
    keyLight.shadow.camera.near = 1;
    keyLight.shadow.camera.far = 22;
    keyLight.shadow.mapSize.width = 1024;
    keyLight.shadow.mapSize.height = 1024;
    keyLight.shadow.bias = -0.0005;
    keyLight.shadow.normalBias = 0.02;
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0xE3ECE8, 0.85);
    rimLight.position.set(-5.5, 4.5, -5.0);
    scene.add(rimLight);

    // Procedural Textures & Materials
    const maxAniso = renderer.capabilities.getMaxAnisotropy();
    const shadowTex = createContactShadowTexture();
    const bumpTex = createNoiseBumpTexture(128, 26);
    const cementBagTex = createCementBagTexture(maxAniso);
    const woodTex = createWoodGrainTexture(maxAniso);

    const disposables: Array<{ dispose: () => void }> = [
      envTexture,
      shadowTex,
      bumpTex,
      cementBagTex,
      woodTex,
    ];

    const track = <T extends { dispose: () => void }>(item: T): T => {
      disposables.push(item);
      return item;
    };

    // Architectural Studio Ground & Plinth
    const floorGeo = track(new THREE.PlaneGeometry(36, 36));
    const floorMat = track(
      new THREE.MeshStandardMaterial({
        color: 0xF7F6F2,
        roughness: 0.92,
        metalness: 0.0,
      })
    );
    const floorMesh = new THREE.Mesh(floorGeo, floorMat);
    floorMesh.rotation.x = -Math.PI / 2;
    floorMesh.position.y = 0;
    floorMesh.receiveShadow = true;
    scene.add(floorMesh);

    // Soft radial contact shadow under main plinth (offset >= 0.015 to avoid Z-fighting)
    const mainShadowGeo = track(new THREE.PlaneGeometry(6.8, 5.6));
    const mainShadowMat = track(
      new THREE.MeshBasicMaterial({
        map: shadowTex,
        transparent: true,
        depthWrite: false,
        opacity: 0.5,
      })
    );
    const mainShadow = new THREE.Mesh(mainShadowGeo, mainShadowMat);
    mainShadow.rotation.x = -Math.PI / 2;
    mainShadow.position.y = 0.015;
    scene.add(mainShadow);

    // Architectural Travertine Showroom Plinth (Composite Group)
    const plinthGroup = new THREE.Group();
    const plinthBaseGeo = track(new RoundedBoxGeometry(4.6, 0.18, 3.6, 3, 0.025));
    const plinthMat = track(
      new THREE.MeshStandardMaterial({
        color: 0xECE9E0,
        roughness: 0.72,
        metalness: 0.04,
        bumpMap: bumpTex,
        bumpScale: 0.004,
      })
    );
    const plinthMesh = new THREE.Mesh(plinthBaseGeo, plinthMat);
    plinthMesh.position.y = 0.09;
    plinthMesh.receiveShadow = true;
    plinthMesh.castShadow = true;
    plinthGroup.add(plinthMesh);

    // Brass-bronze perimeter inlay trim on plinth
    const trimGeo = track(new THREE.BoxGeometry(4.62, 0.02, 3.62));
    const trimMat = track(
      new THREE.MeshStandardMaterial({
        color: 0x9C7A5B,
        roughness: 0.32,
        metalness: 0.75,
      })
    );
    const trimMesh = new THREE.Mesh(trimGeo, trimMat);
    trimMesh.position.y = 0.02;
    plinthGroup.add(trimMesh);
    scene.add(plinthGroup);

    const plinthTopY = 0.18;

    // Shared Materials with varied roughness >= 0.25 across adjacent parts
    const terracottaMat = track(
      new THREE.MeshStandardMaterial({
        color: 0xBD704F,
        roughness: 0.78,
        metalness: 0.04,
        bumpMap: bumpTex,
        bumpScale: 0.008,
      })
    );
    const terracottaDarkHoleMat = track(
      new THREE.MeshStandardMaterial({
        color: 0x4A291B,
        roughness: 0.95,
        metalness: 0.0,
      })
    );
    const palletWoodMat = track(
      new THREE.MeshStandardMaterial({
        map: woodTex,
        color: 0xffffff,
        roughness: 0.76,
        metalness: 0.02,
        bumpMap: bumpTex,
        bumpScale: 0.005,
      })
    );
    const timberEndMat = track(
      new THREE.MeshStandardMaterial({
        color: 0xD9B382,
        roughness: 0.85,
        metalness: 0.0,
      })
    );
    const strapMat = track(
      new THREE.MeshStandardMaterial({
        color: 0x252923,
        roughness: 0.28,
        metalness: 0.72,
      })
    );
    const cementBagMat = track(
      new THREE.MeshStandardMaterial({
        map: cementBagTex,
        color: 0xffffff,
        roughness: 0.82,
        metalness: 0.02,
        bumpMap: bumpTex,
        bumpScale: 0.005,
      })
    );
    const seamMat = track(
      new THREE.MeshStandardMaterial({
        color: 0xBD704F,
        roughness: 0.5,
        metalness: 0.1,
      })
    );
    const steelRebarMat = track(
      new THREE.MeshPhysicalMaterial({
        color: 0x4B524E,
        roughness: 0.24,
        metalness: 0.88,
        anisotropy: 0.7,
        clearcoat: 0.15,
      })
    );
    const steelCutEndMat = track(
      new THREE.MeshStandardMaterial({
        color: 0x9CA49F,
        roughness: 0.15,
        metalness: 0.94,
      })
    );
    const copperTieMat = track(
      new THREE.MeshStandardMaterial({
        color: 0xBD704F,
        roughness: 0.3,
        metalness: 0.82,
      })
    );
    const upvcOuterMat = track(
      new THREE.MeshPhysicalMaterial({
        color: 0x7A847F,
        roughness: 0.22,
        metalness: 0.12,
        clearcoat: 0.45,
        clearcoatRoughness: 0.18,
      })
    );
    const upvcInnerMat = track(
      new THREE.MeshStandardMaterial({
        color: 0x2B302D,
        roughness: 0.65,
        metalness: 0.05,
      })
    );
    const cmuConcreteMat = track(
      new THREE.MeshStandardMaterial({
        color: 0xB8B5AC,
        roughness: 0.88,
        metalness: 0.02,
        bumpMap: bumpTex,
        bumpScale: 0.012,
      })
    );

    const interactableGroups: Array<{
      key: MaterialFocusKey;
      categoryName: string;
      group: THREE.Group;
      basePos: THREE.Vector3;
      explodeVec: THREE.Vector3;
      meshes: THREE.Mesh[];
    }> = [];

    const addGroupShadow = (parent: THREE.Group, rx: number, rz: number) => {
      const sGeo = track(new THREE.PlaneGeometry(rx, rz));
      const sMesh = new THREE.Mesh(sGeo, mainShadowMat);
      sMesh.rotation.x = -Math.PI / 2;
      sMesh.position.y = 0.008;
      parent.add(sMesh);
    };

    // =========================================================================
    // GROUP 1: STACKED KILNED CLAY BRICKS (Composite 10+ parts, bottom-pivoted)
    // =========================================================================
    const bricksGroup = new THREE.Group();
    const bricksBasePos = new THREE.Vector3(-1.25, plinthTopY, 0.85);
    bricksGroup.position.copy(bricksBasePos);
    addGroupShadow(bricksGroup, 1.35, 1.15);

    // Timber Pallet Base (3 runners + 4 deck slats)
    const runnerGeo = track(new THREE.BoxGeometry(1.05, 0.05, 0.08));
    [-0.34, 0, 0.34].forEach((zOff) => {
      const rMesh = new THREE.Mesh(runnerGeo, palletWoodMat);
      rMesh.position.set(0, 0.025, zOff);
      rMesh.castShadow = true;
      rMesh.receiveShadow = true;
      bricksGroup.add(rMesh);
    });
    const slatGeo = track(new THREE.BoxGeometry(0.22, 0.025, 0.82));
    [-0.38, -0.13, 0.13, 0.38].forEach((xOff) => {
      const sMesh = new THREE.Mesh(slatGeo, palletWoodMat);
      sMesh.position.set(xOff, 0.062, 0);
      sMesh.castShadow = true;
      sMesh.receiveShadow = true;
      bricksGroup.add(sMesh);
    });

    // Individual Perforated Clay Bricks across 3 courses
    const brickGeo = track(new RoundedBoxGeometry(0.42, 0.14, 0.21, 2, 0.015));
    const coreHoleGeo = track(new THREE.CylinderGeometry(0.032, 0.032, 0.144, 12));
    const brickPositions: Array<[number, number, number, number]> = [
      // Course 1
      [-0.23, 0.145, -0.22, 0],
      [0.23, 0.145, -0.22, 0],
      [-0.23, 0.145, 0.02, 0],
      [0.23, 0.145, 0.02, 0],
      [-0.23, 0.145, 0.26, 0],
      [0.23, 0.145, 0.26, 0],
      // Course 2
      [-0.22, 0.29, -0.18, 0.02],
      [0.24, 0.29, -0.18, -0.01],
      [-0.23, 0.29, 0.12, 0],
      [0.23, 0.29, 0.12, 0.015],
      // Course 3 (top display bricks)
      [-0.18, 0.435, -0.05, 0.06],
      [0.25, 0.435, 0.05, -0.08],
    ];
    brickPositions.forEach(([bx, by, bz, rotY]) => {
      const bSub = new THREE.Group();
      bSub.position.set(bx, by, bz);
      bSub.rotation.y = rotY;
      const bMesh = new THREE.Mesh(brickGeo, terracottaMat);
      bMesh.castShadow = true;
      bMesh.receiveShadow = true;
      bSub.add(bMesh);

      [-0.12, 0, 0.12].forEach((hx) => {
        const hMesh = new THREE.Mesh(coreHoleGeo, terracottaDarkHoleMat);
        hMesh.position.set(hx, 0, 0);
        bSub.add(hMesh);
      });
      bricksGroup.add(bSub);
    });

    scene.add(bricksGroup);

    // =========================================================================
    // GROUP 2: PORTLAND CEMENT BAGS (Composite 8 parts, bottom-pivoted)
    // =========================================================================
    const cementGroup = new THREE.Group();
    const cementBasePos = new THREE.Vector3(-1.15, plinthTopY, -0.85);
    cementGroup.position.copy(cementBasePos);
    addGroupShadow(cementGroup, 1.35, 1.15);

    // Pallet base
    [-0.32, 0, 0.32].forEach((zOff) => {
      const rMesh = new THREE.Mesh(runnerGeo, palletWoodMat);
      rMesh.position.set(0, 0.025, zOff);
      rMesh.castShadow = true;
      cementGroup.add(rMesh);
    });
    [-0.36, -0.12, 0.12, 0.36].forEach((xOff) => {
      const sMesh = new THREE.Mesh(slatGeo, palletWoodMat);
      sMesh.position.set(xOff, 0.062, 0);
      sMesh.castShadow = true;
      cementGroup.add(sMesh);
    });

    const bagGeo = track(new RoundedBoxGeometry(0.68, 0.16, 0.46, 4, 0.055));
    const bagSeamGeo = track(new THREE.BoxGeometry(0.69, 0.022, 0.03));
    const bagConfigs: Array<[number, number, number, number]> = [
      [-0.12, 0.155, -0.16, 0.03],
      [0.14, 0.155, 0.18, -0.04],
      [-0.06, 0.315, 0.02, 0.12],
      [0.05, 0.475, -0.02, -0.08],
    ];
    bagConfigs.forEach(([x, y, z, ry]) => {
      const singleBag = new THREE.Group();
      singleBag.position.set(x, y, z);
      singleBag.rotation.y = ry;
      const bMesh = new THREE.Mesh(bagGeo, cementBagMat);
      bMesh.castShadow = true;
      bMesh.receiveShadow = true;
      singleBag.add(bMesh);

      const frontSeam = new THREE.Mesh(bagSeamGeo, seamMat);
      frontSeam.position.set(0, 0, 0.23);
      singleBag.add(frontSeam);

      const backSeam = new THREE.Mesh(bagSeamGeo, seamMat);
      backSeam.position.set(0, 0, -0.23);
      singleBag.add(backSeam);

      cementGroup.add(singleBag);
    });

    scene.add(cementGroup);

    // =========================================================================
    // GROUP 3: RIBBED STEEL REBAR BUNDLE (Composite 12 parts, bottom-pivoted)
    // =========================================================================
    const steelGroup = new THREE.Group();
    const steelBasePos = new THREE.Vector3(1.15, plinthTopY, 0.9);
    steelGroup.position.copy(steelBasePos);
    addGroupShadow(steelGroup, 1.55, 0.95);

    // Two timber cradle sleepers with notches
    const cradleGeo = track(new RoundedBoxGeometry(0.14, 0.1, 0.68, 2, 0.01));
    [-0.48, 0.48].forEach((cx) => {
      const cMesh = new THREE.Mesh(cradleGeo, palletWoodMat);
      cMesh.position.set(cx, 0.05, 0);
      cMesh.castShadow = true;
      cMesh.receiveShadow = true;
      steelGroup.add(cMesh);
    });

    const rebarLen = 1.55;
    const rodGeo = track(new THREE.CylinderGeometry(0.042, 0.042, rebarLen, 16));
    rodGeo.rotateZ(Math.PI / 2);
    const capGeo = track(new THREE.CircleGeometry(0.041, 16));
    capGeo.rotateY(Math.PI / 2);

    const rodOffsets: Array<[number, number]> = [
      [0, 0.14],
      [-0.088, 0.14],
      [0.088, 0.14],
      [-0.176, 0.14],
      [0.176, 0.14],
      [-0.044, 0.215],
      [0.044, 0.215],
      [-0.132, 0.215],
      [0.132, 0.215],
      [0, 0.29],
    ];

    rodOffsets.forEach(([rz, ry]) => {
      const rodMesh = new THREE.Mesh(rodGeo, steelRebarMat);
      rodMesh.position.set(0, ry, rz);
      rodMesh.castShadow = true;
      rodMesh.receiveShadow = true;
      steelGroup.add(rodMesh);

      const endCapR = new THREE.Mesh(capGeo, steelCutEndMat);
      endCapR.position.set(rebarLen / 2 + 0.001, ry, rz);
      steelGroup.add(endCapR);
    });

    // Copper-terracotta tie wire bands around the bundle
    const tieGeo = track(new THREE.TorusGeometry(0.18, 0.014, 10, 24));
    tieGeo.rotateY(Math.PI / 2);
    [-0.36, 0, 0.36].forEach((tx) => {
      const tMesh = new THREE.Mesh(tieGeo, copperTieMat);
      tMesh.position.set(tx, 0.19, 0);
      tMesh.scale.set(1, 0.72, 1.15);
      steelGroup.add(tMesh);
    });

    scene.add(steelGroup);

    // =========================================================================
    // GROUP 4: SCHEDULE-80 UPVC CONDUIT PIPES (Composite 9 parts, bottom-pivoted)
    // =========================================================================
    const pipesGroup = new THREE.Group();
    const pipesBasePos = new THREE.Vector3(1.2, plinthTopY, -0.85);
    pipesGroup.position.copy(pipesBasePos);
    addGroupShadow(pipesGroup, 1.45, 1.05);

    // Timber pipe cradles
    [-0.42, 0.42].forEach((cx) => {
      const cMesh = new THREE.Mesh(cradleGeo, palletWoodMat);
      cMesh.position.set(cx, 0.05, 0);
      cMesh.castShadow = true;
      pipesGroup.add(cMesh);
    });

    const pipeLen = 1.32;
    const outerPipeGeo = track(new THREE.CylinderGeometry(0.115, 0.115, pipeLen, 24));
    outerPipeGeo.rotateZ(Math.PI / 2);
    const innerBoreGeo = track(new THREE.CylinderGeometry(0.092, 0.092, pipeLen + 0.01, 20));
    innerBoreGeo.rotateZ(Math.PI / 2);
    const bellSocketGeo = track(new THREE.CylinderGeometry(0.132, 0.118, 0.18, 24));
    bellSocketGeo.rotateZ(Math.PI / 2);
    const gasketGeo = track(new THREE.TorusGeometry(0.126, 0.012, 10, 24));
    gasketGeo.rotateY(Math.PI / 2);

    const pipeCoords: Array<[number, number]> = [
      [-0.13, 0.21],
      [0.13, 0.21],
      [0, 0.42],
    ];
    pipeCoords.forEach(([pz, py]) => {
      const pUnit = new THREE.Group();
      pUnit.position.set(0, py, pz);

      const outerM = new THREE.Mesh(outerPipeGeo, upvcOuterMat);
      outerM.castShadow = true;
      outerM.receiveShadow = true;
      pUnit.add(outerM);

      const innerM = new THREE.Mesh(innerBoreGeo, upvcInnerMat);
      pUnit.add(innerM);

      const socketM = new THREE.Mesh(bellSocketGeo, upvcOuterMat);
      socketM.position.x = pipeLen / 2 - 0.05;
      socketM.castShadow = true;
      pUnit.add(socketM);

      const gasketM = new THREE.Mesh(gasketGeo, seamMat);
      gasketM.position.x = pipeLen / 2 + 0.035;
      pUnit.add(gasketM);

      pipesGroup.add(pUnit);
    });

    scene.add(pipesGroup);

    // =========================================================================
    // GROUP 5: KILN-DRIED STRUCTURAL TIMBER C24 (Composite 9 parts, bottom-pivoted)
    // =========================================================================
    const timberGroup = new THREE.Group();
    const timberBasePos = new THREE.Vector3(0.0, plinthTopY, 0.05);
    timberGroup.position.copy(timberBasePos);
    addGroupShadow(timberGroup, 1.35, 0.95);

    const plankGeo = track(new RoundedBoxGeometry(1.26, 0.09, 0.22, 2, 0.008));
    const endCapGeo = track(new THREE.PlaneGeometry(0.21, 0.082));
    endCapGeo.rotateY(Math.PI / 2);
    const battenGeo = track(new THREE.BoxGeometry(0.06, 0.03, 0.72));

    // Bottom timber layer (3 planks)
    [-0.24, 0, 0.24].forEach((tz) => {
      const pMesh = new THREE.Mesh(plankGeo, palletWoodMat);
      pMesh.position.set(0, 0.045, tz);
      pMesh.castShadow = true;
      pMesh.receiveShadow = true;
      timberGroup.add(pMesh);

      const capMesh = new THREE.Mesh(endCapGeo, timberEndMat);
      capMesh.position.set(0.631, 0.045, tz);
      timberGroup.add(capMesh);
    });

    // Cross spacer battens
    [-0.38, 0.38].forEach((bx) => {
      const bat = new THREE.Mesh(battenGeo, timberEndMat);
      bat.position.set(bx, 0.105, 0);
      timberGroup.add(bat);
    });

    // Second timber layer (2 planks)
    [-0.13, 0.13].forEach((tz) => {
      const pMesh = new THREE.Mesh(plankGeo, palletWoodMat);
      pMesh.position.set(0, 0.165, tz);
      pMesh.castShadow = true;
      pMesh.receiveShadow = true;
      timberGroup.add(pMesh);

      const capMesh = new THREE.Mesh(endCapGeo, timberEndMat);
      capMesh.position.set(0.631, 0.165, tz);
      timberGroup.add(capMesh);
    });

    // Top structural beam
    const topBeamGeo = track(new RoundedBoxGeometry(1.18, 0.13, 0.18, 2, 0.01));
    const topBeam = new THREE.Mesh(topBeamGeo, palletWoodMat);
    topBeam.position.set(0, 0.275, 0);
    topBeam.castShadow = true;
    topBeam.receiveShadow = true;
    timberGroup.add(topBeam);

    // Steel packaging strap around bottom layer
    const strapBandGeo = track(new THREE.BoxGeometry(0.025, 0.1, 0.72));
    const strapBand = new THREE.Mesh(strapBandGeo, strapMat);
    strapBand.position.set(0, 0.05, 0);
    timberGroup.add(strapBand);

    scene.add(timberGroup);

    // =========================================================================
    // GROUP 6: HOLLOW CONCRETE MASONRY UNITS (CMU) (Composite 8 parts)
    // =========================================================================
    const cmuGroup = new THREE.Group();
    const cmuBasePos = new THREE.Vector3(0.05, plinthTopY, -1.05);
    cmuGroup.position.copy(cmuBasePos);
    addGroupShadow(cmuGroup, 1.15, 0.85);

    const cmuShellGeo = track(new RoundedBoxGeometry(0.46, 0.24, 0.24, 2, 0.012));
    const cmuCavityGeo = track(new THREE.BoxGeometry(0.15, 0.244, 0.16));

    const buildCmuBlock = (x: number, y: number, z: number, ry: number) => {
      const block = new THREE.Group();
      block.position.set(x, y, z);
      block.rotation.y = ry;

      const shell = new THREE.Mesh(cmuShellGeo, cmuConcreteMat);
      shell.castShadow = true;
      shell.receiveShadow = true;
      block.add(shell);

      [-0.11, 0.11].forEach((cx) => {
        const cav = new THREE.Mesh(cmuCavityGeo, upvcInnerMat);
        cav.position.set(cx, 0.002, 0);
        block.add(cav);
      });
      return block;
    };

    cmuGroup.add(buildCmuBlock(-0.25, 0.12, 0, 0.04));
    cmuGroup.add(buildCmuBlock(0.25, 0.12, 0.02, -0.03));
    cmuGroup.add(buildCmuBlock(0.0, 0.36, 0.0, 0.08));

    scene.add(cmuGroup);

    // Collect interactable groups & assign meshes for raycasting + sub-part exploded vectors
    const registerInteractable = (
      key: MaterialFocusKey,
      categoryName: string,
      group: THREE.Group,
      basePos: THREE.Vector3,
      explodeVec: THREE.Vector3
    ) => {
      const meshes: THREE.Mesh[] = [];
      group.children.forEach((subChild, idx) => {
        // Skip contact shadow plane at index 0
        if (idx === 0) return;
        subChild.userData.baseLocalPos = subChild.position.clone();
        const dy = Math.max(0.06, subChild.position.y * 0.95 + idx * 0.032);
        subChild.userData.explodeSubVec = new THREE.Vector3(
          subChild.position.x * 0.55,
          dy,
          subChild.position.z * 0.55
        );
      });

      group.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          const m = child as THREE.Mesh;
          m.userData.focusKey = key;
          m.userData.categoryName = categoryName;
          meshes.push(m);
        }
      });
      group.userData.currentScale = 1;
      group.userData.currentLift = 0;
      interactableGroups.push({ key, categoryName, group, basePos, explodeVec, meshes });
    };

    registerInteractable(
      'bricks',
      'Bricks',
      bricksGroup,
      bricksBasePos,
      new THREE.Vector3(-0.65, 0.22, 0.52)
    );
    registerInteractable(
      'cement',
      'Cement',
      cementGroup,
      cementBasePos,
      new THREE.Vector3(-0.65, 0.28, -0.52)
    );
    registerInteractable(
      'steel',
      'Steel',
      steelGroup,
      steelBasePos,
      new THREE.Vector3(0.65, 0.18, 0.52)
    );
    registerInteractable(
      'pipes',
      'Pipes',
      pipesGroup,
      pipesBasePos,
      new THREE.Vector3(0.65, 0.25, -0.52)
    );
    registerInteractable(
      'timber',
      'Timber',
      timberGroup,
      timberBasePos,
      new THREE.Vector3(0, 0.48, 0.18)
    );
    registerInteractable(
      'cmu',
      'Aggregates',
      cmuGroup,
      cmuBasePos,
      new THREE.Vector3(0, 0.35, -0.58)
    );

    const allPickableMeshes = interactableGroups.flatMap((g) => g.meshes);

    // Pre-compile shaders on hardware GPU
    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    // 4. On-Demand Render Loop with Software-WebGL `afterDraw` Pacing & Exponential Damping
    let frameId = 0;
    let renderBusy = false;
    let renderDirty = false;
    let isDisposed = false;
    let lastTime = performance.now();

    function afterDraw(cb: () => void) {
      if (isDisposed) return;
      const gl = renderer.getContext() as WebGL2RenderingContext;
      if (gl && typeof gl.fenceSync === 'function') {
        const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
        gl.flush();
        const poll = () => {
          if (isDisposed) return;
          const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
          if (state === gl.UNSIGNALED) {
            frameId = window.setTimeout(poll, 5);
          } else {
            if (sync) gl.deleteSync(sync);
            frameId = window.setTimeout(cb, 80);
          }
        };
        frameId = window.setTimeout(poll, 5);
      } else {
        frameId = window.setTimeout(cb, 80);
      }
    }

    function stepSimulation(dt: number): boolean {
      let needsMoreFrames = false;
      const st = stateRef.current;

      // Smoothly damp exploded view separation
      const expDiff = Math.abs(st.explodedTarget - st.currentExploded);
      if (expDiff > 0.001) {
        st.currentExploded = THREE.MathUtils.damp(
          st.currentExploded,
          st.explodedTarget,
          7,
          dt
        );
        needsMoreFrames = true;
      } else {
        st.currentExploded = st.explodedTarget;
      }

      for (const item of interactableGroups) {
        // Determine target scale and elevation based on active focus or camera preset
        let targetScale = 1.0;
        let targetLift = 0.0;
        if (st.focusKey !== 'all') {
          if (item.key === st.focusKey) {
            targetScale = 1.18;
            targetLift = 0.16;
          } else {
            targetScale = 0.58;
            targetLift = -0.02;
          }
        } else if (st.presetKey === 'masonry') {
          if (item.key === 'bricks' || item.key === 'cement' || item.key === 'cmu') {
            targetScale = 1.08;
            targetLift = 0.06;
          } else {
            targetScale = 0.72;
          }
        } else if (st.presetKey === 'steel') {
          if (item.key === 'steel' || item.key === 'timber' || item.key === 'pipes') {
            targetScale = 1.08;
            targetLift = 0.06;
          } else {
            targetScale = 0.72;
          }
        }

        const curScale = item.group.userData.currentScale ?? 1.0;
        const curLift = item.group.userData.currentLift ?? 0.0;
        if (Math.abs(targetScale - curScale) > 0.002 || Math.abs(targetLift - curLift) > 0.002) {
          const nextScale = THREE.MathUtils.damp(curScale, targetScale, 8, dt);
          const nextLift = THREE.MathUtils.damp(curLift, targetLift, 8, dt);
          item.group.userData.currentScale = nextScale;
          item.group.userData.currentLift = nextLift;
          item.group.scale.setScalar(nextScale);
          needsMoreFrames = true;
        } else {
          item.group.userData.currentScale = targetScale;
          item.group.userData.currentLift = targetLift;
          item.group.scale.setScalar(targetScale);
        }

        _scratchVec
          .copy(item.basePos)
          .addScaledVector(item.explodeVec, st.currentExploded);
        _scratchVec.y += item.group.userData.currentLift;
        item.group.position.copy(_scratchVec);

        // Separate individual sub-parts inside each assembly when Spread Assembly > 0
        for (let i = 1; i < item.group.children.length; i++) {
          const sub = item.group.children[i];
          const baseLocal = sub.userData.baseLocalPos as THREE.Vector3 | undefined;
          const explodeSub = sub.userData.explodeSubVec as THREE.Vector3 | undefined;
          if (baseLocal && explodeSub) {
            sub.position.copy(baseLocal).addScaledVector(explodeSub, st.currentExploded);
          }
        }
      }

      // Smoothly damp camera preset transitions
      if (st.isCameraTransitioning) {
        const k = 1 - Math.exp(-6.5 * dt);
        camera.position.lerp(st.targetCamPos, k);
        controls.target.lerp(st.targetLookAt, k);
        if (
          camera.position.distanceToSquared(st.targetCamPos) < 0.0008 &&
          controls.target.distanceToSquared(st.targetLookAt) < 0.0008
        ) {
          camera.position.copy(st.targetCamPos);
          controls.target.copy(st.targetLookAt);
          st.isCameraTransitioning = false;
        } else {
          needsMoreFrames = true;
        }
      }

      if (controls.update()) {
        needsMoreFrames = true;
      }

      return needsMoreFrames;
    }

    function requestRender() {
      if (isDisposed) return;
      if (renderBusy) {
        renderDirty = true;
        return;
      }
      renderBusy = true;
      frameId = requestAnimationFrame(() => {
        if (isDisposed) return;
        renderDirty = false;
        const now = performance.now();
        const dt = Math.min((now - lastTime) / 1000, 0.1);
        lastTime = now;

        const keepAnimating = stepSimulation(dt);
        renderer.render(scene, camera);

        const done = () => {
          renderBusy = false;
          if (renderDirty || keepAnimating) {
            requestRender();
          }
        };

        if (isSoftwareGl) {
          afterDraw(done);
        } else {
          done();
        }
      });
    }

    stateRef.current.requestRenderFn = requestRender;

    const onControlsStart = () => {
      stateRef.current.isCameraTransitioning = false;
    };
    const onControlsChange = () => {
      requestRender();
    };
    controls.addEventListener('start', onControlsStart);
    controls.addEventListener('change', onControlsChange);

    // Throttled Raycasting on pointermove & click
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let lastRaycastTime = 0;

    const handlePointerMove = (e: MouseEvent) => {
      const now = performance.now();
      if (now - lastRaycastTime < 75) return;
      lastRaycastTime = now;

      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(allPickableMeshes, false);
      if (hits.length > 0) {
        const focusKey = hits[0].object.userData.focusKey as MaterialFocusKey;
        renderer.domElement.style.cursor = 'pointer';
        setHoveredMaterialLabel(FOCUS_TARGETS[focusKey]?.label || null);
      } else {
        renderer.domElement.style.cursor = 'grab';
        setHoveredMaterialLabel(null);
      }
    };

    const handleClick = (e: MouseEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(allPickableMeshes, false);
      if (hits.length > 0) {
        const focusKey = hits[0].object.userData.focusKey as MaterialFocusKey;
        const catName = hits[0].object.userData.categoryName as string;
        if (focusKey) {
          handleFocusChange(focusKey);
        }
        if (catName && onSelectCategoryRef.current) {
          onSelectCategoryRef.current(catName);
        }
      }
    };

    renderer.domElement.addEventListener('mousemove', handlePointerMove);
    renderer.domElement.addEventListener('click', handleClick);

    const handleResize = () => {
      if (!container || isDisposed) return;
      const w = Math.max(container.clientWidth, 280);
      const h = Math.max(container.clientHeight, 280);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      requestRender();
    };
    window.addEventListener('resize', handleResize);

    // Initial render
    requestRender();

    return () => {
      isDisposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      window.removeEventListener('resize', handleResize);
      renderer.domElement.removeEventListener('mousemove', handlePointerMove);
      renderer.domElement.removeEventListener('click', handleClick);
      controls.removeEventListener('start', onControlsStart);
      controls.removeEventListener('change', onControlsChange);
      controls.dispose();
      disposables.forEach((d) => d.dispose());
      renderer.dispose();
    };
  }, []);

  if (webglFailed) {
    return (
      <div className="w-full h-full min-h-[420px] bg-[#EFEEE8] border border-[#E7E4DC] flex flex-col items-center justify-center p-8 text-center">
        <p className="text-xs font-mono uppercase tracking-wider text-[#777A73] mb-2">
          Architectural Material Specimen Display
        </p>
        <h3 className="text-lg font-semibold text-[#252923] mb-2">
          Portland Cement · Terracotta Bricks · Ribbed Steel · UPVC · Douglas Fir
        </h3>
        <p className="text-sm text-[#777A73] max-w-md">
          Interactive 3D viewport is in static preview mode on this device.
        </p>
      </div>
    );
  }

  const currentFocusInfo = FOCUS_TARGETS[activeFocus];

  return (
    <div
      className="relative w-full h-full min-h-[460px] bg-[#F7F6F2] border border-[#E7E4DC] overflow-hidden select-none"
      data-testid="material-showroom-3d"
    >
      {/* Isolated WebGL Canvas Mount Container */}
      <div ref={mountRef} className="w-full h-full min-h-[460px]" />

      {/* Top-Left Minimal Spec Header Overlay (Non-obstructive) */}
      <div className="absolute top-3.5 left-4 right-4 flex items-start justify-between pointer-events-none">
        <div className="bg-[#FFFFFF] border border-[#E7E4DC] px-3.5 py-2 pointer-events-auto">
          <div className="text-[11px] font-mono text-[#777A73]">
            SPECIMEN PLINTH 01 · {hoveredMaterialLabel || currentFocusInfo.label}
          </div>
          <div className="text-xs font-medium text-[#252923] mt-0.5">
            {currentFocusInfo.spec}
          </div>
        </div>

        {activeFocus !== 'all' && (
          <button
            type="button"
            onClick={() => handleFocusChange('all')}
            className="pointer-events-auto inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#252923] bg-[#FFFFFF] border border-[#E7E4DC] hover:border-[#252923] transition-colors whitespace-nowrap shrink-0"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset View
          </button>
        )}
      </div>

      {/* Unified Collapsible Bottom Control Dock (Zero backdrop-filter over WebGL) */}
      {variant === 'hero' && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 w-[94%] max-w-[680px] z-10 pointer-events-auto">
          <div className="flex justify-end mb-1">
            <button
              type="button"
              onClick={() => setDockCollapsed((prev) => !prev)}
              aria-expanded={!dockCollapsed}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-[#252923] bg-[#FFFFFF] border border-[#E7E4DC] hover:bg-[#EFEEE8] transition-colors whitespace-nowrap shrink-0"
            >
              {dockCollapsed ? (
                <>
                  <ChevronUp className="w-3.5 h-3.5" />
                  Show Studio Controls
                </>
              ) : (
                <>
                  <ChevronDown className="w-3.5 h-3.5" />
                  Hide Controls
                </>
              )}
            </button>
          </div>

          {!dockCollapsed && (
            <div className="bg-[#FFFFFF] border border-[#E7E4DC] p-2.5 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2 pb-2 mb-2 border-b border-[#E7E4DC]">
                {/* Material Focus Switcher */}
                <div className="flex items-center gap-1 overflow-x-auto">
                  <span className="inline-flex items-center gap-1 text-[11px] text-[#777A73] mr-1 whitespace-nowrap shrink-0">
                    <Eye className="w-3 h-3" />
                    Inspect:
                  </span>
                  {(
                    [
                      ['all', 'All'],
                      ['bricks', 'Bricks'],
                      ['cement', 'Cement'],
                      ['steel', 'Steel'],
                      ['pipes', 'Pipes'],
                      ['timber', 'Timber'],
                      ['cmu', 'CMU'],
                    ] as Array<[MaterialFocusKey, string]>
                  ).map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => handleFocusChange(key)}
                      className={`px-2 py-1 text-[11px] font-medium transition-colors whitespace-nowrap shrink-0 ${
                        activeFocus === key
                          ? 'bg-[#315744] text-white'
                          : 'bg-[#F7F6F2] text-[#252923] hover:bg-[#EFEEE8]'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3">
                {/* Camera Angle Presets */}
                <div className="flex items-center gap-1">
                  {(Object.keys(CAMERA_PRESETS) as CameraPresetKey[]).map((key) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => handlePresetChange(key)}
                      className={`px-2.5 py-1 text-[11px] font-medium transition-colors whitespace-nowrap shrink-0 ${
                        activePreset === key && activeFocus === 'all'
                          ? 'bg-[#252923] text-white'
                          : 'text-[#777A73] hover:text-[#252923] hover:bg-[#F7F6F2]'
                      }`}
                    >
                      {CAMERA_PRESETS[key].label}
                    </button>
                  ))}
                </div>

                {/* Exploded View Slider */}
                <label className="flex items-center gap-2 text-[11px] text-[#777A73] whitespace-nowrap shrink-0">
                  <Layers className="w-3.5 h-3.5 text-[#315744]" />
                  <span>Spread Assembly</span>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.02}
                    value={explodedRatio}
                    onChange={(e) => handleExplodedChange(parseFloat(e.target.value))}
                    aria-label="Spread Assembly"
                    className="w-24 accent-[#315744] cursor-pointer"
                  />
                </label>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
