/* ========================================
   THREE.JS IMPORTS
   ======================================== */
import * as THREE from 'three';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { MTLLoader } from 'three/addons/loaders/MTLLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

/* ========================================
   THREE.JS SCENE VARIABLES
   ======================================== */
let scene, camera, renderer, controls;
let guitarModel = null;
let fretZones = []; // Array of clickable mesh zones for frets
let raycaster, mouse;

/* ========================================
   STATE MANAGEMENT
   ======================================== */
const state = {
    currentScreen: 'menu',
    targetNote: '',
    score: 0,
    foundPositions: [],
    allPositions: [],
    // View mode: '3d' or '2d'
    viewMode: '3d',
    // Triads mode
    targetTriad: null,
    clickedTriadNotes: [],
    clickedTriadPositions: [],
    // Triads settings
    triadSettings: {
        major: true,
        minor: true,
        diminished: false,
        augmented: false
    },
    // 3D rotation
    rotation: {
        x: 35,
        y: 0
    }
};

/* ========================================
   MUSIC THEORY CONSTANTS
   ======================================== */
const NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

// Triad definitions (root, third, fifth intervals in semitones)
const TRIAD_TYPES = {
    major: { name: 'Major', intervals: [0, 4, 7] },
    minor: { name: 'Minor', intervals: [0, 3, 7] },
    diminished: { name: 'Diminished', intervals: [0, 3, 6] },
    augmented: { name: 'Augmented', intervals: [0, 4, 8] }
};

// String tuning (from high E to low E, top to bottom in display)
const STRING_TUNING = [
    { note: 'E', octave: 4, baseFreq: 329.63 },  // High E (String 1)
    { note: 'B', octave: 3, baseFreq: 246.94 },  // B (String 2)
    { note: 'G', octave: 3, baseFreq: 196.00 },  // G (String 3)
    { note: 'D', octave: 3, baseFreq: 146.83 },  // D (String 4)
    { note: 'A', octave: 2, baseFreq: 110.00 },  // A (String 5)
    { note: 'E', octave: 2, baseFreq: 82.41 }    // Low E (String 6)
];

const NUM_FRETS = 13; // 0-12

/* ========================================
   WEB AUDIO API
   ======================================== */
let audioContext = null;

function getAudioContext() {
    if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    return audioContext;
}

function playGuitarTone(frequency) {
    const ctx = getAudioContext();

    // Create oscillator with sawtooth wave for rich harmonics
    const oscillator = ctx.createOscillator();
    oscillator.type = 'sawtooth';
    oscillator.frequency.setValueAtTime(frequency, ctx.currentTime);

    // Create lowpass filter
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(3000, ctx.currentTime);
    filter.frequency.exponentialRampToValueAtTime(500, ctx.currentTime + 1.5);

    // Create gain node for volume envelope
    const gainNode = ctx.createGain();
    gainNode.gain.setValueAtTime(0, ctx.currentTime);
    gainNode.gain.linearRampToValueAtTime(0.4, ctx.currentTime + 0.02); // Quick attack
    gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 1.5); // Long decay

    // Connect the nodes
    oscillator.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(ctx.destination);

    // Start and stop
    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + 1.5);
}

/* ========================================
   MUSIC THEORY FUNCTIONS
   ======================================== */
function getNoteAt(stringIndex, fretIndex) {
    const stringTuning = STRING_TUNING[stringIndex];
    const openNoteIndex = NOTES.indexOf(stringTuning.note);
    const noteIndex = (openNoteIndex + fretIndex) % 12;
    return NOTES[noteIndex];
}

function getFrequencyAt(stringIndex, fretIndex) {
    const baseFreq = STRING_TUNING[stringIndex].baseFreq;
    return baseFreq * Math.pow(2, fretIndex / 12);
}

function getAllPositions(note) {
    const positions = [];
    for (let stringIndex = 0; stringIndex < STRING_TUNING.length; stringIndex++) {
        // Start from fret 1 (skip open strings)
        for (let fretIndex = 1; fretIndex < NUM_FRETS; fretIndex++) {
            if (getNoteAt(stringIndex, fretIndex) === note) {
                positions.push({ string: stringIndex, fret: fretIndex });
            }
        }
    }
    return positions;
}

function getRandomNote() {
    return NOTES[Math.floor(Math.random() * NOTES.length)];
}

function getRandomTriad() {
    const rootNote = getRandomNote();

    // Get only enabled triad types
    const enabledTypes = Object.keys(state.triadSettings).filter(type => state.triadSettings[type]);

    if (enabledTypes.length === 0) {
        // Fallback to major if nothing is enabled
        enabledTypes.push('major');
    }

    const triadType = enabledTypes[Math.floor(Math.random() * enabledTypes.length)];
    const triadDef = TRIAD_TYPES[triadType];

    const rootIndex = NOTES.indexOf(rootNote);
    const notes = triadDef.intervals.map(interval => {
        return NOTES[(rootIndex + interval) % 12];
    });

    return {
        root: rootNote,
        type: triadType,
        typeName: triadDef.name,
        notes: notes
    };
}

/* ========================================
   UI RENDERING FUNCTIONS
   ======================================== */
function renderMenu() {
    const app = document.getElementById('app');
    app.innerHTML = `
        <div class="menu-screen">
            <h1 class="title">Guitar Fretboard Memorizer</h1>
            <p class="subtitle">Master the neck, one note at a time.</p>
            <div class="view-toggle-container">
                <label class="view-toggle-label">
                    <span class="view-toggle-text">View Mode:</span>
                    <div class="view-toggle-switch">
                        <input type="checkbox" id="viewModeToggle" ${state.viewMode === '3d' ? 'checked' : ''}>
                        <span class="toggle-slider">
                            <span class="toggle-label-left">2D</span>
                            <span class="toggle-label-right">3D</span>
                        </span>
                    </div>
                </label>
            </div>
            <div class="mode-cards">
                <div class="mode-card" id="singleNoteMode">
                    <h2>Single Note</h2>
                    <p>Find random notes on the fretboard and build your muscle memory.</p>
                </div>
                <div class="mode-card" id="findAllMode">
                    <h2>Find All Instances</h2>
                    <p>Locate every position of a specific note across the entire neck.</p>
                </div>
                <div class="mode-card" id="triadsMode">
                    <h2>Chord Triads</h2>
                    <p>Click all three notes of a chord triad to score a point.</p>
                </div>
            </div>
        </div>
    `;

    // Setup view mode toggle
    const viewToggle = document.getElementById('viewModeToggle');
    viewToggle.addEventListener('change', (e) => {
        state.viewMode = e.target.checked ? '3d' : '2d';
        console.log(`View mode changed to: ${state.viewMode}`);
    });

    document.getElementById('singleNoteMode').addEventListener('click', startSingleNoteGame);
    document.getElementById('findAllMode').addEventListener('click', startFindAllGame);
    document.getElementById('triadsMode').addEventListener('click', startTriadsGame);
}

/* ========================================
   THREE.JS SETUP AND MODEL LOADING
   ======================================== */
