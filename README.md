# Wingman - BGA Assistant

A Chrome extension that helps you master games on Board Game Arena with intelligent strategy recommendations and opponent analysis.

## Features

- **Game Detection**: Automatically detects which game you're playing
- **Strategy Recommendations**: Real-time suggestions based on game state
- **Opponent Analysis**: Tracks opponent behavior and identifies their strategies
- **Counter-Strategies**: Suggests how to counter opponent moves
- **Training Mode**: Capture WebSocket data to improve game support

## Supported Games

| Game | Rules | Opponent Patterns | Parser | Status |
|------|-------|-------------------|--------|--------|
| Wingspan | Yes | Yes | Yes | Ready |
| Sushi Go | Yes | Yes | Yes | Ready |
| Ticket to Ride | Yes | Yes | Yes | Ready |

**Note**: Parsers need refinement based on real BGA WebSocket data. Use Training Mode to capture data!

## Installation

1. Open Chrome and navigate to `chrome://extensions`
2. Enable **"Developer mode"** in the top right
3. Click **"Load unpacked"** and select the `src/` folder
4. Navigate to boardgamearena.com and start a game!

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Alt+B` | Toggle sidebar visibility |
| `Alt+T` | Toggle training mode (captures WebSocket data) |
| `Alt+D` | Download captured training data as JSON |

## Training Mode (Data Capture)

The parsers need real WebSocket data from BGA to work properly. Here's how to capture it:

1. Load the extension in Chrome
2. Go to boardgamearena.com and start a game
3. Press `Alt+B` to open the sidebar
4. Press `Alt+T` to enable Training Mode (you'll see "TRAINING" indicator)
5. Play the game normally - all WebSocket messages are captured
6. Press `Alt+D` to download the captured data as JSON
7. Share the JSON file so the parsers can be improved!

The captured data helps understand BGA's WebSocket protocol for each game.

## Project Structure

```
src/
├── manifest.json           # Chrome Extension manifest v3
├── background.js           # Service worker (settings, storage)
├── content.js              # Main content script integration
│
├── core/
│   ├── RuleEngine.js       # Universal rule evaluation engine
│   └── OpponentAnalyzer.js # Opponent behavior analysis
│
├── parsers/
│   ├── game-detector.js    # Detects which game is being played
│   ├── websocket-interceptor.js  # Captures BGA WebSocket traffic
│   ├── wingspan-parser.js  # Wingspan game state parser
│   ├── sushigo-parser.js   # Sushi Go game state parser
│   └── tickettoride-parser.js # Ticket to Ride parser
│
├── games/
│   ├── wingspan-rules.json     # Wingspan strategy rules
│   ├── sushigo-rules.json      # Sushi Go strategy rules
│   └── tickettoride-rules.json # Ticket to Ride rules
│
├── opponents/
│   ├── opponent-patterns-sushigo.json
│   ├── opponent-patterns-tickettoride.json
│   └── opponent-patterns-wingspan.json
│
├── ui/
│   ├── sidebar.html        # Main sidebar interface
│   ├── sidebar.css         # Sidebar styling
│   ├── popup.html          # Settings popup
│   └── popup.js            # Popup logic
│
└── icons/
    ├── icon16.png
    ├── icon32.png
    ├── icon48.png
    └── icon128.png
```

## How It Works

```
Board Game Arena (WebSocket)
            │
            ▼
    WebSocket Interceptor
    (captures all messages)
            │
    ┌───────┴───────┐
    ▼               ▼
Game Detector   Game Parser
(identifies     (transforms to
 game type)      game state)
    │               │
    └───────┬───────┘
            ▼
    ┌───────────────┐
    │               │
    ▼               ▼
Rule Engine    Opponent Analyzer
(evaluates     (tracks behavior,
 JSON rules)    classifies style)
    │               │
    └───────┬───────┘
            ▼
    Recommendations
    (sorted by priority)
            │
            ▼
        Sidebar UI
```

## Development

### Adding Support for New Games

1. Create a new parser in `src/parsers/{gamename}-parser.js`
2. Create rules JSON in `src/games/{gamename}-rules.json`
3. Create opponent patterns in `src/opponents/opponent-patterns-{gamename}.json`
4. Add the game to `game-detector.js` patterns
5. Update `manifest.json` to include the new parser

### Improving Existing Parsers

1. Enable Training Mode (`Alt+T`) and play a game
2. Download the training data (`Alt+D`)
3. Analyze the WebSocket message structure
4. Update the parser to extract relevant data

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Sidebar doesn't appear | Press `Alt+B` to toggle it |
| Game not detected | Check console for errors, try refreshing |
| No recommendations | The parser may need real WebSocket data |
| Extension not loading | Check `chrome://extensions` for errors |

## License

MIT
