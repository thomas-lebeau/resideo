#!/bin/bash
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# GitHub repository
REPO_OWNER="thomas-lebeau"
REPO_NAME="resideo"
DIR_NAME="raspberry-home-monitor"
BINARY_NAME="raspberry-home-monitor"

DOWNLOAD_URL=https://github.com/$REPO_OWNER/$REPO_NAME/releases/latest/download/$BINARY_NAME

# Determine installation directory
if [ -w "/usr/local" ]; then
    INSTALL_DIR="/usr/local"
elif [ -w "$HOME/.local/" ]; then
    INSTALL_DIR="$HOME/.local"
fi

if [ ! -d "$INSTALL_DIR/$DIR_NAME" ]; then
    mkdir -p "$INSTALL_DIR/$DIR_NAME"
fi

# Download binary
TEMP_FILE=$(mktemp)
echo -e "${YELLOW}Downloading $BINARY_NAME...${NC}"
if curl -L -o "$TEMP_FILE" "$DOWNLOAD_URL"; then
    echo -e "${GREEN}Download complete!${NC}"
else
    echo -e "${RED}Error: Failed to download binary${NC}"
    rm -f "$TEMP_FILE"
    exit 1
fi

# Install binary
echo -e "${YELLOW}Installing $BINARY_NAME to $INSTALL_DIR...${NC}"
mv "$TEMP_FILE" "$INSTALL_DIR/$DIR_NAME/$BINARY_NAME"
chmod +x "$INSTALL_DIR/$DIR_NAME/$BINARY_NAME"
ln -sf "$INSTALL_DIR/$DIR_NAME/$BINARY_NAME" "$INSTALL_DIR/bin/$BINARY_NAME"

echo -e "${GREEN}Installation complete!${NC}"
echo ""

# Check if install directory is in PATH
if echo "$PATH" | grep -q "$INSTALL_DIR/bin"; then
    echo -e "${GREEN}✓${NC} $INSTALL_DIR/bin is in your PATH"
else
    echo -e "${YELLOW}⚠${NC}  $INSTALL_DIR/bin is not in your PATH"
    echo "   Add this line to your shell profile (~/.bashrc, ~/.zshrc, etc.):"
    echo "   export PATH=\"$INSTALL_DIR/bin:\$PATH\""
    echo ""
fi

echo ""
echo -e "${GREEN}Installation successful!${NC}"
echo ""
echo "See the README for configuration instructions: https://github.com/$REPO_OWNER/$REPO_NAME/blob/main/README.md"
