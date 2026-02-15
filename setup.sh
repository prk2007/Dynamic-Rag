#!/bin/bash
set -e

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🚀 Dynamic RAG - Automated Setup Script"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Check if Docker and Docker Compose are installed
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed. Please install Docker first."
    echo "   Visit: https://docs.docker.com/get-docker/"
    exit 1
fi

if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
    echo "❌ Docker Compose is not installed. Please install Docker Compose first."
    echo "   Visit: https://docs.docker.com/compose/install/"
    exit 1
fi

echo "✅ Docker and Docker Compose are installed"
echo ""

# Detect if docker compose or docker-compose
if docker compose version &> /dev/null; then
    DOCKER_COMPOSE="docker compose"
else
    DOCKER_COMPOSE="docker-compose"
fi

# Check if .env exists
SKIP_ENV=false
if [ -f .env ]; then
    echo "⚠️  .env file already exists"
    read -p "   Do you want to overwrite it? (y/N): " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "   ✅ Keeping existing .env file"
        SKIP_ENV=true
    fi
fi

# Create .env file from example if needed
if [ "$SKIP_ENV" != "true" ]; then
    echo "📝 Creating .env file from template..."
    cp .env.example .env

    # Generate encryption key
    echo "🔐 Generating encryption key..."
    if command -v openssl &> /dev/null; then
        ENCRYPTION_KEY=$(openssl rand -hex 32)
        # Update .env file with generated encryption key
        if [[ "$OSTYPE" == "darwin"* ]]; then
            # macOS
            sed -i '' "s/ENCRYPTION_KEY=.*/ENCRYPTION_KEY=$ENCRYPTION_KEY/" .env
        else
            # Linux
            sed -i "s/ENCRYPTION_KEY=.*/ENCRYPTION_KEY=$ENCRYPTION_KEY/" .env
        fi
        echo "   ✅ Encryption key generated and added to .env"
    else
        echo "   ⚠️  OpenSSL not found - you need to manually set ENCRYPTION_KEY in .env"
        echo "      Run: openssl rand -hex 32"
    fi

    # Generate random database password
    if command -v openssl &> /dev/null; then
        DB_PASSWORD=$(openssl rand -hex 16)
    else
        DB_PASSWORD=$(cat /dev/urandom | tr -dc 'a-zA-Z0-9' | fold -w 32 | head -n 1)
    fi

    if [[ "$OSTYPE" == "darwin"* ]]; then
        sed -i '' "s/DB_PASSWORD=.*/DB_PASSWORD=$DB_PASSWORD/" .env
    else
        sed -i "s/DB_PASSWORD=.*/DB_PASSWORD=$DB_PASSWORD/" .env
    fi
    echo "   ✅ Database password generated"
    echo ""
fi

# Check if frontend/.env exists
if [ ! -f frontend/.env ] || [ "$SKIP_ENV" != "true" ]; then
    echo "📝 Creating frontend/.env file..."
    if [ -f frontend/.env.example ]; then
        cp frontend/.env.example frontend/.env
        echo "   ✅ Frontend .env created from template"
    else
        echo "VITE_API_URL=http://localhost:3001" > frontend/.env
        echo "   ✅ Frontend .env created with default values"
    fi
    echo ""
fi

echo "📦 Building and starting Docker containers..."
echo "   This may take a few minutes on first run..."
echo ""

# Stop any existing containers
$DOCKER_COMPOSE down 2>/dev/null || true

# Build and start containers
$DOCKER_COMPOSE build
$DOCKER_COMPOSE up -d

echo ""
echo "⏳ Waiting for services to be healthy..."
echo "   (This can take 30-60 seconds on first start)"
echo ""

# Wait for services to be healthy
MAX_WAIT=90
ELAPSED=0
DOTS=""
while [ $ELAPSED -lt $MAX_WAIT ]; do
    HEALTHY=$($DOCKER_COMPOSE ps | grep -c "healthy" || echo "0")
    RUNNING=$($DOCKER_COMPOSE ps | grep -c "Up" || echo "0")

    # Show progress
    DOTS="${DOTS}."
    if [ ${#DOTS} -gt 3 ]; then
        DOTS="."
    fi
    echo -ne "\r   Services: $RUNNING running, $HEALTHY healthy $DOTS   "

    if [ "$HEALTHY" -ge 3 ]; then
        echo ""
        echo "✅ All services are healthy!"
        break
    fi
    sleep 3
    ELAPSED=$((ELAPSED + 3))
done

echo ""

if [ $ELAPSED -ge $MAX_WAIT ]; then
    echo "⚠️  Services took longer than expected to start"
    echo "   Checking service status..."
fi

echo ""
echo "📊 Service Status:"
$DOCKER_COMPOSE ps

# Check if API is responding
echo ""
echo "🔍 Testing API endpoint..."
sleep 2
if curl -s http://localhost:3001/health > /dev/null 2>&1; then
    echo "✅ API is responding"
else
    echo "⚠️  API is not responding yet - it may still be initializing"
    echo "   Check logs with: $DOCKER_COMPOSE logs -f api"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Setup Complete!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "🌐 Access URLs:"
echo "   Frontend:      http://localhost:3000"
echo "   API:           http://localhost:3001"
echo "   Health Check:  http://localhost:3001/health"
echo "   MinIO Console: http://localhost:9001"
echo "                  (Login: minioadmin / minioadmin123)"
echo ""
echo "📋 Next Steps:"
echo "   1. Visit http://localhost:3000"
echo "   2. Create a new account (Sign Up)"
echo "   3. Verify your email (check logs if no SendGrid)"
echo "   4. Start uploading and searching documents!"
echo ""
echo "🔍 Useful Commands:"
echo "   View all logs:        $DOCKER_COMPOSE logs -f"
echo "   View API logs:        $DOCKER_COMPOSE logs -f api"
echo "   View worker logs:     $DOCKER_COMPOSE logs -f worker"
echo "   View service status:  $DOCKER_COMPOSE ps"
echo "   Stop services:        $DOCKER_COMPOSE down"
echo "   Stop & remove data:   $DOCKER_COMPOSE down -v"
echo ""
echo "📖 Documentation: README.md"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
