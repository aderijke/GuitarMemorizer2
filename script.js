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
    // Debug mode: show/hide hitboxes and tooltip
    showDebug: false,
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

const NUM_FRETS = 23; // 0-22 (22 frets)

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

        // Setup debug tooltip for mouse hover
        setupDebugTooltip();

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

                    // Debug: Log all mesh names to find frets
                    console.log("Model loaded. Meshes:");
                    guitarModel.traverse((child) => {
                        if (child.isMesh) {
                            console.log(`- ${child.name}`);
                        }
                    });

                    // Calculate neck region immediately
                    const neckRegion = findNeckRegion();
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

    // Find Nut (Cejilla), Bridge (Puente), and Neck (Mastil) to calculate dimensions
    let nutMesh = null;
    let bridgeMesh = null;
    let neckMesh = null;

    guitarModel.traverse((child) => {
        if (child.isMesh && child.name) {
            const name = child.name.toLowerCase();
            if (name.includes('cejilla')) {
                nutMesh = child;
            } else if (name.includes('puente')) {
                bridgeMesh = child;
            } else if (name.includes('mastil')) {
                neckMesh = child;
            }
        }
    });

    // Calculate overall bounding box for fallbacks
    const overallBox = new THREE.Box3().setFromObject(guitarModel);
    const overallSize = overallBox.getSize(new THREE.Vector3());
    const overallCenter = overallBox.getCenter(new THREE.Vector3());
    const overallMin = overallBox.min;

    let nutX, scaleLength, neckLength, neckWidth;

    if (nutMesh && bridgeMesh) {
        // Get exact positions from objects
        nutMesh.updateMatrixWorld(true);
        bridgeMesh.updateMatrixWorld(true);

        const nutBox = new THREE.Box3().setFromObject(nutMesh);
        const bridgeBox = new THREE.Box3().setFromObject(bridgeMesh);

        // Nut is usually at the start of the scale (closest to headstock)
        // We want the edge of the nut that touches the fretboard
        nutX = nutBox.max.x;

        // Bridge saddle is where the string ends vibrating
        const bridgeX = bridgeBox.getCenter(new THREE.Vector3()).x;

        // Calculate scale length
        scaleLength = Math.abs(bridgeX - nutX);

        console.log(`Found Nut at X=${nutX.toFixed(3)} and Bridge at X=${bridgeX.toFixed(3)}`);
        console.log(`Calculated Scale Length: ${scaleLength.toFixed(3)}`);
    } else {
        console.warn('Could not find Nut or Bridge objects, using estimation');
        // Fallback estimation
        nutX = overallMin.x + overallSize.x * 0.15;
        scaleLength = overallSize.x * 0.65;
    }

    // Calculate neck length - try to find from neck mesh, otherwise estimate
    if (neckMesh) {
        neckMesh.updateMatrixWorld(true);
        const neckBox = new THREE.Box3().setFromObject(neckMesh);
        const neckSize = neckBox.getSize(new THREE.Vector3());
        neckLength = neckSize.x; // Length along X axis
        neckWidth = neckSize.z; // Width along Z axis
        console.log(`Found Neck mesh, length: ${neckLength.toFixed(3)}, width: ${neckWidth.toFixed(3)}`);
    } else {
        // Estimate: neck typically extends to about 12-14 frets, roughly 60-70% of scale length
        neckLength = scaleLength * 0.65;
        console.warn('Could not find Neck mesh, using estimated length');
    }

    // Calculate neck width if not found from mesh
    if (!neckWidth) {
        if (nutMesh) {
            const nutBox = new THREE.Box3().setFromObject(nutMesh);
            const nutSize = nutBox.getSize(new THREE.Vector3());
            // Neck width is typically slightly wider than nut at the nut, tapers down
            neckWidth = nutSize.z * 1.1; // Slightly wider than nut
        } else {
            // Fallback: estimate from overall size
            neckWidth = overallSize.z * 0.15;
        }
    }

    const neckStartX = nutX;
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

/**
 * Group fret candidates that are close together (same fret detected multiple times)
 * Uses a larger tolerance to account for fret thickness
 */
function groupFretCandidates(candidates, tolerance = 0.015) {
    if (candidates.length === 0) return [];
    
    // Sort by X position
    candidates.sort((a, b) => a.x - b.x);
    
    const groups = [];
    
    for (const candidate of candidates) {
        let addedToGroup = false;
        
        // Try to add to existing group
        for (const group of groups) {
            // Check if candidate is within tolerance of the group center
            // This is more efficient and works better for grouping
            const distance = Math.abs(candidate.x - group.x);
            
            if (distance < tolerance) {
                // Add to this group
                group.candidates.push(candidate);
                // Update group center (weighted average by vertex count if available)
                const totalWeight = group.candidates.reduce((sum, c) => sum + (c.vertexCount || 1), 0);
                group.x = group.candidates.reduce((sum, c) => sum + c.x * (c.vertexCount || 1), 0) / totalWeight;
                group.y = Math.max(...group.candidates.map(c => c.y));
                group.z = group.candidates.reduce((sum, c) => sum + c.z, 0) / group.candidates.length;
                addedToGroup = true;
                break;
            }
        }
        
        // Create new group if not added to existing
        if (!addedToGroup) {
            groups.push({
                x: candidate.x,
                y: candidate.y,
                z: candidate.z,
                candidates: [candidate]
            });
        }
    }
    
    // Convert groups to simple fret objects
    return groups.map(group => ({
        x: group.x,
        y: group.y,
        z: group.z,
        candidateCount: group.candidates.length
    }));
}

/**
 * Extract fret positions from the fretboard geometry
 * Uses raycasting to find frets by detecting height changes on the fretboard
 */
