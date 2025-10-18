#!/bin/bash
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# GitHub repository
REPO_OWNER="thomas-lebeau"
REPO_NAME="resideo"
DIR_NAME="raspberry-home-monitor"
BINARY_NAME="raspberry-home-monitor"

# Detect architecture
echo -e "${BLUE}Detecting system architecture...${NC}"
ARCH=$(uname -m)
case "$ARCH" in
    x86_64)
        ARCHIVE_NAME="${BINARY_NAME}-linux-x64.tar.gz"
        echo -e "${GREEN}Detected: x86_64 (x64)${NC}"
        ;;
    armv7l|armv6l)
        ARCHIVE_NAME="${BINARY_NAME}-linux-armv7.tar.gz"
        echo -e "${GREEN}Detected: ARM (ARMv7)${NC}"
        ;;
    aarch64|arm64)
        # Try ARMv7 for 64-bit ARM (like Raspberry Pi 4 running 64-bit OS)
        ARCHIVE_NAME="${BINARY_NAME}-linux-armv7.tar.gz"
        echo -e "${YELLOW}Detected: ARM64 - will try ARMv7 build${NC}"
        ;;
    *)
        echo -e "${RED}Error: Unsupported architecture: $ARCH${NC}"
        echo "Supported architectures: x86_64, armv7l, armv6l, aarch64"
        exit 1
        ;;
esac

DOWNLOAD_URL="https://github.com/$REPO_OWNER/$REPO_NAME/releases/latest/download/$ARCHIVE_NAME"

# Determine installation directory
if [ -w "/usr/local" ]; then
    INSTALL_DIR="/usr/local"
elif [ -w "$HOME/.local/" ]; then
    INSTALL_DIR="$HOME/.local"
fi

if [ ! -d "$INSTALL_DIR/$DIR_NAME" ]; then
    mkdir -p "$INSTALL_DIR/$DIR_NAME"
fi

# Download archive
TEMP_FILE=$(mktemp)
TEMP_DIR=$(mktemp -d)
echo -e "${YELLOW}Downloading $ARCHIVE_NAME...${NC}"
if curl -L -o "$TEMP_FILE" "$DOWNLOAD_URL"; then
    echo -e "${GREEN}Download complete!${NC}"
else
    echo -e "${RED}Error: Failed to download archive${NC}"
    rm -f "$TEMP_FILE"
    rm -rf "$TEMP_DIR"
    exit 1
fi

# Extract archive
echo -e "${YELLOW}Extracting archive...${NC}"
if tar -xzf "$TEMP_FILE" -C "$TEMP_DIR"; then
    echo -e "${GREEN}Extraction complete!${NC}"
else
    echo -e "${RED}Error: Failed to extract archive${NC}"
    rm -f "$TEMP_FILE"
    rm -rf "$TEMP_DIR"
    exit 1
fi

# Install binary and dependencies
echo -e "${YELLOW}Installing $BINARY_NAME to $INSTALL_DIR/$DIR_NAME...${NC}"
# Remove old installation if it exists
rm -rf "$INSTALL_DIR/$DIR_NAME"
mkdir -p "$INSTALL_DIR/$DIR_NAME"

# Copy everything (binary + node_modules if present)
cp -r "$TEMP_DIR/"* "$INSTALL_DIR/$DIR_NAME/"
chmod +x "$INSTALL_DIR/$DIR_NAME/$BINARY_NAME"

# Create wrapper script if node_modules exist (ARMv7 build)
if [ -d "$INSTALL_DIR/$DIR_NAME/node_modules" ]; then
    cat > "$INSTALL_DIR/$DIR_NAME/${BINARY_NAME}-wrapper.sh" << EOF
#!/bin/bash
SCRIPT_DIR="\$( cd "\$( dirname "\${BASH_SOURCE[0]}" )" && pwd )"
export NODE_PATH="\$SCRIPT_DIR/node_modules:\$NODE_PATH"
exec "\$SCRIPT_DIR/$BINARY_NAME" "\$@"
EOF
    chmod +x "$INSTALL_DIR/$DIR_NAME/${BINARY_NAME}-wrapper.sh"
    # Symlink to the wrapper instead
    mkdir -p "$INSTALL_DIR/bin"
    ln -sf "$INSTALL_DIR/$DIR_NAME/${BINARY_NAME}-wrapper.sh" "$INSTALL_DIR/bin/$BINARY_NAME"
else
    # No node_modules, link directly to binary
    mkdir -p "$INSTALL_DIR/bin"
    ln -sf "$INSTALL_DIR/$DIR_NAME/$BINARY_NAME" "$INSTALL_DIR/bin/$BINARY_NAME"
fi

# Cleanup
rm -f "$TEMP_FILE"
rm -rf "$TEMP_DIR"

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
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}✓ Installation successful!${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "${BLUE}Installed:${NC} $ARCHIVE_NAME"
echo -e "${BLUE}Location:${NC}  $INSTALL_DIR/$DIR_NAME/$BINARY_NAME"
echo ""
echo "Run '${GREEN}$BINARY_NAME --help${NC}' to get started"
echo ""
echo "Configuration and documentation:"
echo "https://github.com/$REPO_OWNER/$REPO_NAME/blob/main/README.md"