function initThreeJS(container) {
    try {
        // Create scene
        scene = new THREE.Scene();
        scene.background = new THREE.Color(0x1a1a1a);

        // Create camera
        camera = new THREE.PerspectiveCamera(
            45,
            container.clientWidth / container.clientHeight,
            0.1,
            1000
        );
        camera.position.set(0, 1.5, 3);
        camera.lookAt(0, 0, 0);

        // Create renderer
        try {
            renderer = new THREE.WebGLRenderer({ antialias: true });
        } catch (e) {
            // Try without antialias if that was the issue, though unlikely for this specific error
            try {
                renderer = new THREE.WebGLRenderer({ antialias: false });
            } catch (e2) {
                console.error("WebGL not supported:", e2);
                return false;
            }
        }

        renderer.setSize(container.clientWidth, container.clientHeight);
        renderer.setPixelRatio(window.devicePixelRatio);
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        container.appendChild(renderer.domElement);

        // Add lighting
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        scene.add(ambientLight);

        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
        directionalLight.position.set(2, 4, 3);
        directionalLight.castShadow = true;
        directionalLight.shadow.mapSize.width = 2048;
        directionalLight.shadow.mapSize.height = 2048;
        scene.add(directionalLight);

        const fillLight = new THREE.DirectionalLight(0x6699ff, 0.3);
        fillLight.position.set(-2, 2, -3);
        scene.add(fillLight);

        // Setup OrbitControls
        controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.05;
        controls.minDistance = 0.1; // Closer zoom for better fret visibility
        controls.maxDistance = 10; // Further zoom out
        controls.zoomSpeed = 1.2; // Faster zoom speed
        controls.maxPolarAngle = Math.PI / 1.5;
        controls.target.set(0, 0, 0);
        controls.update();

        // Setup raycaster for click detection
        raycaster = new THREE.Raycaster();
        mouse = new THREE.Vector2();

        // Handle window resize
        window.addEventListener('resize', onWindowResize);

        // Start animation loop
        animate();

        return true;
    } catch (error) {
        console.error("Error initializing Three.js:", error);
        return false;
    }
}

function onWindowResize() {
    const container = document.querySelector('.fretboard-container');
    if (container && camera && renderer) {
        camera.aspect = container.clientWidth / container.clientHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(container.clientWidth, container.clientHeight);
    }
}

function animate() {
    requestAnimationFrame(animate);
    if (controls) controls.update();
    if (renderer && scene && camera) {
        renderer.render(scene, camera);
    }
}

function loadGuitarModel() {
    return new Promise((resolve, reject) => {
        const mtlLoader = new MTLLoader();
        mtlLoader.setPath('Gibson 335/');

        mtlLoader.load('Gibson 335_Low_Poly.mtl', (materials) => {
            materials.preload();

            const objLoader = new OBJLoader();
            objLoader.setMaterials(materials);
            objLoader.setPath('Gibson 335/');

            objLoader.load(
                'Gibson 335_Low_Poly.obj',
                (object) => {
                    guitarModel = object;

                    // Load custom texture
                    const textureLoader = new THREE.TextureLoader();
                    const texture = textureLoader.load('Gibson 335/Texturas/Tex_Caja_2.jpg');
                    texture.colorSpace = THREE.SRGBColorSpace;

                    // Scale and position the guitar
                    guitarModel.scale.set(0.8, 0.8, 0.8);
                    guitarModel.position.set(0, -0.5, 0);
                    guitarModel.rotation.y = Math.PI / 2; // Rotate to horizontal

                    // Enable shadows and apply texture
                    guitarModel.traverse((child) => {
                        if (child.isMesh) {
                            child.castShadow = true;
                            child.receiveShadow = true;

                            // Apply texture to material
                            if (child.material) {
                                if (Array.isArray(child.material)) {
                                    child.material.forEach(mat => {
                                        mat.map = texture;
                                        mat.needsUpdate = true;
                                    });
                                } else {
                                    child.material.map = texture;
                                    child.material.needsUpdate = true;
                                }
                            }
                        }
                    });

                    scene.add(guitarModel);

                    // Create fret zones after model is loaded
                    createFretZones();

                    resolve(guitarModel);
                },
                (xhr) => {
                    console.log((xhr.loaded / xhr.total * 100) + '% loaded');
                },
                (error) => {
                    console.error('Error loading OBJ:', error);
                    reject(error);
                }
            );
        }, undefined, (error) => {
            console.error('Error loading MTL:', error);
            reject(error);
        });
    });
}

function findNeckRegion() {
    if (!guitarModel) return null;

    // Calculate overall bounding box
    const overallBox = new THREE.Box3().setFromObject(guitarModel);
    const overallSize = overallBox.getSize(new THREE.Vector3());
    const overallCenter = overallBox.getCenter(new THREE.Vector3());
    const overallMin = overallBox.min;
    const overallMax = overallBox.max;

    // For a guitar model rotated 90 degrees on Y axis:
    // - X axis: length (headstock to body)
    // - Y axis: height (top to bottom)
    // - Z axis: width (side to side)
    
    // The neck typically:
    // - Starts near the headstock (left/most negative X) at the nut
    // - Extends about 60-70% of the model length
    // - Is narrow in Z (about 5-10% of model width)
    // - Is centered in Z
    // - Is at a specific Y level (around the middle, slightly above center)
    
    // More conservative estimates based on typical guitar proportions
    const neckLength = overallSize.x * 0.65; // Neck is about 65% of model length
    const neckWidth = overallSize.z * 0.12; // Neck is narrow in Z (about 12% of width)
    
    // Neck starts from the nut position (where fret 0 would be)
    // The nut is typically at the junction of headstock and neck
    // Start a bit further in from the left edge to account for headstock
    const nutX = overallMin.x + overallSize.x * 0.15; // Nut position (fret 0)
    const neckStartX = nutX; // First fret starts just after the nut
    const neckCenterZ = overallCenter.z; // Centered in Z
    const neckY = overallCenter.y - overallSize.y * 0.1; // Slightly below center (fretboard is on top of neck)

    return {
        startX: neckStartX,
        nutX: nutX, // Store nut position separately
        length: neckLength,
        centerZ: neckCenterZ,
        width: neckWidth,
        y: neckY,
        overallBox: overallBox
    };
}

function findFretPositionsUsingRaycasting(neckRegion) {
    if (!neckRegion || !guitarModel) return null;

    const fretPositions = [];
    const raycaster = new THREE.Raycaster();
    
    // Get all meshes for raycasting
    const meshes = [];
    guitarModel.traverse((child) => {
        if (child.isMesh && child.geometry) {
            meshes.push(child);
        }
    });

    // Calculate fret positions using logarithmic spacing
    // Use the full neck length for scale length calculation
    const scaleLength = neckRegion.length * 0.9;
    const nutX = neckRegion.nutX || neckRegion.startX;
    
    // For each fret (1-12), calculate position from the nut
    for (let fret = 1; fret < NUM_FRETS; fret++) {
        // Logarithmic fret spacing formula: distance = scaleLength * (1 - 2^(-fret/12))
        const distanceFromNut = scaleLength * (1 - Math.pow(2, -fret / 12));
        const fretX = nutX + distanceFromNut;
        
        // Cast a ray from above the model down to find the fretboard surface
        // Cast at the center of the neck width
        const rayOrigin = new THREE.Vector3(fretX, neckRegion.y + 0.5, neckRegion.centerZ);
        const rayDirection = new THREE.Vector3(0, -1, 0);
        
        raycaster.set(rayOrigin, rayDirection);
        const intersects = raycaster.intersectObjects(meshes, false);
        
        let bestY = neckRegion.y;
        if (intersects.length > 0) {
            // Use the first intersection (closest surface)
            bestY = intersects[0].point.y;
        }

        fretPositions.push({
            x: fretX,
            y: bestY,
            z: neckRegion.centerZ
        });
    }

    console.log(`Found ${fretPositions.length} fret positions, starting at X=${fretPositions[0]?.x.toFixed(3)} (fret 1)`);
    return fretPositions;
}