function extractFretPositionsFromGeometry(neckRegion) {
    if (!guitarModel) return null;

    // Find the circulo object that contains all frets
    // Specifically look for "Círculo.009_Círculo.060" (exact name)
    let fretContainerObject = null;
    guitarModel.traverse((child) => {
        if (child.isMesh && child.name) {
            // Try exact match first
            if (child.name === 'Círculo.009_Círculo.060') {
                fretContainerObject = child;
            } else {
                // Fallback: case-insensitive match for variations
                const name = child.name.toLowerCase();
                const normalizedTarget = 'círculo.009_círculo.060';
                if (name === normalizedTarget || 
                    (name.includes('circulo.009') && name.includes('circulo.060'))) {
                    fretContainerObject = child;
                }
            }
        }
    });

    if (fretContainerObject) {
        console.log(`Found fret container object: ${fretContainerObject.name}`);
        fretContainerObject.updateMatrixWorld(true);
        
        // Get bounding box of the fret container
        const fretBox = new THREE.Box3().setFromObject(fretContainerObject);
        const nutX = neckRegion.nutX || neckRegion.startX;
        const neckEndX = neckRegion.startX + neckRegion.length;
        
        // Method 1: Analyze by color/material differences - frets might have different colors
        const geometry = fretContainerObject.geometry;
        const material = fretContainerObject.material;
        
        // Check if geometry has vertex colors
        if (geometry && geometry.attributes.color) {
            console.log('Found vertex colors in geometry, analyzing color differences...');
            const colors = geometry.attributes.color;
            const positions = geometry.attributes.position;
            const worldMatrix = fretContainerObject.matrixWorld;
            const vertex = new THREE.Vector3();
            const color = new THREE.Color();
            
            // Group vertices by X position and check their colors
            const xColorGroups = new Map();
            
            for (let i = 0; i < positions.count; i++) {
                vertex.fromBufferAttribute(positions, i);
                vertex.applyMatrix4(worldMatrix);
                
                if (vertex.x > nutX && vertex.x < neckEndX) {
                    color.fromBufferAttribute(colors, i);
                    const roundedX = Math.round(vertex.x * 2000) / 2000; // 0.0005 precision
                    
                    if (!xColorGroups.has(roundedX)) {
                        xColorGroups.set(roundedX, {
                            x: roundedX,
                            colors: [],
                            vertices: []
                        });
                    }
                    
                    xColorGroups.get(roundedX).colors.push({
                        r: color.r,
                        g: color.g,
                        b: color.b
                    });
                    xColorGroups.get(roundedX).vertices.push(vertex);
                }
            }
            
            // Calculate average brightness across all positions to find baseline
            let totalBrightness = 0;
            let totalCount = 0;
            xColorGroups.forEach((group) => {
                group.colors.forEach(c => {
                    totalBrightness += (c.r + c.g + c.b) / 3;
                    totalCount++;
                });
            });
            const avgBrightness = totalBrightness / totalCount;
            
            console.log(`Analyzing ${xColorGroups.size} X positions, average brightness: ${avgBrightness.toFixed(3)}`);
            
            // Find X positions where colors are significantly different (likely frets)
            // Frets might be darker (no color/material) or have different colors
            const fretCandidates = [];
            xColorGroups.forEach((group, x) => {
                if (group.colors.length > 3) {
                    // Calculate average color and brightness for this X position
                    const avgR = group.colors.reduce((sum, c) => sum + c.r, 0) / group.colors.length;
                    const avgG = group.colors.reduce((sum, c) => sum + c.g, 0) / group.colors.length;
                    const avgB = group.colors.reduce((sum, c) => sum + c.b, 0) / group.colors.length;
                    const groupBrightness = (avgR + avgG + avgB) / 3;
                    
                    // Check brightness difference from average (frets might be darker/lighter)
                    const brightnessDiff = Math.abs(groupBrightness - avgBrightness);
                    
                    // Check color variance within this group
                    const variance = group.colors.reduce((sum, c) => {
                        const cBrightness = (c.r + c.g + c.b) / 3;
                        return sum + Math.abs(cBrightness - groupBrightness);
                    }, 0) / group.colors.length;
                    
                    // Frets might be:
                    // 1. Significantly darker (no color/material) - brightnessDiff > threshold
                    // 2. Significantly lighter (different material) - brightnessDiff > threshold
                    // 3. Have high color variance (mixed colors) - variance > threshold
                    const isDark = groupBrightness < avgBrightness - 0.1;
                    const isLight = groupBrightness > avgBrightness + 0.1;
                    const hasHighVariance = variance > 0.08;
                    
                    if (brightnessDiff > 0.12 || (hasHighVariance && brightnessDiff > 0.05)) {
                        const avgY = group.vertices.reduce((sum, v) => sum + v.y, 0) / group.vertices.length;
                        const avgZ = group.vertices.reduce((sum, v) => sum + v.z, 0) / group.vertices.length;
                        
                        fretCandidates.push({
                            x: x,
                            y: avgY,
                            z: avgZ,
                            brightness: groupBrightness,
                            brightnessDiff: brightnessDiff,
                            colorVariance: variance,
                            isDark: isDark,
                            isLight: isLight,
                            vertexCount: group.vertices.length
                        });
                    }
                }
            });
            
            if (fretCandidates.length > 0) {
                console.log(`Found ${fretCandidates.length} fret candidates using vertex colors`);
                
                // Group nearby candidates using improved grouping function
                // Use larger tolerance (1.5cm) to account for fret thickness
                const groupedFrets = groupFretCandidates(fretCandidates, 0.015);
                
                groupedFrets.sort((a, b) => a.x - b.x);
                const validFrets = groupedFrets.filter(f => f.x > nutX && f.x < neckEndX);
                
                console.log(`Found ${validFrets.length} frets using vertex color analysis:`);
                validFrets.forEach((fret, i) => {
                    const type = fret.isDark ? 'dark' : (fret.isLight ? 'light' : 'varied');
                    console.log(`  Fret ${i + 1}: X=${fret.x.toFixed(3)}, brightness=${fret.brightness.toFixed(3)}, diff=${fret.brightnessDiff.toFixed(3)}, type=${type}`);
                });
                
                // Return results from color detection (will be supplemented with calculated if needed)
                if (validFrets.length > 0) {
                    console.log(`Using ${validFrets.length} frets from vertex color analysis`);
                    return validFrets;
                }
            } else {
                console.log('No frets found using vertex color analysis');
            }
        } else {
            console.log('No vertex colors found in geometry - color/material detection requires vertex colors');
        }
        
        // Color/material detection did not find frets, try geometry analysis
        console.log('Color/material detection did not find frets, trying geometry analysis...');
        
        // Method 2: Direct geometry analysis - analyze vertices and edges to find fret positions
        if (geometry && geometry.attributes.position) {
            const positions = geometry.attributes.position;
            const worldMatrix = fretContainerObject.matrixWorld;
            const vertex = new THREE.Vector3();
            
            // Collect all X positions from vertices with their Y and Z
            const vertexData = [];
            for (let i = 0; i < positions.count; i++) {
                vertex.fromBufferAttribute(positions, i);
                vertex.applyMatrix4(worldMatrix);
                
                // Only consider vertices in the neck region
                if (vertex.x > nutX && vertex.x < neckEndX) {
                    vertexData.push({
                        x: vertex.x,
                        y: vertex.y,
                        z: vertex.z
                    });
                }
            }
            
            console.log(`Analyzing ${vertexData.length} vertices in neck region`);
            
            // Try multiple rounding precisions to find frets
            const precisions = [100, 200, 500, 1000, 2000]; // Different levels of precision
            let bestFrets = [];
            
            for (let precision of precisions) {
                // Group vertices by X position (frets are vertical, so many vertices share same X)
                const xGroups = new Map();
                
                vertexData.forEach(v => {
                    const roundedX = Math.round(v.x * precision) / precision;
                    if (!xGroups.has(roundedX)) {
                        xGroups.set(roundedX, []);
                    }
                    xGroups.get(roundedX).push(v);
                });
                
                // Find X positions with many vertices (these are likely frets)
                // Frets are vertical lines, so they have many vertices at the same X
                const fretCandidates = [];
                const minVertexCount = 3; // Lower threshold to catch more frets
                
                xGroups.forEach((vertices, x) => {
                    if (vertices.length >= minVertexCount) {
                        // Calculate average Y and Z for this X position
                        const avgY = vertices.reduce((sum, v) => sum + v.y, 0) / vertices.length;
                        const avgZ = vertices.reduce((sum, v) => sum + v.z, 0) / vertices.length;
                        const maxY = Math.max(...vertices.map(v => v.y));
                        
                        fretCandidates.push({
                            x: x,
                            y: maxY, // Use max Y (top of fret)
                            z: avgZ,
                            vertexCount: vertices.length,
                            avgY: avgY
                        });
                    }
                });
                
                // Group nearby candidates using improved grouping function
                // Use larger tolerance (1.5cm) to account for fret thickness
                const groupedFrets = groupFretCandidates(fretCandidates, 0.015);
                
                // Sort final frets
                groupedFrets.sort((a, b) => a.x - b.x);
                
                const validFrets = groupedFrets.map(f => ({
                    x: f.x,
                    y: f.y,
                    z: f.z,
                    vertexCount: f.candidateCount || 1
                }));
                
                // Keep the result with the most frets
                if (validFrets.length > bestFrets.length) {
                    bestFrets = validFrets;
                    console.log(`Found ${validFrets.length} frets using precision ${precision}:`);
                    validFrets.forEach((fret, i) => {
                        console.log(`  Fret ${i + 1}: X=${fret.x.toFixed(3)}, vertices=${fret.vertexCount}`);
                    });
                }
            }
            
            // Return up to 22 frets (NUM_FRETS - 1 = 22 for 22 frets)
            if (bestFrets.length >= NUM_FRETS - 1) {
                console.log(`Extracted ${bestFrets.length} fret positions from geometry analysis, using first ${NUM_FRETS - 1}`);
                return bestFrets.slice(0, NUM_FRETS - 1);
            } else if (bestFrets.length >= 8) {
                console.log(`Found ${bestFrets.length} frets using geometry analysis (target: ${NUM_FRETS - 1})`);
                return bestFrets;
            } else {
                console.log(`Geometry analysis found only ${bestFrets.length} frets, trying edge analysis...`);
            }
        }
        
        // Method 3: Analyze faces/edges to find vertical edges (frets)
        if (fretContainerObject.geometry && fretContainerObject.geometry.index) {
            const geometry2 = fretContainerObject.geometry;
            console.log('Trying face/edge analysis method...');
            const positions = geometry2.attributes.position;
            const indices = geometry2.index;
            const worldMatrix = fretContainerObject.matrixWorld;
            const vertex = new THREE.Vector3();
            
            // Collect all X positions from edges (where faces meet)
            const edgeXPositions = new Set();
            
            // Analyze each face to find vertical edges
            for (let i = 0; i < indices.count; i += 3) {
                const i0 = indices.getX(i);
                const i1 = indices.getX(i + 1);
                const i2 = indices.getX(i + 2);
                
                const vertices = [
                    vertex.fromBufferAttribute(positions, i0).applyMatrix4(worldMatrix),
                    vertex.fromBufferAttribute(positions, i1).applyMatrix4(worldMatrix),
                    vertex.fromBufferAttribute(positions, i2).applyMatrix4(worldMatrix)
                ];
                
                // Check each edge of the triangle
                for (let j = 0; j < 3; j++) {
                    const v1 = vertices[j];
                    const v2 = vertices[(j + 1) % 3];
                    
                    // If X is similar but Y or Z differs significantly, it's a vertical edge (fret)
                    const xDiff = Math.abs(v1.x - v2.x);
                    const yDiff = Math.abs(v1.y - v2.y);
                    const zDiff = Math.abs(v1.z - v2.z);
                    
                    if (xDiff < 0.001 && (yDiff > 0.01 || zDiff > 0.01)) {
                        // Vertical edge - this is likely part of a fret
                        const avgX = (v1.x + v2.x) / 2;
                        if (avgX > nutX && avgX < neckEndX) {
                            edgeXPositions.add(Math.round(avgX * 1000) / 1000);
                        }
                    }
                }
            }
            
            // Convert to array and group using improved grouping
            const edgeXArray = Array.from(edgeXPositions).sort((a, b) => a - b);
            const edgeCandidates = edgeXArray.map(x => ({
                x: x,
                y: neckRegion.y,
                z: neckRegion.centerZ,
                vertexCount: 1
            }));
            
            // Group nearby edges using improved grouping function
            // Use larger tolerance (1.5cm) to account for fret thickness
            const groupedFrets = groupFretCandidates(edgeCandidates, 0.015);
            
            // Filter to only include groups with multiple edges (more reliable)
            const fretCandidates = groupedFrets
                .filter(f => f.candidateCount >= 2)
                .map(f => ({
                    x: f.x,
                    y: f.y,
                    z: f.z
                }))
                .sort((a, b) => a.x - b.x);
            
            console.log(`Found ${fretCandidates.length} frets using edge analysis`);
            
            if (fretCandidates.length > bestFrets.length) {
                bestFrets = fretCandidates;
                console.log('Edge analysis found more frets, using those:');
                fretCandidates.forEach((fret, i) => {
                    console.log(`  Fret ${i + 1}: X=${fret.x.toFixed(3)}`);
                });
            }
        }
        
        // Method 4: Use raycasting to find frets by detecting height changes
        console.log('Trying raycasting method to find frets...');
        // Scan along the X-axis at multiple Z positions to find where frets are located
        const raycaster = new THREE.Raycaster();
        const sampleCount = 1000; // Very high resolution scan
        const scanStartX = Math.max(nutX, fretBox.min.x);
        const scanEndX = Math.min(neckEndX, fretBox.max.x);
        const scanLength = scanEndX - scanStartX;
        const stepSize = scanLength / sampleCount;
        
        // Scan at multiple Z positions to catch all frets
        const zPositions = [
            neckRegion.centerZ,
            neckRegion.centerZ - neckRegion.width * 0.3,
            neckRegion.centerZ + neckRegion.width * 0.3
        ];
        
        const heightSamples = [];
        const scanY = neckRegion.y + 0.5; // Start ray above the fretboard
        
        // Sample heights along the X-axis at multiple Z positions
        for (let zPos of zPositions) {
            for (let i = 0; i <= sampleCount; i++) {
                const sampleX = scanStartX + (i * stepSize);
                const rayOrigin = new THREE.Vector3(sampleX, scanY, zPos);
                const rayDirection = new THREE.Vector3(0, -1, 0);
                
                raycaster.set(rayOrigin, rayDirection);
                const intersects = raycaster.intersectObject(fretContainerObject, false);
                
                if (intersects.length > 0) {
                    // Find the highest intersection (top of fret)
                    const highestIntersect = intersects.reduce((prev, curr) => 
                        curr.point.y > prev.point.y ? curr : prev
                    );
                    heightSamples.push({
                        x: sampleX,
                        y: highestIntersect.point.y,
                        z: highestIntersect.point.z
                    });
                }
            }
        }
        
        // Group samples by X position to find average height at each X
        const xGroups = new Map();
        heightSamples.forEach(sample => {
            const roundedX = Math.round(sample.x * 1000) / 1000; // Round to 0.001
            if (!xGroups.has(roundedX)) {
                xGroups.set(roundedX, []);
            }
            xGroups.get(roundedX).push(sample.y);
        });
        
        // Create averaged height samples
        const averagedSamples = [];
        xGroups.forEach((yValues, x) => {
            const avgY = yValues.reduce((sum, y) => sum + y, 0) / yValues.length;
            const maxY = Math.max(...yValues);
            averagedSamples.push({
                x: x,
                y: avgY,
                maxY: maxY
            });
        });
        
        // Sort by X
        averagedSamples.sort((a, b) => a.x - b.x);
        
        // Find frets by detecting local maxima in height
        // Frets are vertical lines that are higher than the surrounding area
        const fretCandidates = [];
        const heightThreshold = 0.0005; // Lower threshold to catch more frets
        
        for (let i = 2; i < averagedSamples.length - 2; i++) {
            const prev2Y = averagedSamples[i - 2]?.y || averagedSamples[i - 1]?.y || 0;
            const prevY = averagedSamples[i - 1]?.y || 0;
            const currY = averagedSamples[i].y;
            const nextY = averagedSamples[i + 1]?.y || 0;
            const next2Y = averagedSamples[i + 2]?.y || averagedSamples[i + 1]?.y || 0;
            
            // Look for local maxima (fret is higher than surrounding area)
            // Check both immediate neighbors and slightly further ones
            const isLocalMax = currY > prevY + heightThreshold && 
                              currY > nextY + heightThreshold &&
                              currY > prev2Y + heightThreshold * 0.5 &&
                              currY > next2Y + heightThreshold * 0.5;
            
            if (isLocalMax) {
                fretCandidates.push({
                    x: averagedSamples[i].x,
                    y: averagedSamples[i].maxY,
                    z: neckRegion.centerZ
                });
            }
        }
        
        // Group nearby candidates using improved grouping function
        // Use larger tolerance (1.5cm) to account for fret thickness
        const groupedFrets = groupFretCandidates(fretCandidates, 0.015);
        
        // Sort by X position and filter to valid range
        groupedFrets.sort((a, b) => a.x - b.x);
        const validFrets = groupedFrets.filter(f => f.x > nutX && f.x < neckEndX);
        
        console.log(`Found ${validFrets.length} frets using raycasting on fret container:`);
        validFrets.forEach((fret, i) => {
            console.log(`  Fret ${i + 1}: X=${fret.x.toFixed(3)}, Y=${fret.y.toFixed(3)}, Z=${fret.z.toFixed(3)}`);
        });
        
        // Return up to 22 frets (NUM_FRETS - 1 = 22 for 22 frets)
        if (validFrets.length >= NUM_FRETS - 1) {
            console.log(`Extracted ${validFrets.length} fret positions from fret container using raycasting, using first ${NUM_FRETS - 1}`);
            return validFrets.slice(0, NUM_FRETS - 1);
        } else if (validFrets.length > 0) {
            console.log(`Found ${validFrets.length} frets using raycasting (target: ${NUM_FRETS - 1})`);
            return validFrets;
        }
    }

    // If we couldn't find the circulo mesh or extract frets, return null
    console.warn('Could not find fret container mesh "circulo.009_circulo.060" or extract fret positions from geometry');
    return null;
}

