// server.js - REVISED FOR ROOMS AND NAMES

const express = require('express');
// ... (rest of the initial setup)
const http = require('http');
const server = http.createServer(app);
const { Server } = require('socket.io');

// ... (other setup code)

const port = process.env.PORT || 3000;
app.use(express.static(__dirname)); 

// --- CENTRAL GAME STATE ---
let games = {};     // Holds all active games: { roomId: { playerX: socketId, playerO: socketId, names: {X: 'Name1', O: 'Name2'}, turn: 'X', board: ['', ...], state: 'active' } }
let waitingPlayer = null; // Holds the socket.id of the player waiting for an opponent
let nextGameId = 1;

io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    // 1. New Event: Client sends its name and requests to join a game
    socket.on('request-join', (data) => {
        const playerName = data.name || 'Guest';
        let roomId;

        if (waitingPlayer) {
            // Player 2 found: Start the game with the waiting player (Player X)
            roomId = waitingPlayer.roomId;
            const game = games[roomId];
            
            // Assign Player O
            game.playerO = socket.id;
            game.names.O = playerName;
            
            // Join the room and remove the player from the waiting list
            socket.join(roomId);
            waitingPlayer = null;

            // Notify both players that the game has started
            io.to(roomId).emit('game-start', { 
                playerXName: game.names.X, 
                playerOName: game.names.O,
                yourRole: 'O',
                currentTurn: game.turn,
                roomId: roomId
            });

        } else {
            // Player 1 found: Create a new room and wait for an opponent
            roomId = 'game-' + (nextGameId++);
            socket.join(roomId);
            
            games[roomId] = {
                roomId: roomId,
                playerX: socket.id,
                playerO: null,
                names: { X: playerName, O: null },
                turn: 'X',
                board: Array(9).fill(''),
                state: 'waiting'
            };
            
            waitingPlayer = { socketId: socket.id, roomId: roomId };

            // Send initial connection data to Player X
            socket.emit('wait-for-opponent', { yourRole: 'X', roomId: roomId, yourName: playerName });
        }
    });

    // 2. Updated Event: Move Handling (Requires roomId and server game state)
    socket.on('make-move', (data) => {
        const { index, roomId, player } = data;
        const game = games[roomId];
        
        // Validation Checks
        if (!game || game.state !== 'active' || player !== game.turn) {
            return; // Ignore if game is over, doesn't exist, or not player's turn
        }
        if (game.board[index] !== '') {
            return; // Ignore if cell is already taken
        }

        // 3. Process Move and Update Turn
        game.board[index] = player;
        const nextTurn = (player === 'X' ? 'O' : 'X');
        game.turn = nextTurn;

        // Broadcast to ONLY the players in this room
        io.to(roomId).emit('move-made', { 
            index: index, 
            player: player,
            nextTurn: nextTurn 
        });

        // The client will still check for the win, but they will emit 'game-over'
    });

    // 4. Update Game Over and Reset
    socket.on('game-over', (data) => {
        const game = games[data.roomId];
        if (game) {
            game.state = 'finished';
            io.to(data.roomId).emit('game-finished', data); 
        }
    });
    
    socket.on('request-reset', (data) => {
        const game = games[data.roomId];
        if (game) {
            game.board = Array(9).fill('');
            game.turn = 'X';
            game.state = 'active';
            io.to(data.roomId).emit('game-reset', { turn: 'X' });
        }
    });

    // 5. Disconnection Handling
    socket.on('disconnect', () => {
        // Simple logic: find which game they were in and notify the other player
        for (const roomId in games) {
            const game = games[roomId];
            if (game.playerX === socket.id || game.playerO === socket.id) {
                // Remove the game from the active list
                delete games[roomId];
                io.to(roomId).emit('player-disconnected', 'Opponent disconnected. Game ended.');
                // If the disconnected player was the waiting one, clear the waiting list
                if (waitingPlayer && waitingPlayer.socketId === socket.id) {
                    waitingPlayer = null;
                }
                return;
            }
        }
    });
});

server.listen(port, () => {
    console.log(`Server running on port ${port}`);
});