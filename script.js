// List of 12 fruits
const FRUITS = [
  { name: 'apple', displayName: 'แอปเปิ้ล' },
  { name: 'banana', displayName: 'กล้วย' },
  { name: 'watermelon', displayName: 'แตงโม' },
  { name: 'grape', displayName: 'องุ่น' },
  { name: 'strawberry', displayName: 'สตรอว์เบอร์รี่' },
  { name: 'cherry', displayName: 'เชอร์รี่' },
  { name: 'pineapple', displayName: 'สับปะรด' },
  { name: 'peach', displayName: 'ลูกพีช' },
  { name: 'orange', displayName: 'ส้ม' },
  { name: 'lemon', displayName: 'เลมอน' },
  { name: 'avocado', displayName: 'อะโวคาโด' },
  { name: 'kiwi', displayName: 'กีวี่' }
];

// Game State Variables
let cards = [];
let flippedCards = [];
let moves = 0;
let matches = 0;
let seconds = 0;
let timerInterval = null;
let previewTimeout = null;
let previewInterval = null;
let gameStarted = false;
let isBoardLocked = false;
let soundEnabled = true;

// Web Audio API Context
let audioCtx = null;

// DOM Elements
const gameBoard = document.getElementById('game-board');
const movesCountEl = document.getElementById('moves-count');
const timerEl = document.getElementById('timer');
const bestRecordEl = document.getElementById('best-record');
const subtitleEl = document.querySelector('.game-subtitle');
const btnRestart = document.getElementById('btn-restart');
const btnSound = document.getElementById('btn-sound');
const soundIcon = document.getElementById('sound-icon');
const victoryModal = document.getElementById('victory-modal');
const modalTimeEl = document.getElementById('modal-time');
const modalMovesEl = document.getElementById('modal-moves');
const newBestBadge = document.getElementById('new-best-badge');
const btnPlayAgain = document.getElementById('btn-play-again');

// --- Sound Synthesis with Web Audio API ---

/**
 * Initializes the audio context. Resumes if suspended.
 */
function initAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
}

/**
 * Synthesizes and plays game sound effects
 * @param {string} type - The sound effect to play ('flip', 'match', 'mismatch', 'victory')
 */
function playSound(type) {
  if (!soundEnabled) return;
  
  try {
    initAudio();
    if (!audioCtx) return;
    
    const now = audioCtx.currentTime;
    
    if (type === 'flip') {
      // Quick satisfying slide/pop
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      
      osc.type = 'sine';
      osc.frequency.setValueAtTime(150, now);
      osc.frequency.exponentialRampToValueAtTime(450, now + 0.08);
      
      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
      
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      
      osc.start(now);
      osc.stop(now + 0.08);
      
    } else if (type === 'match') {
      // High-pitched bright double chime (Chime-like C5 & E5)
      const playTone = (freq, startOffset, volume) => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, now + startOffset);
        
        gain.gain.setValueAtTime(volume, now + startOffset);
        gain.gain.exponentialRampToValueAtTime(0.001, now + startOffset + 0.35);
        
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(now + startOffset);
        osc.stop(now + startOffset + 0.35);
      };
      
      playTone(523.25, 0, 0.25); // C5
      playTone(659.25, 0.08, 0.2); // E5
      
    } else if (type === 'mismatch') {
      // Low buzz double beep
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(200, now);
      osc.frequency.setValueAtTime(140, now + 0.12);
      
      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
      
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      
      osc.start(now);
      osc.stop(now + 0.25);
      
    } else if (type === 'victory') {
      // Ascending major chord arpeggio
      const chord = [261.63, 329.63, 392.00, 523.25, 659.25, 783.99, 1046.50]; // C4, E4, G4, C5, E5, G5, C6
      
      chord.forEach((freq, idx) => {
        const offset = idx * 0.1;
        const duration = 0.5;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + offset);
        
        gain.gain.setValueAtTime(0.15, now + offset);
        gain.gain.exponentialRampToValueAtTime(0.001, now + offset + duration);
        
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        
        osc.start(now + offset);
        osc.stop(now + offset + duration);
      });
    }
  } catch (error) {
    console.warn("AudioContext playback failed", error);
  }
}

// --- Game Logic ---

/**
 * Shuffles elements in an array using the Fisher-Yates algorithm
 * @param {Array} array 
 */
function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

