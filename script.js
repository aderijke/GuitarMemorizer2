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
let fretMarkers = []; // Array of fret marker dots (3D spheres)
let raycaster, mouse;
let gameTimer = null; // Timer for time limit countdown

/* ========================================
   STATE MANAGEMENT
   ======================================== */
const state = {
    currentScreen: 'menu',
    targetNote: '',
    score: 0,
    errors: 0,
    foundPositions: [],
    allPositions: [],
    // View mode: '3d' or '2d'
    viewMode: '3d',
    // Model quality: 'low' or 'high' poly
    modelQuality: 'low',
    // Debug mode: show/hide hitboxes and tooltip
    showDebug: false,
    // Rotation enabled: allow rotating the 3D guitar view
    rotationEnabled: false,
    // Triads mode
    targetTriad: null,
    clickedTriadNotes: [],
    clickedTriadPositions: [],
    // Root note position to highlight (if showTriadRootNote is enabled)
    triadRootNotePosition: null,
    // Triads settings
    triadSettings: {
        major: true,
        minor: true,
        diminished: false,
        augmented: false
    },
    // Show triad root note: if true, show a random position of the root note on the fretboard
    showTriadRootNote: false,
    // 3D rotation
    rotation: {
        x: 35,
        y: 0
    },
    // Time limit in seconds (0 = no limit)
    timeLimit: 0,
    timeRemaining: 0,
    // Enable time limit mode: if true, allow setting time limit with slider
    enableTimeLimit: false,
    // Disabled frets: array of fret numbers that are disabled (e.g., [1, 2, 3, 4, 5, 6])
    disabledFrets: [],
    // Enable disabled frets mode: if true, allow disabling frets with from/to sliders
    enableDisabledFrets: false,
    // Timer started: track if timer has been started (starts on first click)
    timerStarted: false,
    // First question: track if this is the first question (timer waits for click)
    isFirstQuestion: true,
    // Show solution: track if solution is currently being shown
    showSolution: false
};

/* ========================================
   COOKIE UTILITIES
   ======================================== */
function setCookie(name, value, days = 365) {
    const date = new Date();
    date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
    const expires = `expires=${date.toUTCString()}`;
    document.cookie = `${name}=${encodeURIComponent(JSON.stringify(value))};${expires};path=/`;
}

function getCookie(name) {
    const nameEQ = `${name}=`;
    const ca = document.cookie.split(';');
    for (let i = 0; i < ca.length; i++) {
        let c = ca[i];
        while (c.charAt(0) === ' ') c = c.substring(1, c.length);
        if (c.indexOf(nameEQ) === 0) {
            try {
                return JSON.parse(decodeURIComponent(c.substring(nameEQ.length)));
            } catch (e) {
                return null;
            }
        }
    }
    return null;
}

function saveSettingsToCookies() {
    // Save menu settings
    setCookie('viewMode', state.viewMode);
    setCookie('modelQuality', state.modelQuality);
    setCookie('enableTimeLimit', state.enableTimeLimit);
    setCookie('timeLimit', state.timeLimit);
    setCookie('enableDisabledFrets', state.enableDisabledFrets);
    setCookie('disabledFrets', state.disabledFrets);
    
    // Save triads settings
    setCookie('triadSettings', state.triadSettings);
    setCookie('showTriadRootNote', state.showTriadRootNote);
    
    // Save game screen settings
    setCookie('showDebug', state.showDebug);
    setCookie('rotationEnabled', state.rotationEnabled);
    
    // Save 2D rotation
    setCookie('rotation', state.rotation);
    
    // Save camera position and target if they exist
    if (camera && controls) {
        setCookie('cameraPosition', {
            x: camera.position.x,
            y: camera.position.y,
            z: camera.position.z
        });
        setCookie('cameraTarget', {
            x: controls.target.x,
            y: controls.target.y,
            z: controls.target.z
        });
    }
}

function loadSettingsFromCookies() {
    // Load menu settings
    const viewMode = getCookie('viewMode');
    if (viewMode !== null) state.viewMode = viewMode;
    
    const modelQuality = getCookie('modelQuality');
    if (modelQuality !== null) state.modelQuality = modelQuality;
    
    const enableTimeLimit = getCookie('enableTimeLimit');
    if (enableTimeLimit !== null) state.enableTimeLimit = enableTimeLimit;
    
    const timeLimit = getCookie('timeLimit');
    if (timeLimit !== null) state.timeLimit = timeLimit;
    
    const enableDisabledFrets = getCookie('enableDisabledFrets');
    if (enableDisabledFrets !== null) state.enableDisabledFrets = enableDisabledFrets;
    
    const disabledFrets = getCookie('disabledFrets');
    if (disabledFrets !== null && Array.isArray(disabledFrets)) state.disabledFrets = disabledFrets;
    
    // Load triads settings
    const triadSettings = getCookie('triadSettings');
    if (triadSettings !== null) {
        Object.assign(state.triadSettings, triadSettings);
    }
    
    const showTriadRootNote = getCookie('showTriadRootNote');
    if (showTriadRootNote !== null) state.showTriadRootNote = showTriadRootNote;
    
    // Load game screen settings
    const showDebug = getCookie('showDebug');
    if (showDebug !== null) state.showDebug = showDebug;
    
    const rotationEnabled = getCookie('rotationEnabled');
    if (rotationEnabled !== null) state.rotationEnabled = rotationEnabled;
    
    // Load 2D rotation
    const rotation = getCookie('rotation');
    if (rotation !== null) {
        state.rotation.x = rotation.x !== undefined ? rotation.x : 35;
        state.rotation.y = rotation.y !== undefined ? rotation.y : 0;
    }
}

function loadCameraFromCookies() {
    if (!camera || !controls) return;
    
    const cameraPosition = getCookie('cameraPosition');
    const cameraTarget = getCookie('cameraTarget');
    
    if (cameraPosition) {
        camera.position.set(cameraPosition.x, cameraPosition.y, cameraPosition.z);
    }
    
    if (cameraTarget) {
        controls.target.set(cameraTarget.x, cameraTarget.y, cameraTarget.z);
        camera.lookAt(controls.target);
    }
    
    if (cameraPosition || cameraTarget) {
        controls.update();
    }
}

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
            // Skip disabled frets
            if (isFretDisabled(fretIndex)) {
                continue;
            }
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

