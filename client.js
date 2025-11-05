// client.js - COMPLETE AND CORRECTED VERSION

const socket = io();
const cells = document.querySelectorAll('.cell');

// --- Element Selections ---
const lobby = document.getElementById('lobby');
const nameInput = document.getElementById('name-input');
const joinButton = document.getElementById('join-game-button');
const gameWrapper = document.querySelector('.game-wrapper');
const playerXNameDisplay = document.getElementById('player-x-name');
const playerONameDisplay = document.getElementById('player-o-name');
const statusDisplay = document.querySelector('h1');
const resetButton = document.getElementById('reset-button');

// --- Game State ---
let playerRole = null;
let playerName = null;
let opponentName = null;
let roomId = null; 
let boardState = Array(9).fill('');
let gameActive = false;
let currentTurn = 'X'; 

// --- RESTORED: Winning Conditions ---
const winningConditions = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8], // Rows
    [0, 3, 6], [1, 4, 7], [2, 5, 8], // Columns
    [0, 4, 8], [2, 4, 6]  // Diagonals
];


// =========================================================
//                  LOBBY & JOIN LOGIC
// =========================================================

// RESTORED: Attach event listeners to cells
cells.forEach(cell => {
    cell.addEventListener('click', handleCellClick);
});

// RESTORED: Attach listener to reset button
resetButton.addEventListener('click', () => {
    if (playerRole === 'X' && roomId) { 
        socket.emit('request-reset', { roomId: roomId });
    } else {
        alert("Only Player X can initiate the reset. Ask your opponent to click 'Play Again'.");
    }
});


joinButton.addEventListener('click', () => {
    const name = nameInput.value.trim();
    if (name) {
        playerName = name;
        lobby.style.display = 'none';
        gameWrapper.style.display = 'flex'; // Use flex to center game wrapper
        
        socket.emit('request-join', { name: playerName });
        statusDisplay.textContent = `Finding game for ${playerName}...`;
    } else {
        alert("Please enter a name to join.");
    }
});


// =========================================================
//                 SOCKET LISTENERS (ROOM-BASED)
// =========================================================

// Player X connects and waits
socket.on('wait-for-opponent', (data) => {
    playerRole = data.yourRole;
    roomId = data.roomId;
    playerXNameDisplay.textContent = `You (X): ${data.yourName}`;
    playerONameDisplay.textContent = `O: Waiting...`;
    statusDisplay.textContent = `Waiting for opponent...`;
});


// Game starts (sent to both X and O)
socket.on('game-start', (data) => {
    gameActive = true;
    roomId = data.roomId;
    currentTurn = data.currentTurn;
    
    // Player O receives their role here
    if (data.yourRole) { 
        playerRole = data.yourRole;
    }
    
    // Determine opponent's name and update display
    playerXNameDisplay.textContent = `${data.playerXName} (X)`;
    playerONameDisplay.textContent = `${data.playerOName} (O)`;
    
    // FIX: Correctly set opponentName for status updates
    if (playerRole === 'X') {
        opponentName = data.playerOName;
    } else { // If playerRole is O
        opponentName = data.playerXName;
    }

    const turnName = (currentTurn === playerRole) ? 'Your' : opponentName + "'s";
    statusDisplay.textContent = `Game Start! It is ${turnName} turn (${currentTurn}).`;
});


// Move Handling
socket.on('move-made', (data) => {
    if (boardState[data.index] === '') {
        boardState[data.index] = data.player;
        cells[data.index].textContent = data.player;
    }

    currentTurn = data.nextTurn; 
    const isOver = checkWin(data.player); 

    if (!isOver) {
        // FIX: Use the correct logic for name display based on whose turn it is
        const turnName = (currentTurn === playerRole) ? 'Your' : opponentName + "'s";
        statusDisplay.textContent = `It is ${turnName} turn (${currentTurn}).`;
    }
});

// FIX: Complete game-finished logic
socket.on('game-finished', (data) => {
    gameActive = false;
    if (data.winner === 'Draw') {
        statusDisplay.textContent = `Game Over! It's a Draw!`;
    } else {
        // Use names for the final victory message
        const winnerName = (data.winner === playerRole) ? playerName : opponentName;
        statusDisplay.textContent = `Game Over! ${winnerName} (${data.winner}) Wins!`;
    }
});

// FIX: Complete game-reset logic
socket.on('game-reset', (data) => {
    resetGame();
    currentTurn = data.turn; // Should be 'X'
    gameActive = true;
    
    const turnName = (currentTurn === playerRole) ? 'Your' : opponentName + "'s";
    statusDisplay.textContent = `New Game! It is ${turnName} turn (${currentTurn}).`;
});

socket.on('player-disconnected', (message) => {
    gameActive = false;
    statusDisplay.textContent = message;
    resetGame();
});


// =========================================================
//                 GAME LOGIC FUNCTIONS
// =========================================================

function handleCellClick(event) {
    const clickedCellIndex = event.target.getAttribute('data-index');

    if (!gameActive || playerRole !== currentTurn || boardState[clickedCellIndex] !== '' || !roomId) {
        return;
    }
    
    socket.emit('make-move', { 
        index: clickedCellIndex, 
        player: playerRole, 
        roomId: roomId 
    });
}

// RESTORED: checkWin function
function checkWin(lastPlayer) {
    let roundWon = false;
    let boardFull = !boardState.includes('');

    for (let i = 0; i < winningConditions.length; i++) {
        const [a, b, c] = winningConditions[i];

        if (boardState[a] === lastPlayer && boardState[a] === boardState[b] && boardState[a] === boardState[c]) {
            roundWon = true;
            // Highlight the winning cells
            cells[a].classList.add('winner');
            cells[b].classList.add('winner');
            cells[c].classList.add('winner');
            break; 
        }
    }

    if (roundWon || boardFull) {
        const winner = roundWon ? lastPlayer : 'Draw';
        socket.emit('game-over', { winner: winner, roomId: roomId });
        return true; 
    }
    
    return false;
}

// RESTORED: resetGame function
function resetGame() {
    boardState.fill('');
    cells.forEach(cell => {
        cell.textContent = '';
        cell.classList.remove('winner');
    });
}