/**
 * Formats time from seconds into MM:SS format
 * @param {number} totalSeconds 
 */
function formatTime(totalSeconds) {
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Starts the timer interval
 */
function startTimer() {
  seconds = 0;
  timerEl.innerText = formatTime(seconds);
  timerInterval = setInterval(() => {
    seconds++;
    timerEl.innerText = formatTime(seconds);
  }, 1000);
}

/**
 * Stops the timer interval
 */
function stopTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
}

/**
 * Loads and displays the best record from LocalStorage
 */
function loadBestRecord() {
  const record = localStorage.getItem('fruit_match_best_record');
  if (record) {
    const data = JSON.parse(record);
    bestRecordEl.innerText = `${data.moves} ครั้ง (${formatTime(data.seconds)})`;
  } else {
    bestRecordEl.innerText = '-';
  }
}

/**
 * Saves and updates the best record in LocalStorage
 * @returns {boolean} True if a new best record was achieved
 */
function updateBestRecord() {
  const record = localStorage.getItem('fruit_match_best_record');
  const currentRecord = { moves: moves, seconds: seconds };
  
  if (!record) {
    localStorage.setItem('fruit_match_best_record', JSON.stringify(currentRecord));
    return true;
  }
  
  const savedRecord = JSON.parse(record);
  
  // Rule 1: Lower moves is better
  // Rule 2: If moves are identical, faster time (seconds) is better
  if (moves < savedRecord.moves || (moves === savedRecord.moves && seconds < savedRecord.seconds)) {
    localStorage.setItem('fruit_match_best_record', JSON.stringify(currentRecord));
    return true;
  }
  
  return false;
}

/**
 * Initializes and starts a new game session
 */
function initGame() {
  // Reset States
  stopTimer();
  if (previewTimeout) clearTimeout(previewTimeout);
  if (previewInterval) clearInterval(previewInterval);
  
  flippedCards = [];
  moves = 0;
  matches = 0;
  seconds = 0;
  gameStarted = false;
  isBoardLocked = true; // Lock board during preview
  
  movesCountEl.innerText = moves;
  timerEl.innerText = formatTime(seconds);
  victoryModal.classList.remove('show');
  newBestBadge.classList.add('hide');
  
  loadBestRecord();
  
  // Duplicate fruit items to make 24 cards (12 pairs)
  const doubleFruits = [...FRUITS, ...FRUITS];
  
  // Shuffle cards
  cards = shuffle(doubleFruits.map((item, idx) => ({
    id: idx,
    name: item.name,
    displayName: item.displayName
  })));
  
  // Clear and Build Board HTML
  gameBoard.innerHTML = '';
  cards.forEach((card, index) => {
    const cardElement = createCardElement(card, index);
    gameBoard.appendChild(cardElement);
  });
  
  // Start Preview logic: Reveal all cards
  const cardInners = gameBoard.querySelectorAll('.card-inner');
  cardInners.forEach(inner => inner.classList.add('flipped'));
  
  const originalSubtitle = "จับคู่การ์ดผลไม้การ์ตูนสุดน่ารักเพื่อชนะเกม!";
  let countdown = 3;
  subtitleEl.innerHTML = `เตรียมจำตำแหน่งการ์ด! ⏱️ เริ่มเล่นใน <strong>${countdown}</strong>`;
  
  previewInterval = setInterval(() => {
    countdown--;
    if (countdown > 0) {
      subtitleEl.innerHTML = `เตรียมจำตำแหน่งการ์ด! ⏱️ เริ่มเล่นใน <strong>${countdown}</strong>`;
    } else {
      clearInterval(previewInterval);
    }
  }, 650);
  
  previewTimeout = setTimeout(() => {
    cardInners.forEach(inner => inner.classList.remove('flipped'));
    subtitleEl.innerText = originalSubtitle;
    isBoardLocked = false;
  }, 1950);
}

/**
 * Creates the DOM element for a card
 * @param {object} card 
 * @param {number} index 
 */
function createCardElement(card, index) {
  const container = document.createElement('div');
  container.className = 'card-container';
  container.setAttribute('data-index', index);
  container.setAttribute('data-name', card.name);
  
  const inner = document.createElement('div');
  inner.className = 'card-inner';
  
  const back = document.createElement('div');
  back.className = 'card-face card-back';
  
  const front = document.createElement('div');
  front.className = 'card-face card-front';
  
  const img = document.createElement('img');
  img.src = `assets/${card.name}.jpg`;
  img.className = 'fruit-image';
  img.alt = card.displayName;
  img.loading = 'lazy';
  
  front.appendChild(img);
  inner.appendChild(back);
  inner.appendChild(front);
  container.appendChild(inner);
  
  // Add Click event listener
  container.addEventListener('click', handleCardClick);
  
  return container;
}

