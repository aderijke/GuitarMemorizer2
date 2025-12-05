# 🎸 Guitar Fretboard Memorizer

An interactive web application to help guitarists master the fretboard through gamified learning. Practice finding notes, chords, and build muscle memory with both 2D and immersive 3D views.

![Guitar Fretboard Memorizer](https://img.shields.io/badge/Status-Active-success)
![License](https://img.shields.io/badge/License-MIT-blue)

## ✨ Features

### 🎮 Game Modes

- **Single Note Mode**: Find random notes on the fretboard to build muscle memory
- **Find All Instances**: Locate every position of a specific note across the entire neck
- **Chord Triads**: Click all three notes of a chord triad (Major, Minor, Diminished, Augmented) to score points

### 🎨 View Modes

- **3D View**: Immersive 3D guitar model with interactive controls
  - Rotate the guitar (toggle on/off)
  - Pan with Shift + drag
  - Zoom in/out
  - Reset camera button
  - Debug mode for visualizing hitboxes
- **2D View**: Traditional flat fretboard view for quick reference

### ⚙️ Customizable Settings

- **Time Limit**: Set a time limit (1-10 seconds) to add challenge
- **Disabled Frets**: Practice with specific frets disabled (e.g., focus on open strings or higher frets)
- **Triad Types**: Choose which chord types to practice (Major, Minor, Diminished, Augmented)
- **View Mode**: Switch between 2D and 3D views

### 🎵 Audio Feedback

- Real-time audio playback when clicking frets
- Accurate guitar tone generation using Web Audio API
- Standard guitar tuning (E-A-D-G-B-E)

## 🚀 Getting Started

### Prerequisites

- A modern web browser with ES6 module support
- No build tools or installation required!

### Installation

1. Clone the repository:
```bash
git clone https://github.com/aderijke/GuitarMemorizer2.git
cd GuitarMemorizer2
```

2. Open `index.html` in your web browser:
   - Simply double-click the file, or
   - Use a local web server (recommended):
   ```bash
   # Using Python 3
   python -m http.server 8000
   
   # Using Node.js (with http-server)
   npx http-server
   ```

3. Navigate to `http://localhost:8000` in your browser

## 🎯 How to Use

### Basic Gameplay

1. **Select a Game Mode**: Choose from Single Note, Find All Instances, or Chord Triads
2. **Configure Settings**: Adjust time limit, disabled frets, and view mode as needed
3. **Start Playing**: Click on the fretboard to find the target note(s)
4. **Track Progress**: Monitor your score and errors in real-time

### 3D View Controls

- **Rotation**: Toggle the rotation control on/off, then drag to rotate the guitar
- **Pan**: Hold Shift and drag to move the camera
- **Zoom**: Scroll to zoom in/out
- **Reset Camera**: Click the "↻ Reset" button to return to default view
- **Debug Mode**: Enable to see hitboxes and fret information

### Settings Explained

- **Time Limit**: When enabled, you have a limited time to find notes. The timer counts down and the game ends when time runs out.
- **Disabled Frets**: When enabled, you can specify a range of frets to disable. This is useful for focusing practice on specific areas of the neck.
- **View Mode**: Switch between 2D (traditional) and 3D (immersive) views. 3D view requires WebGL support.

## 🛠️ Technologies Used

- **Three.js** (v0.160.0): 3D graphics and rendering
- **Web Audio API**: Real-time audio synthesis
- **Vanilla JavaScript (ES6 Modules)**: No frameworks, pure JavaScript
- **CSS3**: Modern styling with glassmorphism effects
- **HTML5**: Semantic markup

## 📁 Project Structure

```
GuitarMemorizer2/
├── index.html          # Main HTML file
├── script.js           # Application logic and game mechanics
├── styles.css          # Styling and animations
├── Gibson 335/        # 3D guitar model files
│   ├── *.obj          # 3D model geometry
│   ├── *.mtl          # Material definitions
│   └── Texturas/      # Texture files
└── README.md          # This file
```

## 🎨 Design Features

- **Glassmorphism UI**: Modern frosted glass effect design
- **Smooth Animations**: Fluid transitions and hover effects
- **Responsive Layout**: Works on various screen sizes
- **Dark Theme**: Easy on the eyes for extended practice sessions
- **Intuitive Controls**: Slider toggles and clear visual feedback

## 🔧 Development

### Key Components

- **State Management**: Centralized state object for game state
- **3D Rendering**: Three.js scene with OrbitControls for camera manipulation
- **Raycasting**: Precise click detection on 3D fretboard
- **Audio Synthesis**: Real-time frequency generation for guitar tones
- **Game Logic**: Score tracking, timer management, and feedback system

### Browser Compatibility

- Chrome/Edge (recommended)
- Firefox
- Safari
- Any modern browser with ES6 module and WebGL support

## 📝 License

This project is open source and available under the [MIT License](LICENSE).

## 🤝 Contributing

Contributions, issues, and feature requests are welcome! Feel free to check the [issues page](https://github.com/aderijke/GuitarMemorizer2/issues).

## 👤 Author

**Arthur de Rijke**

- GitHub: [@aderijke](https://github.com/aderijke)

## 🙏 Acknowledgments

- Three.js community for excellent 3D graphics library
- Guitar model assets (Gibson 335)
- Web Audio API documentation

---

**Happy practicing! 🎸🎵**

