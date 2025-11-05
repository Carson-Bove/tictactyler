// client.js - REVISED FOR ROOMS AND NAMES

const socket = io();
const cells = document.querySelectorAll('.cell');
// New elements
const lobby = document.getElementById('lobby');
const nameInput = document.getElementById('name-input');
const joinButton = document.getElementById('join-game-button');
const gameWrapper = document.querySelector('.game-wrapper'); // New element to hide/show game
const playerXNameDisplay = document.getElementById('player-x-name');
const playerONameDisplay = document.getElementById('player-o-name');

// Existing elements
const statusDisplay = document.querySelector('h1');
const resetButton = document.getElementById('reset-button');

// --- Game State ---
let playerRole = null; // 'X' or 'O'
let playerName = null;
let opponentName = null;
let roomId = null; // CRITICAL: This links the client to the game on the server
let boardState = Array(9).fill('');
let gameActive = false;
let currentTurn = 'X'; 
const winningConditions = [ /* ... (existing winning conditions array) ... */ ];


// --- LOBBY/JOIN GAME LOGIC ---

joinButton.addEventListener('click', () => {
    const name = nameInput.value.trim();
    if (name) {
        playerName = name;
        lobby.style.display = 'none'; // Hide the lobby
        gameWrapper.style.display = 'block'; // Show the game content
        
        // Send the player's name and request to join/find a game
        socket.emit('request-join', { name: playerName });
        statusDisplay.textContent = `Finding game for ${playerName}...`;
    } else {
        alert("Please enter a name to join.");
    }
});


// --- SOCKET LISTENERS (ROOM-BASED) ---

// Player X connects and waits
socket.on('wait-for-opponent', (data) => {
    playerRole = data.yourRole; // X
    roomId = data.roomId;
    playerXNameDisplay.textContent = `You (X): ${data.yourName}`;
    playerONameDisplay.textContent = `O: Waiting...`;
    statusDisplay.textContent = `Waiting for an opponent to join Game ${roomId}...`;
});


// Game starts (sent to both X and O)
socket.on('game-start', (data) => {
    gameActive = true;
    roomId = data.roomId;
    currentTurn = data.currentTurn;
    
    // Set names and roles based on the server's data
    if (data.yourRole) { // This will only be sent to Player O
        playerRole = data.yourRole;
    }
    
    // Determine which name is yours and which is your opponent's
    const opponentRole = (playerRole === 'X' ? 'O' : 'X');
    
    playerXNameDisplay.textContent = `${data.playerXName} (X)`;
    playerONameDisplay.textContent = `${data.playerOName} (O)`;
    
    if (playerRole === 'X') {
        opponentName = data.playerOName;
    } else {
        opponentName = data.playerXName;
    }

    statusDisplay.textContent = `Game Start! ${currentTurn}'s turn. Opponent: ${opponentName}`;
});


// Updated Move Handling: Now requires roomId
socket.on('move-made', (data) => {
    // ... (rest of the move-made logic is the same)
    if (boardState[data.index] === '') {
        boardState[data.index] = data.player;
        cells[data.index].textContent = data.player;
    }

    currentTurn = data.nextTurn; 
    const isOver = checkWin(data.player); 

    if (!isOver) {
        const turnName = (currentTurn === playerRole) ? 'Your' : opponentName + "'s";
        statusDisplay.textContent = `It is ${turnName} turn (${currentTurn}).`;
    }
});

// ... (game-finished, game-reset, player-disconnected logic remains similar, 
// but ensure they reference the updated display elements and state variables)


// --- LOCAL CLICK HANDLER (Sends Move to Server) ---

function handleCellClick(event) {
    const clickedCellIndex = event.target.getAttribute('data-index');

    // CRITICAL: Check for roomId now
    if (!gameActive || playerRole !== currentTurn || boardState[clickedCellIndex] !== '' || !roomId) {
        return;
    }
    
    // Send the roomId with the move
    socket.emit('make-move', { 
        index: clickedCellIndex, 
        player: playerRole, 
        roomId: roomId 
    });
}


// --- GAME LOGIC FUNCTIONS (Ensure they use roomId in emits) ---

function checkWin(lastPlayer) {
    // ... (checkWin logic remains the same)

    if (roundWon || boardFull) {
        const winner = roundWon ? lastPlayer : 'Draw';
        // Send roomId with game-over message
        socket.emit('game-over', { winner: winner, roomId: roomId });
        return true; 
    }
    
    return false;
}

resetButton.addEventListener('click', () => {
    if (playerRole === 'X' && roomId) { 
        // Send roomId with reset request
        socket.emit('request-reset', { roomId: roomId });
    } else {
        alert("Only Player X can initiate the reset. Ask your opponent to click 'Play Again'.");
    }
});