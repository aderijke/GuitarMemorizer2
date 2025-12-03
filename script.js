/* ========================================
   STATE MANAGEMENT
   ======================================== */
const state = {
    currentScreen: 'menu',
    targetNote: '',
    score: 0,
    foundPositions: [],
    allPositions: [],
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

    document.getElementById('singleNoteMode').addEventListener('click', startSingleNoteGame);
    document.getElementById('findAllMode').addEventListener('click', startFindAllGame);
    document.getElementById('triadsMode').addEventListener('click', startTriadsGame);
}

function renderFretboard(highlightedPositions = []) {
    let fretboardHTML = '<div class="fretboard">';

    // Add fret marker dots
    fretboardHTML += '<div class="fret-markers">';
    const markerFrets = [3, 5, 7, 9, 12];
    const displayedFrets = NUM_FRETS - 1; // 12 frets (1-12)

    markerFrets.forEach(fret => {
        // Calculate position based on 12 displayed frets (starting at fret 1)
        // Fret 3 is at index 2 (0, 1, 2)
        const leftPercent = ((fret - 1 + 0.5) / displayedFrets) * 100;

        if (fret === 12) {
            // Double dots for 12th fret
            fretboardHTML += `<div class="fret-marker-dot" style="left: ${leftPercent}%; top: 35%"></div>`;
            fretboardHTML += `<div class="fret-marker-dot" style="left: ${leftPercent}%; top: 65%"></div>`;
        } else {
            fretboardHTML += `<div class="fret-marker-dot" style="left: ${leftPercent}%"></div>`;
        }
    });
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
            <div class="fretboard-container">
                ${renderFretboard([])}
            </div>
        </div>
    `;

    document.getElementById('exitBtn').addEventListener('click', () => {
        state.currentScreen = 'menu';
        renderMenu();
    });

    // Add click listeners to frets
    document.querySelectorAll('.fret').forEach(fret => {
        fret.addEventListener('click', handleSingleNoteFretClick);
    });

    // Initialize 3D rotation controls
    updateFretboardRotation();
    initRotationControls();
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
            <div class="fretboard-container">
                ${renderFretboard(state.foundPositions)}
            </div>
        </div>
    `;

    document.getElementById('exitBtn').addEventListener('click', () => {
        state.currentScreen = 'menu';
        renderMenu();
    });

    // Add click listeners to frets
    document.querySelectorAll('.fret').forEach(fret => {
        fret.addEventListener('click', handleFindAllFretClick);
    });

    // Initialize 3D rotation controls
    updateFretboardRotation();
    initRotationControls();
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

function handleSingleNoteFretClick(event) {
    const fret = event.currentTarget;
    const stringIndex = parseInt(fret.dataset.string);
    const fretIndex = parseInt(fret.dataset.fret);

    const clickedNote = getNoteAt(stringIndex, fretIndex);
    const frequency = getFrequencyAt(stringIndex, fretIndex);

    // Play sound
    playGuitarTone(frequency);

    if (clickedNote === state.targetNote) {
        // Correct answer
        fret.classList.add('highlighted');
        fret.innerHTML = `<div class="note-marker found">${clickedNote}</div>`;
        showFeedback('success', 'Correct! Great job!');
        state.score += 1;

        // Update score display
        document.querySelector('.score').textContent = `Score: ${state.score}`;

        // Auto-advance to next note
        setTimeout(() => {
            state.targetNote = getRandomNote();
            renderSingleNoteGame();
        }, 1500);
    } else {
        // Wrong answer
        showFeedback('error', `Incorrect. That was ${clickedNote}. Try again!`);
    }
}

function handleFindAllFretClick(event) {
    const fret = event.currentTarget;
    const stringIndex = parseInt(fret.dataset.string);
    const fretIndex = parseInt(fret.dataset.fret);

    // Check if already found
    const alreadyFound = state.foundPositions.some(
        pos => pos.string === stringIndex && pos.fret === fretIndex
    );

    if (alreadyFound) {
        return; // Already clicked this position
    }

    const clickedNote = getNoteAt(stringIndex, fretIndex);
    const frequency = getFrequencyAt(stringIndex, fretIndex);

    // Play sound
    playGuitarTone(frequency);

    if (clickedNote === state.targetNote) {
        // Correct position
        state.foundPositions.push({ string: stringIndex, fret: fretIndex });

        const remaining = state.allPositions.length - state.foundPositions.length;

        if (remaining > 0) {
            showFeedback('success', `Good! ${remaining} more to go.`);
            renderFindAllGame();
        } else {
            // All found!
            renderFindAllGame();
            showFeedback('success', `Awesome! You found all ${state.targetNote}'s!`);
            state.score += 10;

            // Auto-advance to next note
            setTimeout(() => {
                state.targetNote = getRandomNote();
                state.allPositions = getAllPositions(state.targetNote);
                state.foundPositions = [];
                renderFindAllGame();
            }, 2000);
        }
    } else {
        // Wrong position
        showFeedback('error', `Oops, that's a ${clickedNote}. Keep looking for ${state.targetNote}.`);
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
            <div class="fretboard-container">
                ${renderFretboard(state.clickedTriadPositions)}
            </div>
        </div>
    `;

    document.getElementById('exitBtn').addEventListener('click', () => {
        state.currentScreen = 'menu';
        renderMenu();
    });

    // Add click listeners to frets
    document.querySelectorAll('.fret').forEach(fret => {
        fret.addEventListener('click', handleTriadFretClick);
    });

    // Initialize 3D rotation controls
    updateFretboardRotation();
    initRotationControls();
}

function handleTriadFretClick(event) {
    const fret = event.currentTarget;
    const stringIndex = parseInt(fret.dataset.string);
    const fretIndex = parseInt(fret.dataset.fret);

    const clickedNote = getNoteAt(stringIndex, fretIndex);
    const frequency = getFrequencyAt(stringIndex, fretIndex);

    // Play sound
    playGuitarTone(frequency);

    const triad = state.targetTriad;

    // Check if this note is part of the triad
    if (triad.notes.includes(clickedNote)) {
        // Check if we already clicked this note
        if (!state.clickedTriadNotes.includes(clickedNote)) {
            state.clickedTriadNotes.push(clickedNote);

            // Check if all notes are clicked
            if (state.clickedTriadNotes.length === 3) {
                // All notes found!
                state.clickedTriadPositions.push({ string: stringIndex, fret: fretIndex });
                showFeedback('success', 'Perfect! All notes found!');
                state.score += 1;

                // Show the completed state
                renderTriadsGame();

                // Auto-advance to next triad
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
            // Note already clicked
            showFeedback('error', `You already found ${clickedNote}.`);
        }
    } else {
        // Wrong note
        showFeedback('error', `That's ${clickedNote}, not part of the ${triad.root} ${triad.typeName} triad.`);
    }
}

/* ========================================
   3D ROTATION CONTROLS
   ======================================== */
let isDragging = false;
let lastMouseX = 0;
let lastMouseY = 0;

function updateFretboardRotation() {
    const fretboard = document.querySelector('.fretboard');
    if (fretboard) {
        fretboard.style.transform = `rotateX(${state.rotation.x}deg) rotateY(${state.rotation.y}deg)`;
    }
}

function initRotationControls() {
    const fretboardContainer = document.querySelector('.fretboard-container');
    if (!fretboardContainer) return;

    fretboardContainer.addEventListener('mousedown', (e) => {
        // Don't start dragging if clicking on a fret
        if (e.target.closest('.fret')) return;

        isDragging = true;
        lastMouseX = e.clientX;
        lastMouseY = e.clientY;
        fretboardContainer.style.cursor = 'grabbing';
    });

    document.addEventListener('mousemove', (e) => {
        if (!isDragging) return;

        const deltaX = e.clientX - lastMouseX;
        const deltaY = e.clientY - lastMouseY;

        // Update rotation (Y axis for horizontal movement, X axis for vertical movement)
        state.rotation.y += deltaX * 0.5;
        state.rotation.x -= deltaY * 0.5;

        // Clamp X rotation to prevent flipping
        state.rotation.x = Math.max(-60, Math.min(80, state.rotation.x));

        updateFretboardRotation();

        lastMouseX = e.clientX;
        lastMouseY = e.clientY;
    });

    document.addEventListener('mouseup', () => {
        if (isDragging) {
            isDragging = false;
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
