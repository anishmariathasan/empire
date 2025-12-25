// Player game page client-side JavaScript
const socket = io();

// Get PIN from URL
const pathParts = window.location.pathname.split('/');
const gamePin = pathParts[pathParts.length - 1].toUpperCase();
console.log('Game PIN from URL:', gamePin, 'Path:', window.location.pathname);

// DOM Elements
const screens = {
    join: document.getElementById('joinScreen'),
    waitingRoom: document.getElementById('waitingRoom'),
    gameActive: document.getElementById('gameActiveScreen'),
    gameOver: document.getElementById('gameOverScreen')
};

// Join screen elements
const gamePinDisplay = document.getElementById('gamePinDisplay');
const playerNameInput = document.getElementById('playerNameInput');
const joinBtn = document.getElementById('joinBtn');
const joinError = document.getElementById('joinError');

// Waiting room elements
const waitingRoomPin = document.getElementById('waitingRoomPin');
const submissionCard = document.getElementById('submissionCard');
const submittedCard = document.getElementById('submittedCard');
const famousNameInput = document.getElementById('famousName');
const submitNameBtn = document.getElementById('submitNameBtn');
const playerCountSpan = document.getElementById('playerCount');
const playerList = document.getElementById('playerList');

// Game active elements
const currentGuesserDisplay = document.getElementById('currentGuesserDisplay');
const revealedList = document.getElementById('revealedList');
const eliminatedList = document.getElementById('eliminatedList');

// Game over elements
const winnerName = document.getElementById('winnerName');
const playAgainBtn = document.getElementById('playAgainBtn');

// State
let playerName = null;
let playerId = null;
let hasSubmitted = false;

// Initialize
gamePinDisplay.textContent = gamePin;
waitingRoomPin.textContent = gamePin;

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

// Event Handlers
joinBtn.addEventListener('click', () => {
    const name = playerNameInput.value.trim();

    if (!name) {
        joinError.textContent = 'Please enter your name';
        return;
    }

    joinError.textContent = '';
    
    socket.emit('joinGame', { pin: gamePin, playerName: name }, (response) => {
        if (response.success) {
            playerName = response.normalizedName || name;
            playerId = response.playerId;
            showScreen('waitingRoom');
            showToast(`Welcome, ${playerName}!`, 'success');
        } else {
            joinError.textContent = response.error || 'Failed to join game';
        }
    });
});

playerNameInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        joinBtn.click();
    }
});

submitNameBtn.addEventListener('click', () => {
    const famousName = famousNameInput.value.trim();

    if (!famousName) {
        showToast('Please enter a famous person\'s name', 'error');
        return;
    }

    socket.emit('submitName', { famousName, playerId }, (response) => {
        if (response.success) {
            hasSubmitted = true;
            submissionCard.style.display = 'none';
            submittedCard.style.display = 'block';
            // Update submitted card to show the normalised name and add another player option
            submittedCard.innerHTML = `
                <div class="success-icon">✓</div>
                <h2>Name Submitted!</h2>
                <p class="submitted-name">Playing as: <strong>${playerName}</strong></p>
                <p class="submitted-name">Submitted: <strong>"${response.normalizedName}"</strong></p>
                <div class="waiting-info">
                    <div class="spinner"></div>
                    <p>Waiting for other players...</p>
                </div>
                <div class="another-player-section">
                    <p>Got another player on this device?</p>
                    <button id="addAnotherPlayerBtn" class="btn btn-secondary">Add Another Player</button>
                </div>
            `;
            // Add event listener for the new button
            document.getElementById('addAnotherPlayerBtn').addEventListener('click', resetForAnotherPlayer);
            showToast('Name submitted successfully!', 'success');
        } else {
            showToast(response.error || 'Failed to submit name', 'error');
        }
    });
});

// Reset for another player on same device
function resetForAnotherPlayer() {
    // Don't disconnect - just reset state for a new player
    // The previous player's submission remains in the game
    
    // Reset local state
    playerName = null;
    playerId = null;
    hasSubmitted = false;
    
    // Reset UI
    playerNameInput.value = '';
    famousNameInput.value = '';
    submissionCard.style.display = 'block';
    submittedCard.style.display = 'none';
    
    // Go back to join screen
    showScreen('join');
    showToast('Ready for another player!', 'info');
}

famousNameInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        submitNameBtn.click();
    }
});

playAgainBtn.addEventListener('click', () => {
    // Reset state
    hasSubmitted = false;
    famousNameInput.value = '';
    submissionCard.style.display = 'block';
    submittedCard.style.display = 'none';
    revealedList.innerHTML = '<li class="empty-state">No names revealed yet</li>';
    eliminatedList.innerHTML = '<li class="empty-state">No one eliminated yet</li>';
    showScreen('waitingRoom');
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
    if (currentGuesser === playerName) {
        showToast('It\'s your turn to guess!', 'info');
    }
});

socket.on('nameRevealed', ({ name, guessedBy }) => {
    const emptyState = revealedList.querySelector('.empty-state');
    if (emptyState) emptyState.remove();

    const li = document.createElement('li');
    li.innerHTML = `<strong>${escapeHtml(name)}</strong> → guessed by ${escapeHtml(guessedBy)}`;
    revealedList.appendChild(li);
});

socket.on('playerEliminated', ({ playerName: eliminated }) => {
    const emptyState = eliminatedList.querySelector('.empty-state');
    if (emptyState) emptyState.remove();

    const li = document.createElement('li');
    li.textContent = eliminated;
    eliminatedList.appendChild(li);
    
    if (eliminated === playerName) {
        showToast('You have been eliminated!', 'error');
    } else {
        showToast(`${eliminated} has been eliminated!`, 'info');
    }
});

socket.on('gameOver', ({ winner }) => {
    winnerName.textContent = winner;
    showScreen('gameOver');
    if (winner === playerName) {
        showToast('Congratulations! You won!', 'success');
    } else {
        showToast(`${winner} wins!`, 'info');
    }
});

socket.on('gameReset', ({ playerList: players }) => {
    hasSubmitted = false;
    famousNameInput.value = '';
    submissionCard.style.display = 'block';
    submittedCard.style.display = 'none';
    revealedList.innerHTML = '<li class="empty-state">No names revealed yet</li>';
    eliminatedList.innerHTML = '<li class="empty-state">No one eliminated yet</li>';
    updatePlayerList(players);
    showScreen('waitingRoom');
    showToast('New round started!', 'success');
});

socket.on('playerRemoved', ({ playerId: removedPlayerId, playerName: removedPlayerName }) => {
    // Check if the current player was removed
    if (playerId && removedPlayerId === playerId) {
        alert('You have been removed from the game by the reader.');
        window.location.href = '/';
    } else {
        showToast(`${removedPlayerName} has been removed from the game`, 'info');
    }
});

socket.on('disconnect', () => {
    showToast('Disconnected from server', 'error');
});

socket.on('connect', () => {
    console.log('Connected to server');
});
