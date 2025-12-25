// Main page client-side JavaScript
const socket = io();

// DOM Elements
const screens = {
    home: document.getElementById('homeScreen'),
    gameCreated: document.getElementById('gameCreatedScreen'),
    waitingRoom: document.getElementById('waitingRoom'),
    gameActive: document.getElementById('gameActiveScreen'),
    gameOver: document.getElementById('gameOverScreen')
};

// Home screen elements
const gamePinInput = document.getElementById('gamePin');
const playerNameInput = document.getElementById('playerName');
const joinGameBtn = document.getElementById('joinGameBtn');
const createGameBtn = document.getElementById('createGameBtn');

// Game created screen elements
const displayPin = document.getElementById('displayPin');
const copyPinBtn = document.getElementById('copyPinBtn');
const shareLink = document.getElementById('shareLink');
const copyLinkBtn = document.getElementById('copyLinkBtn');
const openReaderBtn = document.getElementById('openReaderBtn');

// Waiting room elements
const waitingRoomPin = document.getElementById('waitingRoomPin');
const famousNameInput = document.getElementById('famousName');
const submitNameBtn = document.getElementById('submitNameBtn');
const submissionStatus = document.getElementById('submissionStatus');
const playerCountSpan = document.getElementById('playerCount');
const playerList = document.getElementById('playerList');
const waitingMessage = document.getElementById('waitingMessage');

// Game active elements
const currentGuesserDisplay = document.getElementById('currentGuesserDisplay');
const revealedList = document.getElementById('revealedList');
const eliminatedList = document.getElementById('eliminatedList');

// Game over elements
const winnerName = document.getElementById('winnerName');
const playAgainBtn = document.getElementById('playAgainBtn');
const newGameBtn = document.getElementById('newGameBtn');

// State
let currentPin = null;
let hasSubmitted = false;

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

function updatePlayerList(players) {
    playerList.innerHTML = '';
    playerCountSpan.textContent = players.length;

    if (players.length === 0) {
        playerList.innerHTML = '<li class="empty-state">No players yet</li>';
        return;
    }

    players.forEach(player => {
        const li = document.createElement('li');
        li.innerHTML = `
            <span class="player-name">${escapeHtml(player.name)}</span>
            <span class="status ${player.hasSubmitted ? 'submitted' : 'waiting'}">
                ${player.hasSubmitted ? '✓ Submitted' : 'Waiting...'}
            </span>
        `;
        playerList.appendChild(li);
    });
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Keep-alive to prevent server sleep (Render free tier)
let keepAliveInterval = null;
function startKeepAlive() {
    if (keepAliveInterval) return;
    keepAliveInterval = setInterval(() => {
        fetch('/health').catch(() => {});
    }, 60000); // Ping every minute
}

function stopKeepAlive() {
    if (keepAliveInterval) {
        clearInterval(keepAliveInterval);
        keepAliveInterval = null;
    }
}

// Event Handlers
createGameBtn.addEventListener('click', () => {
    socket.emit('createGame', (response) => {
        if (response.success) {
            currentPin = response.pin;
            displayPin.textContent = response.pin;
            
            const gameUrl = `${window.location.origin}/game/${response.pin}`;
            shareLink.value = gameUrl;
            
            showScreen('gameCreated');
            showToast('Game created successfully!', 'success');
            startKeepAlive(); // Keep server alive while game is active
        } else {
            showToast(response.error || 'Failed to create game', 'error');
        }
    });
});

copyPinBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(currentPin).then(() => {
        showToast('PIN copied to clipboard!', 'success');
    });
});

copyLinkBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(shareLink.value).then(() => {
        showToast('Link copied to clipboard!', 'success');
    });
});

openReaderBtn.addEventListener('click', () => {
    window.open(`/reader/${currentPin}`, '_blank');
});

// Back to home button
const backToHomeBtn = document.getElementById('backToHomeBtn');
backToHomeBtn.addEventListener('click', () => {
    if (confirm('Are you sure you want to leave? The game PIN will be lost.')) {
        window.location.href = '/';
    }
});