function isFretDisabled(fretIndex) {
    return state.disabledFrets.includes(fretIndex);
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

function selectRandomRootNotePosition(rootNote) {
    if (!state.showTriadRootNote || !rootNote) {
        return null;
    }
    
    const rootPositions = getAllPositions(rootNote);
    if (rootPositions.length > 0) {
        // Pick a random position
        return rootPositions[Math.floor(Math.random() * rootPositions.length)];
    }
    return null;
}

function highlightRootNotePosition() {
    // Clear previous root note highlight
    if (fretZones && fretZones.length > 0) {
        fretZones.forEach(zone => {
            if (zone.userData.isRootNote) {
                zone.userData.isRootNote = false;
                zone.material.color.setHex(zone.userData.originalColor);
                // Only reset opacity if not showing feedback or hovered
                if (!zone.userData.isFeedback && !zone.userData.isHovered) {
                    zone.material.opacity = zone.userData.originalOpacity;
                }
            }
        });
    }
    
    // Highlight root note position if enabled
    if (state.showTriadRootNote && state.triadRootNotePosition && fretZones && fretZones.length > 0) {
        const rootZone = fretZones.find(z =>
            z.userData.stringIndex === state.triadRootNotePosition.string &&
            z.userData.fretIndex === state.triadRootNotePosition.fret
        );
        
        if (rootZone) {
            rootZone.userData.isRootNote = true;
            rootZone.material.color.setHex(0x00aaff); // Light blue for root note
            rootZone.material.opacity = 0.6;
            rootZone.visible = true;
            // Store that this is a root note so it stays visible
            rootZone.userData.originalOpacity = 0.6; // Update original opacity so it stays visible
        }
    }
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
            <div class="menu-content">
                <div class="menu-modes">
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
                <div class="menu-settings">
                    <h2 class="settings-title">Settings</h2>
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
                    <div class="view-toggle-container">
                        <label class="view-toggle-label">
                            <span class="view-toggle-text">3D Model Quality:</span>
                            <div class="view-toggle-switch">
                                <input type="checkbox" id="modelQualityToggle" ${state.modelQuality === 'high' ? 'checked' : ''}>
                                <span class="toggle-slider">
                                    <span class="toggle-label-left">Low</span>
                                    <span class="toggle-label-right">High</span>
                                </span>
                            </div>
                        </label>
                    </div>
                    <div class="time-limit-container">
                        <label class="time-limit-label">
                            <div class="view-toggle-container" style="width: 100%; justify-content: flex-start;">
                                <label class="view-toggle-label">
                                    <span class="view-toggle-text">Time Limit:</span>
                                    <div class="view-toggle-switch">
                                        <input type="checkbox" id="enableTimeLimitToggle" ${state.enableTimeLimit ? 'checked' : ''}>
                                        <span class="toggle-slider">
                                            <span class="toggle-label-left">Off</span>
                                            <span class="toggle-label-right">On</span>
                                        </span>
                                    </div>
                                </label>
                            </div>
                            <div class="time-limit-control" id="timeLimitControl" style="display: ${state.enableTimeLimit ? 'flex' : 'none'};">
                                <input type="range" id="timeLimitSlider" min="1" max="10" value="${state.timeLimit > 0 ? state.timeLimit : 1}" step="1">
                                <span class="time-limit-value" id="timeLimitValue">${state.timeLimit > 0 ? `${state.timeLimit}s` : '1s'}</span>
                            </div>
                        </label>
                    </div>
                    <div class="disabled-frets-container">
                        <label class="disabled-frets-label">
                            <div class="view-toggle-container" style="width: 100%; justify-content: flex-start;">
                                <label class="view-toggle-label">
                                    <span class="view-toggle-text">Disable Frets:</span>
                                    <div class="view-toggle-switch">
                                        <input type="checkbox" id="enableDisabledFretsToggle" ${state.enableDisabledFrets ? 'checked' : ''}>
                                        <span class="toggle-slider">
                                            <span class="toggle-label-left">Off</span>
                                            <span class="toggle-label-right">On</span>
                                        </span>
                                    </div>
                                </label>
                            </div>
                            <div class="disabled-frets-controls" id="disabledFretsControls" style="display: ${state.enableDisabledFrets ? 'flex' : 'none'};">
                                <div class="disabled-frets-range">
                                    <label class="range-label">
                                        <span>From:</span>
                                        <input type="range" id="disabledFretStart" min="1" max="${NUM_FRETS - 1}" value="${state.disabledFrets.length > 0 ? Math.min(...state.disabledFrets) : 1}" step="1">
                                        <span class="range-value" id="disabledFretStartValue">${state.disabledFrets.length > 0 ? Math.min(...state.disabledFrets) : 1}</span>
                                    </label>
                                    <label class="range-label">
                                        <span>To:</span>
                                        <input type="range" id="disabledFretEnd" min="1" max="${NUM_FRETS - 1}" value="${state.disabledFrets.length > 0 ? Math.max(...state.disabledFrets) : 1}" step="1">
                                        <span class="range-value" id="disabledFretEndValue">${state.disabledFrets.length > 0 ? Math.max(...state.disabledFrets) : 1}</span>
                                    </label>
                                </div>
                            </div>
                        </label>
                    </div>
                </div>
            </div>
        </div>
    `;

    // Setup view mode toggle
    const viewToggle = document.getElementById('viewModeToggle');
    viewToggle.addEventListener('change', (e) => {
        state.viewMode = e.target.checked ? '3d' : '2d';
        saveSettingsToCookies();
    });

    // Setup model quality toggle
    const modelQualityToggle = document.getElementById('modelQualityToggle');
    modelQualityToggle.addEventListener('change', (e) => {
        state.modelQuality = e.target.checked ? 'high' : 'low';
        saveSettingsToCookies();
    });

    // Setup time limit toggle
    const enableTimeLimitToggle = document.getElementById('enableTimeLimitToggle');
    if (enableTimeLimitToggle) {
        enableTimeLimitToggle.addEventListener('change', (e) => {
            state.enableTimeLimit = e.target.checked;
            
            const timeLimitControl = document.getElementById('timeLimitControl');
            if (timeLimitControl) {
                timeLimitControl.style.display = state.enableTimeLimit ? 'flex' : 'none';
            }
            
            if (!state.enableTimeLimit) {
                // If toggle is off, disable time limit
                state.timeLimit = 0;
            } else {
                // If toggle is on, set default time limit if it's 0
                if (state.timeLimit === 0) {
                    state.timeLimit = 1;
                    const timeLimitSlider = document.getElementById('timeLimitSlider');
                    const timeLimitValue = document.getElementById('timeLimitValue');
                    if (timeLimitSlider) timeLimitSlider.value = 1;
                    if (timeLimitValue) timeLimitValue.textContent = '1s';
                }
            }
            saveSettingsToCookies();
        });
    }

    // Setup time limit slider
    const timeLimitSlider = document.getElementById('timeLimitSlider');
    const timeLimitValue = document.getElementById('timeLimitValue');
    if (timeLimitSlider && timeLimitValue) {
        timeLimitSlider.addEventListener('input', (e) => {
            if (!state.enableTimeLimit) return;
            
            const value = parseInt(e.target.value);
            state.timeLimit = value;
            timeLimitValue.textContent = `${value}s`;
            saveSettingsToCookies();
        });
    }

    // Setup disabled frets toggle
    const enableDisabledFretsToggle = document.getElementById('enableDisabledFretsToggle');
    if (enableDisabledFretsToggle) {
        enableDisabledFretsToggle.addEventListener('change', (e) => {
            state.enableDisabledFrets = e.target.checked;
            
            const disabledFretsControls = document.getElementById('disabledFretsControls');
            if (disabledFretsControls) {
                disabledFretsControls.style.display = state.enableDisabledFrets ? 'flex' : 'none';
            }
            
            if (!state.enableDisabledFrets) {
                // If toggle is off, enable all frets (clear disabled frets)
                state.disabledFrets = [];
            }
            saveSettingsToCookies();
        });
    }

    // Setup disabled frets controls
    const disabledFretStart = document.getElementById('disabledFretStart');
    const disabledFretStartValue = document.getElementById('disabledFretStartValue');
    const disabledFretEnd = document.getElementById('disabledFretEnd');
    const disabledFretEndValue = document.getElementById('disabledFretEndValue');

    function updateDisabledFrets() {
        if (!state.enableDisabledFrets) return;
        
        if (!disabledFretStart || !disabledFretEnd) return;
        
        const start = parseInt(disabledFretStart.value);
        const end = parseInt(disabledFretEnd.value);
        const minFret = Math.min(start, end);
        const maxFret = Math.max(start, end);
        
        state.disabledFrets = [];
        for (let i = minFret; i <= maxFret; i++) {
            state.disabledFrets.push(i);
        }
        
        if (disabledFretStartValue) disabledFretStartValue.textContent = start;
        if (disabledFretEndValue) disabledFretEndValue.textContent = end;
        saveSettingsToCookies();
    }

    if (disabledFretStart) {
        disabledFretStart.addEventListener('input', updateDisabledFrets);
    }
    if (disabledFretEnd) {
        disabledFretEnd.addEventListener('input', updateDisabledFrets);
    }
    
    // Initialize disabled frets display
    if (state.enableDisabledFrets) {
        updateDisabledFrets();
    }

    document.getElementById('singleNoteMode').addEventListener('click', startSingleNoteGame);
    document.getElementById('findAllMode').addEventListener('click', startFindAllGame);
    document.getElementById('triadsMode').addEventListener('click', startTriadsGame);
}

/* ========================================
   THREE.JS SETUP AND MODEL LOADING
   ======================================== */

// Default camera settings
const DEFAULT_CAMERA_POSITION = new THREE.Vector3(-2.123, 1.330, 1.006);
const DEFAULT_CAMERA_TARGET = new THREE.Vector3(-1.522, -0.597, 0.039);

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
        // Set default camera position
        camera.position.copy(DEFAULT_CAMERA_POSITION);
        // Camera will look at controls.target which is set below
        
        // Debug: Log initial camera parameters
        const initialDistance = camera.position.length();
        
        // Calculate spherical coordinates for reference
        const initialSpherical = new THREE.Spherical();
        initialSpherical.setFromVector3(camera.position);

        // Create renderer
        try {
            renderer = new THREE.WebGLRenderer({ antialias: true });
        } catch (e) {
            // Try without antialias if that was the issue, though unlikely for this specific error
            try {
                renderer = new THREE.WebGLRenderer({ antialias: false });
            } catch (e2) {
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
        // Allow more vertical rotation to see strings when guitar is rotated
        controls.maxPolarAngle = Math.PI * 0.85; // ~153 degrees - allows looking down more
        controls.minPolarAngle = Math.PI * 0.15; // ~27 degrees - prevents looking from below
        controls.target.copy(DEFAULT_CAMERA_TARGET);
        camera.lookAt(controls.target); // Make sure camera looks at target
        // Set rotation based on state (default: false, so rotation disabled)
        controls.enableRotate = state.rotationEnabled;
        controls.update();
        
        // Get current spherical coordinates from controls
        const controlsSpherical = new THREE.Spherical();
        controlsSpherical.setFromVector3(
            camera.position.clone().sub(controls.target)
        );
        
        // Throttle logging to avoid console spam (log max once per second)
        let lastLogTime = 0;
        const logThrottle = 1000; // 1 second
        let movementTimeout = null;
        
        // Adjust camera to keep strings visible when rotating the guitar
        // When viewing from behind (snaren van je af), automatically adjust camera angle
        controls.addEventListener('change', () => {
            // Get current camera position relative to target
            const direction = new THREE.Vector3();
            direction.subVectors(camera.position, controls.target);
            const distance = direction.length();
            
            // Get spherical coordinates
            const spherical = new THREE.Spherical();
            spherical.setFromVector3(direction);
            
            // Normalize azimuth to 0-2PI (0 = front, PI = back)
            let azimuth = spherical.theta;
            if (azimuth < 0) azimuth += Math.PI * 2;
            
            // Store current camera state for easy access
            window._lastCameraState = {
                position: { x: camera.position.x, y: camera.position.y, z: camera.position.z },
                target: { x: controls.target.x, y: controls.target.y, z: controls.target.z },
                distance: distance,
                spherical: { radius: spherical.radius, theta: spherical.theta, phi: spherical.phi },
                azimuth: azimuth,
                azimuthDegrees: azimuth * 180 / Math.PI,
                polar: spherical.phi,
                polarDegrees: spherical.phi * 180 / Math.PI
            };
            
            // Clear existing timeout
            if (movementTimeout) {
                clearTimeout(movementTimeout);
            }
            
            // Log camera state 500ms after user stops moving
            movementTimeout = setTimeout(() => {
                // Camera movement stopped - save to cookies
                saveSettingsToCookies();
            }, 500);
            
            // Check if we're looking from behind (azimuth between 90 and 270 degrees)
            // This is when the strings are facing away from the camera
            const isLookingFromBehind = azimuth > Math.PI / 2 && azimuth < (3 * Math.PI) / 2;
            
            // Current polar angle (0 = top, PI/2 = horizontal, PI = bottom)
            let polar = spherical.phi;
            
            // When looking from behind, limit how far down we can look
            // to keep the strings visible instead of seeing the bottom
            if (isLookingFromBehind) {
                // Limit polar angle to ~60 degrees (Math.PI * 0.33) when looking from behind
                // This keeps the camera high enough to see the strings
                const maxPolarWhenBehind = Math.PI * 0.33; // ~60 degrees
                if (polar > maxPolarWhenBehind) {
                    polar = maxPolarWhenBehind;
                    spherical.phi = polar;
                    
                    // Update camera position with adjusted angle
                    const newDirection = new THREE.Vector3();
                    newDirection.setFromSpherical(spherical);
                    newDirection.multiplyScalar(distance);
                    camera.position.copy(controls.target).add(newDirection);
                    camera.lookAt(controls.target);
                }
            }
        });

        // Setup raycaster for click detection
        raycaster = new THREE.Raycaster();
        mouse = new THREE.Vector2();

        // Setup debug tooltip for mouse hover
        setupDebugTooltip();
        
        // Function to reset camera to default position with animation
        window.resetCamera = function() {
            if (!camera || !controls) {
                return;
            }
            
            const startPosition = camera.position.clone();
            const startTarget = controls.target.clone();
            const endPosition = DEFAULT_CAMERA_POSITION.clone();
            const endTarget = DEFAULT_CAMERA_TARGET.clone();
            
            const duration = 1000; // 1 second animation
            const startTime = Date.now();
            
            function animate() {
                const elapsed = Date.now() - startTime;
                const progress = Math.min(elapsed / duration, 1);
                
                // Use easing function for smooth animation (ease-in-out)
                const eased = progress < 0.5
                    ? 2 * progress * progress
                    : 1 - Math.pow(-2 * progress + 2, 2) / 2;
                
                // Interpolate camera position
                camera.position.lerpVectors(startPosition, endPosition, eased);
                
                // Interpolate target
                controls.target.lerpVectors(startTarget, endTarget, eased);
                
                // Update camera to look at target
                camera.lookAt(controls.target);
                controls.update();
                
                if (progress < 1) {
                    requestAnimationFrame(animate);
                } else {
                    // Ensure we end exactly at the target
                    camera.position.copy(endPosition);
                    controls.target.copy(endTarget);
                    camera.lookAt(controls.target);
                    controls.update();
                    // Save camera position after reset
                    saveSettingsToCookies();
                }
            }
            
            animate();
        };
        
        // Expose function to console for getting current camera parameters
        window.getCameraParams = function() {
            if (!camera || !controls) {
                return null;
            }
            
            const direction = new THREE.Vector3();
            direction.subVectors(camera.position, controls.target);
            const distance = direction.length();
            
            const spherical = new THREE.Spherical();
            spherical.setFromVector3(direction);
            
            let azimuth = spherical.theta;
            if (azimuth < 0) azimuth += Math.PI * 2;
            
            const params = {
                cameraPosition: {
                    x: camera.position.x,
                    y: camera.position.y,
                    z: camera.position.z
                },
                target: {
                    x: controls.target.x,
                    y: controls.target.y,
                    z: controls.target.z
                },
                distance: distance,
                spherical: {
                    radius: spherical.radius,
                    theta: spherical.theta,
                    phi: spherical.phi
                },
                angles: {
                    azimuth: azimuth,
                    azimuthDegrees: azimuth * 180 / Math.PI,
                    polar: spherical.phi,
                    polarDegrees: spherical.phi * 180 / Math.PI
                }
            };
            
            return params;
        };
        

        // Handle window resize
        window.addEventListener('resize', onWindowResize);

        // Start animation loop
        animate();

        return true;
    } catch (error) {
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

// Track if we've logged the initial state
let hasLoggedInitialState = false;

function animate() {
    requestAnimationFrame(animate);
    if (controls) controls.update();
    
    // Log camera state once after first frame (when everything is initialized)
    if (!hasLoggedInitialState && controls && camera) {
        hasLoggedInitialState = true;
        setTimeout(() => {
            // Initial camera state logged - logging removed
        }, 100);
    }
    
    if (renderer && scene && camera) {
        renderer.render(scene, camera);
    }
}

function loadGuitarModel() {
    return new Promise((resolve, reject) => {
        const mtlLoader = new MTLLoader();
        mtlLoader.setPath('Gibson 335/');

        // Determine which model to load based on state
        const modelType = state.modelQuality === 'high' ? 'High_Poly' : 'Low_Poly';
        const mtlFile = `Gibson 335_${modelType}.mtl`;
        const objFile = `Gibson 335_${modelType}.obj`;

        mtlLoader.load(mtlFile, (materials) => {
            materials.preload();

            const objLoader = new OBJLoader();
            objLoader.setMaterials(materials);
            objLoader.setPath('Gibson 335/');

            objLoader.load(
                objFile,
                (object) => {
                    guitarModel = object;


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
                    
                    // Load camera position from cookies after model is loaded
                    loadCameraFromCookies();
                    
                    // Highlight root note position if in triads mode and option is enabled
                    if (state.currentScreen === 'triads') {
                        highlightRootNotePosition();
                    }

                    resolve(guitarModel);
                },
                (xhr) => {
                    // Loading progress
                },
                (error) => {
                    reject(error);
                }
            );
        }, undefined, (error) => {
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

    } else {
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
    } else {
        // Estimate: neck typically extends to about 12-14 frets, roughly 60-70% of scale length
        neckLength = scaleLength * 0.65;
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
                // Group nearby candidates using improved grouping function
                // Use larger tolerance (1.5cm) to account for fret thickness
                const groupedFrets = groupFretCandidates(fretCandidates, 0.015);
                
                groupedFrets.sort((a, b) => a.x - b.x);
                const validFrets = groupedFrets.filter(f => f.x > nutX && f.x < neckEndX);
                
                // Return results from color detection
                if (validFrets.length > 0) {
                    return validFrets;
                }
            }
        }
        
        // Color/material detection did not find frets, try geometry analysis
        
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
                }
            }
            
            // Return up to 22 frets (NUM_FRETS - 1 = 22 for 22 frets)
            if (bestFrets.length >= NUM_FRETS - 1) {
                return bestFrets.slice(0, NUM_FRETS - 1);
            } else if (bestFrets.length >= 8) {
                return bestFrets;
            }
        }
        
        // Method 3: Analyze faces/edges to find vertical edges (frets)
        if (fretContainerObject.geometry && fretContainerObject.geometry.index) {
            const geometry2 = fretContainerObject.geometry;
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
            
            if (fretCandidates.length > bestFrets.length) {
                bestFrets = fretCandidates;
            }
        }
        
        // Method 4: Use raycasting to find frets by detecting height changes
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
        
        // Return up to 22 frets (NUM_FRETS - 1 = 22 for 22 frets)
        if (validFrets.length >= NUM_FRETS - 1) {
            return validFrets.slice(0, NUM_FRETS - 1);
        } else if (validFrets.length > 0) {
            return validFrets;
        }
    }

    // If we couldn't find the circulo mesh or extract frets, return null
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

                const isDisabled = isFretDisabled(fretIndex);
                
                const geometry = new THREE.BoxGeometry(boxWidth, boxHeight, boxDepth);
                const material = new THREE.MeshBasicMaterial({
                    color: isDisabled ? 0x666666 : (fretColors[fretIndex] || 0xff0000),
                    transparent: true,
                    opacity: isDisabled ? 0.4 : 0.6 // Higher opacity to better see overlaps between frets
                });

                const zone = new THREE.Mesh(geometry, material);
                zone.position.x = centerX;
                zone.position.y = neckStartY + (fretIndex * slope);
                // Position exactly on the string
                zone.position.z = (stringIndex - 2.5) * stringSpacing;
                zone.visible = isDisabled ? true : state.showDebug; // Disabled frets always visible
                zone.material.opacity = isDisabled ? 0.3 : (state.showDebug ? 0.6 : 0);

                zone.userData = {
                    stringIndex,
                    fretIndex,
                    note: getNoteAt(stringIndex, fretIndex),
                    isDisabled: isDisabled
                };

                scene.add(zone);
                fretZones.push(zone);
            }
        }
        return;
    }

    // Use analyzed positions
    const { fretPositions, neckRegion } = analysis;


    // Extract string objects from the model
    const stringObjects = extractStringObjects();

    if (!stringObjects || stringObjects.length < 6) {
        // Fall back to estimation if we don't have string geometry
        useFallbackHitboxes(fretPositions, neckRegion);
        return;
    }

    // Analyze string geometry to get positions at all frets
    const stringPositionsByFret = analyzeStringGeometry(stringObjects, fretPositions, neckRegion);

    if (!stringPositionsByFret || stringPositionsByFret.length === 0) {
        useFallbackHitboxes(fretPositions, neckRegion);
        return;
    }


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
                continue;
            }
            
            // Make box slightly smaller to avoid overlapping with nut and fret
            const margin = (fretEndX - fretStartX) * 0.05; // 5% margin on each side (reduced for wider hitboxes)
            boxWidth = (fretEndX - fretStartX) - (2 * margin);
            targetX = fretStartX + margin + boxWidth / 2; // Center in the space between
        } else {
            // All other frets: between previous fret and current fret
            if (fretIndex - 1 >= fretPositions.length || fretIndex >= fretPositions.length) {
                continue;
            }
            
            fretStartX = fretPositions[fretIndex - 1].x;
            fretEndX = fretPositions[fretIndex].x;
            
            // Validate: fretEndX should be greater than fretStartX
            if (fretEndX <= fretStartX) {
                continue;
            }
            
            // Make box slightly smaller to avoid overlapping with frets
            const margin = (fretEndX - fretStartX) * 0.05; // 5% margin on each side (reduced for wider hitboxes)
            boxWidth = (fretEndX - fretStartX) - (2 * margin);
            targetX = fretStartX + margin + boxWidth / 2; // Center in the space between
        }


        // Get string positions at this fret from the extracted geometry
        const stringPositions = stringPositionsByFret[fretIndex];

        if (!stringPositions || stringPositions.length < STRING_TUNING.length) {
            continue;
        }

        // Create hitboxes for each string at this fret
        for (let stringIndex = 0; stringIndex < STRING_TUNING.length; stringIndex++) {
            const stringPos = stringPositions[stringIndex];

            if (!stringPos) {
                continue;
            }

            // Use the EXACT target X position (center between frets)
            const posX = targetX;
            const posY = stringPos.y + 0.01; // Slightly above string
            const posZ = stringPos.z;

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

            const actualFretIndex = fretIndex + 1;
            const isDisabled = isFretDisabled(actualFretIndex);

            const geometry = new THREE.BoxGeometry(boxWidth, boxHeight, boxDepth);
            const material = new THREE.MeshBasicMaterial({
                color: isDisabled ? 0x666666 : (fretColors[fretIndex] || 0xff0000),
                transparent: true,
                opacity: isDisabled ? 0.4 : 0.6, // Higher opacity to better see overlaps between frets
                side: THREE.DoubleSide
            });

            const zone = new THREE.Mesh(geometry, material);
            zone.position.set(posX, posY, posZ);
            // Hitboxes are invisible by default, only visible on hover or feedback
            // Disabled frets are always slightly visible
            zone.visible = true;
            zone.material.opacity = isDisabled ? 0.3 : (state.showDebug ? 0.6 : 0); // Disabled frets slightly visible

            zone.userData = {
                stringIndex,
                fretIndex: actualFretIndex,
                note: getNoteAt(stringIndex, actualFretIndex),
                originalColor: isDisabled ? 0x666666 : material.color.getHex(),
                originalOpacity: isDisabled ? 0.3 : (state.showDebug ? 0.6 : 0), // Store original opacity
                isHovered: false,
                isFeedback: false, // Track if showing feedback (correct/wrong)
                isDisabled: isDisabled
            };

            scene.add(zone);
            fretZones.push(zone);
        }
    }

    
    // Setup mouse over effects for hitboxes
    setupHitboxHoverEffects();
    
    // Create fret markers (dots) on the fretboard
    createFretMarkers();
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

            const actualFretIndex = fretIndex + 1;
            const isDisabled = isFretDisabled(actualFretIndex);

            const geometry = new THREE.BoxGeometry(boxWidth, boxHeight, boxDepth);
            const material = new THREE.MeshBasicMaterial({
                color: isDisabled ? 0x666666 : (fretColors[fretIndex] || 0xff0000),
                transparent: true,
                opacity: isDisabled ? 0.4 : 0.6, // Higher opacity to better see overlaps between frets
                side: THREE.DoubleSide
            });

            const zone = new THREE.Mesh(geometry, material);
            zone.position.set(posX, posY, posZ);
            // Hitboxes are invisible by default, only visible on hover or feedback
            // Disabled frets are always slightly visible
            zone.visible = true;
            zone.material.opacity = isDisabled ? 0.3 : (state.showDebug ? 0.6 : 0); // Disabled frets slightly visible

            zone.userData = {
                stringIndex,
                fretIndex: actualFretIndex,
                note: getNoteAt(stringIndex, actualFretIndex),
                originalColor: isDisabled ? 0x666666 : material.color.getHex(),
                originalOpacity: isDisabled ? 0.3 : (state.showDebug ? 0.6 : 0), // Store original opacity
                isHovered: false,
                isFeedback: false, // Track if showing feedback (correct/wrong)
                isDisabled: isDisabled
            };

            scene.add(zone);
            fretZones.push(zone);
        }
    }

    
    // Setup mouse over effects for hitboxes
    setupHitboxHoverEffects();
    
    // Create fret markers (dots) on the fretboard
    createFretMarkers();
}

function createFretMarkers() {
    // Clear existing markers
    fretMarkers.forEach(marker => scene.remove(marker));
    fretMarkers = [];
    
    // Fret numbers that should have markers (standard guitar fret markers)
    const markerFrets = [3, 5, 7, 9, 12, 15, 17, 19, 21];
    
    // Analyze the model to get fret positions
    const analysis = analyzeGuitarModel();
    
    if (!analysis) {
        // Fallback to old hardcoded positions
        const stringSpacing = 0.05;
        const fretSpacing = 0.20;
        const neckStartZ = -2.8;
        const neckStartY = -0.49;
        const slope = 0.014;
        const neckCenterZ = 0; // Center of strings
        
        for (const fretIndex of markerFrets) {
            if (fretIndex >= NUM_FRETS) continue;
            
            // Calculate position in the center of the fret space (between frets)
            const fretX = neckStartZ + (fretIndex * fretSpacing);
            let centerX = fretX;
            
            if (fretIndex < NUM_FRETS - 1) {
                const nextFretX = neckStartZ + ((fretIndex + 1) * fretSpacing);
                centerX = (fretX + nextFretX) / 2;
            } else if (fretIndex > 1) {
                const prevFretX = neckStartZ + ((fretIndex - 1) * fretSpacing);
                centerX = (fretX + prevFretX) / 2;
            }
            
            const centerY = neckStartY + (fretIndex * slope) - 0.0075; // Half sunk into fretboard (radius is 0.015, so -0.0075 is half)
            const centerZ = neckCenterZ;
            
            if (fretIndex === 12) {
                // Double dots for 12th fret (top and bottom)
                const dotSpacing = stringSpacing * 2.5; // Space between dots
                createMarkerDot(centerX, centerY, centerZ - dotSpacing / 2);
                createMarkerDot(centerX, centerY, centerZ + dotSpacing / 2);
            } else {
                // Single dot centered
                createMarkerDot(centerX, centerY, centerZ);
            }
        }
        return;
    }
    
    // Use analyzed positions
    const { fretPositions, neckRegion } = analysis;
    
    if (!fretPositions || fretPositions.length === 0) {
        return;
    }
    
    // Get string positions to calculate center Z
    const stringObjects = extractStringObjects();
    let centerZ = neckRegion.centerZ;
    
    if (stringObjects && stringObjects.length >= 6) {
        // Calculate center Z from string positions
        const stringPositionsByFret = analyzeStringGeometry(stringObjects, fretPositions, neckRegion);
        if (stringPositionsByFret && stringPositionsByFret.length > 0) {
            const firstFretPositions = stringPositionsByFret[0];
            if (firstFretPositions && firstFretPositions.length >= 6) {
                const firstStringZ = firstFretPositions[0].z;
                const lastStringZ = firstFretPositions[5].z;
                centerZ = (firstStringZ + lastStringZ) / 2;
            }
        }
    }
    
    // Create markers for each marked fret
    for (const fretIndex of markerFrets) {
        if (fretIndex >= NUM_FRETS) continue;
        
        // Find the fret position index (fretIndex 1 = position 0, fretIndex 2 = position 1, etc.)
        const fretPosIndex = fretIndex - 1;
        
        if (fretPosIndex < 0 || fretPosIndex >= fretPositions.length) {
            continue;
        }
        
        // Calculate position in the center of the fret space (between frets)
        let centerX, centerY;
        
        if (fretIndex === 1) {
            // First fret: between nut and fret 1
            const nutX = neckRegion.nutX || neckRegion.startX;
            const fret1X = fretPositions[0].x;
            centerX = (nutX + fret1X) / 2;
        } else if (fretPosIndex < fretPositions.length) {
            // Between previous fret and current fret
            const prevFretX = fretPositions[fretPosIndex - 1].x;
            const currentFretX = fretPositions[fretPosIndex].x;
            centerX = (prevFretX + currentFretX) / 2;
        } else {
            continue;
        }
        
        // Get Y position from fret position or estimate
        centerY = fretPositions[fretPosIndex].y - 0.0045; // Half sunk into fretboard (radius is 0.015, so -0.0075 is half)
        
        if (fretIndex === 12) {
            // Double dots for 12th fret (top and bottom)
            const dotSpacing = neckRegion.width * 0.3; // Space between dots
            createMarkerDot(centerX, centerY, centerZ - dotSpacing / 2);
            createMarkerDot(centerX, centerY, centerZ + dotSpacing / 2);
        } else {
            // Single dot centered
            createMarkerDot(centerX, centerY, centerZ);
        }
    }
}

function createMarkerDot(x, y, z) {
    // Create a small white sphere for the fret marker
    const geometry = new THREE.SphereGeometry(0.015, 16, 16); // Small sphere, 0.015 radius
    const material = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        emissive: 0x222222, // Slight glow
        metalness: 0.3,
        roughness: 0.7
    });
    
    const marker = new THREE.Mesh(geometry, material);
    marker.position.set(x, y, z);
    marker.castShadow = true;
    marker.receiveShadow = true;
    
    scene.add(marker);
    fretMarkers.push(marker);
}

/**
 * Toggle debug mode (show/hide hitboxes and tooltip)
 */
function toggleDebugMode(enabled) {
    state.showDebug = enabled;
    saveSettingsToCookies();
    
    // Update hitbox visibility and opacity
    if (fretZones && fretZones.length > 0) {
        fretZones.forEach(zone => {
            zone.visible = true; // Always visible now
            // Update opacity based on debug mode and feedback state
            if (!zone.userData.isFeedback && !zone.userData.isHovered) {
                if (zone.userData.isDisabled) {
                    // Disabled frets are always slightly visible
                    zone.material.opacity = 0.3;
                    zone.userData.originalOpacity = 0.3;
                } else if (zone.userData.isRootNote) {
                    // Keep root note visible regardless of debug mode
                    zone.material.opacity = 0.6;
                    zone.userData.originalOpacity = 0.6;
                } else {
                    zone.material.opacity = enabled ? 0.6 : 0;
                    zone.userData.originalOpacity = enabled ? 0.6 : 0;
                }
            }
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

function toggleRotation(enabled) {
    state.rotationEnabled = enabled;
    saveSettingsToCookies();
    
    // Enable/disable rotation in OrbitControls
    if (controls) {
        controls.enableRotate = enabled;
    }
    
    // Show/hide help text
    updateRotationHelpText();
}

function updateRotationHelpText() {
    const helpText = document.getElementById('rotationHelpText');
    if (helpText) {
        if (state.rotationEnabled) {
            helpText.style.display = 'block';
        } else {
            helpText.style.display = 'none';
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
 * Setup mouse over effects for hitboxes
 */
let hoveredHitbox = null;

let hoverEffectsSetup = false;

function setupHitboxHoverEffects() {
    // Hover effects disabled - only feedback on click (red/green) is shown
    // This function is kept for compatibility but does nothing
    return;
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

        // Check if fret is disabled
        if (isFretDisabled(fretIndex)) {
            showFeedback('error', `Fret ${fretIndex} is disabled!`);
            return;
        }

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
    fretMarkers = [];
}


function fallbackToCSS(container, gameMode) {
    cleanupThreeJS(); // Ensure clean state
    container.classList.add('use-css-fallback');

    // Determine highlighted positions based on game mode
    let highlighted = [];
    if (gameMode === 'findAll') {
        highlighted = state.foundPositions;
    } else if (gameMode === 'triads') {
        highlighted = [...state.clickedTriadPositions];
        // Add root note position if option is enabled
        if (state.showTriadRootNote && state.triadRootNotePosition) {
            highlighted.push(state.triadRootNotePosition);
        }
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
/**
 * Calculate fret spacing percentages based on logarithmic formula
 * Formula from fret spacing mathematics: X_n = L × (1 - 1/r^n) where r = 2^(1/12)
 * Returns array of percentages for each fret space (between frets)
 */
function calculateFretSpacingPercentages() {
    const r = Math.pow(2, 1/12); // 12th root of 2 (approximately 1.059463)
    const percentages = [];
    
    // Calculate position of nut (fret 0)
    let prevPosition = 0; // Position of nut relative to scale length (0%)
    
    // For each fret from 1 to NUM_FRETS-1, calculate the width of the space before it
    for (let fret = 1; fret < NUM_FRETS; fret++) {
        // Position of this fret: X_n = 1 - 1/r^n (normalized to 0-1)
        const currentPosition = 1 - (1 / Math.pow(r, fret));
        
        // Width of the space between previous fret and this fret
        const spaceWidth = currentPosition - prevPosition;
        percentages.push(spaceWidth);
        
        prevPosition = currentPosition;
    }
    
    // Normalize percentages to sum to 1 (100%)
    const total = percentages.reduce((sum, p) => sum + p, 0);
    return percentages.map(p => (p / total) * 100);
}

/**
 * Calculate cumulative positions for each fret (for absolute positioning of dots)
 * Returns array of left positions (0-100%) for each fret space
 */
function calculateFretCumulativePositions() {
    const r = Math.pow(2, 1/12); // 12th root of 2 (approximately 1.059463)
    const positions = [];
    
    // Calculate cumulative position for each fret space
    let cumulativePosition = 0;
    
    for (let fret = 1; fret < NUM_FRETS; fret++) {
        // Position of this fret: X_n = 1 - 1/r^n (normalized to 0-1)
        const currentPosition = 1 - (1 / Math.pow(r, fret));
        
        // Store the left edge position of this fret space (before normalization)
        positions.push(cumulativePosition);
        
        // Move to next position
        cumulativePosition = currentPosition;
    }
    
    // Normalize to 0-100% range based on the total width
    // The last position should account for the remaining space
    const totalWidth = cumulativePosition;
    if (totalWidth > 0) {
        return positions.map(p => (p / totalWidth) * 100);
    }
    return positions;
}

function renderFretboard(highlightedPositions = []) {
    // Calculate correct fret spacing percentages
    const fretPercentages = calculateFretSpacingPercentages();
    
    let fretboardHTML = '<div class="fretboard">';

    fretboardHTML += '<div class="strings-container">';
    
    // Add fret marker dots - positioned absolutely within strings-container
    // Markers go in the middle of specific fret spaces (between frets)
    fretboardHTML += '<div class="fret-markers">';
    const markerFrets = [3, 5, 7, 9, 12, 15, 17, 19, 21];

    // Calculate cumulative positions for absolute positioning
    // Position dots in the center of each fret space
    let cumulativePos = 0;
    for (let i = 1; i < NUM_FRETS; i++) {
        const spaceWidth = fretPercentages[i - 1];
        // Center position of this fret space (between previous fret and current fret)
        const centerPos = cumulativePos + (spaceWidth / 2);
        
        if (markerFrets.includes(i)) {
            if (i === 12) {
                // Double dots for 12th fret
                fretboardHTML += `<div class="fret-marker-dot" style="left: ${centerPos}%; top: 25%; transform: translate(-50%, -50%)"></div>`;
                fretboardHTML += `<div class="fret-marker-dot" style="left: ${centerPos}%; top: 75%; transform: translate(-50%, -50%)"></div>`;
            } else {
                // Single dot centered vertically
                fretboardHTML += `<div class="fret-marker-dot" style="left: ${centerPos}%"></div>`;
            }
        }
        
        cumulativePos += spaceWidth;
    }
    fretboardHTML += '</div>';

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
            const isDisabled = isFretDisabled(fretIndex);
            const percentage = fretPercentages[fretIndex - 1];

            fretboardHTML += `
                <div class="fret ${isHighlighted ? 'highlighted' : ''} ${isDisabled ? 'disabled' : ''}" 
                     data-string="${stringIndex}" 
                     data-fret="${fretIndex}"
                     style="flex-basis: ${percentage}%">
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
        const percentage = fretPercentages[i - 1];
        fretboardHTML += `<div class="fret-number" style="flex-basis: ${percentage}%">${i}</div>`;
    }
    fretboardHTML += '</div>';

    fretboardHTML += '</div>'; // Close fretboard

    return fretboardHTML;
}

