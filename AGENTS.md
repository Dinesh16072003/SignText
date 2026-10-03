# AGENTS.md - Signtext

This file contains the rules and conventions for building Signtext. Follow these strictly.

## Project Overview
Signtext recognizes American Sign Language in real time from a webcam or an uploaded video and shows the text in a container, like Google Translate.  

Stack: Vite + React frontend, Supabase for login and data, MediaPipe hand landmarks in the browser, and a TensorFlow.js model for recognition (added later).

## Folder Structure
Always maintain this structure:
- `backend/`
- `database/`
- `ml/` (Python training)
- `frontend/` with `src/` containing: `assets/`, `components/`, `context/`, `data/`, `hooks/`, `pages/`, `services/`

## Rules for This Project
- Keep the folder structure above. Never rename top-level folders without approval.
- Never fake model output. Only display real predictions once the model is integrated.
- Work on one task at a time. After each task, tell me exactly how to run and test it.
- Make it look like a polished, professional product, not a demo.
- Write clear, plain-language messages for empty, loading, and error states. No placeholder lorem ipsum. No stock gradients or decorative clutter.
- Fully responsive from phone to desktop. Support keyboard navigation.
- High contrast: text must be easy to read. This app is for accessibility.

## Design System
Use CSS variables defined once (in `frontend/src/index.css`) for a consistent look.

### Colors
- Calm color palette with one strong accent color.
- High contrast for all text and UI elements.
- Define semantic color tokens (background, surface, text, border, accent, accent-hover, etc.) as CSS variables.

### Typography
- One accessible font family used across the app.
- Define font sizes as CSS variables.
- Use generous spacing throughout.

### Spacing
- Define spacing scale as CSS variables (e.g., --space-1 through --space-6 or similar).
- Use consistent spacing for padding, margins, gaps.

### Components
- Buttons, inputs, and cards must share one consistent style.
- All interactive elements must have clear hover, focus, and disabled states.
- Focus states must be visible and keyboard-accessible.

### Layout
- Add a top navigation bar with the logo on the left and "Sign in" / "Create account" on the right.
- The Translate page has two large panes side by side (like Google Translate), stacked on mobile.
- Video pane (left): "Use camera" and "Upload video" buttons (UI only for now). Show camera or chosen video when triggered. Include a short helper line under the video explaining what to do.
- Text pane (right): "Copy" and "Clear" buttons. Include a friendly empty state when nothing is present.
- No hand tracking, no login, no model yet (these come later).