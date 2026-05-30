# fTerm

A web-based SSH remote terminal tool with support for rz/sz file transfer.

## Features

- **Web SSH Terminal**: High-performance terminal experience based on xterm.js
- **Local Shell Support**: Native local shell access via node-pty
- **File Transfer**: Supports rz/sz (ZMODEM) file upload and download
- **Multi-Session Management**: Manage multiple SSH/local shell sessions simultaneously
- **Connection Management**: Visual connection configuration management (CRUD)
- **Desktop App**: Packaged as a cross-platform desktop client via NW.js

## Screenshot

![fterm Screenshot](./screenshot.png)

## Tech Stack

- **Frontend**: Vue 3 + TypeScript + Vite + Bootstrap 5 + xterm.js
- **Backend**: Node.js + Express + WebSocket (ws)
- **SSH/PTY**: ssh2 + node-pty
- **Build Tools**: Vite + TypeScript + nw-builder

## Quick Start

### Install

```bash
npm install -g @fefeding/fterm
# or
pnpm add -g @fefeding/fterm
```

### Requirements

- Node.js >= 18
- pnpm

### Install Dependencies

```bash
pnpm install
```

### Development Mode

```bash
pnpm dev
```

Visit http://localhost:9801 after starting.

### Build

```bash
# Build frontend + backend
pnpm build

# Build frontend only
pnpm run build-only
```

### Start Production Server

After global installation, use the `fterm` CLI command:

```bash
# Start the server (default port 9802)
sudo fterm start

# Stop the server
fterm stop

# Restart the server
fterm restart

# Show version
fterm -v
```

You can also start directly with Node.js:

```bash
node server.js
```

Or use npm scripts in the project directory:

```bash
# Start the server
npm start

# Stop the server
npm stop

# Restart the server
npm restart
```

Default port is 9802. You can specify a custom port via `--port` or the `PORT` environment variable:

```bash
node server.js --port 3000
```

### Desktop App (NW.js)

```bash
# Development mode
pnpm nw:dev

# Build for all platforms
pnpm nw:build        # Current platform
pnpm nw:build:win    # Windows
pnpm nw:build:osx    # macOS
pnpm nw:build:linux  # Linux
```

## Project Structure

```
.
├── bin/              # CLI entry
├── dist/             # Build output
├── public/           # Static assets
├── scripts/          # Build scripts
├── server/           # Server-side source (TypeScript)
│   ├── model/        # Entity definitions
│   ├── service/      # Business logic
│   └── index.ts      # Server entry point
├── src/              # Frontend source
│   ├── adapter/      # Data adapter layer
│   ├── base/         # Base modules
│   ├── components/   # Vue components
│   ├── platform/     # Platform entry
│   ├── service/      # Frontend services
│   ├── stores/       # Pinia state management
│   ├── utils/        # Utility functions
│   └── views/        # Page views
├── view/             # HTML templates
└── server.js         # Production startup script
```

## Development Notes

### Server-Side Development

Server code is located in the `server/` directory, written in TypeScript. In development mode, Vite directly references the source code, so no manual compilation is needed.

### Frontend Development

The frontend uses Vue 3 Composition API + Pinia for state management, with Bootstrap 5 as the UI framework.

### Connection Configuration

Connection information is persisted in local files on the server side.

## License

MIT