/**
 * Calculate fret positions using standard guitar fret spacing formula
 * Used as fallback when geometry extraction doesn't work
 */
function findFretPositionsUsingCalculation(neckRegion) {
    if (!neckRegion) return null;

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
    // Use the exact scale length if available, otherwise estimate
    const scaleLength = neckRegion.scaleLength || (neckRegion.length * 0.9);
    const nutX = neckRegion.nutX || neckRegion.startX;

    console.log(`Using Scale Length: ${scaleLength.toFixed(3)}, Nut Position: ${nutX.toFixed(3)}`);

    // For each fret (1-12), calculate position from the nut
    for (let fret = 1; fret < NUM_FRETS; fret++) {
        // Logarithmic fret spacing formula: distance = scaleLength * (1 - 2^(-fret/12))
        const distanceFromNut = scaleLength * (1 - Math.pow(2, -fret / 12));
        const fretX = nutX + distanceFromNut;

        // Cast a ray from above the model down to find the fretboard surface
        const rayOrigin = new THREE.Vector3(fretX, neckRegion.y + 0.5, neckRegion.centerZ);
        const rayDirection = new THREE.Vector3(0, -1, 0);

        raycaster.set(rayOrigin, rayDirection);
        const intersects = raycaster.intersectObjects(meshes, false);

        let bestY = neckRegion.y;
        if (intersects.length > 0) {
            bestY = intersects[0].point.y;
        }

        fretPositions.push({
            x: fretX,
            y: bestY,
            z: neckRegion.centerZ
        });
    }


    console.log(`Calculated ${fretPositions.length} fret positions, starting at X=${fretPositions[0]?.x.toFixed(3)} (fret 1), ending at X=${fretPositions[fretPositions.length - 1]?.x.toFixed(3)} (fret ${fretPositions.length})`);
    return fretPositions;
}

