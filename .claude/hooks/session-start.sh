#!/bin/bash
# Claude Code Session Start Hook
# Ensures the correct Node.js version is available
# Only runs in Claude Code web sessions, not local environments

set -e

# Skip this hook if running locally (detect by checking common local indicators)
if [ -n "$HOME" ] && [ -d "$HOME/.config" ] && [ ! -f "/.dockerenv" ] && [ -z "$CODESPACES" ]; then
    # This appears to be a local environment with a real home directory
    # Skip the Node.js setup as the user likely has their own Node.js setup
    exit 0
fi

echo "🔧 Setting up Node.js environment..."

# Read Node version from .nvmrc
if [ -f ".nvmrc" ]; then
    NODE_VERSION=$(cat .nvmrc)
    echo "📋 .nvmrc specifies Node.js v${NODE_VERSION}"
else
    echo "⚠️  No .nvmrc found, using default Node.js v24.12.0"
    NODE_VERSION="24.12.0"
fi

# Install to ~/.local/bin which comes first in PATH on Claude Code web sessions
INSTALL_DIR="$HOME/.local"
mkdir -p "$INSTALL_DIR/bin"

# Check if the correct Node version is already installed
if [ -f "$INSTALL_DIR/bin/node" ] && [ "$("$INSTALL_DIR/bin/node" --version)" = "v${NODE_VERSION}" ]; then
    echo "✓ Node.js v${NODE_VERSION} already installed"
else
    echo "📥 Installing Node.js v${NODE_VERSION}..."

    # Download and install Node.js directly from nodejs.org
    cd /tmp
    curl -fsSLO "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-x64.tar.xz"
    tar -xJf "node-v${NODE_VERSION}-linux-x64.tar.xz"

    # Copy binaries to ~/.local (bin, lib, include, share)
    cp -r "node-v${NODE_VERSION}-linux-x64"/* "$INSTALL_DIR/"

    # Clean up
    rm -rf "node-v${NODE_VERSION}-linux-x64"*

    echo "✓ Node.js v${NODE_VERSION} installed to $INSTALL_DIR/bin"
fi

echo "✅ Node.js $($INSTALL_DIR/bin/node --version) ready!"
