// Reader view client-side JavaScript
const socket = io();

// Get PIN from URL
const pathParts = window.location.pathname.split('/');
const gamePin = pathParts[pathParts.length - 1].toUpperCase();

// DOM Elements
const screens = {
    waiting: document.getElementById('waitingSection'),
    game: document.getElementById('gameSection'),
    gameOver: document.getElementById('gameOverSection')
};

// Waiting section elements
const readerPin = document.getElementById('readerPin');
const playerCountSpan = document.getElementById('playerCount');
const playerList = document.getElementById('playerList');
const noPlayersMsg = document.getElementById('noPlayersMsg');
const startInfo = document.getElementById('startInfo');
const startGameBtn = document.getElementById('startGameBtn');

// Reader join elements
const readerJoinCard = document.getElementById('readerJoinCard');
const readerNameInput = document.getElementById('readerName');
const readerFamousNameInput = document.getElementById('readerFamousName');
const readerJoinBtn = document.getElementById('readerJoinBtn');
const readerJoinStatus = document.getElementById('readerJoinStatus');

// Game section elements
const namesList = document.getElementById('namesList');
const currentGuesserDisplay = document.getElementById('currentGuesserDisplay');
const nextGuesserBtn = document.getElementById('nextGuesserBtn');
const revealNameSelect = document.getElementById('revealNameSelect');
const guessedBySelect = document.getElementById('guessedBySelect');
const revealNameBtn = document.getElementById('revealNameBtn');
const eliminateSelect = document.getElementById('eliminateSelect');
const eliminateBtn = document.getElementById('eliminateBtn');
const revealedList = document.getElementById('revealedList');
const eliminatedList = document.getElementById('eliminatedList');
const activePlayersList = document.getElementById('activePlayersList');

// Game over elements
const winnerName = document.getElementById('winnerName');
const resetGameBtn = document.getElementById('resetGameBtn');

// State
let players = [];
let shuffledNames = [];
let guessOrder = [];
let currentGuesser = null;
let revealedNames = new Set();
let eliminatedPlayers = new Set();
let readerHasJoined = false;

// Initialize
readerPin.textContent = gamePin;

// Utility functions
function showScreen(screenName) {
    Object.values(screens).forEach(screen => screen.classList.remove('active'));
    screens[screenName].classList.add('active');
}

function showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = `toast ${type} show`;
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

