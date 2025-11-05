// server.js - FINAL CORRECTED VERSION (Targeted Role Assignment)

const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require('socket.io');

// Configure Socket.IO
const io = new Server(server, {
    cors: {
        origin: "*", 
        methods: ["GET", "POST"]
    }
});

const port = process.env.PORT || 3000;

// Serve static files
app.use(express.static(__dirname)); 

// --- CENTRAL GAME STATE MANAGEMENT ---
let games = {};     
let waitingPlayer = null; 
let nextGameId = 1;

io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);

    // === 1. JOIN GAME REQUEST ===
    socket.on('request-join', (data) => {
        const playerName = data.name || 'Guest';
        let roomId;

        if (waitingPlayer) {
            // Player 2 (O) found: Start the game
            roomId = waitingPlayer.roomId;
            const game = games[roomId];
            
            game.playerO = socket.id;
            game.names.O = playerName;
            
            socket.join(roomId);
            
            // ***** CRITICAL FIX: ACTIVATE THE GAME STATE *****
            game.state = 'active'; 

            // --- Send targeted 'game-start' messages ---
            
            const baseGameData = {
                playerXName: game.names.X, 
                playerOName: game.names.O,
                currentTurn: game.turn,
                roomId: roomId
            };
            
            // 1. Send specific data to Player O (the connecting socket)
            socket.emit('game-start', { ...baseGameData, yourRole: 'O' });
            
            // 2. Send specific data to Player X (the waiting socket)
            io.to(waitingPlayer.socketId).emit('game-start', { ...baseGameData, yourRole: 'X' });

            waitingPlayer = null; // Clear waiting list AFTER sending messages

        } else {
            // Player 1 (X) found: Create a new room and wait
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

    // === 2. MOVE HANDLING (NO CHANGE) ===
    socket.on('make-move', (data) => {
        const { index, roomId, player } = data;
        const game = games[roomId];
        
        // Validation Checks: Ensures game is active and it's the correct turn
        if (!game || game.state !== 'active' || player !== game.turn || game.board[index] !== '') {
            return; 
        }

        // Process Move and Update Turn
        game.board[index] = player;
        const nextTurn = (player === 'X' ? 'O' : 'X');
        game.turn = nextTurn;

        // Broadcast move to ONLY the players in this room
        io.to(roomId).emit('move-made', { 
            index: index, 
            player: player,
            nextTurn: nextTurn 
        });
    });

    // === 3. GAME OVER & RESET (NO CHANGE) ===
    socket.on('game-over', (data) => {
        const game = games[data.roomId];
        if (game) {
            game.state = 'finished';
            io.to(data.roomId).emit('game-finished', data); 
        }
    });
    
    socket.on('request-reset', (data) => {
    const game = games[data.roomId];
    if (game && game.playerX === socket.id) { // Only allow Player X (the initiator)
        game.board = Array(9).fill('');
        game.turn = 'X';
        game.state = 'active'; // Critical: Set state back to active
        
        // Broadcast the reset signal
        io.to(data.roomId).emit('game-reset', { turn: 'X' });
        console.log(`Game ${data.roomId} reset by Player X.`);
    }
});

    // === 4. DISCONNECTION HANDLING (NO CHANGE) ===
    socket.on('disconnect', () => {
        for (const roomId in games) {
            const game = games[roomId];
            if (game.playerX === socket.id || game.playerO === socket.id) {
                const disconnectedPlayerName = (game.playerX === socket.id) ? game.names.X : game.names.O;
                delete games[roomId];
                io.to(roomId).emit('player-disconnected', `${disconnectedPlayerName}'s opponent disconnected. Game ended.`);
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