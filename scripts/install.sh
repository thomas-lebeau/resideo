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
SERVICE_NAME="${BINARY_NAME}.service"

echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}  Raspberry Home Monitor Installation${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Check if running as root
IS_ROOT=false
if [ "$EUID" -eq 0 ]; then
    IS_ROOT=true
    CURRENT_USER="${SUDO_USER:-root}"
else
    CURRENT_USER="$USER"
fi

# Detect architecture
echo -e "${BLUE}Detecting system architecture...${NC}"
ARCH=$(uname -m)
case "$ARCH" in
    x86_64)
        ARCHIVE_NAME="${BINARY_NAME}-linux-x64.tar.gz"
        echo -e "${GREEN}✓ Detected: x86_64 (x64)${NC}"
        ;;
    armv7l|armv6l)
        ARCHIVE_NAME="${BINARY_NAME}-linux-armv7.tar.gz"
        echo -e "${GREEN}✓ Detected: ARM (ARMv7)${NC}"
        ;;
    aarch64|arm64)
        # Try ARMv7 for 64-bit ARM (like Raspberry Pi 4 running 64-bit OS)
        ARCHIVE_NAME="${BINARY_NAME}-linux-armv7.tar.gz"
        echo -e "${GREEN}✓ Detected: ARM64 - will try ARMv7 build${NC}"
        ;;
    *)
        echo -e "${RED}Error: Unsupported architecture: $ARCH${NC}"
        echo "Supported architectures: x86_64, armv7l, armv6l, aarch64"
        exit 1
        ;;
esac

DOWNLOAD_URL="https://github.com/$REPO_OWNER/$REPO_NAME/releases/latest/download/$ARCHIVE_NAME"

# Determine installation directory
if [ "$IS_ROOT" = true ] || [ -w "/usr/local" ]; then
    INSTALL_DIR="/usr/local"
elif [ -w "$HOME/.local/" ]; then
    INSTALL_DIR="$HOME/.local"
else
    echo -e "${RED}Error: Cannot write to /usr/local or ~/.local${NC}"
    echo "Please run with sudo or create ~/.local directory"
    exit 1
fi

echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}  Step 1: Installing Binary${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

if [ ! -d "$INSTALL_DIR/$DIR_NAME" ]; then
    mkdir -p "$INSTALL_DIR/$DIR_NAME"
fi

# Download archive
TEMP_FILE=$(mktemp)
TEMP_DIR=$(mktemp -d)
echo -e "${YELLOW}Downloading $ARCHIVE_NAME...${NC}"
if curl -L -o "$TEMP_FILE" "$DOWNLOAD_URL"; then
    echo -e "${GREEN}✓ Download complete${NC}"
else
    echo -e "${RED}Error: Failed to download archive${NC}"
    rm -f "$TEMP_FILE"
    rm -rf "$TEMP_DIR"
    exit 1
fi

# Extract archive
echo -e "${YELLOW}Extracting archive...${NC}"
if tar -xzf "$TEMP_FILE" -C "$TEMP_DIR"; then
    echo -e "${GREEN}✓ Extraction complete${NC}"
else
    echo -e "${RED}Error: Failed to extract archive${NC}"
    rm -f "$TEMP_FILE"
    rm -rf "$TEMP_DIR"
    exit 1
fi

# Install binary and dependencies
echo -e "${YELLOW}Installing to $INSTALL_DIR/$DIR_NAME...${NC}"
# Remove old installation if it exists
rm -rf "$INSTALL_DIR/$DIR_NAME"
mkdir -p "$INSTALL_DIR/$DIR_NAME"

# Copy everything (binary + node_modules if present)
cp -r "$TEMP_DIR/"* "$INSTALL_DIR/$DIR_NAME/"
chmod +x "$INSTALL_DIR/$DIR_NAME/$BINARY_NAME"

# Create symlink to binary
mkdir -p "$INSTALL_DIR/bin"
ln -sf "$INSTALL_DIR/$DIR_NAME/$BINARY_NAME" "$INSTALL_DIR/bin/$BINARY_NAME"

# Cleanup
rm -f "$TEMP_FILE"
rm -rf "$TEMP_DIR"

echo -e "${GREEN}✓ Binary installed successfully${NC}"
BINARY_PATH="$INSTALL_DIR/bin/$BINARY_NAME"

# Check if install directory is in PATH
if echo "$PATH" | grep -q "$INSTALL_DIR/bin"; then
    echo -e "${GREEN}✓ $INSTALL_DIR/bin is in your PATH${NC}"
else
    echo -e "${YELLOW}⚠ $INSTALL_DIR/bin is not in your PATH${NC}"
    echo "  Add this line to your shell profile (~/.bashrc, ~/.zshrc, etc.):"
    echo "  export PATH=\"$INSTALL_DIR/bin:\$PATH\""
fi

# Service installation (only if running as root)
if [ "$IS_ROOT" = true ]; then
    echo ""
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}  Step 2: Setting Up Systemd Service${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""

    SERVICE_FILE="/etc/systemd/system/$SERVICE_NAME"

    if [ -f "$SERVICE_FILE" ]; then
        # Service file already exists (update scenario)
        echo -e "${YELLOW}Service file already exists at $SERVICE_FILE${NC}"
        echo -e "${GREEN}✓ Binary updated${NC}"
        echo ""

        # Ask if user wants to restart the service
        read -p "$(echo -e ${BLUE}Would you like to restart the service now to apply the update? [Y/n]${NC} )" -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]] || [[ -z $REPLY ]]; then
            echo -e "${YELLOW}Restarting service...${NC}"
            if systemctl restart "$SERVICE_NAME"; then
                echo -e "${GREEN}✓ Service restarted successfully${NC}"
            else
                echo -e "${RED}Error: Failed to restart service${NC}"
                echo -e "${BLUE}You can restart it manually with:${NC}"
                echo -e "  ${GREEN}sudo systemctl restart $SERVICE_NAME${NC}"
            fi
        else
            echo -e "${BLUE}Skipped restart. To apply the update later, run:${NC}"
            echo -e "  ${GREEN}sudo systemctl restart $SERVICE_NAME${NC}"
        fi
    else
        # First time installation
        echo -e "${YELLOW}Installing service file...${NC}"

        # Copy service file from installation directory
        if [ -f "$INSTALL_DIR/$DIR_NAME/$SERVICE_NAME" ]; then
            cp "$INSTALL_DIR/$DIR_NAME/$SERVICE_NAME" "$SERVICE_FILE"
            echo -e "${GREEN}✓ Service file installed${NC}"
        else
            echo -e "${RED}Error: Service template not found in release${NC}"
            exit 1
        fi

        echo ""
        echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
        echo -e "${YELLOW}  ⚠ Configuration Required${NC}"
        echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
        echo ""
        echo "Please edit the service file to configure:"
        echo "  1. User to run the service as"
        echo "  2. Path to your .env file"
        echo ""
        echo -e "  ${GREEN}sudo nano $SERVICE_FILE${NC}"
        echo ""
        echo "Then enable and start the service:"
        echo -e "  ${GREEN}sudo systemctl daemon-reload${NC}"
        echo -e "  ${GREEN}sudo systemctl enable $SERVICE_NAME${NC}"
        echo -e "  ${GREEN}sudo systemctl start $SERVICE_NAME${NC}"
    fi

    echo ""
    echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${GREEN}  ✓ Installation Complete!${NC}"
    echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""

    echo -e "${BLUE}Useful Commands:${NC}"
    echo "  View logs:      sudo journalctl -u $SERVICE_NAME -f"
    echo "  Stop service:   sudo systemctl stop $SERVICE_NAME"
    echo "  Start service:  sudo systemctl start $SERVICE_NAME"
    echo "  Restart:        sudo systemctl restart $SERVICE_NAME"
    echo "  Status:         sudo systemctl status $SERVICE_NAME"

else
    # Not running as root
    echo ""
    echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${GREEN}  ✓ Binary Installation Complete!${NC}"
    echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""

    echo -e "${BLUE}Installed:${NC} $ARCHIVE_NAME"
    echo -e "${BLUE}Location:${NC}  $BINARY_PATH"
    echo ""

    echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${YELLOW}  ⚠ Systemd Service Not Installed${NC}"
    echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    echo "To install as a systemd service (required for auto-start on boot),"
    echo "please run this script again with sudo:"
    echo ""
    echo -e "  ${GREEN}curl -fsSL https://raw.githubusercontent.com/$REPO_OWNER/$REPO_NAME/main/scripts/install.sh | sudo bash${NC}"
    echo ""
    echo "Or test the binary manually:"
    echo -e "  ${GREEN}$BINARY_NAME --help${NC}"
fi

echo ""
