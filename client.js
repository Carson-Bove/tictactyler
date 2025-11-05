// client.js - FINAL CORRECTED VERSION (Simplified Role Assignment)

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

// --- Winning Conditions ---
const winningConditions = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8], 
    [0, 3, 6], [1, 4, 7], [2, 5, 8], 
    [0, 4, 8], [2, 4, 6]
];

// =========================================================
//              CRITICAL FIX: ATTACH LISTENERS
// =========================================================
cells.forEach(cell => {
    cell.addEventListener('click', handleCellClick);
});

// --- LOBBY/JOIN GAME LOGIC ---
joinButton.addEventListener('click', () => {
    const name = nameInput.value.trim();
    if (name) {
        playerName = name;
        lobby.style.display = 'none';
        gameWrapper.style.display = 'flex'; // Show game wrapper
        
        socket.emit('request-join', { name: playerName });
        statusDisplay.textContent = `Finding game for ${playerName}...`;
    } else {
        alert("Please enter a name to join.");
    }
});


// =========================================================
//                 SOCKET LISTENERS
// =========================================================

socket.on('wait-for-opponent', (data) => {
    playerRole = data.yourRole;
    roomId = data.roomId;
    // We already know our name from the join process
    playerXNameDisplay.textContent = `${playerName} (X)`;
    playerONameDisplay.textContent = `O: Waiting for Opponent...`;
    statusDisplay.textContent = `Waiting for opponent...`;
});

socket.on('game-start', (data) => {
    gameActive = true;
    roomId = data.roomId;
    currentTurn = data.currentTurn;
    
    // CRITICAL FIX: Set playerRole directly from the server's specific data
    playerRole = data.yourRole; 
    
    // Update displays
    playerXNameDisplay.textContent = `${data.playerXName} (X)`;
    playerONameDisplay.textContent = `${data.playerOName} (O)`;
    
    // Determine opponent name
    opponentName = (playerRole === 'X') ? data.playerOName : data.playerXName;

    const turnName = (currentTurn === playerRole) ? 'Your' : opponentName + "'s";
    statusDisplay.textContent = `Game Start! It is ${turnName} turn (${currentTurn}).`;
});


socket.on('move-made', (data) => {
    // Optional: Add the logs back for future debugging if needed
    // console.log(`P_ROLE: ${playerRole}, C_TURN: ${currentTurn}, ACTIVE: ${gameActive}, ROOM: ${roomId}`);
    
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
socket.on('game-finished', (data) => {
    // CRITICAL: Stop the game immediately
    gameActive = false; 
    
    // Clear any temporary turn status display
    statusDisplay.textContent = ''; 

    if (data.winner === 'Draw') {
        statusDisplay.textContent = `Game Over! It's a Draw!`;
    } else {
        const winnerName = (data.winner === playerRole) ? playerName : opponentName;
        statusDisplay.textContent = `Game Over! ${winnerName} (${data.winner}) Wins!`;
    }
    
    // The cells will still show the winner's move, but the game is inactive.
});

socket.on('game-reset', (data) => {
    // Call the function that clears the board visuals and local state
    resetGame(); 
    
    currentTurn = data.turn; // Should be 'X'
    // CRITICAL: Set gameActive back to true
    gameActive = true; 
    
    const turnName = (currentTurn === playerRole) ? 'Your' : opponentName + "'s";
    statusDisplay.textContent = `New Game! It is ${turnName} turn (${currentTurn}).`;
});
// ... (Rest of game-finished, game-reset, player-disconnected logic remains the same)

// =========================================================
//                 GAME LOGIC FUNCTIONS
// =========================================================

function handleCellClick(event) {
    const clickedCellIndex = event.target.getAttribute('data-index');

    if (!gameActive || playerRole !== currentTurn || boardState[clickedCellIndex] !== '' || !roomId) {
        // console.log("MOVE BLOCKED by validation check."); // Optional log
        return;
    }
    
    // Send the move to the server
    socket.emit('make-move', { 
        index: clickedCellIndex, 
        player: playerRole, 
        roomId: roomId 
    });
}

function checkWin(lastPlayer) {
    let roundWon = false;
    let boardFull = !boardState.includes('');

    for (let i = 0; i < winningConditions.length; i++) {
        const [a, b, c] = winningConditions[i];

        if (boardState[a] === lastPlayer && boardState[a] === boardState[b] && boardState[a] === boardState[c]) {
            roundWon = true;
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

resetButton.addEventListener('click', () => {
    // Only Player X can request a reset from the server
    if (playerRole === 'X' && roomId) { 
        socket.emit('request-reset', { roomId: roomId });
    } else {
        alert("Only Player X can initiate the reset.");
    }
});


function resetGame() {
    boardState.fill('');
    cells.forEach(cell => {
        cell.textContent = '';
        cell.classList.remove('winner');
    });
}