function analyzeGuitarModel() {
    if (!guitarModel) return null;

    // First, find the neck region
    const neckRegion = findNeckRegion();
    if (!neckRegion) return null;

    // Find fret positions using raycasting
    let fretPositions = findFretPositionsUsingRaycasting(neckRegion);
    
    if (!fretPositions || fretPositions.length === 0) {
        // Fallback to simple calculation
        const scaleLength = neckRegion.length * 0.9;
        const nutX = neckRegion.nutX || neckRegion.startX;
        fretPositions = [];
        
        for (let fret = 1; fret < NUM_FRETS; fret++) {
            const distanceFromNut = scaleLength * (1 - Math.pow(2, -fret / 12));
            fretPositions.push({
                x: nutX + distanceFromNut,
                y: neckRegion.y,
                z: neckRegion.centerZ
            });
        }
    }

    // Calculate string positions (evenly spaced across the neck width)
    // Ensure we have exactly 6 strings
    const stringPositions = [];
    
    // Use the actual model bounding box to determine the Z range
    const overallBox = neckRegion.overallBox;
    const zMin = overallBox.min.z;
    const zMax = overallBox.max.z;
    const zCenter = (zMin + zMax) / 2;
    const zRange = zMax - zMin;
    
    // Try to find string-like objects in the model first
    const stringMeshes = [];
    guitarModel.traverse((child) => {
        if (child.isMesh && child.geometry) {
            const childBox = new THREE.Box3().setFromObject(child);
            const childSize = childBox.getSize(new THREE.Vector3());
            const childCenter = childBox.getCenter(new THREE.Vector3());
            
            // Look for thin, long objects that could be strings
            // Strings are typically very thin in one dimension and long in another
            const maxDim = Math.max(childSize.x, childSize.y, childSize.z);
            const minDim = Math.min(childSize.x, childSize.y, childSize.z);
            
            // Check if it's a thin, long object (could be a string)
            if (minDim < 0.01 && maxDim > 1.0) {
                // Check if it's in the neck region (X axis) and centered in Y
                if (childCenter.x >= neckRegion.startX && childCenter.x <= neckRegion.startX + neckRegion.length) {
                    stringMeshes.push({
                        z: childCenter.z,
                        mesh: child
                    });
                }
            }
        }
    });
    
    // If we found string-like objects, use them
    if (stringMeshes.length >= 4) {
        // ... (existing code for string meshes) ...
        // Sort by Z position
        stringMeshes.sort((a, b) => a.z - b.z);
        // ...
    } else {
        // Fallback: Use raycasting to measure the actual neck width
        // First, get all meshes for raycasting
        const meshes = [];
        guitarModel.traverse((child) => {
            if (child.isMesh && child.geometry) {
                meshes.push(child);
            }
        });
        
        // Scan across the Z axis at a middle fret position
        const scanX = neckRegion.startX + neckRegion.length * 0.4; // Around 5th-7th fret
        const scanY = neckRegion.y + 1.0; // Start ray above
        
        let minZ = zCenter;
        let maxZ = zCenter;
        let foundNeck = false;
        
        const raycaster = new THREE.Raycaster();
        const dir = new THREE.Vector3(0, -1, 0);
        const steps = 50;
        const scanWidth = zRange * 0.8; // Scan 80% of total width
        const stepSize = scanWidth / steps;
        
        // Scan for min Z (left edge)
        for (let z = zCenter; z > zCenter - scanWidth/2; z -= stepSize) {
            raycaster.set(new THREE.Vector3(scanX, scanY, z), dir);
            if (raycaster.intersectObjects(meshes, false).length > 0) {
                minZ = z;
                foundNeck = true;
            } else if (foundNeck) {
                // Edge found
                break;
            }
        }
        
        // Scan for max Z (right edge)
        foundNeck = false; // Reset for right scan
        for (let z = zCenter; z < zCenter + scanWidth/2; z += stepSize) {
            raycaster.set(new THREE.Vector3(scanX, scanY, z), dir);
            if (raycaster.intersectObjects(meshes, false).length > 0) {
                maxZ = z;
                foundNeck = true;
            } else if (foundNeck) {
                // Edge found
                break;
            }
        }
        
        const measuredNeckWidth = maxZ - minZ;
        
        if (measuredNeckWidth > 0.1) {
            console.log(`Measured neck width via raycasting: ${measuredNeckWidth.toFixed(3)} (from ${minZ.toFixed(3)} to ${maxZ.toFixed(3)})`);
            
            // Apply margins - strings don't go to the very edge of the neck
            const margin = measuredNeckWidth * 0.10; // 10% margin on each side
            const usableWidth = measuredNeckWidth - (2 * margin);
            const startZ = minZ + margin;
            
            const stringSpacing = usableWidth / (STRING_TUNING.length - 1);
            
            for (let i = 0; i < STRING_TUNING.length; i++) {
                stringPositions.push(startZ + (i * stringSpacing));
            }
        } else {
            // Fallback to estimation if measurement failed
            console.warn("Neck measurement failed, using fallback estimation");
            const estimatedNeckWidth = zRange * 0.38;
            const estimatedNeckMinZ = zCenter - estimatedNeckWidth / 2;
            const stringSpacing = estimatedNeckWidth / (STRING_TUNING.length - 1);
            
            for (let i = 0; i < STRING_TUNING.length; i++) {
                const stringZ = estimatedNeckMinZ + (i * stringSpacing);
                stringPositions.push(stringZ);
            }
        }
    }

    console.log(`Calculated ${stringPositions.length} string positions for ${STRING_TUNING.length} strings:`, stringPositions.map(p => p.toFixed(3)));
    console.log(`Model Z range: ${zMin.toFixed(3)} to ${zMax.toFixed(3)}, total width: ${zRange.toFixed(3)}`);
    console.log(`String positions range: ${Math.min(...stringPositions).toFixed(3)} to ${Math.max(...stringPositions).toFixed(3)}`);

    return {
        fretPositions: fretPositions,
        stringPositions: stringPositions,
        neckBox: neckRegion.overallBox,
        neckCenter: new THREE.Vector3(neckRegion.startX + neckRegion.length / 2, neckRegion.y, neckRegion.centerZ),
        neckSize: new THREE.Vector3(neckRegion.length, 0.1, neckRegion.width),
        neckAxis: 'x',
        stringAxis: 'z',
        neckRegion: neckRegion // Include full neck region for taper calculation
    };
}

