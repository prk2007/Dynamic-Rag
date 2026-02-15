#!/bin/bash

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🔍 Dynamic RAG - Deployment Verification"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

PASSED=0
FAILED=0

# Detect docker-compose command
if docker compose version &> /dev/null; then
    DOCKER_COMPOSE="docker compose"
else
    DOCKER_COMPOSE="docker-compose"
fi

# Function to check service
check_service() {
    local service=$1
    local url=$2
    local expected=$3

    echo -n "   Testing $service..."

    if curl -s "$url" | grep -q "$expected"; then
        echo " ✅"
        PASSED=$((PASSED + 1))
        return 0
    else
        echo " ❌"
        FAILED=$((FAILED + 1))
        return 1
    fi
}

# Function to check container health
check_container() {
    local container=$1
    local name=$2

    echo -n "   Checking $name container..."

    if $DOCKER_COMPOSE ps | grep "$container" | grep -q "Up"; then
        echo " ✅"
        PASSED=$((PASSED + 1))
        return 0
    else
        echo " ❌"
        FAILED=$((FAILED + 1))
        return 1
    fi
}

echo "1️⃣  Checking Docker Containers"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
check_container "dynamicrag-postgres" "PostgreSQL"
check_container "dynamicrag-redis" "Redis"
check_container "dynamicrag-minio" "MinIO"
check_container "dynamicrag-api" "API Server"
check_container "dynamicrag-worker" "Worker"
check_container "dynamicrag-frontend" "Frontend"

echo ""
echo "2️⃣  Checking Service Health"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
check_service "API Health" "http://localhost:3001/health" "healthy"
check_service "MinIO" "http://localhost:9000/minio/health/live" "200"

echo ""
echo "3️⃣  Checking Frontend"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if curl -s http://localhost:3000 > /dev/null 2>&1; then
    echo "   Frontend is accessible... ✅"
    PASSED=$((PASSED + 1))
else
    echo "   Frontend is NOT accessible... ❌"
    FAILED=$((FAILED + 1))
fi

echo ""
echo "4️⃣  Checking Database"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Check if customers table exists
echo -n "   Database schema..."
if $DOCKER_COMPOSE exec -T postgres psql -U rag_user -d dynamic_rag -c "SELECT 1 FROM customers LIMIT 1;" 2>/dev/null | grep -q "1 row"; then
    echo " ✅"
    PASSED=$((PASSED + 1))
elif $DOCKER_COMPOSE exec -T postgres psql -U rag_user -d dynamic_rag -c "SELECT 1 FROM customers LIMIT 1;" 2>&1 | grep -q "0 rows"; then
    echo " ✅ (no data yet)"
    PASSED=$((PASSED + 1))
else
    echo " ❌"
    FAILED=$((FAILED + 1))
fi

# Check pgvector extension
echo -n "   pgvector extension..."
if $DOCKER_COMPOSE exec -T postgres psql -U rag_user -d dynamic_rag -c "SELECT * FROM pg_extension WHERE extname = 'vector';" 2>/dev/null | grep -q "vector"; then
    echo " ✅"
    PASSED=$((PASSED + 1))
else
    echo " ❌"
    FAILED=$((FAILED + 1))
fi

echo ""
echo "5️⃣  Checking Redis"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -n "   Redis connection..."
if $DOCKER_COMPOSE exec -T redis redis-cli ping 2>/dev/null | grep -q "PONG"; then
    echo " ✅"
    PASSED=$((PASSED + 1))
else
    echo " ❌"
    FAILED=$((FAILED + 1))
fi

echo ""
echo "6️⃣  Checking Configuration"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Check .env file
echo -n "   .env file exists..."
if [ -f .env ]; then
    echo " ✅"
    PASSED=$((PASSED + 1))
else
    echo " ❌"
    FAILED=$((FAILED + 1))
fi

# Check encryption key
echo -n "   ENCRYPTION_KEY configured..."
if [ -f .env ] && grep -q "ENCRYPTION_KEY=[a-f0-9]\{64\}" .env; then
    echo " ✅"
    PASSED=$((PASSED + 1))
else
    echo " ❌"
    FAILED=$((FAILED + 1))
fi

# Check frontend .env
echo -n "   frontend/.env exists..."
if [ -f frontend/.env ]; then
    echo " ✅"
    PASSED=$((PASSED + 1))
else
    echo " ❌"
    FAILED=$((FAILED + 1))
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📊 Verification Results"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "   Passed: $PASSED"
echo "   Failed: $FAILED"

if [ $FAILED -eq 0 ]; then
    echo ""
    echo "✅ All checks passed! Your deployment is ready."
    echo ""
    echo "🌐 Access URLs:"
    echo "   Frontend:      http://localhost:3000"
    echo "   API:           http://localhost:3001"
    echo "   MinIO Console: http://localhost:9001"
    echo ""
    exit 0
else
    echo ""
    echo "⚠️  Some checks failed. Please review the output above."
    echo ""
    echo "💡 Troubleshooting:"
    echo "   - Check logs: $DOCKER_COMPOSE logs -f"
    echo "   - Check status: $DOCKER_COMPOSE ps"
    echo "   - Restart: $DOCKER_COMPOSE restart"
    echo ""
    exit 1
fi
