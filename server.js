// server.js - FINAL STABLE VERSION (Idle System Removed)

const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require('socket.io');

const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});

const port = process.env.PORT || 3000;
app.use(express.static(__dirname)); 

// --- CENTRAL GAME STATE MANAGEMENT ---
let games = {};     
let waitingPlayer = null; 
let nextGameId = 1;


// === UNIFIED DISCONNECTION HANDLER (Handles Disconnect & Auto-Re-Queue) ===
const handlePlayerDisconnection = (socketId) => {
    
    // 1. Check active games
    for (const roomId in games) {
        const game = games[roomId];
        
        if (game.playerX === socketId || game.playerO === socketId) {
            
            let remainingPlayerId = null;
            let disconnectedName = null;
            let remainingPlayerName = null;

            // *** CRITICAL FIX: Explicitly determine who left and who remains ***
            if (game.playerX === socketId) {
                // Player X disconnected, Player O remains
                remainingPlayerId = game.playerO;
                disconnectedName = game.names.X;
                remainingPlayerName = game.names.O;
            } else {
                // Player O disconnected, Player X remains (This flow already worked)
                remainingPlayerId = game.playerX;
                disconnectedName = game.names.O;
                remainingPlayerName = game.names.X;
            }
            // *** End of CRITICAL FIX ***

            // Delete the game before re-queueing
            delete games[roomId];
            
            // Check if the game was active and the remaining player exists
            if (game.state === 'active' && remainingPlayerId) {
                // Get the remaining player's socket object
                const remainingSocket = io.sockets.sockets.get(remainingPlayerId);

                if (remainingSocket) {
                    // 1. Notify the client to reset visually
                    remainingSocket.emit('opponent-disconnected', { 
                        message: `${disconnectedName} disconnected. Re-joining queue...`,
                        name: remainingPlayerName
                    });
                    
                    // 2. The server automatically re-queues the player.
                    remainingSocket.emit('request-join', { name: remainingPlayerName });
                    
                    console.log(`Player ${remainingPlayerName} automatically re-queued by server.`);
                } else {
                    console.log(`Remaining player socket ${remainingPlayerId} not found. Could not auto-requeue.`);
                }
            }
            return; 
        }
    }
    
    // 2. Check waiting player status (if Player 1 disconnected while waiting)
    if (waitingPlayer && waitingPlayer.socketId === socketId) {
        waitingPlayer = null;
        console.log(`Waiting player ${socketId} slot cleared.`);
    }
};


io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);

    // === 1. JOIN GAME REQUEST ===
    socket.on('request-join', (data) => {
    const playerName = data.name || 'Guest';
    let roomId;

    // *** CRITICAL FIX: Check if a waitingPlayer exists AND it's NOT the same socket ***
    if (waitingPlayer && waitingPlayer.socketId !== socket.id) { 
        // Player 2 (O) found: Start the game with the waiting player (Player X)
        roomId = waitingPlayer.roomId;
        const game = games[roomId]; 

        // Assign Player O
        game.playerO = socket.id;
        game.names.O = playerName;
        socket.join(roomId);
        game.state = 'active'; 

        const baseGameData = {
            playerXName: game.names.X, 
            playerOName: game.names.O,
            currentTurn: game.turn,
            roomId: roomId
        };
        
        socket.emit('game-start', { ...baseGameData, yourRole: 'O' });
        io.to(waitingPlayer.socketId).emit('game-start', { ...baseGameData, yourRole: 'X' });

        waitingPlayer = null; 

    } else {
        // Player 1 (X) found OR the player is the one currently waiting: Create a new room and wait
        
        // If the player is already waiting, we do nothing. The server's disconnect
        // handler would have already put them into the queue. However, since the client
        // is designed to auto-re-queue, this extra 'else if' handles the scenario
        // where they hit 'Start Game' a second time while waiting.
        if (waitingPlayer && waitingPlayer.socketId === socket.id) {
            console.log(`Player ${playerName} already waiting. Ignoring duplicate join request.`);
            // Optionally emit a message to confirm they are still waiting
            socket.emit('wait-for-opponent', { yourRole: 'X', roomId: waitingPlayer.roomId, yourName: playerName });
            return;
        }


        // Standard Player 1 flow: Create new room and wait
        roomId = 'game-' + (nextGameId++);
        socket.join(roomId);
        
        // CRITICAL: Create the game object for Player X
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
        socket.emit('wait-for-opponent', { yourRole: 'X', roomId: roomId, yourName: playerName });
    }
});

    // === 2. MOVE HANDLING ===
    socket.on('make-move', (data) => {
        const { index, roomId, player } = data;
        const game = games[roomId];
        
        if (!game || game.state !== 'active' || player !== game.turn || game.board[index] !== '') {
            return; 
        }

        game.board[index] = player;
        const nextTurn = (player === 'X' ? 'O' : 'X');
        game.turn = nextTurn;

        io.to(roomId).emit('move-made', { 
            index: index, player: player, nextTurn: nextTurn 
        });
    });

    // === 3. GAME OVER & RESET ===
    socket.on('game-over', (data) => {
        const game = games[data.roomId];
        if (game) {
            game.state = 'finished';
            io.to(data.roomId).emit('game-finished', data); 
        }
    });
    
    socket.on('request-reset', (data) => {
        const game = games[data.roomId];
        if (game && game.playerX === socket.id) {
            game.board = Array(9).fill('');
            game.turn = 'X';
            game.state = 'active'; 
            io.to(data.roomId).emit('game-reset', { turn: 'X' });
        }
    });

    // === 4. DISCONNECTION HANDLER ===
    socket.on('disconnect', () => {
        handlePlayerDisconnection(socket.id);
    });
});

server.listen(port, () => {
    console.log(`Server running on port ${port}`);
});