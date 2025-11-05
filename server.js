// server.js - Rewritten to manage turn consistency

const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require('socket.io');
const path = require('path');

const port = 3000;

// Setup Socket.IO with CORS for development
const io = new Server(server, {
    cors: {
        origin: "*", 
        methods: ["GET", "POST"]
    }
});

// Serve static files from the frontend directory
const FRONTEND_DIR = '/Users/carsonbove/Desktop/TylerTacToe'; // **YOUR SPECIFIC PATH**
app.use(express.static(FRONTEND_DIR)); 

// Game State Management
let playerSockets = {}; // { socketId: 'X' or 'O' }
let playerSocketIds = []; // [socketIdX, socketIdO]
let currentPlayerMarker = 'X'; // The server always tracks whose turn it is

io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);
    
    // --- Connection and Role Assignment ---
    if (playerSocketIds.length < 2) {
        let playerRole;
        
        if (playerSocketIds.length === 0) {
            playerRole = 'X';
            playerSocketIds.push(socket.id);
            playerSockets[socket.id] = playerRole;
        } else if (playerSocketIds.length === 1 && !playerSockets[socket.id]) {
            playerRole = 'O';
            playerSocketIds.push(socket.id);
            playerSockets[socket.id] = playerRole;
        }
        
        socket.emit('player-role', playerRole);
        console.log(`Assigned ${playerRole} to ${socket.id}`);
        
        // Start game when both players connect
        if (playerSocketIds.length === 2) {
            // Tell all clients the game is starting and X goes first
            io.emit('start-game', { turn: 'X' });
            console.log('Two players connected. Game starting! X starts.');
        }
        
    } else {
        // Server is full
        socket.emit('wait', 'Server is full. Please wait.');
        socket.disconnect();
    }
    
    // --- Move Handling (Central Validation) ---
    socket.on('make-move', (data) => {
        const playerMakingMove = playerSockets[socket.id];

        // 1. Validation Check: Is it this player's turn?
        if (playerMakingMove !== currentPlayerMarker) {
            // Optionally, tell the client they tried to move out of turn
            socket.emit('out-of-turn', 'It is not your turn.');
            return;
        }

        // 2. Move is Valid: Update server state and broadcast
        // The client-side logic will handle checking if the cell is empty.
        
        // Broadcast the move and the NEW turn to all clients
        currentPlayerMarker = (currentPlayerMarker === 'X' ? 'O' : 'X');
        io.emit('move-made', { 
            index: data.index, 
            player: data.player,
            nextTurn: currentPlayerMarker // IMPORTANT: Tell clients whose turn is NEXT
        }); 
        console.log(`Move made by ${data.player} in cell ${data.index}. Next turn: ${currentPlayerMarker}`);
    });
    
    // --- Game Over/Reset Handling ---
    socket.on('game-over', (data) => {
        io.emit('game-finished', data); 
    });

    socket.on('request-reset', () => {
        currentPlayerMarker = 'X'; // X always starts the new game
        io.emit('game-reset', { turn: 'X' });
        console.log('Game reset requested. X starts next.');
    });

    // --- Disconnection ---
    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        const playerRole = playerSockets[socket.id];
        
        if (playerRole) {
            delete playerSockets[socket.id];
            playerSocketIds = playerSocketIds.filter(id => id !== socket.id);
            io.emit('player-disconnected', `${playerRole} disconnected. Game ended.`);
            console.log(`${playerRole} removed. Player count: ${playerSocketIds.length}`);
        }
    });
});

server.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});