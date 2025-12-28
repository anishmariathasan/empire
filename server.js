const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    },
    pingInterval: 10000, // Keep connections alive
    pingTimeout: 5000
});

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Store active games
const games = new Map();

// Health check endpoint (keeps Render from sleeping if pinged)
app.get('/health', (req, res) => {
    res.json({ status: 'ok', games: games.size });
});

// Generate a random 6-character game PIN
function generateGamePin() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Removed confusing characters like O, 0, I, 1
    let pin = '';
    for (let i = 0; i < 6; i++) {
        pin += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return pin;
}

// Shuffle array using Fisher-Yates algorithm
function shuffleArray(array) {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}

// Normalize name to Title Case
function normalizeName(name) {
    return name
        .trim()
        .toLowerCase()
        .split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
}

// API Routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/game/:pin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'game.html'));
});

app.get('/reader/:pin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'reader.html'));
});

// Socket.io connection handling
io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    // Create a new game
    socket.on('createGame', (callback) => {
        let pin = generateGamePin();
        // Ensure unique PIN
        while (games.has(pin)) {
            pin = generateGamePin();
        }

        const game = {
            pin: pin,
            hostId: socket.id,
            players: new Map(),
            status: 'waiting',
            submissions: new Map(),
            shuffledNames: [],
            revealedNames: [],
            eliminatedPlayers: new Set(),
            currentGuesser: null,
            guessOrder: [],
            createdAt: Date.now()
        };

        games.set(pin, game);
        socket.join(pin);
        socket.gamePin = pin;

        console.log(`Game created with PIN: ${pin}`);
        callback({ success: true, pin: pin });
    });

    // Join an existing game
    socket.on('joinGame', ({ pin, playerName }, callback) => {
        console.log(`Join attempt - PIN: ${pin}, Player: ${playerName}`);
        console.log(`Available games: ${Array.from(games.keys()).join(', ') || 'none'}`);
        
        const game = games.get(pin.toUpperCase());

        if (!game) {
            console.log(`Game not found for PIN: ${pin.toUpperCase()}`);
            callback({ success: false, error: 'Game not found. The game may have expired or the PIN is incorrect.' });
            return;
        }

        if (game.status !== 'waiting') {
            callback({ success: false, error: 'Game has already started.' });
            return;
        }

        // Normalise player name
        const normalizedPlayerName = normalizeName(playerName);

        // Check for duplicate names
        for (const [id, player] of game.players) {
            if (player.name.toLowerCase() === normalizedPlayerName.toLowerCase()) {
                callback({ success: false, error: 'That name is already taken. Please choose a different name.' });
                return;
            }
        }

        // Generate unique player ID (allows multiple players from same socket/device)
        const uniquePlayerId = `${socket.id}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        game.players.set(uniquePlayerId, {
            id: uniquePlayerId,
            socketId: socket.id,
            name: normalizedPlayerName,
            hasSubmitted: false
        });

        socket.join(pin.toUpperCase());
        socket.gamePin = pin.toUpperCase();
        socket.currentPlayerId = uniquePlayerId;

        // Notify all players about the updated player list
        const playerList = Array.from(game.players.values()).map(p => ({
            id: p.id,
            name: p.name,
            hasSubmitted: p.hasSubmitted
        }));

        io.to(pin.toUpperCase()).emit('playerListUpdate', playerList);

        console.log(`${normalizedPlayerName} joined game ${pin}`);
        callback({ success: true, isHost: socket.id === game.hostId, normalizedName: normalizedPlayerName, playerId: uniquePlayerId });
    });

    // Submit a famous person name
    socket.on('submitName', ({ famousName, playerId }, callback) => {
        const pin = socket.gamePin;
        const game = games.get(pin);

        if (!game) {
            callback({ success: false, error: 'Game not found.' });
            return;
        }

        if (game.status !== 'waiting') {
            callback({ success: false, error: 'Submissions are closed.' });
            return;
        }

        // Use provided playerId or fall back to currentPlayerId on socket
        const currentPlayerId = playerId || socket.currentPlayerId;
        const player = game.players.get(currentPlayerId);
        
        if (!player) {
            callback({ success: false, error: 'You are not in this game. Please join first.' });
            return;
        }

        if (player.hasSubmitted) {
            callback({ success: false, error: 'You have already submitted a name.' });
            return;
        }

        // Normalise famous name to Title Case
        const normalizedFamousName = normalizeName(famousName);

        game.submissions.set(currentPlayerId, normalizedFamousName);
        player.hasSubmitted = true;

        // Update player list
        const playerList = Array.from(game.players.values()).map(p => ({
            id: p.id,
            name: p.name,
            hasSubmitted: p.hasSubmitted
        }));

        io.to(pin).emit('playerListUpdate', playerList);

        console.log(`${player.name} submitted their name in game ${pin}`);
        callback({ success: true, normalizedName: normalizedFamousName });
    });

    // Reader joins the game
    socket.on('joinAsReader', ({ pin }, callback) => {
        const game = games.get(pin.toUpperCase());

        if (!game) {
            callback({ success: false, error: 'Game not found.' });
            return;
        }

        socket.join(pin.toUpperCase());
        socket.gamePin = pin.toUpperCase();
        socket.isReader = true;

        const playerList = Array.from(game.players.values()).map(p => ({
            id: p.id,
            name: p.name,
            hasSubmitted: p.hasSubmitted
        }));

        callback({ 
            success: true, 
            status: game.status,
            playerCount: game.players.size,
            submissionCount: game.submissions.size,
            playerList: playerList
        });
    });

    // Remove a player (reader only, before game starts)
    socket.on('removePlayer', ({ playerId, playerName }, callback) => {
        const pin = socket.gamePin;
        const game = games.get(pin);

        if (!game) {
            callback({ success: false, error: 'Game not found.' });
            return;
        }

        if (!socket.isReader) {
            callback({ success: false, error: 'Only the reader can remove players.' });
            return;
        }

        if (game.status !== 'waiting') {
            callback({ success: false, error: 'Cannot remove players after game has started.' });
            return;
        }

        // Find player by ID or name
        let playerIdToRemove = playerId;
        if (!playerIdToRemove && playerName) {
            for (const [id, player] of game.players) {
                if (player.name === playerName) {
                    playerIdToRemove = id;
                    break;
                }
            }
        }

        if (!playerIdToRemove || !game.players.has(playerIdToRemove)) {
            callback({ success: false, error: 'Player not found.' });
            return;
        }

        const removedPlayer = game.players.get(playerIdToRemove);
        game.players.delete(playerIdToRemove);
        game.submissions.delete(playerIdToRemove);

        // Notify all players
        const playerList = Array.from(game.players.values()).map(p => ({
            id: p.id,
            name: p.name,
            hasSubmitted: p.hasSubmitted
        }));

        io.to(pin).emit('playerListUpdate', playerList);
        io.to(pin).emit('playerRemoved', { playerName: removedPlayer.name });

        console.log(`${removedPlayer.name} removed from game ${pin} by reader`);
        callback({ success: true, removedName: removedPlayer.name });
    });

    // Start the game (reader only)
    socket.on('startGame', (callback) => {
        const pin = socket.gamePin;
        const game = games.get(pin);

        if (!game) {
            callback({ success: false, error: 'Game not found.' });
            return;
        }

        if (game.submissions.size < 2) {
            callback({ success: false, error: 'Need at least 2 players with submissions to start.' });
            return;
        }

        // Check if all players have submitted
        const allSubmitted = Array.from(game.players.values()).every(p => p.hasSubmitted);
        if (!allSubmitted) {
            callback({ success: false, error: 'Not all players have submitted their names.' });
            return;
        }

        game.status = 'playing';

        // Shuffle the famous names
        const names = Array.from(game.submissions.values());
        game.shuffledNames = shuffleArray(names);

        // Create shuffled guess order (player names)
        const playerNames = Array.from(game.players.values()).map(p => p.name);
        game.guessOrder = shuffleArray(playerNames);
        game.currentGuesser = 0;

        // Notify all players that game has started
        io.to(pin).emit('gameStarted');

        console.log(`Game ${pin} started with ${game.shuffledNames.length} names`);
        callback({ 
            success: true, 
            names: game.shuffledNames,
            guessOrder: game.guessOrder,
            currentGuesser: game.guessOrder[0]
        });
    });

    // Reveal a name (mark as guessed)
    socket.on('revealName', ({ name, guessedBy }, callback) => {
        const pin = socket.gamePin;
        const game = games.get(pin);

        if (!game || game.status !== 'playing') {
            callback({ success: false, error: 'Game not in progress.' });
            return;
        }

        game.revealedNames.push({ name, guessedBy });

        io.to(pin).emit('nameRevealed', { name, guessedBy });

        callback({ success: true });
    });

    // Eliminate a player
    socket.on('eliminatePlayer', ({ playerName }, callback) => {
        const pin = socket.gamePin;
        const game = games.get(pin);

        if (!game || game.status !== 'playing') {
            callback({ success: false, error: 'Game not in progress.' });
            return;
        }

        game.eliminatedPlayers.add(playerName);

        io.to(pin).emit('playerEliminated', { playerName });

        // Check if game is over (only 1 player left)
        const activePlayers = game.guessOrder.filter(p => !game.eliminatedPlayers.has(p));
        if (activePlayers.length === 1) {
            game.status = 'finished';
            io.to(pin).emit('gameOver', { winner: activePlayers[0] });
        }

        callback({ success: true, activePlayers });
    });

    // Next guesser
    socket.on('nextGuesser', (callback) => {
        const pin = socket.gamePin;
        const game = games.get(pin);

        if (!game || game.status !== 'playing') {
            callback({ success: false, error: 'Game not in progress.' });
            return;
        }

        // Find next non-eliminated player
        let nextIndex = game.currentGuesser;
        do {
            nextIndex = (nextIndex + 1) % game.guessOrder.length;
        } while (game.eliminatedPlayers.has(game.guessOrder[nextIndex]) && nextIndex !== game.currentGuesser);

        game.currentGuesser = nextIndex;
        const currentGuesser = game.guessOrder[nextIndex];

        io.to(pin).emit('guesserChanged', { currentGuesser });

        callback({ success: true, currentGuesser });
    });

    // Reset game for another round
    socket.on('resetGame', (callback) => {
        const pin = socket.gamePin;
        const game = games.get(pin);

        if (!game) {
            callback({ success: false, error: 'Game not found.' });
            return;
        }

        // Reset game state
        game.status = 'waiting';
        game.submissions.clear();
        game.shuffledNames = [];
        game.revealedNames = [];
        game.eliminatedPlayers.clear();
        game.currentGuesser = null;
        game.guessOrder = [];

        // Reset player submission status
        for (const [id, player] of game.players) {
            player.hasSubmitted = false;
        }

        const playerList = Array.from(game.players.values()).map(p => ({
            id: p.id,
            name: p.name,
            hasSubmitted: p.hasSubmitted
        }));

        io.to(pin).emit('gameReset', { playerList });

        callback({ success: true });
    });

    // Handle disconnection
    socket.on('disconnect', () => {
        const pin = socket.gamePin;
        if (pin && games.has(pin)) {
            const game = games.get(pin);
            
            // Find all players from this socket that haven't submitted
            const playersToRemove = [];
            for (const [playerId, player] of game.players) {
                if (player.socketId === socket.id && !player.hasSubmitted && game.status === 'waiting') {
                    playersToRemove.push(playerId);
                }
            }
            
            // Remove unsubmitted players from this socket
            for (const playerId of playersToRemove) {
                const player = game.players.get(playerId);
                console.log(`${player.name} disconnected from game ${pin} (not submitted)`);
                game.players.delete(playerId);
                game.submissions.delete(playerId);
            }
            
            if (playersToRemove.length > 0) {
                const playerList = Array.from(game.players.values()).map(p => ({
                    id: p.id,
                    name: p.name,
                    hasSubmitted: p.hasSubmitted
                }));
                io.to(pin).emit('playerListUpdate', playerList);
            }

            // Only delete games that are empty AND older than 30 minutes
            // This prevents games from being deleted when host switches tabs
            const gameAgeMinutes = (Date.now() - game.createdAt) / (1000 * 60);
            console.log(`Game ${pin} - players: ${game.players.size}, submissions: ${game.submissions.size}, age: ${gameAgeMinutes.toFixed(2)} mins`);
            if (game.players.size === 0 && game.submissions.size === 0 && gameAgeMinutes > 30) {
                games.delete(pin);
                console.log(`Game ${pin} deleted (no players, older than 30 mins)`);
            }
        }
        console.log('User disconnected:', socket.id);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Empire Game server running on http://localhost:${PORT}`);
});