/**
 * Handles card click events
 */
function handleCardClick(event) {
  const clickedCardContainer = event.currentTarget;
  const inner = clickedCardContainer.querySelector('.card-inner');
  
  // Guard checks
  if (isBoardLocked) return;
  if (inner.classList.contains('flipped') || inner.classList.contains('matched')) return;
  if (flippedCards.length >= 2) return;
  
  // Initialize AudioContext on first user interaction if needed
  initAudio();
  
  // Start Timer on first click
  if (!gameStarted) {
    gameStarted = true;
    startTimer();
  }
  
  // Flip card
  playSound('flip');
  inner.classList.add('flipped');
  flippedCards.push(clickedCardContainer);
  
  // If we have flipped 2 cards, check matching
  if (flippedCards.length === 2) {
    checkMatch();
  }
}

/**
 * Checks if the two flipped cards match
 */
function checkMatch() {
  isBoardLocked = true;
  moves++;
  movesCountEl.innerText = moves;
  
  const card1 = flippedCards[0];
  const card2 = flippedCards[1];
  
  const name1 = card1.getAttribute('data-name');
  const name2 = card2.getAttribute('data-name');
  
  if (name1 === name2) {
    // MATCH FOUND
    setTimeout(() => {
      card1.querySelector('.card-inner').classList.add('matched');
      card2.querySelector('.card-inner').classList.add('matched');
      playSound('match');
      
      flippedCards = [];
      isBoardLocked = false;
      
      matches++;
      if (matches === FRUITS.length) {
        handleVictory();
      }
    }, 400);
  } else {
    // MISMATCH
    setTimeout(() => {
      card1.querySelector('.card-inner').classList.add('mismatch');
      card2.querySelector('.card-inner').classList.add('mismatch');
      playSound('mismatch');
    }, 450);
    
    // Flip them back after 1.2 seconds
    setTimeout(() => {
      card1.querySelector('.card-inner').classList.remove('flipped', 'mismatch');
      card2.querySelector('.card-inner').classList.remove('flipped', 'mismatch');
      flippedCards = [];
      isBoardLocked = false;
    }, 1200);
  }
}

/**
 * Handles victory condition when all cards match
 */
function handleVictory() {
  stopTimer();
  
  const isNewBest = updateBestRecord();
  loadBestRecord();
  
  // Update Modal Statistics
  modalTimeEl.innerText = formatTime(seconds);
  modalMovesEl.innerText = moves;
  
  if (isNewBest) {
    newBestBadge.classList.remove('hide');
  }
  
  // Show Modal
  setTimeout(() => {
    playSound('victory');
    victoryModal.classList.add('show');
  }, 600);
}

/**
 * Toggles sound effects state
 */
function toggleSound() {
  soundEnabled = !soundEnabled;
  localStorage.setItem('fruit_match_sound_enabled', soundEnabled);
  updateSoundButtonUI();
}

/**
 * Updates the speaker icon and label based on sound settings
 */
function updateSoundButtonUI() {
  if (soundEnabled) {
    soundIcon.innerText = '🔊';
    btnSound.innerHTML = `<span id="sound-icon">🔊</span> ปิดเสียง`;
    btnSound.classList.remove('btn-secondary');
    btnSound.classList.add('btn-primary');
    // Ensure audio can resume
    initAudio();
  } else {
    soundIcon.innerText = '🔇';
    btnSound.innerHTML = `<span id="sound-icon">🔇</span> เปิดเสียง`;
    btnSound.classList.remove('btn-primary');
    btnSound.classList.add('btn-secondary');
  }
}

// --- Setup Event Listeners & Initialize ---

// Load saved sound preference
const savedSoundPref = localStorage.getItem('fruit_match_sound_enabled');
if (savedSoundPref !== null) {
  soundEnabled = savedSoundPref === 'true';
}

updateSoundButtonUI();
btnSound.addEventListener('click', toggleSound);
btnRestart.addEventListener('click', initGame);
btnPlayAgain.addEventListener('click', initGame);

// Start the game board
initGame();