/**
 * Extract string objects from the guitar model
 * Looks for 'Cuerdas' objects which represent the physical strings
 */
function extractStringObjects() {
    if (!guitarModel) return null;

    const stringObjects = [];

    guitarModel.traverse((child) => {
        if (child.isMesh && child.name) {
            // Look for string objects (Cuerdas in Spanish)
            if (child.name.toLowerCase().includes('cuerda')) {
                stringObjects.push(child);
            }
        }
    });

    console.log(`Found ${stringObjects.length} string objects in model:`, stringObjects.map(s => s.name));
    return stringObjects;
}

/**
 * Get the Z position of a string at a specific X position (fret location)
 * by analyzing its geometry
 */
function getStringPositionAtX(stringMesh, targetX) {
    if (!stringMesh || !stringMesh.geometry) return null;

    const geometry = stringMesh.geometry;
    const positions = geometry.attributes.position;

    if (!positions) return null;

    // Get world matrix to transform local coordinates to world coordinates
    stringMesh.updateMatrixWorld(true);
    const worldMatrix = stringMesh.matrixWorld;

    const vertex = new THREE.Vector3();
    let closestVertex = null;
    let closestDistance = Infinity;

    // Find vertex closest to our target X position
    for (let i = 0; i < positions.count; i++) {
        vertex.fromBufferAttribute(positions, i);
        vertex.applyMatrix4(worldMatrix);

        const distance = Math.abs(vertex.x - targetX);
        if (distance < closestDistance) {
            closestDistance = distance;
            closestVertex = vertex.clone();
        }
    }

    return closestVertex;
}

