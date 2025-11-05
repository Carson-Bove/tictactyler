// client.js - Rewritten for server-controlled turn management

const socket = io('http://localhost:3000'); // Connect to your Node.js server
const cells = document.querySelectorAll('.cell');
const statusDisplay = document.querySelector('h1');
const resetButton = document.getElementById('reset-button'); // Assumes you added this button

// --- Game State ---
let playerRole = null; // 'X' or 'O'
let boardState = Array(9).fill('');
let gameActive = false;
let currentTurn = 'X'; // Should always match the server's tracking

// --- Winning Conditions (Must be defined on client for win check) ---
const winningConditions = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8], // Rows
    [0, 3, 6], [1, 4, 7], [2, 5, 8], // Columns
    [0, 4, 8], [2, 4, 6]  // Diagonals
];


// --- Socket Listeners ---

socket.on('player-role', (role) => {
    playerRole = role;
    statusDisplay.textContent = `You are Player ${playerRole}. Waiting for opponent...`;
});

socket.on('start-game', (data) => {
    gameActive = true;
    currentTurn = data.turn; // Should be 'X'
    statusDisplay.textContent = `Game Start! It is ${currentTurn}'s turn.`;
});

// IMPORTANT: This handles all move updates, whether from you or opponent
socket.on('move-made', (data) => {
    // 1. Update board state (Only if the cell is still empty/valid)
    if (boardState[data.index] === '') {
        boardState[data.index] = data.player;
        cells[data.index].textContent = data.player;
    }

    // 2. Update turn based on server's NEXT turn instruction
    currentTurn = data.nextTurn; 
    
    // 3. Check for win/draw after the move is processed
    const isOver = checkWin(data.player); 

    if (!isOver) {
        statusDisplay.textContent = `It is Player ${currentTurn}'s turn.`;
    }
});

socket.on('game-finished', (data) => {
    gameActive = false;
    if (data.winner === 'Draw') {
        statusDisplay.textContent = `Game Over! It's a Draw!`;
    } else {
        statusDisplay.textContent = `Game Over! Player ${data.winner} Wins!`;
    }
});

socket.on('game-reset', (data) => {
    resetGame();
    currentTurn = data.turn; // Should be 'X'
    gameActive = true;
    statusDisplay.textContent = `New Game! It is Player ${currentTurn}'s turn.`;
});

socket.on('player-disconnected', (message) => {
    gameActive = false;
    statusDisplay.textContent = message;
    resetGame();
});


// --- Local Click Handler (Request Move) ---

cells.forEach(cell => {
    cell.addEventListener('click', handleCellClick);
});

function handleCellClick(event) {
    const clickedCellIndex = event.target.getAttribute('data-index');

    // 1. Check local turn and game state BEFORE requesting move
    if (!gameActive || playerRole !== currentTurn || boardState[clickedCellIndex] !== '') {
        // If not your turn, game not active, or cell is taken, do nothing.
        return;
    }
    
    // 2. Request the move from the server (NO local board update yet)
    // The server will validate and broadcast the 'move-made' event back to us.
    socket.emit('make-move', { 
        index: clickedCellIndex, 
        player: playerRole 
    });
}


// --- Game Logic Functions ---

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
        socket.emit('game-over', { winner: winner });
        return true; 
    }
    
    return false;
}

function resetGame() {
    boardState.fill('');
    cells.forEach(cell => {
        cell.textContent = '';
        cell.classList.remove('winner');
    });
    // gameActive will be set to true by the 'game-reset' event from the server
}

// --- Reset Button Handler ---
resetButton.addEventListener('click', () => {
    // Only Player X initiates the reset request for simplicity
    if (playerRole === 'X') { 
        socket.emit('request-reset');
    } else {
        alert("Only Player X can initiate the reset. Ask your opponent to click 'Play Again'.");
    }
});