joinGameBtn.addEventListener('click', () => {
    const pin = gamePinInput.value.trim().toUpperCase();
    const name = playerNameInput.value.trim();

    if (!pin) {
        showToast('Please enter a game PIN', 'error');
        return;
    }

    if (!name) {
        showToast('Please enter your name', 'error');
        return;
    }

    socket.emit('joinGame', { pin, playerName: name }, (response) => {
        if (response.success) {
            currentPin = pin;
            waitingRoomPin.textContent = pin;
            showScreen('waitingRoom');
            showToast(`Welcome, ${name}!`, 'success');
        } else {
            showToast(response.error || 'Failed to join game', 'error');
        }
    });
});

submitNameBtn.addEventListener('click', () => {
    const famousName = famousNameInput.value.trim();

    if (!famousName) {
        showToast('Please enter a famous person\'s name', 'error');
        return;
    }

    socket.emit('submitName', { famousName }, (response) => {
        if (response.success) {
            hasSubmitted = true;
            famousNameInput.disabled = true;
            submitNameBtn.disabled = true;
            submissionStatus.innerHTML = `<div class="submitted-confirmation">✓ Submitted: <strong>"${response.normalizedName}"</strong></div>`;
            submissionStatus.className = 'status-message success';
            showToast('Name submitted successfully!', 'success');
        } else {
            showToast(response.error || 'Failed to submit name', 'error');
        }
    });
});

playAgainBtn.addEventListener('click', () => {
    // Reset state
    hasSubmitted = false;
    famousNameInput.value = '';
    famousNameInput.disabled = false;
    submitNameBtn.disabled = false;
    submissionStatus.textContent = '';
    revealedList.innerHTML = '<li class="empty-state">No names revealed yet</li>';
    eliminatedList.innerHTML = '<li class="empty-state">No one eliminated yet</li>';
    showScreen('waitingRoom');
});

newGameBtn.addEventListener('click', () => {
    window.location.reload();
});

// Auto-uppercase PIN input
gamePinInput.addEventListener('input', (e) => {
    e.target.value = e.target.value.toUpperCase();
});

// Socket event handlers
socket.on('playerListUpdate', (players) => {
    updatePlayerList(players);
});

socket.on('gameStarted', () => {
    showScreen('gameActive');
    showToast('Game has started!', 'success');
});

socket.on('guesserChanged', ({ currentGuesser }) => {
    currentGuesserDisplay.textContent = currentGuesser;
});

socket.on('nameRevealed', ({ name, guessedBy }) => {
    const emptyState = revealedList.querySelector('.empty-state');
    if (emptyState) emptyState.remove();

    const li = document.createElement('li');
    li.innerHTML = `<strong>${escapeHtml(name)}</strong> → guessed by ${escapeHtml(guessedBy)}`;
    revealedList.appendChild(li);
});

socket.on('playerEliminated', ({ playerName }) => {
    const emptyState = eliminatedList.querySelector('.empty-state');
    if (emptyState) emptyState.remove();

    const li = document.createElement('li');
    li.textContent = playerName;
    eliminatedList.appendChild(li);
    
    showToast(`${playerName} has been eliminated!`, 'info');
});

socket.on('gameOver', ({ winner }) => {
    winnerName.textContent = winner;
    showScreen('gameOver');
    showToast(`${winner} wins!`, 'success');
});

socket.on('gameReset', ({ playerList: players }) => {
    hasSubmitted = false;
    famousNameInput.value = '';
    famousNameInput.disabled = false;
    submitNameBtn.disabled = false;
    submissionStatus.textContent = '';
    revealedList.innerHTML = '<li class="empty-state">No names revealed yet</li>';
    eliminatedList.innerHTML = '<li class="empty-state">No one eliminated yet</li>';
    updatePlayerList(players);
    showScreen('waitingRoom');
    showToast('New round started!', 'success');
});

socket.on('disconnect', () => {
    showToast('Disconnected from server', 'error');
});

socket.on('connect', () => {
    if (currentPin) {
        showToast('Reconnected to server', 'success');
    }
});