/**
 * Analyze string geometry to get positions at all fret locations
 * Extracts positions BETWEEN frets (where hitboxes will be placed)
 */
function analyzeStringGeometry(stringObjects, fretPositions, neckRegion) {
    if (!stringObjects || stringObjects.length === 0) return null;

    // Sort strings by their Z position at the first fret
    const firstFretX = fretPositions[0]?.x || -2.6;

    const stringsWithPositions = stringObjects.map(stringMesh => {
        const pos = getStringPositionAtX(stringMesh, firstFretX);
        return {
            mesh: stringMesh,
            name: stringMesh.name,
            zAtFirstFret: pos ? pos.z : 0
        };
    });

    // Sort by Z position (from low to high, which corresponds to string 1-6)
    stringsWithPositions.sort((a, b) => a.zAtFirstFret - b.zAtFirstFret);

    console.log('Sorted strings:', stringsWithPositions.map(s => ({
        name: s.name,
        z: s.zAtFirstFret.toFixed(3)
    })));

    // Extract positions BETWEEN frets (where hitboxes will be placed)
    // fretIndex 0 = between nut and fret 1
    // fretIndex 1 = between fret 1 and fret 2
    // etc.
    const stringPositionsByFret = [];
    const nutX = neckRegion.nutX || neckRegion.startX;

    for (let fretIndex = 0; fretIndex < fretPositions.length; fretIndex++) {
        // Calculate the X position where the hitbox will be (between this fret and the next)
        // Use the same calculation as in createFretZones to ensure consistency
        let targetX;

        if (fretIndex === 0) {
            // First fret: between nut and fret 1
            const fretStartX = nutX;
            const fretEndX = fretPositions[0].x;
            const margin = (fretEndX - fretStartX) * 0.05; // 5% margin on each side (reduced for wider hitboxes)
            const boxWidth = (fretEndX - fretStartX) - (2 * margin);
            targetX = fretStartX + margin + boxWidth / 2; // Center in the space between
        } else {
            // All other frets: between previous fret and current fret
            const fretStartX = fretPositions[fretIndex - 1].x;
            const fretEndX = fretPositions[fretIndex].x;
            const margin = (fretEndX - fretStartX) * 0.05; // 5% margin on each side (reduced for wider hitboxes)
            const boxWidth = (fretEndX - fretStartX) - (2 * margin);
            targetX = fretStartX + margin + boxWidth / 2; // Center in the space between
        }

        const stringPositions = [];

        for (let stringIndex = 0; stringIndex < Math.min(6, stringsWithPositions.length); stringIndex++) {
            const stringData = stringsWithPositions[stringIndex];
            const pos = getStringPositionAtX(stringData.mesh, targetX);

            if (pos) {
                stringPositions.push({
                    y: pos.y,
                    z: pos.z
                });
            }
        }

        stringPositionsByFret.push(stringPositions);
    }

    return stringPositionsByFret;
}

function analyzeGuitarModel() {
    if (!guitarModel) return null;

    // First, find the neck region
    const neckRegion = findNeckRegion();
    if (!neckRegion) return null;

    // Find fret positions from geometry only (no calculation fallback)
    let fretPositions = extractFretPositionsFromGeometry(neckRegion);

    if (!fretPositions || fretPositions.length === 0) {
        console.error('Could not extract fret positions from geometry. Make sure the mesh "circulo.009_circulo.060" exists in the model.');
        return null;
    }

    // We'll calculate string positions later using raycasting at each fret
    // For now, return a placeholder that will be populated during hitbox creation
    return {
        fretPositions: fretPositions,
        neckBox: neckRegion.overallBox,
        neckCenter: new THREE.Vector3(neckRegion.startX + neckRegion.length / 2, neckRegion.y, neckRegion.centerZ),
        neckSize: new THREE.Vector3(neckRegion.length, 0.1, neckRegion.width),
        neckAxis: 'x',
        stringAxis: 'z',
        neckRegion: neckRegion // Include full neck region
    };
}