function createFretZones() {
    // Clear existing zones
    fretZones.forEach(zone => scene.remove(zone));
    fretZones = [];

    // Analyze the model to get fret and string positions
    const analysis = analyzeGuitarModel();
    
    if (!analysis) {
        console.warn('Could not analyze guitar model, using fallback positions');
        // Fallback to old hardcoded positions
        const stringSpacing = 0.05;
        const fretSpacing = 0.20;
        const neckStartZ = -2.8;
        const neckStartY = -0.49;
        const slope = 0.014;

        for (let stringIndex = 0; stringIndex < STRING_TUNING.length; stringIndex++) {
            for (let fretIndex = 1; fretIndex < NUM_FRETS; fretIndex++) {
                // Calculate position first to determine exact box width
                const fretX = neckStartZ + (fretIndex * fretSpacing);
                let centerX = fretX;
                let boxWidth = fretSpacing; // Default to fret spacing
                
                if (fretIndex < NUM_FRETS - 1) {
                    // Center exactly between current and next fret
                    const nextFretX = neckStartZ + ((fretIndex + 1) * fretSpacing);
                    centerX = (fretX + nextFretX) / 2;
                    boxWidth = nextFretX - fretX; // Exact distance between frets
                } else if (fretIndex > 1) {
                    // Last fret - center between previous and current
                    const prevFretX = neckStartZ + ((fretIndex - 1) * fretSpacing);
                    centerX = (fretX + prevFretX) / 2;
                    boxWidth = fretX - prevFretX; // Exact distance between frets
                }
                
                // Create box geometry for fret hitbox
                // Width: exact distance between frets
                // Height: small height above fretboard
                const boxHeight = 0.08;
                // Depth: slightly wider than a string (not the space between strings)
                const boxDepth = Math.min(stringSpacing * 0.3, 0.02); // Max 30% of string spacing or 0.02
                
                const geometry = new THREE.BoxGeometry(boxWidth, boxHeight, boxDepth);
                const material = new THREE.MeshBasicMaterial({
                    color: 0xff0000,
                    transparent: true,
                    opacity: 0.5
                });

                const zone = new THREE.Mesh(geometry, material);
                zone.position.x = centerX;
                zone.position.y = neckStartY + (fretIndex * slope);
                // Position exactly on the string
                zone.position.z = (stringIndex - 2.5) * stringSpacing;

                zone.userData = {
                    stringIndex,
                    fretIndex,
                    note: getNoteAt(stringIndex, fretIndex)
                };

                scene.add(zone);
                fretZones.push(zone);
            }
        }
        return;
    }

    // Use analyzed positions
    const { fretPositions, stringPositions, neckAxis, stringAxis, neckRegion } = analysis;

    // Get all meshes for raycasting validation
    const meshes = [];
    guitarModel.traverse((child) => {
        if (child.isMesh && child.geometry) {
            meshes.push(child);
        }
    });

    // Get overall bounding box once for validation
    const overallBox = new THREE.Box3().setFromObject(guitarModel);
    
    const raycaster = new THREE.Raycaster();

    // Create hitboxes at the intersection of each fret and string
    // Ensure we loop through all 6 strings
    console.log(`Creating hitboxes for ${STRING_TUNING.length} strings and ${fretPositions.length} frets`);
    
    for (let stringIndex = 0; stringIndex < STRING_TUNING.length; stringIndex++) {
        let hitboxesForThisString = 0;
        
        for (let fretIndex = 0; fretIndex < fretPositions.length && fretIndex < NUM_FRETS - 1; fretIndex++) {
            const fretPos = fretPositions[fretIndex];
            
            // Ensure we have a valid string position for this string index
            if (stringIndex >= stringPositions.length) {
                console.warn(`String index ${stringIndex} out of range (${stringPositions.length} positions available)`);
                continue;
            }
            
            const stringPos = stringPositions[stringIndex];

            // Calculate position: exactly on the string, exactly between two frets
            // First, determine the X position (fret position) - exactly between this fret and next
            let posX;
            let fretStartX, fretEndX;
            
            if (fretIndex < fretPositions.length - 1) {
                // Center exactly between this fret and the next fret
                fretStartX = fretPositions[fretIndex].x;
                fretEndX = fretPositions[fretIndex + 1].x;
                posX = (fretStartX + fretEndX) / 2; // Exact center between frets
            } else if (fretIndex > 0) {
                // Last fret - center between previous and current fret
                fretStartX = fretPositions[fretIndex - 1].x;
                fretEndX = fretPositions[fretIndex].x;
                posX = (fretStartX + fretEndX) / 2; // Exact center between frets
            } else {
                // First fret - use position between nut and first fret
                const nutX = neckRegion.nutX || neckRegion.startX;
                fretStartX = nutX;
                fretEndX = fretPositions[0].x;
                posX = (fretStartX + fretEndX) / 2; // Center between nut and first fret
            }
            
            // Calculate string position at this specific fret position
            // Strings taper (converge) as they go from nut to body
            // We need to interpolate the string Z position based on the X position (fret position)
            
            // Get the neck region for interpolation
            const neckStartX = neckRegion.startX; // Nut position (fret 0)
            const neckEndX = neckRegion.startX + neckRegion.length; // End of neck (around fret 12)
            const neckLength = neckEndX - neckStartX;
            
            // Calculate taper: strings are wider at the nut, narrower at the body
            // Use the string positions at the nut (start) and interpolate to narrower at the end
            const nutZMin = stringPositions[0]; // First string at nut
            const nutZMax = stringPositions[stringPositions.length - 1]; // Last string at nut
            const nutWidth = nutZMax - nutZMin;
            
            // Estimate body width (typically 15-20% narrower than nut)
            const taperRatio = 0.85; // Strings are 85% of nut width at body
            const bodyWidth = nutWidth * taperRatio;
            const bodyZCenter = (nutZMin + nutZMax) / 2; // Center stays the same
            const bodyZMin = bodyZCenter - bodyWidth / 2;
            const bodyZMax = bodyZCenter + bodyWidth / 2;
            
            // Interpolate based on X position (how far along the neck)
            const progress = (posX - neckStartX) / neckLength; // 0 at nut, 1 at body
            const clampedProgress = Math.max(0, Math.min(1, progress)); // Clamp between 0 and 1
            
            // Interpolate string positions at this fret
            const currentZMin = nutZMin + (bodyZMin - nutZMin) * clampedProgress;
            const currentZMax = nutZMax + (bodyZMax - nutZMax) * clampedProgress;
            const currentWidth = currentZMax - currentZMin;
            
            // Calculate this string's Z position based on its index at this specific fret
            const stringSpacing = currentWidth / (STRING_TUNING.length - 1);
            const stringZ = currentZMin + (stringIndex * stringSpacing);
            
            // Position exactly on the string (Z position for strings running along Z axis)
            let posY = fretPos.y; // Start with fretboard Y position
            let posZ = stringZ; // Use interpolated string position at this fret
            
            // Ensure we're using the correct axis
            if (stringAxis === 'z') {
                posZ = stringZ; // Interpolated string position (Z axis)
            } else if (stringAxis === 'y') {
                posY = stringZ; // Interpolated string position (Y axis)
            } else {
                posX = stringZ; // Interpolated string position (X axis)
            }
            
            // Debug logging for first few hitboxes
            if (stringIndex < 2 && fretIndex < 2) {
                console.log(`Hitbox ${stringIndex}-${fretIndex}: fretStartX=${fretStartX.toFixed(3)}, fretEndX=${fretEndX.toFixed(3)}, posX=${posX.toFixed(3)}, stringZ=${stringZ.toFixed(3)}, posZ=${posZ.toFixed(3)}`);
            }

            // Validate position: check if it's within the model bounds and on the surface
            // First, check if Z position is within reasonable bounds of the model
            const modelZMin = overallBox.min.z;
            const modelZMax = overallBox.max.z;
            const modelZRange = modelZMax - modelZMin;
            
            // Use a wider valid range - 75% of model width centered on model
            // This should allow all strings including the outer ones
            const validZCenter = (modelZMin + modelZMax) / 2;
            const validZWidth = modelZRange * 0.75; // 75% of model width (increased from 65%)
            const validZMin = validZCenter - validZWidth / 2;
            const validZMax = validZCenter + validZWidth / 2;
            
            if (posZ < validZMin || posZ > validZMax) {
                // Position is outside valid range, skip this hitbox
                continue;
            }
            
            // Validate Y position by checking if it's near the model surface
            // Try multiple raycast positions to find the surface
            let foundValidPosition = false;
            let finalY = posY;
            
            // Cast rays at the exact position and slightly offset positions
            const rayOffsets = [
                { x: 0, z: 0 },      // Exact position
                { x: 0, z: 0.02 },   // Slightly right
                { x: 0, z: -0.02 },  // Slightly left
                { x: 0.02, z: 0 },   // Slightly forward
                { x: -0.02, z: 0 }   // Slightly back
            ];
            
            for (const offset of rayOffsets) {
                const rayOrigin = new THREE.Vector3(posX + offset.x, posY + 0.5, posZ + offset.z);
                const rayDirection = new THREE.Vector3(0, -1, 0);
                raycaster.set(rayOrigin, rayDirection);
                const intersects = raycaster.intersectObjects(meshes, false);

                if (intersects.length > 0) {
                    // Use the intersection point, but keep it slightly above the surface
                    const surfaceY = intersects[0].point.y;
                    const distanceFromSurface = Math.abs(posY - surfaceY);
                    
                    // Use a reasonable threshold (0.3 units) to validate position
                    if (distanceFromSurface < 0.3) {
                        finalY = surfaceY + 0.01; // Slightly above surface for better clicking
                        foundValidPosition = true;
                        break; // Found valid position, no need to check other offsets
                    }
                }
            }
            
            // If we didn't find a valid position with raycasting, use the calculated Y
            // This allows hitboxes even if raycasting misses (which can happen at edges)
            // Always use the calculated Y position - raycasting is just for fine-tuning
            if (!foundValidPosition) {
                // Use calculated Y position from fret position
                finalY = fretPos.y;
            }
            
            posY = finalY;

            // Calculate box dimensions
            // Width: exact distance between the two frets (already calculated above)
            let boxWidth;
            
            if (fretIndex < fretPositions.length - 1) {
                // Between current fret and next fret
                boxWidth = fretEndX - fretStartX; // Full distance between frets
            } else if (fretIndex > 0) {
                // Last fret - between previous and current fret
                boxWidth = fretEndX - fretStartX; // Full distance between frets
            } else {
                // First fret - between nut and first fret
                boxWidth = fretEndX - fretStartX; // Full distance between nut and first fret
            }
            
            // Height: small height above fretboard for clicking
            const boxHeight = 0.04;
            
            // Depth: very narrow, just slightly wider than a string
            // Calculate based on string spacing at this fret position to avoid overlap
            let boxDepth = 0.012; // Default: very narrow
            
            // Calculate string spacing at this fret position
            if (stringIndex < STRING_TUNING.length - 1) {
                // Calculate next string's Z position at this fret
                const nextStringProgress = (posX - neckStartX) / neckLength;
                const clampedNextProgress = Math.max(0, Math.min(1, nextStringProgress));
                const nextStringZMin = nutZMin + (bodyZMin - nutZMin) * clampedNextProgress;
                const nextStringZMax = nutZMax + (bodyZMax - nutZMax) * clampedNextProgress;
                const nextStringWidth = nextStringZMax - nextStringZMin;
                const nextStringSpacing = nextStringWidth / (STRING_TUNING.length - 1);
                const nextStringZ = nextStringZMin + ((stringIndex + 1) * nextStringSpacing);
                
                // Use 30% of the distance to next string to avoid overlap
                const distanceToNext = Math.abs(nextStringZ - posZ);
                boxDepth = Math.min(distanceToNext * 0.3, 0.02); // Max 0.02
            } else if (stringIndex > 0) {
                // Last string - use distance from previous string
                const prevStringProgress = (posX - neckStartX) / neckLength;
                const clampedPrevProgress = Math.max(0, Math.min(1, prevStringProgress));
                const prevStringZMin = nutZMin + (bodyZMin - nutZMin) * clampedPrevProgress;
                const prevStringZMax = nutZMax + (bodyZMax - nutZMax) * clampedPrevProgress;
                const prevStringWidth = prevStringZMax - prevStringZMin;
                const prevStringSpacing = prevStringWidth / (STRING_TUNING.length - 1);
                const prevStringZ = prevStringZMin + ((stringIndex - 1) * prevStringSpacing);
                
                // Use 30% of the distance from previous string
                const distanceFromPrev = Math.abs(posZ - prevStringZ);
                boxDepth = Math.min(distanceFromPrev * 0.3, 0.02); // Max 0.02
            }
            
            // Ensure minimum depth for usability
            boxDepth = Math.max(0.008, boxDepth); // At least 0.008 
            
            const geometry = new THREE.BoxGeometry(boxWidth, boxHeight, boxDepth);
            const material = new THREE.MeshBasicMaterial({
                color: 0xff0000, // Red for debugging
                transparent: true,
                opacity: 0.3, // More transparent to see strings
                side: THREE.DoubleSide
            });

            const zone = new THREE.Mesh(geometry, material);

            // Position at the intersection of fret and string
            zone.position.set(posX, posY, posZ);

            // Store metadata (fretIndex + 1 because we start counting from fret 1)
            zone.userData = {
                stringIndex,
                fretIndex: fretIndex + 1,
                note: getNoteAt(stringIndex, fretIndex + 1)
            };

            scene.add(zone);
            fretZones.push(zone);
            hitboxesForThisString++;
        }
        
        console.log(`String ${stringIndex + 1}: Created ${hitboxesForThisString} hitboxes`);
    }

    console.log('Created fret zones based on model analysis:', {
        fretCount: fretPositions.length,
        stringCount: stringPositions.length,
        expectedStrings: STRING_TUNING.length,
        zonesCreated: fretZones.length,
        expectedZones: STRING_TUNING.length * fretPositions.length,
        neckAxis: neckAxis,
        stringAxis: stringAxis
    });
}

