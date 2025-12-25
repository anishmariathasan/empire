# Empire Game

A multiplayer guessing game where friends submit famous names, then take turns trying to figure out who submitted what.

## How It Works

1. **Create or join a game** - Each game gets a unique 6-letter PIN or shareable link
2. **Submit a famous person** - Everyone enters a name (kept secret)
3. **The reader reads the list** - Names are shuffled and read aloud in random order
4. **Guess and eliminate** - Players take turns guessing who submitted each name
5. **Last player wins** - When your identity is guessed, you're out

## Features

- **Live multiplayer** - Real-time sync across all players
- **Game PINs** - Easy-to-share 6-character codes
- **Randomised order** - Submission order is shuffled, so going first doesn't matter
- **Reader can play** - The person managing the game can also join as a player
- **Name normalisation** - Names auto-format to Title Case (no worrying about capitals)
- **Spell-check confirmation** - Preview names before submitting
- **Back buttons** - Easy navigation between pages
- **Mobile-friendly** - Works on phones, tablets, and desktops

## Getting Started

### Play Online (Easiest)
Visit the live site and create a game - share the PIN with friends.

### Run Locally

```bash
npm install
npm start
```

Opens on `http://localhost:3000`

## How to Play

### For the Host
1. Click **Create New Game**
2. Share the PIN or use the share link
3. Click **Open Reader View** to manage the game in another tab
4. Once all players submit, click **Start Game**
5. Read the names aloud and manage the game

### For Players
1. Enter the game PIN or use the share link
2. Submit a famous person's name
3. Wait for the reader to start the game
4. Listen and guess who submitted each name
5. Last player standing wins!

### Optional: Reader Joins Too
The reader can enter their name and submit a famous person to play along whilst managing the game.

## Technical

Built with:
- **Node.js + Express** - Backend
- **Socket.io** - Real-time multiplayer
- **HTML/CSS/JavaScript** - Frontend

Deployed free on Render.

## Rules

- Everyone must submit a name before the game starts
- Players guess in randomised order
- When your name is guessed, you're eliminated
- Game ends when one player remains (the winner)