function createFretZones() {
    // Clear existing zones
    fretZones.forEach(zone => scene.remove(zone));
    fretZones = [];
    
    // Different colors for each fret row to visualize overlaps
    // All strings on the same fret get the same color
    const fretColors = [
        0xff0000, // Red - Fret 1
        0x00ff00, // Green - Fret 2
        0x0000ff, // Blue - Fret 3
        0xffff00, // Yellow - Fret 4
        0xff00ff, // Magenta - Fret 5
        0x00ffff, // Cyan - Fret 6
        0xff8800, // Orange - Fret 7
        0x8800ff, // Purple - Fret 8
        0x00ff88, // Teal - Fret 9
        0xff0088, // Pink - Fret 10
        0x88ff00, // Lime - Fret 11
        0x0088ff, // Light Blue - Fret 12
        0xff4444, // Light Red - Fret 13
        0x44ff44, // Light Green - Fret 14
        0x4444ff, // Light Blue - Fret 15
        0xffff44, // Light Yellow - Fret 16
        0xff44ff, // Light Magenta - Fret 17
        0x44ffff, // Light Cyan - Fret 18
        0xffaa00, // Amber - Fret 19
        0xaa00ff, // Violet - Fret 20
        0x00aaff, // Sky Blue - Fret 21
        0xaaff00, // Chartreuse - Fret 22
        0xff00aa, // Rose - Fret 23
        0x00ffaa  // Spring Green - Fret 24
    ];

    // Analyze the model to get fret positions
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
                // Depth: wider for easier clicking (Z-direction, across strings)
                const boxDepth = Math.min(stringSpacing * 0.6, 0.04); // Max 60% of string spacing or 0.04 (wider for easier clicking)

                const geometry = new THREE.BoxGeometry(boxWidth, boxHeight, boxDepth);
                const material = new THREE.MeshBasicMaterial({
                    color: fretColors[fretIndex] || 0xff0000,
                    transparent: true,
                    opacity: 0.6 // Higher opacity to better see overlaps between frets
                });

                const zone = new THREE.Mesh(geometry, material);
                zone.position.x = centerX;
                zone.position.y = neckStartY + (fretIndex * slope);
                // Position exactly on the string
                zone.position.z = (stringIndex - 2.5) * stringSpacing;
                zone.visible = state.showDebug; // Hide by default, show only when debug is enabled

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
    const { fretPositions, neckRegion } = analysis;

    console.log(`Creating hitboxes for ${STRING_TUNING.length} strings and ${fretPositions.length} frets`);

    // Extract string objects from the model
    const stringObjects = extractStringObjects();

    if (!stringObjects || stringObjects.length < 6) {
        console.warn(`Expected 6 string objects but found ${stringObjects?.length || 0}, using fallback`);
        // Fall back to estimation if we don't have string geometry
        useFallbackHitboxes(fretPositions, neckRegion);
        return;
    }

    // Analyze string geometry to get positions at all frets
    const stringPositionsByFret = analyzeStringGeometry(stringObjects, fretPositions, neckRegion);

    if (!stringPositionsByFret || stringPositionsByFret.length === 0) {
        console.warn('Could not extract string positions from geometry, using fallback');
        useFallbackHitboxes(fretPositions, neckRegion);
        return;
    }

    console.log(`Extracted string positions for ${stringPositionsByFret.length} frets`);

    // Get all meshes for raycasting to find exact fretboard surface
    const meshes = [];
    guitarModel.traverse((child) => {
        if (child.isMesh && child.geometry) {
            meshes.push(child);
        }
    });
    const raycaster = new THREE.Raycaster();

    // Create hitboxes using the extracted geometry
    // We need to calculate the EXACT SAME X position that was used in analyzeStringGeometry
    // fretIndex 0 = between nut and fret 1  
    // fretIndex 1 = between fret 1 and fret 2
    // etc.
    // Create hitboxes for all detected frets (up to 22 frets = 22 hitbox positions)
    for (let fretIndex = 0; fretIndex < stringPositionsByFret.length && fretIndex < NUM_FRETS - 1; fretIndex++) {
        const nutX = neckRegion.nutX || neckRegion.startX;

        // Calculate the EXACT SAME X position that was used in analyzeStringGeometry
        // Hitboxes should be BETWEEN frets, not over them
        let targetX, fretStartX, fretEndX, boxWidth;

        if (fretIndex === 0) {
            // First fret: between nut and fret 1
            fretStartX = nutX;
            fretEndX = fretPositions[0].x;
            
            // Validate: fretEndX should be greater than fretStartX
            if (fretEndX <= fretStartX) {
                console.warn(`Fret ${fretIndex + 1}: Invalid fret positions (start=${fretStartX.toFixed(3)}, end=${fretEndX.toFixed(3)}), skipping`);
                continue;
            }
            
            // Make box slightly smaller to avoid overlapping with nut and fret
            const margin = (fretEndX - fretStartX) * 0.05; // 5% margin on each side (reduced for wider hitboxes)
            boxWidth = (fretEndX - fretStartX) - (2 * margin);
            targetX = fretStartX + margin + boxWidth / 2; // Center in the space between
        } else {
            // All other frets: between previous fret and current fret
            if (fretIndex - 1 >= fretPositions.length || fretIndex >= fretPositions.length) {
                console.warn(`Fret ${fretIndex + 1}: Missing fret positions, skipping`);
                continue;
            }
            
            fretStartX = fretPositions[fretIndex - 1].x;
            fretEndX = fretPositions[fretIndex].x;
            
            // Validate: fretEndX should be greater than fretStartX
            if (fretEndX <= fretStartX) {
                console.warn(`Fret ${fretIndex + 1}: Invalid fret positions (start=${fretStartX.toFixed(3)}, end=${fretEndX.toFixed(3)}), skipping`);
                continue;
            }
            
            // Make box slightly smaller to avoid overlapping with frets
            const margin = (fretEndX - fretStartX) * 0.05; // 5% margin on each side (reduced for wider hitboxes)
            boxWidth = (fretEndX - fretStartX) - (2 * margin);
            targetX = fretStartX + margin + boxWidth / 2; // Center in the space between
        }

        // Debug: log the first few frets to see positioning
        if (fretIndex < 3 || fretIndex >= stringPositionsByFret.length - 1) {
            console.log(`Fret ${fretIndex + 1}: fretStart=${fretStartX.toFixed(3)}, fretEnd=${fretEndX.toFixed(3)}, hitbox targetX=${targetX.toFixed(3)}, width=${boxWidth.toFixed(3)}`);
        }

        // Get string positions at this fret from the extracted geometry
        const stringPositions = stringPositionsByFret[fretIndex];

        if (!stringPositions || stringPositions.length < STRING_TUNING.length) {
            console.warn(`Fret ${fretIndex + 1}: expected 6 strings but got ${stringPositions?.length || 0}`);
            continue;
        }

        // Create hitboxes for each string at this fret
        for (let stringIndex = 0; stringIndex < STRING_TUNING.length; stringIndex++) {
            const stringPos = stringPositions[stringIndex];

            if (!stringPos) {
                console.warn(`Fret ${fretIndex + 1}, String ${stringIndex + 1}: no position data`);
                continue;
            }

            // Use the EXACT target X position (center between frets)
            const posX = targetX;
            const posY = stringPos.y + 0.01; // Slightly above string
            const posZ = stringPos.z;

            // Debug first few hitboxes
            if (fretIndex < 2 && stringIndex < 2) {
                console.log(`Hitbox Fret ${fretIndex + 1}, String ${stringIndex + 1}: posX=${posX.toFixed(3)}, posY=${posY.toFixed(3)}, posZ=${posZ.toFixed(3)}`);
            }
            // Calculate box depth (Z-direction, across strings) - make wider for easier clicking
            let boxDepth = 0.035; // Increased default depth
            if (stringIndex < STRING_TUNING.length - 1 && stringPositions[stringIndex + 1]) {
                const nextStringZ = stringPositions[stringIndex + 1].z;
                boxDepth = Math.min(Math.abs(nextStringZ - posZ) * 0.6, 0.04); // Increased multiplier and max
            } else if (stringIndex > 0 && stringPositions[stringIndex - 1]) {
                const prevStringZ = stringPositions[stringIndex - 1].z;
                boxDepth = Math.min(Math.abs(posZ - prevStringZ) * 0.6, 0.04); // Increased multiplier and max
            }
            boxDepth = Math.max(0.02, boxDepth); // Increased minimum

            const boxHeight = 0.04;

            const geometry = new THREE.BoxGeometry(boxWidth, boxHeight, boxDepth);
            const material = new THREE.MeshBasicMaterial({
                color: fretColors[fretIndex] || 0xff0000,
                transparent: true,
                opacity: 0.6, // Higher opacity to better see overlaps between frets
                side: THREE.DoubleSide
            });

            const zone = new THREE.Mesh(geometry, material);
            zone.position.set(posX, posY, posZ);
            zone.visible = state.showDebug; // Hide by default, show only when debug is enabled

            zone.userData = {
                stringIndex,
                fretIndex: fretIndex + 1,
                note: getNoteAt(stringIndex, fretIndex + 1)
            };

            scene.add(zone);
            fretZones.push(zone);
        }
    }

    console.log(`Created ${fretZones.length} hitboxes (expected: ${STRING_TUNING.length * fretPositions.length})`);
}

