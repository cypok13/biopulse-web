#!/bin/bash
# ============================================
# Biopulse — Deploy Script for VPS
# Usage: bash deploy/deploy.sh
# ============================================

set -e

echo "🫀 Deploying Biopulse..."

# Цвета
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# 1. Pull latest code
echo -e "${YELLOW}📥 Pulling latest code...${NC}"
git pull origin main

# 2. Install dependencies
echo -e "${YELLOW}📦 Installing bot dependencies...${NC}"
cd bot && npm ci --production=false && cd ..

echo -e "${YELLOW}📦 Installing web dependencies...${NC}"
cd web && npm ci --production=false && cd ..

# 3. Build
echo -e "${YELLOW}🔨 Building bot...${NC}"
cd bot && npm run build && cd ..

echo -e "${YELLOW}🔨 Building web...${NC}"
cd web && npm run build && cd ..

# 4. Restart PM2
echo -e "${YELLOW}🔄 Restarting services...${NC}"
pm2 restart ecosystem.config.js

# 5. Status
echo -e "${GREEN}✅ Biopulse deployed successfully!${NC}"
pm2 status
