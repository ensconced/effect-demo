#!/bin/bash
# Claude Code Session Start Hook
# Ensures the correct Node.js version is available using fnm

set -e

echo "🔧 Setting up Node.js environment..."

# Check if fnm is installed
if ! command -v fnm &> /dev/null; then
    echo "📦 Installing fnm (Fast Node Manager)..."

    # Try to download and install fnm
    if curl -fsSL https://fnm.vercel.app/install | bash -s -- --skip-shell; then
        echo "✓ fnm installed successfully"
    else
        # If fnm installation fails, try manual installation of Node v24
        echo "⚠️  fnm installation failed, installing Node.js v24 directly..."

        NODE_VERSION="24.12.0"
        if [ ! -f "/usr/local/bin/node" ] || [ "$(/usr/local/bin/node --version 2>/dev/null)" != "v${NODE_VERSION}" ]; then
            curl -fsSLO "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-x64.tar.xz"
            tar -xJf "node-v${NODE_VERSION}-linux-x64.tar.xz"
            cp -r "node-v${NODE_VERSION}-linux-x64"/* /usr/local/
            rm -rf "node-v${NODE_VERSION}-linux-x64"*
            echo "✓ Node.js v${NODE_VERSION} installed to /usr/local/bin"
        fi
    fi
fi

# If fnm is available, use it to install and use the correct Node version
if command -v fnm &> /dev/null; then
    # Read Node version from .nvmrc
    if [ -f ".nvmrc" ]; then
        NODE_VERSION=$(cat .nvmrc)
        echo "📋 .nvmrc specifies Node.js v${NODE_VERSION}"

        # Install the specified Node version if not already installed
        if ! fnm list | grep -q "${NODE_VERSION}"; then
            echo "📥 Installing Node.js v${NODE_VERSION}..."
            fnm install "${NODE_VERSION}"
        fi

        # Use the specified Node version
        fnm use "${NODE_VERSION}"
        echo "✓ Using Node.js $(node --version)"
    fi
else
    # Check if Node v24 is available
    if [ -f "/usr/local/bin/node" ]; then
        NODE_VERSION=$(/usr/local/bin/node --version)
        echo "✓ Using Node.js ${NODE_VERSION} from /usr/local/bin"
    else
        echo "⚠️  Warning: Node.js v24 may not be available. Falling back to system Node."
        echo "   Current Node version: $(node --version)"
    fi
fi

echo "✅ Node.js environment ready!"