function setupFretClickHandler() {
    renderer.domElement.addEventListener('click', onFretClick);
}

function onFretClick(event) {
    // Calculate mouse position in normalized device coordinates
    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    // Update raycaster
    raycaster.setFromCamera(mouse, camera);

    // Check for intersections with fret zones
    const intersects = raycaster.intersectObjects(fretZones);

    if (intersects.length > 0) {
        const clickedZone = intersects[0].object;
        const { stringIndex, fretIndex, note } = clickedZone.userData;

        // Call the appropriate handler based on game mode
        if (state.currentScreen === 'singleNote') {
            handleSingleNoteClick(stringIndex, fretIndex, note);
        } else if (state.currentScreen === 'findAll') {
            handleFindAllClick(stringIndex, fretIndex, note);
        } else if (state.currentScreen === 'triads') {
            handleTriadClick(stringIndex, fretIndex, note);
        }
    }
}

function cleanupThreeJS() {
    // Remove event listeners
    if (renderer && renderer.domElement) {
        renderer.domElement.removeEventListener('click', onFretClick);
    }
    window.removeEventListener('resize', onWindowResize);

    // Dispose of Three.js objects
    if (renderer) {
        renderer.dispose();
        if (renderer.domElement && renderer.domElement.parentNode) {
            renderer.domElement.parentNode.removeChild(renderer.domElement);
        }
    }

    if (scene) {
        scene.traverse((object) => {
            if (object.geometry) object.geometry.dispose();
            if (object.material) {
                if (Array.isArray(object.material)) {
                    object.material.forEach(mat => mat.dispose());
                } else {
                    object.material.dispose();
                }
            }
        });
    }

    // Clear references
    scene = null;
    camera = null;
    renderer = null;
    controls = null;
    guitarModel = null;
    fretZones = [];
}


