# Castl

A modern chess application built with React and Vite, featuring Stockfish engine integration for analysis and review.

## Features

- Interactive chess board with drag-and-drop moves
- Game analysis with Stockfish engine
- Move review and evaluation
- Clean, responsive UI built with React

## Tech Stack

- **Frontend**: React 19
- **Build Tool**: Vite
- **Chess Logic**: chess.js
- **Engine**: Stockfish.js
- **Styling**: Tailwind CSS
- **Deployment**: GitHub Pages

## Getting Started

### Prerequisites

- Node.js (v16 or higher)
- npm or yarn

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/NotJulz/castl.git
   cd castl
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the development server:
   ```bash
   npm run dev
   ```

4. Open [http://localhost:5173](http://localhost:5173) in your browser.

### Build for Production

```bash
npm run build
```

### Deploy to GitHub Pages

```bash
npm run deploy
```

## Project Structure

```
src/
├── App.jsx          # Main app component
├── Board.jsx        # Chess board component
├── Game.jsx         # Game logic and state
├── Review.jsx       # Move review and analysis
├── main.jsx         # App entry point
└── assets/          # Static assets
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

This project is open source and available under the [MIT License](LICENSE).