function showSolution() {
    state.showSolution = !state.showSolution;
    
    if (state.viewMode === '2d') {
        // For 2D view, re-render the fretboard with solution highlighted
        const container = document.querySelector('.fretboard-container');
        if (container) {
            let highlighted = [];
            
            if (state.currentScreen === 'singleNote') {
                if (state.showSolution) {
                    highlighted = getAllPositions(state.targetNote);
                }
            } else if (state.currentScreen === 'findAll') {
                if (state.showSolution) {
                    highlighted = state.allPositions;
                } else {
                    highlighted = state.foundPositions;
                }
            } else if (state.currentScreen === 'triads') {
                if (state.showSolution) {
                    // Show all positions of all three notes in the triad
                    const triad = state.targetTriad;
                    if (triad) {
                        triad.notes.forEach(note => {
                            highlighted.push(...getAllPositions(note));
                        });
                    }
                } else {
                    highlighted = [...state.clickedTriadPositions];
                    if (state.showTriadRootNote && state.triadRootNotePosition) {
                        highlighted.push(state.triadRootNotePosition);
                    }
                }
            }
            
            container.innerHTML = renderFretboard(highlighted);
            
            // Re-attach event listeners
            const gameMode = state.currentScreen;
            container.querySelectorAll('.fret').forEach(fret => {
                if (gameMode === 'singleNote') {
                    fret.addEventListener('click', handleSingleNoteDOMClick);
                } else if (gameMode === 'findAll') {
                    fret.addEventListener('click', handleFindAllDOMClick);
                } else if (gameMode === 'triads') {
                    fret.addEventListener('click', handleTriadDOMClick);
                }
            });
        }
    } else {
        // For 3D view, highlight zones
        if (fretZones && fretZones.length > 0) {
            let solutionPositions = [];
            
            if (state.currentScreen === 'singleNote') {
                if (state.showSolution) {
                    solutionPositions = getAllPositions(state.targetNote);
                }
            } else if (state.currentScreen === 'findAll') {
                if (state.showSolution) {
                    solutionPositions = state.allPositions;
                }
            } else if (state.currentScreen === 'triads') {
                if (state.showSolution) {
                    const triad = state.targetTriad;
                    if (triad) {
                        triad.notes.forEach(note => {
                            solutionPositions.push(...getAllPositions(note));
                        });
                    }
                }
            }
            
            fretZones.forEach(zone => {
                const stringIndex = zone.userData.stringIndex;
                const fretIndex = zone.userData.fretIndex;
                const isInSolution = solutionPositions.some(
                    pos => pos.string === stringIndex && pos.fret === fretIndex
                );
                
                if (state.showSolution && isInSolution) {
                    // Highlight solution positions
                    zone.material.opacity = 0.8;
                    zone.material.color.setHex(0xffff00); // Yellow for solution
                } else {
                    // Reset to normal state
                    if (zone.userData.isFeedback) {
                        // Keep feedback color if showing feedback
                        return;
                    }
                    if (zone.userData.isRootNote) {
                        // Keep root note highlight
                        return;
                    }
                    if (zone.userData.isDisabled) {
                        zone.material.opacity = 0.3;
                    } else {
                        zone.material.opacity = state.showDebug ? 0.6 : 0;
                    }
                    zone.material.color.setHex(zone.userData.originalColor);
                }
            });
        }
    }
    
    // Update button text
    const solutionBtn = document.getElementById('solutionBtn');
    if (solutionBtn) {
        solutionBtn.textContent = state.showSolution ? 'Hide Solution' : 'Solution';
    }
}