function fallbackToCSS(container, gameMode) {
    console.log("Falling back to CSS renderer");
    cleanupThreeJS(); // Ensure clean state
    container.classList.add('use-css-fallback');

    // Determine highlighted positions based on game mode
    let highlighted = [];
    if (gameMode === 'findAll') {
        highlighted = state.foundPositions;
    } else if (gameMode === 'triads') {
        highlighted = state.clickedTriadPositions;
    }

    container.innerHTML = renderFretboard(highlighted);

    // Add listeners
    container.querySelectorAll('.fret').forEach(fret => {
        if (gameMode === 'singleNote') {
            fret.addEventListener('click', handleSingleNoteDOMClick);
        } else if (gameMode === 'findAll') {
            fret.addEventListener('click', handleFindAllDOMClick);
        } else if (gameMode === 'triads') {
            fret.addEventListener('click', handleTriadDOMClick);
        }
    });

    updateCSSFretboardRotation();
    initCSSRotationControls();
}

/* ========================================
   OLD HTML RENDERING (kept for reference, can be removed later)
   ======================================== */
function renderFretboard(highlightedPositions = []) {
    let fretboardHTML = '<div class="fretboard">';

    // Add fret marker dots - place them in the same flex structure as fret numbers
    // Markers go in the middle of specific fret spaces (between frets)
    fretboardHTML += '<div class="fret-markers">';
    const markerFrets = [3, 5, 7, 9, 12];
    
    // Create a flex container matching the fret layout
    fretboardHTML += '<div class="fret-markers-container">';
    for (let i = 1; i < NUM_FRETS; i++) {
        if (markerFrets.includes(i)) {
            if (i === 12) {
                // Double dots for 12th fret
                fretboardHTML += `<div class="fret-marker-space"><div class="fret-marker-dot" style="top: 35%"></div><div class="fret-marker-dot" style="top: 65%"></div></div>`;
            } else {
                fretboardHTML += `<div class="fret-marker-space"><div class="fret-marker-dot"></div></div>`;
            }
        } else {
            // Empty space for frets without markers
            fretboardHTML += '<div class="fret-marker-space"></div>';
        }
    }
    fretboardHTML += '</div>';
    fretboardHTML += '</div>';

    fretboardHTML += '<div class="strings-container">';

    // Render each string
    for (let stringIndex = 0; stringIndex < STRING_TUNING.length; stringIndex++) {
        fretboardHTML += `
            <div class="string-row">
                <div class="string-line"></div>
                <div class="frets">
        `;

        // Render each fret (starting from 1)
        for (let fretIndex = 1; fretIndex < NUM_FRETS; fretIndex++) {
            const note = getNoteAt(stringIndex, fretIndex);
            const isHighlighted = highlightedPositions.some(
                pos => pos.string === stringIndex && pos.fret === fretIndex
            );

            fretboardHTML += `
                <div class="fret ${isHighlighted ? 'highlighted' : ''}" 
                     data-string="${stringIndex}" 
                     data-fret="${fretIndex}">
                    ${isHighlighted ? `<div class="note-marker found">${note}</div>` : ''}
                </div>
            `;
        }

        fretboardHTML += '</div></div>';
    }

    fretboardHTML += '</div>'; // Close strings-container

    // Add fret numbers
    fretboardHTML += '<div class="fret-numbers">';
    for (let i = 1; i < NUM_FRETS; i++) {
        fretboardHTML += `<div class="fret-number">${i}</div>`;
    }
    fretboardHTML += '</div>';

    fretboardHTML += '</div>'; // Close fretboard

    return fretboardHTML;
}

function showFeedback(type, message) {
    // Remove existing feedback
    const existingFeedback = document.querySelector('.feedback');
    if (existingFeedback) {
        existingFeedback.remove();
    }

    const feedback = document.createElement('div');
    feedback.className = `feedback ${type}`;
    feedback.textContent = message;
    document.body.appendChild(feedback);

    setTimeout(() => {
        feedback.remove();
    }, 2000);
}

function renderSingleNoteGame() {
    const app = document.getElementById('app');
    app.innerHTML = `
        <div class="game-screen">
            <button class="exit-btn" id="exitBtn">← Exit</button>
            <div class="game-header">
                <div class="target-note">${state.targetNote}</div>
                <div class="score">Score: ${state.score}</div>
            </div>
            <div class="fretboard-container" id="threeContainer"></div>
        </div>
    `;

    document.getElementById('exitBtn').addEventListener('click', () => {
        state.currentScreen = 'menu';
        cleanupThreeJS();
        renderMenu();
    });

    // Initialize based on view mode
    const container = document.getElementById('threeContainer');
    if (state.viewMode === '2d') {
        // Use 2D view directly
        fallbackToCSS(container, 'singleNote');
    } else {
        // Try 3D view
        if (initThreeJS(container)) {
            loadGuitarModel().then(() => {
                setupFretClickHandler();
            }).catch(error => {
                console.error('Failed to load guitar model:', error);
                showFeedback('error', 'Failed to load 3D model. Using 2D view.');
                fallbackToCSS(container, 'singleNote');
            });
        } else {
            console.warn('WebGL not supported or disabled. Using CSS fallback.');
            fallbackToCSS(container, 'singleNote');
        }
    }
}

function renderFindAllGame() {
    const app = document.getElementById('app');
    const found = state.foundPositions.length;
    const total = state.allPositions.length;

    app.innerHTML = `
        <div class="game-screen">
            <button class="exit-btn" id="exitBtn">← Exit</button>
            <div class="game-header">
                <div>
                    <div class="target-note">${state.targetNote}</div>
                    <div class="progress-info">Found: ${found} / ${total}</div>
                </div>
                <div class="score">Score: ${state.score}</div>
            </div>
            <div class="fretboard-container" id="threeContainer"></div>
        </div>
    `;

    document.getElementById('exitBtn').addEventListener('click', () => {
        state.currentScreen = 'menu';
        cleanupThreeJS();
        renderMenu();
    });

    // Initialize based on view mode
    const container = document.getElementById('threeContainer');
    if (state.viewMode === '2d') {
        // Use 2D view directly
        fallbackToCSS(container, 'findAll');
    } else {
        // Try 3D view
        if (initThreeJS(container)) {
            loadGuitarModel().then(() => {
                setupFretClickHandler();
            }).catch(error => {
                console.error('Failed to load guitar model:', error);
                showFeedback('error', 'Failed to load 3D model. Using 2D view.');
                fallbackToCSS(container, 'findAll');
            });
        } else {
            console.warn('WebGL not supported or disabled. Using CSS fallback.');
            fallbackToCSS(container, 'findAll');
        }
    }
}

/* ========================================
   GAME LOGIC FUNCTIONS
   ======================================== */
function startSingleNoteGame() {
    state.currentScreen = 'singleNote';
    state.targetNote = getRandomNote();
    renderSingleNoteGame();
}

function startFindAllGame() {
    state.currentScreen = 'findAll';
    state.targetNote = getRandomNote();
    state.allPositions = getAllPositions(state.targetNote);
    state.foundPositions = [];
    renderFindAllGame();
}

/* ========================================
   THREE.JS CLICK HANDLERS
   ======================================== */
function handleSingleNoteClick(stringIndex, fretIndex, note) {
    const frequency = getFrequencyAt(stringIndex, fretIndex);

    // Play sound
    playGuitarTone(frequency);

    if (note === state.targetNote) {
        // Correct answer - highlight the zone temporarily
        const zone = fretZones.find(z =>
            z.userData.stringIndex === stringIndex &&
            z.userData.fretIndex === fretIndex
        );
        if (zone) {
            zone.material.opacity = 0.5;
            zone.material.color.setHex(0x00ff00);
            setTimeout(() => {
                zone.material.opacity = 0;
            }, 1500);
        }

        showFeedback('success', 'Correct! Great job!');
        state.score += 1;

        // Update score display
        document.querySelector('.score').textContent = `Score: ${state.score}`;

        // Auto-advance to next note
        setTimeout(() => {
            state.targetNote = getRandomNote();
            document.querySelector('.target-note').textContent = state.targetNote;
        }, 1500);
    } else {
        // Wrong answer
        showFeedback('error', `Incorrect. That was ${note}. Try again!`);
    }
}

