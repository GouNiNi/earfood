# EarFood - Project Guide

## Overview
EarFood is a PWA that transforms PDF, EPUB, and DOCX documents into enriched audio reading experiences using Web Speech API TTS, with synchronized text display, bookmarks, highlighting, and markdown export.

## Tech Stack
- **Framework**: Vite + React 19 (no TypeScript)
- **Storage**: localForage (IndexedDB)
- **TTS**: Web Speech API (primary), Edge TTS (future)
- **Document parsing**: pdfjs-dist, epubjs, mammoth
- **Icons**: lucide-react
- **Styles**: CSS files + CSS variables (academic theme)
- **Deployment**: Docker + Nginx + Traefik

## Project Structure
```
src/
  components/
    Library.jsx        - Document library grid view
    Reader.jsx         - Main reader view (text + player)
    Player.jsx         - Audio controls (play/pause, skip, speed, progress)
    BookmarkPanel.jsx  - Bookmark list and management
    HighlightPanel.jsx - Highlight management and color picker
    ExportPanel.jsx    - Markdown export view
    ImportModal.jsx    - File upload modal
    WIPLayer.jsx       - WIP/DONE overlay indicator
  stores/
    index.js           - All localforage store instances
  utils/
    extractText.js     - PDF/EPUB/DOCX text extraction
    tts.js             - Web Speech API TTS engine
    formatTime.js      - Time formatting helpers
  App.jsx              - Root component with routing
  App.css              - Component styles
  index.css            - Global styles and CSS variables
  main.jsx             - Entry point
```

## Conventions
- No TypeScript, plain JSX
- French UI text (app is in French)
- CSS variables for theming (see index.css :root)
- localForage for all persistence (never localStorage)
- Semantic commit messages in English
- No unnecessary abstractions - keep it simple

## Key Design Tokens
- `--bg-paper: #fdfaf6` (cream background)
- `--accent-gold: #c5a059` (gold accent)
- `--accent-navy / --text-main: #1a2b3c` (navy text)
- Font serif: Playfair Display
- Font sans: Inter

## Commands
- `npm run dev` - Dev server
- `npm run build` - Production build
- `npm run lint` - ESLint