function updateSolutionDisplay() {
    // Update solution display if it's currently showing
    if (state.showSolution) {
        showSolution(); // Toggle off
        state.showSolution = true; // Set back to true
        showSolution(); // Toggle on with new data
    }
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

function updateScoreDisplay() {
    const scoreElement = document.querySelector('.score');
    if (scoreElement) {
        scoreElement.textContent = `Score: ${state.score}`;
    }
}

function updateErrorsDisplay() {
    const errorsElement = document.querySelector('.errors');
    if (errorsElement) {
        errorsElement.textContent = `Errors: ${state.errors}`;
    }
}

function clearTimer() {
    if (gameTimer) {
        clearInterval(gameTimer);
        gameTimer = null;
    }
    // Reset timer to original time limit if enabled, otherwise set to 0
    if (state.enableTimeLimit && state.timeLimit > 0) {
        state.timeRemaining = state.timeLimit;
    } else {
        state.timeRemaining = 0;
    }
    updateTimerDisplay();
}

function startTimer() {
    clearTimer();
    
    if (!state.enableTimeLimit || state.timeLimit === 0) {
        // Time limit disabled or set to 0, hide timer
        const timerElement = document.querySelector('.timer-display');
        if (timerElement) {
            timerElement.style.display = 'none';
            timerElement.textContent = 'Time: None'; // Set correct content even when hidden
        }
        return;
    }
    
    // Show timer
    const timerElement = document.querySelector('.timer-display');
    if (timerElement) {
        timerElement.style.display = 'block';
    }
    
    state.timeRemaining = state.timeLimit;
    updateTimerDisplay();
    
    gameTimer = setInterval(() => {
        state.timeRemaining -= 1;
        updateTimerDisplay();
        
        if (state.timeRemaining <= 0) {
            clearTimer();
            handleTimeOut();
        }
    }, 1000);
}

function startTimerOnFirstClick() {
    // Start timer only if it hasn't been started yet
    if (!state.timerStarted && state.enableTimeLimit && state.timeLimit > 0) {
        state.timerStarted = true;
        startTimer();
    }
}

function updateTimerDisplay() {
    const timerElement = document.querySelector('.timer-display');
    if (timerElement) {
        if (state.timeLimit === 0) {
            timerElement.style.display = 'none';
        } else {
            timerElement.textContent = `Time: ${state.timeRemaining}s`;
            // Add warning class when time is running low
            if (state.timeRemaining <= 3) {
                timerElement.classList.add('timer-warning');
            } else {
                timerElement.classList.remove('timer-warning');
            }
        }
    }
}

function handleTimeOut() {
    showFeedback('error', "Time's up! Try again.");
    state.errors += 1;
    updateErrorsDisplay();
    
    // Reset timer started flag for next question
    state.timerStarted = false;
    // After timeout, timer should auto-start (not first question anymore)
    state.isFirstQuestion = false;
    
    // Move to next task based on current game mode
    if (state.currentScreen === 'singleNote') {
        const wasShowingSolution = state.showSolution;
        setTimeout(() => {
            state.targetNote = getRandomNote();
            document.querySelector('.target-note').textContent = state.targetNote;
            // Update solution display if it was showing
            if (wasShowingSolution) {
                state.showSolution = true;
                updateSolutionDisplay();
            }
            // Auto-start timer (not first question after timeout)
            if (state.enableTimeLimit && state.timeLimit > 0) {
                startTimer();
            }
        }, 1500);
    } else if (state.currentScreen === 'findAll') {
        const wasShowingSolution = state.showSolution;
        setTimeout(() => {
            state.targetNote = getRandomNote();
            state.allPositions = getAllPositions(state.targetNote);
            state.foundPositions = [];
            
            // Reset all zones
            fretZones.forEach(z => {
                z.userData.isFeedback = false;
                z.material.color.setHex(z.userData.originalColor);
                z.material.opacity = z.userData.originalOpacity;
            });
            
            document.querySelector('.target-note').textContent = state.targetNote;
            document.querySelector('.progress-info').textContent = `Found: 0 / ${state.allPositions.length}`;
            // Update solution display if it was showing
            if (wasShowingSolution) {
                state.showSolution = true;
                updateSolutionDisplay();
            }
            // Auto-start timer (not first question after timeout)
            if (state.enableTimeLimit && state.timeLimit > 0) {
                startTimer();
            }
        }, 1500);
    } else if (state.currentScreen === 'triads') {
        const wasShowingSolution = state.showSolution;
        setTimeout(() => {
            state.targetTriad = getRandomTriad();
            state.clickedTriadNotes = [];
            state.clickedTriadPositions = [];
            
            // Set new root note position if option is enabled
            state.triadRootNotePosition = selectRandomRootNotePosition(state.targetTriad?.root);
            
            // If root note is shown, automatically mark it as found
            if (state.showTriadRootNote && state.triadRootNotePosition && state.targetTriad) {
                state.clickedTriadNotes.push(state.targetTriad.root);
                state.clickedTriadPositions.push(state.triadRootNotePosition);
            }
            
            // Reset all zones first
            fretZones.forEach(z => {
                z.material.opacity = 0;
                z.userData.isRootNote = false;
            });
            
            // Then highlight root note position (this will override the reset for the root note)
            highlightRootNotePosition();
            
            renderTriadsGameUpdate();
            // Update solution display if it was showing
            if (wasShowingSolution) {
                state.showSolution = true;
                updateSolutionDisplay();
            }
            // Auto-start timer (not first question after timeout)
            if (state.enableTimeLimit && state.timeLimit > 0) {
                startTimer();
            }
        }, 1500);
    }
}

function renderSingleNoteGame() {
    const app = document.getElementById('app');
    app.innerHTML = `
        <div class="game-screen">
            <button class="exit-btn" id="exitBtn">← Exit</button>
            <button class="solution-btn" id="solutionBtn">Solution</button>
            <div class="game-header">
                <div class="target-note">${state.targetNote}</div>
                <div class="score-container">
                    <div class="timer-display" style="display: ${state.enableTimeLimit && state.timeLimit > 0 ? 'block' : 'none'}">Time: ${state.enableTimeLimit && state.timeLimit > 0 ? state.timeRemaining + 's' : 'None'}</div>
                    <div class="score">Score: ${state.score}</div>
                    <div class="errors">Errors: ${state.errors}</div>
                </div>
            </div>
            ${state.viewMode === '3d' ? `
                <div class="debug-toggle-container">
                    <div class="debug-toggle-controls">
                        <label class="debug-toggle-label">
                            <span class="debug-toggle-text">Rotation:</span>
                            <div class="view-toggle-switch">
                                <input type="checkbox" id="rotationToggle" ${state.rotationEnabled ? 'checked' : ''}>
                                <span class="toggle-slider">
                                    <span class="toggle-label-left">Off</span>
                                    <span class="toggle-label-right">On</span>
                                </span>
                            </div>
                        </label>
                        <label class="debug-toggle-label">
                            <span class="debug-toggle-text">Debug Info:</span>
                            <div class="view-toggle-switch">
                                <input type="checkbox" id="debugToggle" ${state.showDebug ? 'checked' : ''}>
                                <span class="toggle-slider">
                                    <span class="toggle-label-left">Off</span>
                                    <span class="toggle-label-right">On</span>
                                </span>
                            </div>
                        </label>
                        <button class="reset-camera-btn" id="resetCameraBtn" title="Reset camera to default position">↻ Reset</button>
                    </div>
                    <div class="controls-help-text" id="rotationHelpText" style="display: ${state.rotationEnabled ? 'block' : 'none'};">
                        Drag to rotate. Hold Shift and drag to pan.
                    </div>
                </div>
            ` : ''}
            <div class="fretboard-container" id="threeContainer"></div>
        </div>
    `;

    document.getElementById('exitBtn').addEventListener('click', () => {
        clearTimer();
        state.currentScreen = 'menu';
        state.showSolution = false;
        cleanupThreeJS();
        renderMenu();
    });
    
    // Setup solution button
    const solutionBtn = document.getElementById('solutionBtn');
    if (solutionBtn) {
        solutionBtn.addEventListener('click', () => {
            showSolution();
        });
    }

    // Setup rotation toggle, debug toggle and reset button (only for 3D view)
    if (state.viewMode === '3d') {
        const rotationToggle = document.getElementById('rotationToggle');
        if (rotationToggle) {
            rotationToggle.addEventListener('change', (e) => {
                toggleRotation(e.target.checked);
            });
        }
        
        const debugToggle = document.getElementById('debugToggle');
        if (debugToggle) {
            debugToggle.addEventListener('change', (e) => {
                toggleDebugMode(e.target.checked);
            });
        }
        
        const resetCameraBtn = document.getElementById('resetCameraBtn');
        if (resetCameraBtn) {
            resetCameraBtn.addEventListener('click', () => {
                if (window.resetCamera) {
                    window.resetCamera();
                }
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
                showFeedback('error', 'Failed to load 3D model. Using 2D view.');
                fallbackToCSS(container, 'singleNote');
            });
        } else {
            fallbackToCSS(container, 'singleNote');
        }
    }
    
    // Initialize timer display correctly
    const timerElement = document.querySelector('.timer-display');
    if (timerElement && state.timeLimit === 0) {
        timerElement.textContent = 'Time: None';
    }
    
    // Reset timer started flag - timer will start on first click
    state.timerStarted = false;
    
    // Show timer but don't start it yet
    if (state.enableTimeLimit && state.timeLimit > 0) {
        if (timerElement) {
            timerElement.style.display = 'block';
            timerElement.textContent = `Time: ${state.timeLimit}s`;
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
            <button class="solution-btn" id="solutionBtn">Solution</button>
            <div class="game-header">
                <div>
                    <div class="target-note">${state.targetNote}</div>
                    <div class="progress-info">Found: ${found} / ${total}</div>
                </div>
                <div class="score-container">
                    <div class="timer-display" style="display: ${state.enableTimeLimit && state.timeLimit > 0 ? 'block' : 'none'}">Time: ${state.enableTimeLimit && state.timeLimit > 0 ? state.timeRemaining + 's' : 'None'}</div>
                    <div class="score">Score: ${state.score}</div>
                    <div class="errors">Errors: ${state.errors}</div>
                </div>
            </div>
            ${state.viewMode === '3d' ? `
                <div class="debug-toggle-container">
                    <div class="debug-toggle-controls">
                        <label class="debug-toggle-label">
                            <span class="debug-toggle-text">Rotation:</span>
                            <div class="view-toggle-switch">
                                <input type="checkbox" id="rotationToggle" ${state.rotationEnabled ? 'checked' : ''}>
                                <span class="toggle-slider">
                                    <span class="toggle-label-left">Off</span>
                                    <span class="toggle-label-right">On</span>
                                </span>
                            </div>
                        </label>
                        <label class="debug-toggle-label">
                            <span class="debug-toggle-text">Debug Info:</span>
                            <div class="view-toggle-switch">
                                <input type="checkbox" id="debugToggle" ${state.showDebug ? 'checked' : ''}>
                                <span class="toggle-slider">
                                    <span class="toggle-label-left">Off</span>
                                    <span class="toggle-label-right">On</span>
                                </span>
                            </div>
                        </label>
                        <button class="reset-camera-btn" id="resetCameraBtn" title="Reset camera to default position">↻ Reset</button>
                    </div>
                    <div class="controls-help-text" id="rotationHelpText" style="display: ${state.rotationEnabled ? 'block' : 'none'};">
                        Drag to rotate. Hold Shift and drag to pan.
                    </div>
                </div>
            ` : ''}
            <div class="fretboard-container" id="threeContainer"></div>
        </div>
    `;

    document.getElementById('exitBtn').addEventListener('click', () => {
        clearTimer();
        state.currentScreen = 'menu';
        state.showSolution = false;
        cleanupThreeJS();
        renderMenu();
    });
    
    // Setup solution button
    const solutionBtn = document.getElementById('solutionBtn');
    if (solutionBtn) {
        solutionBtn.addEventListener('click', () => {
            showSolution();
        });
    }

    // Setup rotation toggle, debug toggle and reset button (only for 3D view)
    if (state.viewMode === '3d') {
        const rotationToggle = document.getElementById('rotationToggle');
        if (rotationToggle) {
            rotationToggle.addEventListener('change', (e) => {
                toggleRotation(e.target.checked);
            });
        }
        
        const debugToggle = document.getElementById('debugToggle');
        if (debugToggle) {
            debugToggle.addEventListener('change', (e) => {
                toggleDebugMode(e.target.checked);
            });
        }
        
        const resetCameraBtn = document.getElementById('resetCameraBtn');
        if (resetCameraBtn) {
            resetCameraBtn.addEventListener('click', () => {
                if (window.resetCamera) {
                    window.resetCamera();
                }
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
                showFeedback('error', 'Failed to load 3D model. Using 2D view.');
                fallbackToCSS(container, 'findAll');
            });
        } else {
            fallbackToCSS(container, 'findAll');
        }
    }
    
    // Initialize timer display correctly
    const timerElement = document.querySelector('.timer-display');
    if (timerElement && state.timeLimit === 0) {
        timerElement.textContent = 'Time: None';
    }
    
    // Reset timer started flag - timer will start on first click
    state.timerStarted = false;
    
    // Show timer but don't start it yet
    if (state.enableTimeLimit && state.timeLimit > 0) {
        if (timerElement) {
            timerElement.style.display = 'block';
            timerElement.textContent = `Time: ${state.timeLimit}s`;
        }
    }
}

/* ========================================
   GAME LOGIC FUNCTIONS
   ======================================== */
function startSingleNoteGame() {
    state.currentScreen = 'singleNote';
    state.targetNote = getRandomNote();
    state.score = 0;
    state.errors = 0;
    state.isFirstQuestion = true; // Reset to first question for new game
    state.showSolution = false; // Reset solution display
    renderSingleNoteGame();
}

function startFindAllGame() {
    state.currentScreen = 'findAll';
    state.targetNote = getRandomNote();
    state.allPositions = getAllPositions(state.targetNote);
    state.foundPositions = [];
    state.score = 0;
    state.errors = 0;
    state.isFirstQuestion = true; // Reset to first question for new game
    state.showSolution = false; // Reset solution display
    renderFindAllGame();
}

/* ========================================
   THREE.JS CLICK HANDLERS
   ======================================== */
function handleSingleNoteClick(stringIndex, fretIndex, note) {
    // Start timer on first click
    startTimerOnFirstClick();
    
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
            zone.userData.isFeedback = true;
            zone.material.opacity = 0.7;
            zone.material.color.setHex(0x00ff00); // Green for correct
            setTimeout(() => {
                zone.userData.isFeedback = false;
                zone.material.color.setHex(zone.userData.originalColor);
                // Reset to invisible (0) unless debug mode is on
                zone.material.opacity = state.showDebug ? 0.6 : 0;
                zone.userData.originalOpacity = zone.material.opacity;
            }, 1500);
        }

        showFeedback('success', 'Correct! Great job!');
        state.score += 1;

        // Update score display
        updateScoreDisplay();

        // Clear timer and auto-advance to next note
        clearTimer();
        state.timerStarted = false;
        state.isFirstQuestion = false; // After first question, timer will auto-start
        const wasShowingSolution = state.showSolution;
        state.showSolution = false; // Reset solution display
        setTimeout(() => {
            state.targetNote = getRandomNote();
            document.querySelector('.target-note').textContent = state.targetNote;
            // Update solution display if it was showing
            if (wasShowingSolution) {
                state.showSolution = true;
                updateSolutionDisplay();
            }
            // Auto-start timer if not first question, otherwise wait for click
            if (state.enableTimeLimit && state.timeLimit > 0) {
                if (!state.isFirstQuestion) {
                    startTimer();
                } else {
                    const timerElement = document.querySelector('.timer-display');
                    if (timerElement) {
                        timerElement.textContent = `Time: ${state.timeLimit}s`;
                    }
                }
            }
        }, 1500);
    } else {
        // Wrong answer - show red feedback
        const zone = fretZones.find(z =>
            z.userData.stringIndex === stringIndex &&
            z.userData.fretIndex === fretIndex
        );
        if (zone) {
            zone.userData.isFeedback = true;
            const originalColor = zone.material.color.getHex();
            zone.material.opacity = 0.7;
            zone.material.color.setHex(0xff0000); // Red for wrong
            setTimeout(() => {
                zone.userData.isFeedback = false;
                zone.material.color.setHex(originalColor);
                // Reset to invisible (0) unless debug mode is on
                zone.material.opacity = state.showDebug ? 0.6 : 0;
                zone.userData.originalOpacity = zone.material.opacity;
            }, 1000);
        }
        state.errors += 1;
        updateErrorsDisplay();
        showFeedback('error', `Incorrect. That was ${note}. Try again!`);
    }
}

function handleFindAllClick(stringIndex, fretIndex, note) {
    // Start timer on first click
    startTimerOnFirstClick();
    
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

        // Highlight the zone permanently (green for correct)
        const zone = fretZones.find(z =>
            z.userData.stringIndex === stringIndex &&
            z.userData.fretIndex === fretIndex
        );
        if (zone) {
            zone.userData.isFeedback = true;
            zone.material.opacity = 0.7;
            zone.material.color.setHex(0x00ff00); // Green for correct
        }

        const remaining = state.allPositions.length - state.foundPositions.length;

        if (remaining > 0) {
            showFeedback('success', `Good! ${remaining} more to go.`);
            document.querySelector('.progress-info').textContent = `Found: ${state.foundPositions.length} / ${state.allPositions.length}`;
        } else {
            // All found!
            showFeedback('success', `Awesome! You found all ${state.targetNote}'s!`);
            state.score += 10;
            updateScoreDisplay();

            // Clear timer and auto-advance to next note
            clearTimer();
            state.timerStarted = false;
            state.isFirstQuestion = false; // After first question, timer will auto-start
            const wasShowingSolution = state.showSolution;
            state.showSolution = false; // Reset solution display
            setTimeout(() => {
                state.targetNote = getRandomNote();
                state.allPositions = getAllPositions(state.targetNote);
                state.foundPositions = [];

                // Reset all zones
                fretZones.forEach(z => {
                    z.userData.isFeedback = false;
                    z.material.color.setHex(z.userData.originalColor);
                    z.material.opacity = z.userData.originalOpacity;
                });

                document.querySelector('.target-note').textContent = state.targetNote;
                document.querySelector('.progress-info').textContent = `Found: 0 / ${state.allPositions.length}`;
                // Update solution display if it was showing
                if (wasShowingSolution) {
                    state.showSolution = true;
                    updateSolutionDisplay();
                }
                // Auto-start timer if not first question, otherwise wait for click
                if (state.enableTimeLimit && state.timeLimit > 0) {
                    if (!state.isFirstQuestion) {
                        startTimer();
                    } else {
                        const timerElement = document.querySelector('.timer-display');
                        if (timerElement) {
                            timerElement.textContent = `Time: ${state.timeLimit}s`;
                        }
                    }
                }
            }, 2000);
        }
    } else {
        // Wrong position - show red feedback
        const zone = fretZones.find(z =>
            z.userData.stringIndex === stringIndex &&
            z.userData.fretIndex === fretIndex
        );
        if (zone) {
            zone.userData.isFeedback = true;
            const originalColor = zone.material.color.getHex();
            zone.material.opacity = 0.7;
            zone.material.color.setHex(0xff0000); // Red for wrong
            setTimeout(() => {
                zone.userData.isFeedback = false;
                zone.material.color.setHex(originalColor);
                // Reset to invisible (0) unless debug mode is on
                zone.material.opacity = state.showDebug ? 0.6 : 0;
                zone.userData.originalOpacity = zone.material.opacity;
            }, 1000);
        }
        state.errors += 1;
        updateErrorsDisplay();
        showFeedback('error', `Oops, that's a ${note}. Keep looking for ${state.targetNote}.`);
    }
}

function handleTriadClick(stringIndex, fretIndex, note) {
    // Start timer on first click
    startTimerOnFirstClick();
    
    const frequency = getFrequencyAt(stringIndex, fretIndex);
    playGuitarTone(frequency);

    const triad = state.targetTriad;

        // Check if this note is part of the triad
        if (triad.notes.includes(note)) {
            // Check if we already clicked this note
            if (!state.clickedTriadNotes.includes(note)) {
                state.clickedTriadNotes.push(note);
                state.clickedTriadPositions.push({ string: stringIndex, fret: fretIndex });

                // Highlight the zone (green for correct)
                const zone = fretZones.find(z =>
                    z.userData.stringIndex === stringIndex &&
                    z.userData.fretIndex === fretIndex
                );
                if (zone) {
                    zone.userData.isFeedback = true;
                    zone.userData.isRootNote = false; // Remove root note highlight if this was the root
                    zone.material.opacity = 0.7;
                    zone.material.color.setHex(0x00ff00); // Green for correct
                }
                
                // If this was the root note position, clear it
                if (state.triadRootNotePosition && 
                    state.triadRootNotePosition.string === stringIndex && 
                    state.triadRootNotePosition.fret === fretIndex) {
                    state.triadRootNotePosition = null;
                }

            // Check if all notes are clicked
            if (state.clickedTriadNotes.length === 3) {
                // All notes found!
                showFeedback('success', 'Perfect! All notes found!');
                state.score += 1;
                updateScoreDisplay();

                // Clear timer and auto-advance to next triad
                clearTimer();
                state.timerStarted = false;
                state.isFirstQuestion = false; // After first question, timer will auto-start
                const wasShowingSolution = state.showSolution;
                state.showSolution = false; // Reset solution display
                setTimeout(() => {
                    state.targetTriad = getRandomTriad();
                    state.clickedTriadNotes = [];
                    state.clickedTriadPositions = [];
                    
                    // Set new root note position if option is enabled
                    state.triadRootNotePosition = selectRandomRootNotePosition(state.targetTriad?.root);
                    
                    // If root note is shown, automatically mark it as found
                    if (state.showTriadRootNote && state.triadRootNotePosition && state.targetTriad) {
                        state.clickedTriadNotes.push(state.targetTriad.root);
                        state.clickedTriadPositions.push(state.triadRootNotePosition);
                    }

                    // Reset all zones first
                    fretZones.forEach(z => {
                        z.material.opacity = 0;
                        z.userData.isRootNote = false;
                    });
                    
                    // Then highlight root note position (this will override the reset for the root note)
                    highlightRootNotePosition();

                    // Update UI (we need to re-render the triad display)
                    renderTriadsGameUpdate();
                    // Update solution display if it was showing
                    if (wasShowingSolution) {
                        state.showSolution = true;
                        updateSolutionDisplay();
                    }
                    // Auto-start timer if not first question, otherwise wait for click
                    if (state.enableTimeLimit && state.timeLimit > 0) {
                        if (!state.isFirstQuestion) {
                            startTimer();
                        } else {
                            const timerElement = document.querySelector('.timer-display');
                            if (timerElement) {
                                timerElement.textContent = `Time: ${state.timeLimit}s`;
                            }
                        }
                    }
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
        // Wrong note - show red feedback
        const zone = fretZones.find(z =>
            z.userData.stringIndex === stringIndex &&
            z.userData.fretIndex === fretIndex
        );
        if (zone) {
            zone.userData.isFeedback = true;
            const originalColor = zone.material.color.getHex();
            zone.material.opacity = 0.7;
            zone.material.color.setHex(0xff0000); // Red for wrong
            setTimeout(() => {
                zone.userData.isFeedback = false;
                zone.material.color.setHex(originalColor);
                // Reset to invisible (0) unless debug mode is on
                zone.material.opacity = state.showDebug ? 0.6 : 0;
                zone.userData.originalOpacity = zone.material.opacity;
            }, 1000);
        }
        state.errors += 1;
        updateErrorsDisplay();
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
    state.errors = 0;
    state.isFirstQuestion = true; // Reset to first question for new game
    state.showSolution = false; // Reset solution display
    
    // Set root note position if option is enabled
    state.triadRootNotePosition = selectRandomRootNotePosition(state.targetTriad?.root);
    
    // If root note is shown, automatically mark it as found
    if (state.showTriadRootNote && state.triadRootNotePosition && state.targetTriad) {
        state.clickedTriadNotes.push(state.targetTriad.root);
        state.clickedTriadPositions.push(state.triadRootNotePosition);
    }
    
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
            <div class="settings-container triads-settings">
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
                <div class="view-toggle-container">
                    <label class="view-toggle-label">
                        <span class="view-toggle-text">Show Root Note:</span>
                        <div class="view-toggle-switch">
                            <input type="checkbox" id="showRootNoteToggle" ${state.showTriadRootNote ? 'checked' : ''}>
                            <span class="toggle-slider">
                                <span class="toggle-label-left">Off</span>
                                <span class="toggle-label-right">On</span>
                            </span>
                        </div>
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
            saveSettingsToCookies();
        });
    });

    // Add change listener for show root note toggle
    const showRootNoteToggle = document.getElementById('showRootNoteToggle');
    if (showRootNoteToggle) {
        showRootNoteToggle.addEventListener('change', (e) => {
            state.showTriadRootNote = e.target.checked;
            saveSettingsToCookies();
        });
    }

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
            <button class="solution-btn" id="solutionBtn">Solution</button>
            <div class="game-header">
                <div>
                    <div class="triad-title">${triad.root} ${triad.typeName}</div>
                    <div class="triad-notes">
                        ${noteProgress.map(({ note, isClicked }) => `
                            <span class="triad-note ${isClicked ? 'clicked' : ''}">${note}</span>
                        `).join('')}
                    </div>
                </div>
                <div class="score-container">
                    <div class="timer-display" style="display: ${state.enableTimeLimit && state.timeLimit > 0 ? 'block' : 'none'}">Time: ${state.enableTimeLimit && state.timeLimit > 0 ? state.timeRemaining + 's' : 'None'}</div>
                    <div class="score">Score: ${state.score}</div>
                    <div class="errors">Errors: ${state.errors}</div>
                </div>
            </div>
            ${state.viewMode === '3d' ? `
                <div class="debug-toggle-container">
                    <div class="debug-toggle-controls">
                        <label class="debug-toggle-label">
                            <span class="debug-toggle-text">Rotation:</span>
                            <div class="view-toggle-switch">
                                <input type="checkbox" id="rotationToggle" ${state.rotationEnabled ? 'checked' : ''}>
                                <span class="toggle-slider">
                                    <span class="toggle-label-left">Off</span>
                                    <span class="toggle-label-right">On</span>
                                </span>
                            </div>
                        </label>
                        <label class="debug-toggle-label">
                            <span class="debug-toggle-text">Debug Info:</span>
                            <div class="view-toggle-switch">
                                <input type="checkbox" id="debugToggle" ${state.showDebug ? 'checked' : ''}>
                                <span class="toggle-slider">
                                    <span class="toggle-label-left">Off</span>
                                    <span class="toggle-label-right">On</span>
                                </span>
                            </div>
                        </label>
                        <button class="reset-camera-btn" id="resetCameraBtn" title="Reset camera to default position">↻ Reset</button>
                    </div>
                    <div class="controls-help-text" id="rotationHelpText" style="display: ${state.rotationEnabled ? 'block' : 'none'};">
                        Drag to rotate. Hold Shift and drag to pan.
                    </div>
                </div>
            ` : ''}
            <div class="fretboard-container" id="threeContainer"></div>
        </div>
    `;

    document.getElementById('exitBtn').addEventListener('click', () => {
        clearTimer();
        state.currentScreen = 'menu';
        state.showSolution = false;
        cleanupThreeJS();
        renderMenu();
    });
    
    // Setup solution button
    const solutionBtn = document.getElementById('solutionBtn');
    if (solutionBtn) {
        solutionBtn.addEventListener('click', () => {
            showSolution();
        });
    }

    // Setup rotation toggle, debug toggle and reset button (only for 3D view)
    if (state.viewMode === '3d') {
        const rotationToggle = document.getElementById('rotationToggle');
        if (rotationToggle) {
            rotationToggle.addEventListener('change', (e) => {
                toggleRotation(e.target.checked);
            });
        }
        
        const debugToggle = document.getElementById('debugToggle');
        if (debugToggle) {
            debugToggle.addEventListener('change', (e) => {
                toggleDebugMode(e.target.checked);
            });
        }
        
        const resetCameraBtn = document.getElementById('resetCameraBtn');
        if (resetCameraBtn) {
            resetCameraBtn.addEventListener('click', () => {
                if (window.resetCamera) {
                    window.resetCamera();
                }
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
                // Highlight root note position after setup
                highlightRootNotePosition();
            }).catch(error => {
                showFeedback('error', 'Failed to load 3D model. Using 2D view.');
                fallbackToCSS(container, 'triads');
            });
        } else {
            fallbackToCSS(container, 'triads');
        }
    }
    
    // Initialize timer display correctly
    const timerElement = document.querySelector('.timer-display');
    if (timerElement && state.timeLimit === 0) {
        timerElement.textContent = 'Time: None';
    }
    
    // Reset timer started flag - timer will start on first click
    state.timerStarted = false;
    
    // Show timer but don't start it yet
    if (state.enableTimeLimit && state.timeLimit > 0) {
        if (timerElement) {
            timerElement.style.display = 'block';
            timerElement.textContent = `Time: ${state.timeLimit}s`;
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
    // Start timer on first click
    startTimerOnFirstClick();
    
    const fret = event.currentTarget;
    const stringIndex = parseInt(fret.dataset.string);
    const fretIndex = parseInt(fret.dataset.fret);
    
    // Check if fret is disabled
    if (isFretDisabled(fretIndex)) {
        showFeedback('error', `Fret ${fretIndex} is disabled!`);
        return;
    }
    
    const clickedNote = getNoteAt(stringIndex, fretIndex);
    const frequency = getFrequencyAt(stringIndex, fretIndex);

    playGuitarTone(frequency);

    if (clickedNote === state.targetNote) {
        fret.classList.add('highlighted');
        fret.innerHTML = `<div class="note-marker found">${clickedNote}</div>`;
        showFeedback('success', 'Correct! Great job!');
        state.score += 1;
        updateScoreDisplay();

        // Clear timer and reset for next question
        clearTimer();
        state.timerStarted = false;
        state.isFirstQuestion = false; // After first question, timer will auto-start

        const wasShowingSolution = state.showSolution;
        setTimeout(() => {
            state.targetNote = getRandomNote();
            renderSingleNoteGame();
            // Update solution display if it was showing
            if (wasShowingSolution) {
                state.showSolution = true;
                updateSolutionDisplay();
            }
            // Auto-start timer if not first question
            if (state.enableTimeLimit && state.timeLimit > 0 && !state.isFirstQuestion) {
                startTimer();
            }
        }, 1500);
    } else {
        state.errors += 1;
        updateErrorsDisplay();
        showFeedback('error', `Incorrect. That was ${clickedNote}. Try again!`);
    }
}

function handleFindAllDOMClick(event) {
    // Start timer on first click
    startTimerOnFirstClick();
    
    const fret = event.currentTarget;
    const stringIndex = parseInt(fret.dataset.string);
    const fretIndex = parseInt(fret.dataset.fret);

    // Check if fret is disabled
    if (isFretDisabled(fretIndex)) {
        showFeedback('error', `Fret ${fretIndex} is disabled!`);
        return;
    }

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
            
            // Clear timer and reset for next question
            clearTimer();
            state.timerStarted = false;
            state.isFirstQuestion = false; // After first question, timer will auto-start
            
            const wasShowingSolution = state.showSolution;
            setTimeout(() => {
                state.targetNote = getRandomNote();
                state.allPositions = getAllPositions(state.targetNote);
                state.foundPositions = [];
                renderFindAllGame();
                // Update solution display if it was showing
                if (wasShowingSolution) {
                    state.showSolution = true;
                    updateSolutionDisplay();
                }
                // Auto-start timer if not first question
                if (state.enableTimeLimit && state.timeLimit > 0 && !state.isFirstQuestion) {
                    startTimer();
                }
            }, 2000);
        }
    } else {
        state.errors += 1;
        updateErrorsDisplay();
        showFeedback('error', `Oops, that's a ${clickedNote}. Keep looking for ${state.targetNote}.`);
    }
}

function handleTriadDOMClick(event) {
    // Start timer on first click
    startTimerOnFirstClick();
    
    const fret = event.currentTarget;
    const stringIndex = parseInt(fret.dataset.string);
    const fretIndex = parseInt(fret.dataset.fret);
    
    // Check if fret is disabled
    if (isFretDisabled(fretIndex)) {
        showFeedback('error', `Fret ${fretIndex} is disabled!`);
        return;
    }
    
    const clickedNote = getNoteAt(stringIndex, fretIndex);
    const frequency = getFrequencyAt(stringIndex, fretIndex);

    playGuitarTone(frequency);

    const triad = state.targetTriad;
    if (triad.notes.includes(clickedNote)) {
        // Check if we already clicked this note (including if it's the root note that's shown)
        if (!state.clickedTriadNotes.includes(clickedNote)) {
            state.clickedTriadNotes.push(clickedNote);
            state.clickedTriadPositions.push({ string: stringIndex, fret: fretIndex });
            
            // If this was the root note position, clear it
            if (state.triadRootNotePosition && 
                state.triadRootNotePosition.string === stringIndex && 
                state.triadRootNotePosition.fret === fretIndex) {
                state.triadRootNotePosition = null;
            }
            
            if (state.clickedTriadNotes.length === 3) {
                state.clickedTriadPositions.push({ string: stringIndex, fret: fretIndex });
                showFeedback('success', 'Perfect! All notes found!');
                state.score += 1;
                
                // Clear timer and reset for next question
                clearTimer();
                state.timerStarted = false;
                state.isFirstQuestion = false; // After first question, timer will auto-start
                
                const wasShowingSolution = state.showSolution;
                renderTriadsGame();
                setTimeout(() => {
                    state.targetTriad = getRandomTriad();
                    state.clickedTriadNotes = [];
                    state.clickedTriadPositions = [];
                    
                    // Set new root note position if option is enabled
                    state.triadRootNotePosition = selectRandomRootNotePosition(state.targetTriad?.root);
                    
                    // If root note is shown, automatically mark it as found
                    if (state.showTriadRootNote && state.triadRootNotePosition && state.targetTriad) {
                        state.clickedTriadNotes.push(state.targetTriad.root);
                        state.clickedTriadPositions.push(state.triadRootNotePosition);
                    }
                    
                    // Reset all zones first (only in 3D mode)
                    if (state.viewMode === '3d' && fretZones && fretZones.length > 0) {
                        fretZones.forEach(z => {
                            z.material.opacity = 0;
                            z.userData.isRootNote = false;
                        });
                        // Then highlight root note position (this will override the reset for the root note)
                        highlightRootNotePosition();
                    }
                    
                    renderTriadsGame();
                    // Update solution display if it was showing
                    if (wasShowingSolution) {
                        state.showSolution = true;
                        updateSolutionDisplay();
                    }
                    // Auto-start timer if not first question
                    if (state.enableTimeLimit && state.timeLimit > 0 && !state.isFirstQuestion) {
                        startTimer();
                    }
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
        state.errors += 1;
        updateErrorsDisplay();
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
    // Rotation disabled for 2D version - no rotation controls
    return;
}

/* ========================================
   INITIALIZATION
   ======================================== */
document.addEventListener('DOMContentLoaded', () => {
    // Load settings from cookies first
    loadSettingsFromCookies();
    renderMenu();
});