function handleFindAllClick(stringIndex, fretIndex, note) {
    // Check if already found
    const alreadyFound = state.foundPositions.some(
        pos => pos.string === stringIndex && pos.fret === fretIndex
    );

    if (alreadyFound) {
        return; // Already clicked this position
    }

    const frequency = getFrequencyAt(stringIndex, fretIndex);
    playGuitarTone(frequency);

    if (note === state.targetNote) {
        // Correct position
        state.foundPositions.push({ string: stringIndex, fret: fretIndex });

        // Highlight the zone permanently
        const zone = fretZones.find(z =>
            z.userData.stringIndex === stringIndex &&
            z.userData.fretIndex === fretIndex
        );
        if (zone) {
            zone.material.opacity = 0.7;
            zone.material.color.setHex(0x00e676);
        }

        const remaining = state.allPositions.length - state.foundPositions.length;

        if (remaining > 0) {
            showFeedback('success', `Good! ${remaining} more to go.`);
            document.querySelector('.progress-info').textContent = `Found: ${state.foundPositions.length} / ${state.allPositions.length}`;
        } else {
            // All found!
            showFeedback('success', `Awesome! You found all ${state.targetNote}'s!`);
            state.score += 10;
            document.querySelector('.score').textContent = `Score: ${state.score}`;

            // Auto-advance to next note
            setTimeout(() => {
                state.targetNote = getRandomNote();
                state.allPositions = getAllPositions(state.targetNote);
                state.foundPositions = [];

                // Reset all zones
                fretZones.forEach(z => z.material.opacity = 0);

                document.querySelector('.target-note').textContent = state.targetNote;
                document.querySelector('.progress-info').textContent = `Found: 0 / ${state.allPositions.length}`;
            }, 2000);
        }
    } else {
        // Wrong position
        showFeedback('error', `Oops, that's a ${note}. Keep looking for ${state.targetNote}.`);
    }
}

function handleTriadClick(stringIndex, fretIndex, note) {
    const frequency = getFrequencyAt(stringIndex, fretIndex);
    playGuitarTone(frequency);

    const triad = state.targetTriad;

    // Check if this note is part of the triad
    if (triad.notes.includes(note)) {
        // Check if we already clicked this note
        if (!state.clickedTriadNotes.includes(note)) {
            state.clickedTriadNotes.push(note);
            state.clickedTriadPositions.push({ string: stringIndex, fret: fretIndex });

            // Highlight the zone
            const zone = fretZones.find(z =>
                z.userData.stringIndex === stringIndex &&
                z.userData.fretIndex === fretIndex
            );
            if (zone) {
                zone.material.opacity = 0.7;
                zone.material.color.setHex(0x00e676);
            }

            // Check if all notes are clicked
            if (state.clickedTriadNotes.length === 3) {
                // All notes found!
                showFeedback('success', 'Perfect! All notes found!');
                state.score += 1;
                document.querySelector('.score').textContent = `Score: ${state.score}`;

                // Auto-advance to next triad
                setTimeout(() => {
                    state.targetTriad = getRandomTriad();
                    state.clickedTriadNotes = [];
                    state.clickedTriadPositions = [];

                    // Reset all zones
                    fretZones.forEach(z => z.material.opacity = 0);

                    // Update UI (we need to re-render the triad display)
                    renderTriadsGameUpdate();
                }, 2000);
            } else {
                const remaining = 3 - state.clickedTriadNotes.length;
                showFeedback('success', `Good! ${remaining} more note${remaining > 1 ? 's' : ''} to go.`);
                renderTriadsGameUpdate();
            }
        } else {
            // Note already clicked
            showFeedback('error', `You already found ${note}.`);
        }
    } else {
        // Wrong note
        showFeedback('error', `That's ${note}, not part of the ${triad.root} ${triad.typeName} triad.`);
    }
}





function startTriadsGame() {
    state.currentScreen = 'triadsSettings';
    renderTriadsSettings();
}

function startTriadsGameFromSettings() {
    state.currentScreen = 'triads';
    state.targetTriad = getRandomTriad();
    state.clickedTriadNotes = [];
    state.clickedTriadPositions = [];
    state.score = 0;
    renderTriadsGame();
}

function renderTriadsSettings() {
    const app = document.getElementById('app');
    const settings = state.triadSettings;

    app.innerHTML = `
        <div class="menu-screen">
            <button class="exit-btn" id="exitBtn">← Back</button>
            <h1 class="title">Chord Triads Settings</h1>
            <p class="subtitle">Choose which chord types to practice</p>
            <div class="settings-container">
                <div class="setting-item">
                    <label class="setting-label">
                        <input type="checkbox" id="setting-major" ${settings.major ? 'checked' : ''}>
                        <span class="checkbox-custom"></span>
                        <span class="setting-name">Major</span>
                    </label>
                </div>
                <div class="setting-item">
                    <label class="setting-label">
                        <input type="checkbox" id="setting-minor" ${settings.minor ? 'checked' : ''}>
                        <span class="checkbox-custom"></span>
                        <span class="setting-name">Minor</span>
                    </label>
                </div>
                <div class="setting-item">
                    <label class="setting-label">
                        <input type="checkbox" id="setting-diminished" ${settings.diminished ? 'checked' : ''}>
                        <span class="checkbox-custom"></span>
                        <span class="setting-name">Diminished</span>
                    </label>
                </div>
                <div class="setting-item">
                    <label class="setting-label">
                        <input type="checkbox" id="setting-augmented" ${settings.augmented ? 'checked' : ''}>
                        <span class="checkbox-custom"></span>
                        <span class="setting-name">Augmented</span>
                    </label>
                </div>
            </div>
            <button class="start-game-btn" id="startGameBtn">Start Game</button>
        </div>
    `;

    document.getElementById('exitBtn').addEventListener('click', () => {
        state.currentScreen = 'menu';
        renderMenu();
    });

    // Add change listeners to checkboxes
    Object.keys(settings).forEach(type => {
        const checkbox = document.getElementById(`setting-${type}`);
        checkbox.addEventListener('change', (e) => {
            state.triadSettings[type] = e.target.checked;
        });
    });

    document.getElementById('startGameBtn').addEventListener('click', () => {
        // Check if at least one type is enabled
        const hasEnabled = Object.values(state.triadSettings).some(val => val);
        if (!hasEnabled) {
            showFeedback('error', 'Please select at least one chord type!');
            return;
        }
        startTriadsGameFromSettings();
    });
}

