# EarFood - Project Guide

## Overview
EarFood is a PWA that transforms PDF, EPUB, and DOCX documents into enriched audio reading experiences using Web Speech API TTS, with synchronized text display, bookmarks, highlighting, AI summaries, document chat, and markdown export.

## Tech Stack
- **Framework**: Vite + React 19 (no TypeScript)
- **Storage**: localForage (IndexedDB)
- **TTS**: Web Speech API (primary), Edge TTS (future)
- **AI**: Google Generative AI (Gemini 1.5 Flash) for summaries & chat
- **Document parsing**: pdfjs-dist, epubjs, mammoth
- **Search**: fuse.js (fuzzy search in highlights)
- **Icons**: lucide-react
- **Styles**: CSS files + CSS variables (academic theme, dark mode)
- **Deployment**: Docker + Nginx + Traefik

## Project Structure
```
src/
  components/
    Library.jsx        - Document library grid view
    Reader.jsx         - Main reader view (text + player + panels)
    Player.jsx         - Audio controls (play/pause, skip, speed, progress)
    BookmarkPanel.jsx  - Bookmark list and management
    HighlightPanel.jsx - Highlight management, color picker, search, annotations
    ExportPanel.jsx    - Markdown export view
    SummaryPanel.jsx   - AI chapter summaries (Gemini)
    ChatPanel.jsx      - Document chat with RAG + voice input/output
    SettingsPanel.jsx  - Settings: API key, dark mode, TTS mode, cache
    ImportModal.jsx    - File upload modal
    WIPLayer.jsx       - WIP/DONE overlay indicator
  stores/
    index.js           - All localforage stores + API functions
  utils/
    extractText.js     - PDF/EPUB/DOCX text extraction
    tts.js             - Web Speech API TTS engine
    gemini.js          - Gemini AI integration (summaries + chat)
    formatTime.js      - Time formatting helpers
  App.jsx              - Root component with routing + dark mode
  App.css              - Component styles
  index.css            - Global styles, CSS variables, dark mode
  main.jsx             - Entry point
```

## LocalForage Stores
- `documents` - Document metadata + extracted text
- `progress` - Reading position per document
- `bookmarks` - Bookmarks per document
- `highlights` - Text highlights with colors + annotations
- `summaries` - Cached AI-generated chapter summaries
- `settings` - App settings (API key, dark mode, TTS mode)
- `chat` - Chat history per document
- `analytics` - Listening time, sessions, completion stats

## Conventions
- No TypeScript, plain JSX
- French UI text (app is in French)
- CSS variables for theming (see index.css :root)
- localForage for all persistence (never localStorage)
- Semantic commit messages in English
- No unnecessary abstractions - keep it simple
- Hash-based routing (#/reader/:id)

## Key Design Tokens
- `--bg-paper: #fdfaf6` (cream background, `#1a1a2e` in dark)
- `--accent-gold: #c5a059` (gold accent)
- `--accent-navy / --text-main: #1a2b3c` (navy text)
- Font serif: Playfair Display
- Font sans: Inter

## Commands
- `npm run dev` - Dev server
- `npm run build` - Production build
- `npm run lint` - ESLint