// Fallback function for when string geometry is not available
function useFallbackHitboxes(fretPositions, neckRegion) {
    // Different colors for each fret row to visualize overlaps
    // All strings on the same fret get the same color
    const fretColors = [
        0xff0000, // Red - Fret 1
        0x00ff00, // Green - Fret 2
        0x0000ff, // Blue - Fret 3
        0xffff00, // Yellow - Fret 4
        0xff00ff, // Magenta - Fret 5
        0x00ffff, // Cyan - Fret 6
        0xff8800, // Orange - Fret 7
        0x8800ff, // Purple - Fret 8
        0x00ff88, // Teal - Fret 9
        0xff0088, // Pink - Fret 10
        0x88ff00, // Lime - Fret 11
        0x0088ff, // Light Blue - Fret 12
        0xff4444, // Light Red - Fret 13
        0x44ff44, // Light Green - Fret 14
        0x4444ff, // Light Blue - Fret 15
        0xffff44, // Light Yellow - Fret 16
        0xff44ff, // Light Magenta - Fret 17
        0x44ffff, // Light Cyan - Fret 18
        0xffaa00, // Amber - Fret 19
        0xaa00ff, // Violet - Fret 20
        0x00aaff, // Sky Blue - Fret 21
        0xaaff00, // Chartreuse - Fret 22
        0xff00aa, // Rose - Fret 23
        0x00ffaa  // Spring Green - Fret 24
    ];
    
    const overallBox = new THREE.Box3().setFromObject(guitarModel);
    const zMin = overallBox.min.z;
    const zMax = overallBox.max.z;
    const zCenter = (zMin + zMax) / 2;
    const zRange = zMax - zMin;

    const estimatedNeckWidth = zRange * 0.38;
    const margin = estimatedNeckWidth * 0.10;
    const usableWidth = estimatedNeckWidth - (2 * margin);
    const startZ = zCenter - estimatedNeckWidth / 2 + margin;
    const stringSpacing = usableWidth / (STRING_TUNING.length - 1);
    const avgY = neckRegion.y;

    // Calculate taper
    const nutZMin = startZ;
    const nutZMax = startZ + usableWidth;
    const nutWidth = nutZMax - nutZMin;
    const nutZCenter = (nutZMin + nutZMax) / 2;
    const taperRatio = 0.88;
    const bodyWidth = nutWidth * taperRatio;
    const bodyZMin = nutZCenter - bodyWidth / 2;
    const bodyZMax = nutZCenter + bodyWidth / 2;

    const neckStartX = neckRegion.startX;
    const neckEndX = neckRegion.startX + neckRegion.length;
    const neckLength = neckEndX - neckStartX;
    const nutX = neckRegion.nutX || neckRegion.startX;

    for (let fretIndex = 0; fretIndex < fretPositions.length && fretIndex < NUM_FRETS - 1; fretIndex++) {
        let posX, fretStartX, fretEndX, boxWidth;

        if (fretIndex < fretPositions.length - 1) {
            fretStartX = fretPositions[fretIndex].x;
            fretEndX = fretPositions[fretIndex + 1].x;
            // Make box slightly smaller to avoid overlapping with frets
            const margin = (fretEndX - fretStartX) * 0.05; // 5% margin on each side (reduced for wider hitboxes)
            boxWidth = (fretEndX - fretStartX) - (2 * margin);
            posX = fretStartX + margin + boxWidth / 2; // Center in the space between
        } else if (fretIndex > 0) {
            fretStartX = fretPositions[fretIndex - 1].x;
            fretEndX = fretPositions[fretIndex].x;
            // Make box slightly smaller to avoid overlapping with frets
            const margin = (fretEndX - fretStartX) * 0.05; // 5% margin on each side (reduced for wider hitboxes)
            boxWidth = (fretEndX - fretStartX) - (2 * margin);
            posX = fretStartX + margin + boxWidth / 2; // Center in the space between
        } else {
            fretStartX = nutX;
            fretEndX = fretPositions[0].x;
            // Make box slightly smaller to avoid overlapping with nut and fret
            const margin = (fretEndX - fretStartX) * 0.05; // 5% margin on each side (reduced for wider hitboxes)
            boxWidth = (fretEndX - fretStartX) - (2 * margin);
            posX = fretStartX + margin + boxWidth / 2; // Center in the space between
        }

        // Debug: log the first few frets
        if (fretIndex < 3) {
            console.log(`Fret ${fretIndex + 1}: fretStart=${fretStartX.toFixed(3)}, fretEnd=${fretEndX.toFixed(3)}, hitbox center=${posX.toFixed(3)}, width=${boxWidth.toFixed(3)}`);
        }
        const progress = Math.max(0, Math.min(1, (posX - neckStartX) / neckLength));
        const currentZMin = nutZMin + (bodyZMin - nutZMin) * progress;
        const currentZMax = nutZMax + (bodyZMax - nutZMax) * progress;
        const currentWidth = currentZMax - currentZMin;
        const currentStringSpacing = currentWidth / (STRING_TUNING.length - 1);

        for (let stringIndex = 0; stringIndex < STRING_TUNING.length; stringIndex++) {
            const stringZ = currentZMin + (stringIndex * currentStringSpacing);
            const posY = avgY + 0.01;
            const posZ = stringZ;

            // Calculate box depth (Z-direction, across strings) - make wider for easier clicking
            let boxDepth = 0.025; // Increased default depth
            if (stringIndex < STRING_TUNING.length - 1) {
                const nextStringZ = currentZMin + ((stringIndex + 1) * currentStringSpacing);
                boxDepth = Math.min(Math.abs(nextStringZ - stringZ) * 0.6, 0.04); // Increased multiplier and max
            } else if (stringIndex > 0) {
                const prevStringZ = currentZMin + ((stringIndex - 1) * currentStringSpacing);
                boxDepth = Math.min(Math.abs(stringZ - prevStringZ) * 0.6, 0.04); // Increased multiplier and max
            }
            boxDepth = Math.max(0.02, boxDepth); // Increased minimum

            const boxHeight = 0.04;

            const geometry = new THREE.BoxGeometry(boxWidth, boxHeight, boxDepth);
            const material = new THREE.MeshBasicMaterial({
                color: fretColors[fretIndex] || 0xff0000,
                transparent: true,
                opacity: 0.6, // Higher opacity to better see overlaps between frets
                side: THREE.DoubleSide
            });

            const zone = new THREE.Mesh(geometry, material);
            zone.position.set(posX, posY, posZ);
            zone.visible = state.showDebug; // Hide by default, show only when debug is enabled

            zone.userData = {
                stringIndex,
                fretIndex: fretIndex + 1,
                note: getNoteAt(stringIndex, fretIndex + 1)
            };

            scene.add(zone);
            fretZones.push(zone);
        }
    }

    console.log(`Created ${fretZones.length} fallback hitboxes`);
}

/**
 * Toggle debug mode (show/hide hitboxes and tooltip)
 */
