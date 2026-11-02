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
        ARCHIVE_NAME="${BINARY_NAME}-linux-arm64.tar.gz"
        echo -e "${GREEN}✓ Detected: ARM64${NC}"
        ;;
    *)
        echo -e "${RED}Error: Unsupported architecture: $ARCH${NC}"
        echo "Supported architectures: x86_64, armv7l, armv6l, aarch64"
        exit 1
        ;;
esac

DOWNLOAD_URL="https://github.com/$REPO_OWNER/$REPO_NAME/releases/latest/download/$ARCHIVE_NAME"

# Releases published before the arm64 build existed only ship armv7
if [[ "$ARCHIVE_NAME" == *-linux-arm64.tar.gz ]]; then
    HTTP_CODE=$(curl -sIL --retry 3 --connect-timeout 10 -o /dev/null -w '%{http_code}' "$DOWNLOAD_URL" || true)
    if [ "$HTTP_CODE" = "404" ]; then
        ARCHIVE_NAME="${BINARY_NAME}-linux-armv7.tar.gz"
        DOWNLOAD_URL="https://github.com/$REPO_OWNER/$REPO_NAME/releases/latest/download/$ARCHIVE_NAME"
        echo -e "${YELLOW}⚠ No ARM64 build in the latest release, falling back to ARMv7${NC}"
    elif [[ "$HTTP_CODE" != 2* ]]; then
        echo -e "${RED}Error: Could not check for ARM64 build (HTTP $HTTP_CODE)${NC}"
        exit 1
    fi
fi

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

TARGET_DIR="$INSTALL_DIR/$DIR_NAME"
TEMP_FILE=""
CHECKSUM_FILE=""
STAGING_DIR=""
BACKUP_DIR=""

cleanup() {
    # Put the previous install back if we stopped between the two renames
    if [ -n "$BACKUP_DIR" ] && [ -d "$BACKUP_DIR" ] && [ ! -e "$TARGET_DIR" ]; then
        mv "$BACKUP_DIR" "$TARGET_DIR"
    fi
    rm -f "$TEMP_FILE" "$CHECKSUM_FILE"
    rm -rf "$STAGING_DIR" "$BACKUP_DIR"
}
trap cleanup EXIT

TEMP_FILE=$(mktemp)
CHECKSUM_FILE=$(mktemp)
# Extract next to the target (same filesystem) so the swap below is a rename
STAGING_DIR=$(mktemp -d "$INSTALL_DIR/.$DIR_NAME.XXXXXX")
BACKUP_DIR="$STAGING_DIR.old"

# Download archive (-f: fail on HTTP errors instead of saving the error page)
echo -e "${YELLOW}Downloading $ARCHIVE_NAME...${NC}"
if curl -fL -o "$TEMP_FILE" "$DOWNLOAD_URL"; then
    echo -e "${GREEN}✓ Download complete${NC}"
else
    echo -e "${RED}Error: Failed to download archive${NC}"
    exit 1
fi

# Verify checksum (releases published before checksums existed don't have one)
echo -e "${YELLOW}Verifying checksum...${NC}"
HTTP_CODE=$(curl -sSL --retry 3 --connect-timeout 10 -o "$CHECKSUM_FILE" -w '%{http_code}' "$DOWNLOAD_URL.sha256" || true)
if [ "$HTTP_CODE" = "404" ]; then
    echo -e "${YELLOW}⚠ No checksum published for this release, skipping verification${NC}"
elif [[ "$HTTP_CODE" == 2* ]]; then
    read -r EXPECTED_SHA256 _ < "$CHECKSUM_FILE" || true
    ACTUAL_SHA256=$(sha256sum "$TEMP_FILE")
    ACTUAL_SHA256="${ACTUAL_SHA256%% *}"
    if [[ ! "$EXPECTED_SHA256" =~ ^[0-9a-f]{64}$ ]]; then
        echo -e "${RED}Error: Invalid checksum file for $ARCHIVE_NAME${NC}"
        exit 1
    elif [ "$EXPECTED_SHA256" != "$ACTUAL_SHA256" ]; then
        echo -e "${RED}Error: Checksum mismatch for $ARCHIVE_NAME${NC}"
        echo "  Expected: $EXPECTED_SHA256"
        echo "  Actual:   $ACTUAL_SHA256"
        exit 1
    fi
    echo -e "${GREEN}✓ Checksum verified${NC}"
else
    echo -e "${RED}Error: Could not download checksum (HTTP $HTTP_CODE)${NC}"
    exit 1
fi

# Extract archive
echo -e "${YELLOW}Extracting archive...${NC}"
if tar -xzf "$TEMP_FILE" -C "$STAGING_DIR" && [ -f "$STAGING_DIR/$BINARY_NAME" ]; then
    echo -e "${GREEN}✓ Extraction complete${NC}"
else
    echo -e "${RED}Error: Failed to extract archive${NC}"
    exit 1
fi
chmod 755 "$STAGING_DIR"
chmod +x "$STAGING_DIR/$BINARY_NAME"

# Swap the new install in, keeping the old one until the new one is in place
echo -e "${YELLOW}Installing to $TARGET_DIR...${NC}"
if [ -e "$TARGET_DIR" ]; then
    mv "$TARGET_DIR" "$BACKUP_DIR"
fi
if ! mv "$STAGING_DIR" "$TARGET_DIR"; then
    echo -e "${RED}Error: Failed to install to $TARGET_DIR${NC}"
    exit 1
fi

# Create symlink to binary
mkdir -p "$INSTALL_DIR/bin"
ln -sf "$TARGET_DIR/$BINARY_NAME" "$INSTALL_DIR/bin/$BINARY_NAME"

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