// Title case helper for preview
function toTitleCase(str) {
    return str.trim().toLowerCase().split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function updatePlayerList(playerData) {
    players = playerData;
    playerList.innerHTML = '';
    playerCountSpan.textContent = players.length;

    if (players.length === 0) {
        noPlayersMsg.style.display = 'block';
        startGameBtn.disabled = true;
        return;
    }

    noPlayersMsg.style.display = 'none';

    players.forEach(player => {
        const li = document.createElement('li');
        li.innerHTML = `
            <span class="player-name">${escapeHtml(player.name)}</span>
            <span class="status ${player.hasSubmitted ? 'submitted' : 'waiting'}">
                ${player.hasSubmitted ? '✓ Submitted' : 'Waiting for submission...'}
            </span>
        `;
        playerList.appendChild(li);
    });

    // Check if we can start the game
    const allSubmitted = players.length >= 2 && players.every(p => p.hasSubmitted);
    startGameBtn.disabled = !allSubmitted;
    
    if (allSubmitted) {
        startInfo.textContent = 'All players ready! Click to start the game.';
        startInfo.style.color = '#00b894';
    } else if (players.length < 2) {
        startInfo.textContent = 'Need at least 2 players to start.';
        startInfo.style.color = '';
    } else {
        const waiting = players.filter(p => !p.hasSubmitted).length;
        startInfo.textContent = `Waiting for ${waiting} player(s) to submit their names.`;
        startInfo.style.color = '';
    }
}

function updateNamesList() {
    namesList.innerHTML = '';
    shuffledNames.forEach((name, index) => {
        const li = document.createElement('li');
        li.textContent = name;
        li.dataset.name = name;
        if (revealedNames.has(name)) {
            li.classList.add('revealed');
        }
        namesList.appendChild(li);
    });
}

function updateSelects() {
    // Update reveal name select
    revealNameSelect.innerHTML = '<option value="">Select a name...</option>';
    shuffledNames.filter(name => !revealedNames.has(name)).forEach(name => {
        const option = document.createElement('option');
        option.value = name;
        option.textContent = name;
        revealNameSelect.appendChild(option);
    });

    // Update guessed by select
    guessedBySelect.innerHTML = '<option value="">Select player...</option>';
    guessOrder.filter(name => !eliminatedPlayers.has(name)).forEach(name => {
        const option = document.createElement('option');
        option.value = name;
        option.textContent = name;
        guessedBySelect.appendChild(option);
    });

    // Update eliminate select
    eliminateSelect.innerHTML = '<option value="">Select player...</option>';
    guessOrder.filter(name => !eliminatedPlayers.has(name)).forEach(name => {
        const option = document.createElement('option');
        option.value = name;
        option.textContent = name;
        eliminateSelect.appendChild(option);
    });
}

function updateActivePlayersList() {
    activePlayersList.innerHTML = '';
    guessOrder.filter(name => !eliminatedPlayers.has(name)).forEach((name, index) => {
        const li = document.createElement('li');
        li.innerHTML = `
            <span class="player-name">${escapeHtml(name)}</span>
            ${name === currentGuesser ? '<span class="status submitted">Current Guesser</span>' : ''}
        `;
        activePlayersList.appendChild(li);
    });
}

// Connect to game as reader
socket.emit('joinAsReader', { pin: gamePin }, (response) => {
    if (response.success) {
        console.log('Joined as reader');
        if (response.playerList) {
            updatePlayerList(response.playerList);
        }
        if (response.status === 'playing') {
            // Game already in progress - would need to sync state
            showToast('Game already in progress', 'info');
        }
    } else {
        showToast(response.error || 'Failed to join as reader', 'error');
    }
});

// Reader join as player
readerJoinBtn.addEventListener('click', () => {
    const name = readerNameInput.value.trim();
    const famousName = readerFamousNameInput.value.trim();

    if (!name) {
        showToast('Please enter your name', 'error');
        return;
    }

    if (!famousName) {
        showToast('Please enter a famous person\'s name', 'error');
        return;
    }

    // Show preview of normalized name
    const normalizedPreview = toTitleCase(famousName);
    if (!confirm(`Submit this famous person?\\n\\n"${normalizedPreview}"\\n\\nMake sure the spelling is correct!`)) {
        return;
    }

    // First join the game
    socket.emit('joinGame', { pin: gamePin, playerName: name }, (response) => {
        if (response.success) {
            // Then submit the famous name
            socket.emit('submitName', { famousName }, (submitResponse) => {
                if (submitResponse.success) {
                    readerHasJoined = true;
                    readerJoinCard.innerHTML = `
                        <div class="success-icon">✓</div>
                        <h2>You're In!</h2>
                        <p>Playing as: <strong>${response.normalizedName}</strong></p>
                        <p>Submitted: <strong>${submitResponse.normalizedName}</strong></p>
                    `;
                    showToast('You have joined the game!', 'success');
                } else {
                    showToast(submitResponse.error || 'Failed to submit name', 'error');
                }
            });
        } else {
            showToast(response.error || 'Failed to join game', 'error');
        }
    });
});

// Event Handlers
startGameBtn.addEventListener('click', () => {
    socket.emit('startGame', (response) => {
        if (response.success) {
            shuffledNames = response.names;
            guessOrder = response.guessOrder;
            currentGuesser = response.currentGuesser;
            
            updateNamesList();
            updateSelects();
            currentGuesserDisplay.textContent = currentGuesser;
            updateActivePlayersList();
            
            showScreen('game');
            showToast('Game started!', 'success');
        } else {
            showToast(response.error || 'Failed to start game', 'error');
        }
    });
});

nextGuesserBtn.addEventListener('click', () => {
    socket.emit('nextGuesser', (response) => {
        if (response.success) {
            currentGuesser = response.currentGuesser;
            currentGuesserDisplay.textContent = currentGuesser;
            updateActivePlayersList();
        } else {
            showToast(response.error || 'Failed to change guesser', 'error');
        }
    });
});

revealNameBtn.addEventListener('click', () => {
    const name = revealNameSelect.value;
    const guessedBy = guessedBySelect.value;

    if (!name) {
        showToast('Please select a name', 'error');
        return;
    }

    if (!guessedBy) {
        showToast('Please select who guessed it', 'error');
        return;
    }

    socket.emit('revealName', { name, guessedBy }, (response) => {
        if (response.success) {
            revealedNames.add(name);
            updateNamesList();
            updateSelects();
            
            // Update revealed list
            const emptyState = revealedList.querySelector('.empty-state');
            if (emptyState) emptyState.remove();

            const li = document.createElement('li');
            li.innerHTML = `<strong>${escapeHtml(name)}</strong> → guessed by ${escapeHtml(guessedBy)}`;
            revealedList.appendChild(li);

            // Reset selects
            revealNameSelect.value = '';
            guessedBySelect.value = '';
            
            showToast('Name revealed!', 'success');
        } else {
            showToast(response.error || 'Failed to reveal name', 'error');
        }
    });
});

eliminateBtn.addEventListener('click', () => {
    const playerName = eliminateSelect.value;

    if (!playerName) {
        showToast('Please select a player to eliminate', 'error');
        return;
    }

    socket.emit('eliminatePlayer', { playerName }, (response) => {
        if (response.success) {
            eliminatedPlayers.add(playerName);
            updateSelects();
            updateActivePlayersList();
            
            // Update eliminated list
            const emptyState = eliminatedList.querySelector('.empty-state');
            if (emptyState) emptyState.remove();

            const li = document.createElement('li');
            li.textContent = playerName;
            eliminatedList.appendChild(li);

            // Reset select
            eliminateSelect.value = '';
            
            showToast(`${playerName} eliminated!`, 'info');
        } else {
            showToast(response.error || 'Failed to eliminate player', 'error');
        }
    });
});

resetGameBtn.addEventListener('click', () => {
    socket.emit('resetGame', (response) => {
        if (response.success) {
            // Reset state
            shuffledNames = [];
            guessOrder = [];
            currentGuesser = null;
            revealedNames.clear();
            eliminatedPlayers.clear();
            
            // Reset UI
            revealedList.innerHTML = '<li class="empty-state">No names revealed yet</li>';
            eliminatedList.innerHTML = '<li class="empty-state">No one eliminated yet</li>';
            
            showScreen('waiting');
            showToast('Game reset! Waiting for new submissions.', 'success');
        } else {
            showToast(response.error || 'Failed to reset game', 'error');
        }
    });
});

// Socket event handlers
socket.on('playerListUpdate', (playerData) => {
    updatePlayerList(playerData);
});

socket.on('gameOver', ({ winner }) => {
    winnerName.textContent = winner;
    showScreen('gameOver');
    showToast(`${winner} wins!`, 'success');
});

socket.on('disconnect', () => {
    showToast('Disconnected from server', 'error');
});

socket.on('connect', () => {
    console.log('Connected to server');
    // Rejoin as reader
    socket.emit('joinAsReader', { pin: gamePin }, (response) => {
        if (response.success && response.playerList) {
            updatePlayerList(response.playerList);
        }
    });
});
