#!/usr/bin/env bash
set -e

BASE_URL="${API_URL:-http://localhost:3001}"
FRONTEND_URL="${FRONTEND_URL:-http://localhost:3000}"
PASS=0
FAIL=0

GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

pass() { PASS=$((PASS+1)); echo -e "  ${GREEN}✓${NC} $1"; }
fail() { FAIL=$((FAIL+1)); echo -e "  ${RED}✗${NC} $1"; }

echo "================================================"
echo "  IoT Gateway Platform - Test Suite"
echo "================================================"
echo ""

echo "--- Infrastructure Checks ---"

if command -v docker &> /dev/null; then
  for container in iot-postgres iot-redis iot-emqx iot-nats iot-minio; do
    if docker ps --format '{{.Names}}' 2>/dev/null | grep -q "$container"; then
      pass "$container is running"
    else
      fail "$container is not running"
    fi
  done
else
  fail "Docker not available"
fi

echo ""
echo "--- API Health Check ---"

HEALTH=$(curl -sf "$BASE_URL/health" 2>/dev/null || echo "")
if [ -n "$HEALTH" ]; then
  pass "Health endpoint returned: $(echo $HEALTH | grep -o '"status":"[^"]*"' | cut -d'"' -f4)"
else
  fail "Health endpoint unreachable at $BASE_URL/health"
fi

SWAGGER=$(curl -sf -o /dev/null -w "%{http_code}" "$BASE_URL/api/docs" 2>/dev/null || echo "000")
if [ "$SWAGGER" = "200" ] || [ "$SWAGGER" = "302" ]; then
  pass "Swagger docs accessible (HTTP $SWAGGER)"
else
  fail "Swagger docs not accessible (HTTP $SWAGGER)"
fi

echo ""
echo "--- Authentication Tests ---"

REGISTER=$(curl -sf -X POST "$BASE_URL/api/v1/auth/register" \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","password":"testpass123","name":"Test User"}' 2>/dev/null || echo "")
if echo "$REGISTER" | grep -q '"accessToken"'; then
  TOKEN=$(echo "$REGISTER" | grep -o '"accessToken":"[^"]*"' | cut -d'"' -f4)
  pass "Registration successful (new user)"
else
  LOGIN=$(curl -sf -X POST "$BASE_URL/api/v1/auth/login" \
    -H "Content-Type: application/json" \
    -d '{"email":"test@test.com","password":"testpass123"}' 2>/dev/null || echo "")
  if echo "$LOGIN" | grep -q '"accessToken"'; then
    TOKEN=$(echo "$LOGIN" | grep -o '"accessToken":"[^"]*"' | cut -d'"' -f4)
    pass "Login successful (existing user)"
  else
    fail "Authentication failed"
    TOKEN=""
  fi
fi

if [ -n "$TOKEN" ]; then
  PROFILE=$(curl -sf "$BASE_URL/api/v1/auth/profile" -H "Authorization: Bearer $TOKEN" 2>/dev/null || echo "")
  if echo "$PROFILE" | grep -q '"email"'; then
    pass "Profile endpoint works"
  else
    fail "Profile endpoint failed"
  fi

  echo ""
  echo "--- Gateway API Tests ---"

  GW_CREATE=$(curl -sf -X POST "$BASE_URL/api/v1/gateways" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TOKEN" \
    -d '{"deviceId":"GW-001","name":"Test Gateway","serialNumber":"SN-001","model":"IoT-GW-1000","manufacturer":"TestCorp"}' 2>/dev/null || echo "")
  if echo "$GW_CREATE" | grep -q '"id"'; then
    GW_ID=$(echo "$GW_CREATE" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
    pass "Gateway created (id: $GW_ID)"
  else
    GW_ID=""
    fail "Gateway creation failed: $GW_CREATE"
  fi

  if [ -n "$GW_ID" ]; then
    GW_GET=$(curl -sf "$BASE_URL/api/v1/gateways/$GW_ID" -H "Authorization: Bearer $TOKEN" 2>/dev/null || echo "")
    if echo "$GW_GET" | grep -q '"deviceId"'; then
      pass "Gateway detail retrieved"
    else
      fail "Gateway detail failed"
    fi

    GW_LIST=$(curl -sf "$BASE_URL/api/v1/gateways" -H "Authorization: Bearer $TOKEN" 2>/dev/null || echo "")
    if echo "$GW_LIST" | grep -q '"data"'; then
      pass "Gateway list retrieved"
    else
      fail "Gateway list failed"
    fi

    GW_STATS=$(curl -sf "$BASE_URL/api/v1/gateways/stats" -H "Authorization: Bearer $TOKEN" 2>/dev/null || echo "")
    if echo "$GW_STATS" | grep -q '"total"'; then
      pass "Gateway stats retrieved"
    else
      fail "Gateway stats failed"
    fi

    GW_METRICS=$(curl -sf "$BASE_URL/api/v1/gateways/$GW_ID/metrics" -H "Authorization: Bearer $TOKEN" 2>/dev/null || echo "")
    if echo "$GW_METRICS" | grep -q '"cpu"'; then
      pass "Gateway metrics retrieved"
    else
      fail "Gateway metrics failed"
    fi

    CMD=$(curl -sf -X POST "$BASE_URL/api/v1/gateways/$GW_ID/commands" \
      -H "Content-Type: application/json" \
      -H "Authorization: Bearer $TOKEN" \
      -d '{"type":"ping"}' 2>/dev/null || echo "")
    if echo "$CMD" | grep -q '"id"'; then
      pass "Command execution initiated"
    else
      fail "Command execution failed"
    fi
  fi

  echo ""
  echo "--- Firmware API Tests ---"

  FW=$(curl -sf -X POST "$BASE_URL/api/v1/firmware" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TOKEN" \
    -d '{"name":"Test Firmware","version":"1.0.0","filename":"fw-v1.bin","fileSize":4096,"checksum":"abc123"}' 2>/dev/null || echo "")
  if echo "$FW" | grep -q '"id"'; then
    FW_ID=$(echo "$FW" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
    pass "Firmware release created"
  else
    FW_ID=""
    fail "Firmware creation failed"
  fi

  if [ -n "$FW_ID" ]; then
    FW_LIST=$(curl -sf "$BASE_URL/api/v1/firmware" -H "Authorization: Bearer $TOKEN" 2>/dev/null || echo "")
    if echo "$FW_LIST" | grep -q '"data"'; then
      pass "Firmware list retrieved"
    else
      fail "Firmware list failed"
    fi
  fi

  echo ""
  echo "--- Monitoring & Alerts Tests ---"

  DASHBOARD=$(curl -sf "$BASE_URL/api/v1/monitoring/dashboard" -H "Authorization: Bearer $TOKEN" 2>/dev/null || echo "")
  if echo "$DASHBOARD" | grep -q '"totalGateways"'; then
    pass "Dashboard data retrieved"
  else
    fail "Dashboard endpoint failed"
  fi

  ALERTS=$(curl -sf "$BASE_URL/api/v1/alerts" -H "Authorization: Bearer $TOKEN" 2>/dev/null || echo "")
  if echo "$ALERTS" | grep -q '"data"'; then
    pass "Alerts list retrieved"
  else
    fail "Alerts endpoint failed"
  fi

  echo ""
  echo "--- Provisioning Tests ---"

  TOKEN_CREATE=$(curl -sf -X POST "$BASE_URL/api/v1/provisioning/tokens" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TOKEN" \
    -d '{"description":"Test token","maxUses":5}' 2>/dev/null || echo "")
  if echo "$TOKEN_CREATE" | grep -q '"token"'; then
    pass "Provisioning token created"
  else
    fail "Provisioning token creation failed"
  fi

  echo ""
  echo "--- Analytics Tests ---"

  UTIL=$(curl -sf "$BASE_URL/api/v1/analytics/utilization" -H "Authorization: Bearer $TOKEN" 2>/dev/null || echo "")
  if echo "$UTIL" | grep -q '"totalGateways"'; then
    pass "Analytics utilization retrieved"
  else
    fail "Analytics utilization failed"
  fi

  PERF=$(curl -sf "$BASE_URL/api/v1/analytics/performance" -H "Authorization: Bearer $TOKEN" 2>/dev/null || echo "")
  if echo "$PERF" | grep -q '"avgCpu"'; then
    pass "Analytics performance retrieved"
  else
    fail "Analytics performance failed"
  fi
fi

echo ""
echo "--- Frontend Check ---"

FE_CHECK=$(curl -sf -o /dev/null -w "%{http_code}" "$FRONTEND_URL" 2>/dev/null || echo "000")
if [ "$FE_CHECK" = "200" ]; then
  pass "Frontend is accessible (HTTP 200)"
else
  fail "Frontend not accessible (HTTP $FE_CHECK)"
fi

echo ""
echo "================================================"
echo -e "  Results: ${GREEN}$PASS passed${NC}, ${RED}$FAIL failed${NC}"
echo "================================================"

exit $FAIL
