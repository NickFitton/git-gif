# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Git Gif is a browser-based video-to-GIF converter designed for creating GIFs optimized for GitHub. It uses FFmpeg.wasm to perform video transcoding entirely in the browser (no server-side processing).
The project allows the user to configure the output width and framerate.

## Development Commands

```bash
pnpm install          # Install dependencies
pnpm dev              # Start dev server at localhost:4321
pnpm build            # Type-check and build for production (also downloads FFmpeg assets)
pnpm preview          # Preview production build locally
```

## Architecture

**Tech Stack:** Astro 4.x static site with client-side FFmpeg.wasm for video processing.

**FFmpeg Integration:**

- FFmpeg libraries are downloaded at build time (not installed as npm dependencies)
- Assets served from `/assets/` include: ffmpeg, util, core, and core-mt packages
- Transcoding happens client-side using the FFmpeg class with configurable width and framerate