function toggleDebugMode(enabled) {
    state.showDebug = enabled;
    
    // Show/hide hitboxes
    if (fretZones && fretZones.length > 0) {
        fretZones.forEach(zone => {
            zone.visible = enabled;
        });
    }
    
    // Show/hide tooltip
    const tooltip = document.getElementById('debug-tooltip');
    if (tooltip) {
        if (!enabled) {
            tooltip.style.display = 'none';
        }
    }
}

/**
 * Setup debug tooltip to show object names on mouse hover
 */
function setupDebugTooltip() {
    // Create tooltip element if it doesn't exist
    let tooltip = document.getElementById('debug-tooltip');
    if (!tooltip) {
        tooltip = document.createElement('div');
        tooltip.id = 'debug-tooltip';
        tooltip.style.cssText = `
            position: fixed;
            pointer-events: none;
            background: rgba(0, 0, 0, 0.9);
            color: white;
            padding: 8px 12px;
            border-radius: 4px;
            font-family: monospace;
            font-size: 11px;
            z-index: 10000;
            display: none;
            max-width: 400px;
            word-wrap: break-word;
            white-space: pre-line;
            line-height: 1.4;
            border: 1px solid rgba(255, 255, 255, 0.2);
        `;
        document.body.appendChild(tooltip);
    }

    // Add mousemove listener to renderer canvas
    // Don't clone/replace canvas as it breaks the 3D rendering
    const canvas = renderer.domElement;
    
    // Add mousemove listener (will be added multiple times if called multiple times, but that's okay)
    canvas.addEventListener('mousemove', (event) => {
        if (state.showDebug) {
            onMouseMove(event, tooltip);
        } else {
            tooltip.style.display = 'none';
        }
    });

    // Hide tooltip when mouse leaves canvas
    canvas.addEventListener('mouseleave', () => {
        tooltip.style.display = 'none';
    });
}

/**
 * Handle mouse move for debug tooltip
 */
function onMouseMove(event, tooltip) {
    if (!renderer || !camera || !scene || !state.showDebug) return;

    // Calculate mouse position in normalized device coordinates
    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    // Update raycaster
    raycaster.setFromCamera(mouse, camera);

    // Get all objects in the scene (including guitar model and hitboxes)
    const allObjects = [];
    scene.traverse((child) => {
        if (child.isMesh) {
            allObjects.push(child);
        }
    });

    // Check for intersections
    const intersects = raycaster.intersectObjects(allObjects, true);

    if (intersects.length > 0) {
        const intersectedObject = intersects[0].object;
        
        // Update world matrix to get accurate position
        intersectedObject.updateMatrixWorld(true);
        
        // Get object name
        let objectName = intersectedObject.name || 'Unnamed';
        
        // Get position
        const position = new THREE.Vector3();
        intersectedObject.getWorldPosition(position);
        
        // Get bounding box for dimensions
        const box = new THREE.Box3().setFromObject(intersectedObject);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        
        // Build tooltip content
        let tooltipContent = objectName;
        
        // If it's a hitbox, show additional info
        if (intersectedObject.userData && intersectedObject.userData.stringIndex !== undefined) {
            const { stringIndex, fretIndex, note } = intersectedObject.userData;
            tooltipContent = `Hitbox: String ${stringIndex + 1}, Fret ${fretIndex}, Note: ${note}\n`;
        }
        
        // Add position and dimensions
        tooltipContent += `\nPosition: X=${position.x.toFixed(3)}, Y=${position.y.toFixed(3)}, Z=${position.z.toFixed(3)}`;
        tooltipContent += `\nCenter: X=${center.x.toFixed(3)}, Y=${center.y.toFixed(3)}, Z=${center.z.toFixed(3)}`;
        tooltipContent += `\nSize: W=${size.x.toFixed(3)}, H=${size.y.toFixed(3)}, D=${size.z.toFixed(3)}`;
        tooltipContent += `\nBounds: Min(${box.min.x.toFixed(3)}, ${box.min.y.toFixed(3)}, ${box.min.z.toFixed(3)})`;
        tooltipContent += `\nMax(${box.max.x.toFixed(3)}, ${box.max.y.toFixed(3)}, ${box.max.z.toFixed(3)})`;
        
        // Show tooltip
        tooltip.textContent = tooltipContent;
        tooltip.style.display = 'block';
        tooltip.style.left = (event.clientX + 10) + 'px';
        tooltip.style.top = (event.clientY + 10) + 'px';
    } else {
        // Hide tooltip if no intersection
        tooltip.style.display = 'none';
    }
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
            ${state.viewMode === '3d' ? `
                <div class="debug-toggle-container">
                    <label class="debug-toggle-label">
                        <input type="checkbox" id="debugToggle" ${state.showDebug ? 'checked' : ''}>
                        <span>Debug Info</span>
                    </label>
                </div>
            ` : ''}
            <div class="fretboard-container" id="threeContainer"></div>
        </div>
    `;

    document.getElementById('exitBtn').addEventListener('click', () => {
        state.currentScreen = 'menu';
        cleanupThreeJS();
        renderMenu();
    });

    // Setup debug toggle (only for 3D view)
    if (state.viewMode === '3d') {
        const debugToggle = document.getElementById('debugToggle');
        if (debugToggle) {
            debugToggle.addEventListener('change', (e) => {
                toggleDebugMode(e.target.checked);
            });
        }
    }

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
            ${state.viewMode === '3d' ? `
                <div class="debug-toggle-container">
                    <label class="debug-toggle-label">
                        <input type="checkbox" id="debugToggle" ${state.showDebug ? 'checked' : ''}>
                        <span>Debug Info</span>
                    </label>
                </div>
            ` : ''}
            <div class="fretboard-container" id="threeContainer"></div>
        </div>
    `;

    document.getElementById('exitBtn').addEventListener('click', () => {
        state.currentScreen = 'menu';
        cleanupThreeJS();
        renderMenu();
    });

    // Setup debug toggle (only for 3D view)
    if (state.viewMode === '3d') {
        const debugToggle = document.getElementById('debugToggle');
        if (debugToggle) {
            debugToggle.addEventListener('change', (e) => {
                toggleDebugMode(e.target.checked);
            });
        }
    }

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
            ${state.viewMode === '3d' ? `
                <div class="debug-toggle-container">
                    <label class="debug-toggle-label">
                        <input type="checkbox" id="debugToggle" ${state.showDebug ? 'checked' : ''}>
                        <span>Debug Info</span>
                    </label>
                </div>
            ` : ''}
            <div class="fretboard-container" id="threeContainer"></div>
        </div>
    `;

    document.getElementById('exitBtn').addEventListener('click', () => {
        state.currentScreen = 'menu';
        cleanupThreeJS();
        renderMenu();
    });

    // Setup debug toggle (only for 3D view)
    if (state.viewMode === '3d') {
        const debugToggle = document.getElementById('debugToggle');
        if (debugToggle) {
            debugToggle.addEventListener('change', (e) => {
                toggleDebugMode(e.target.checked);
            });
        }
    }

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