function renderTriadsGame() {
    const app = document.getElementById('app');
    const triad = state.targetTriad;

    // Determine which notes have been clicked
    const noteProgress = triad.notes.map(note => {
        const isClicked = state.clickedTriadNotes.includes(note);
        return { note, isClicked };
    });

    app.innerHTML = `
        <div class="game-screen">
            <button class="exit-btn" id="exitBtn">← Exit</button>
            <div class="game-header">
                <div>
                    <div class="triad-title">${triad.root} ${triad.typeName}</div>
                    <div class="triad-notes">
                        ${noteProgress.map(({ note, isClicked }) => `
                            <span class="triad-note ${isClicked ? 'clicked' : ''}">${note}</span>
                        `).join('')}
                    </div>
                </div>
                <div class="score">Score: ${state.score}</div>
            </div>
            <div class="fretboard-container" id="threeContainer"></div>
        </div>
    `;

    document.getElementById('exitBtn').addEventListener('click', () => {
        state.currentScreen = 'menu';
        cleanupThreeJS();
        renderMenu();
    });

    // Initialize based on view mode
    const container = document.getElementById('threeContainer');
    if (state.viewMode === '2d') {
        // Use 2D view directly
        fallbackToCSS(container, 'triads');
    } else {
        // Try 3D view
        if (initThreeJS(container)) {
            loadGuitarModel().then(() => {
                setupFretClickHandler();
            }).catch(error => {
                console.error('Failed to load guitar model:', error);
                showFeedback('error', 'Failed to load 3D model. Using 2D view.');
                fallbackToCSS(container, 'triads');
            });
        } else {
            console.warn('WebGL not supported or disabled. Using CSS fallback.');
            fallbackToCSS(container, 'triads');
        }
    }
}

function renderTriadsGameUpdate() {
    const triad = state.targetTriad;

    // Determine which notes have been clicked
    const noteProgress = triad.notes.map(note => {
        const isClicked = state.clickedTriadNotes.includes(note);
        return { note, isClicked };
    });

    // Update the notes display
    const notesContainer = document.querySelector('.triad-notes');
    if (notesContainer) {
        notesContainer.innerHTML = noteProgress.map(({ note, isClicked }) => `
            <span class="triad-note ${isClicked ? 'clicked' : ''}">${note}</span>
        `).join('');
    }

    // Update title if changed (new round)
    const titleEl = document.querySelector('.triad-title');
    if (titleEl) {
        titleEl.textContent = `${triad.root} ${triad.typeName}`;
    }
}





/* ========================================
   FALLBACK DOM EVENT HANDLERS
   ======================================== */
function handleSingleNoteDOMClick(event) {
    const fret = event.currentTarget;
    const stringIndex = parseInt(fret.dataset.string);
    const fretIndex = parseInt(fret.dataset.fret);
    const clickedNote = getNoteAt(stringIndex, fretIndex);
    const frequency = getFrequencyAt(stringIndex, fretIndex);

    playGuitarTone(frequency);

    if (clickedNote === state.targetNote) {
        fret.classList.add('highlighted');
        fret.innerHTML = `<div class="note-marker found">${clickedNote}</div>`;
        showFeedback('success', 'Correct! Great job!');
        state.score += 1;
        document.querySelector('.score').textContent = `Score: ${state.score}`;

        setTimeout(() => {
            state.targetNote = getRandomNote();
            renderSingleNoteGame();
        }, 1500);
    } else {
        showFeedback('error', `Incorrect. That was ${clickedNote}. Try again!`);
    }
}

function handleFindAllDOMClick(event) {
    const fret = event.currentTarget;
    const stringIndex = parseInt(fret.dataset.string);
    const fretIndex = parseInt(fret.dataset.fret);

    // Check if already found
    const alreadyFound = state.foundPositions.some(
        pos => pos.string === stringIndex && pos.fret === fretIndex
    );
    if (alreadyFound) return;

    const clickedNote = getNoteAt(stringIndex, fretIndex);
    const frequency = getFrequencyAt(stringIndex, fretIndex);
    playGuitarTone(frequency);

    if (clickedNote === state.targetNote) {
        state.foundPositions.push({ string: stringIndex, fret: fretIndex });
        const remaining = state.allPositions.length - state.foundPositions.length;

        if (remaining > 0) {
            showFeedback('success', `Good! ${remaining} more to go.`);
            renderFindAllGame();
        } else {
            renderFindAllGame();
            showFeedback('success', `Awesome! You found all ${state.targetNote}'s!`);
            state.score += 10;
            setTimeout(() => {
                state.targetNote = getRandomNote();
                state.allPositions = getAllPositions(state.targetNote);
                state.foundPositions = [];
                renderFindAllGame();
            }, 2000);
        }
    } else {
        showFeedback('error', `Oops, that's a ${clickedNote}. Keep looking for ${state.targetNote}.`);
    }
}

function handleTriadDOMClick(event) {
    const fret = event.currentTarget;
    const stringIndex = parseInt(fret.dataset.string);
    const fretIndex = parseInt(fret.dataset.fret);
    const clickedNote = getNoteAt(stringIndex, fretIndex);
    const frequency = getFrequencyAt(stringIndex, fretIndex);

    playGuitarTone(frequency);

    const triad = state.targetTriad;
    if (triad.notes.includes(clickedNote)) {
        if (!state.clickedTriadNotes.includes(clickedNote)) {
            state.clickedTriadNotes.push(clickedNote);
            if (state.clickedTriadNotes.length === 3) {
                state.clickedTriadPositions.push({ string: stringIndex, fret: fretIndex });
                showFeedback('success', 'Perfect! All notes found!');
                state.score += 1;
                renderTriadsGame();
                setTimeout(() => {
                    state.targetTriad = getRandomTriad();
                    state.clickedTriadNotes = [];
                    state.clickedTriadPositions = [];
                    renderTriadsGame();
                }, 2000);
            } else {
                state.clickedTriadPositions.push({ string: stringIndex, fret: fretIndex });
                const remaining = 3 - state.clickedTriadNotes.length;
                showFeedback('success', `Good! ${remaining} more note${remaining > 1 ? 's' : ''} to go.`);
                renderTriadsGame();
            }
        } else {
            showFeedback('error', `You already found ${clickedNote}.`);
        }
    } else {
        showFeedback('error', `That's ${clickedNote}, not part of the ${triad.root} ${triad.typeName} triad.`);
    }
}

/* ========================================
   CSS ROTATION CONTROLS (Fallback)
   ======================================== */
let isDraggingCSS = false;
let lastMouseXCSS = 0;
let lastMouseYCSS = 0;

function updateCSSFretboardRotation() {
    const fretboard = document.querySelector('.fretboard');
    if (fretboard) {
        fretboard.style.transform = `rotateX(${state.rotation.x}deg) rotateY(${state.rotation.y}deg)`;
    }
}

function initCSSRotationControls() {
    const fretboardContainer = document.querySelector('.fretboard-container');
    if (!fretboardContainer) return;

    fretboardContainer.addEventListener('mousedown', (e) => {
        if (e.target.closest('.fret')) return;
        isDraggingCSS = true;
        lastMouseXCSS = e.clientX;
        lastMouseYCSS = e.clientY;
        fretboardContainer.style.cursor = 'grabbing';
    });

    document.addEventListener('mousemove', (e) => {
        if (!isDraggingCSS) return;
        const deltaX = e.clientX - lastMouseXCSS;
        const deltaY = e.clientY - lastMouseYCSS;
        state.rotation.y += deltaX * 0.5;
        state.rotation.x -= deltaY * 0.5;
        state.rotation.x = Math.max(-60, Math.min(80, state.rotation.x));
        updateCSSFretboardRotation();
        lastMouseXCSS = e.clientX;
        lastMouseYCSS = e.clientY;
    });

    document.addEventListener('mouseup', () => {
        if (isDraggingCSS) {
            isDraggingCSS = false;
            const fretboardContainer = document.querySelector('.fretboard-container');
            if (fretboardContainer) {
                fretboardContainer.style.cursor = 'grab';
            }
        }
    });
}

/* ========================================
   INITIALIZATION
   ======================================== */
document.addEventListener('DOMContentLoaded', () => {
    renderMenu();
});
