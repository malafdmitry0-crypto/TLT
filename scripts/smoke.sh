#!/usr/bin/env bash
# =====================================================================
# ТЛТ · Smoke-тесты приёмки (API уровня, против running-стека)
# =====================================================================
# Запуск:
#   scripts/smoke.sh                       # http://localhost:8080 (demo)
#   scripts/smoke.sh http://localhost:3003 # произвольный URL UI
#   SMOKE_API_BASE_URL=http://localhost:8000/api/v1 scripts/smoke.sh http://localhost:3003
#
# Exit code: 0 — все проверки прошли, 1 — есть падения.
# Требует: curl, python3.
# =====================================================================

set -uo pipefail

BASE_URL="${1:-http://localhost:8080}"
API="${SMOKE_API_BASE_URL:-$BASE_URL/api/v1}"

pass=0
fail=0
ok()  { echo "✅ $1"; pass=$((pass+1)); }
bad() { echo "❌ $1"; fail=$((fail+1)); }

_json_field() {
  # _json_field '<json>' '<field>' — извлекает поле; 'dotted.path' не поддерживается.
  python3 -c "import sys,json;d=json.loads(sys.argv[1]);print(d.get(sys.argv[2],''))" "$1" "$2" 2>/dev/null
}

_json_len() {
  python3 -c "import sys,json;print(len(json.loads(sys.argv[1])))" "$1" 2>/dev/null
}

_json_first_field() {
  python3 -c "import sys,json;d=json.loads(sys.argv[1]);print(d[0].get(sys.argv[2], '') if d else '')" "$1" "$2" 2>/dev/null
}

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  ТЛТ smoke · $BASE_URL"
echo "  API · $API"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# --- Инфраструктура ---
echo ""
echo "[Инфраструктура]"
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/")
[ "$code" = "200" ] && ok "UI отвечает 200" || bad "UI code=$code"

code=$(curl -s -o /dev/null -w "%{http_code}" "$API/openapi.json")
[ "$code" = "200" ] && ok "OpenAPI JSON доступен" || bad "OpenAPI code=$code"

# --- Аутентификация ---
echo ""
echo "[Аутентификация]"
RESP=$(curl -s -X POST "$API/auth/guest")
SID=$(_json_field "$RESP" "session_id")
[ -n "$SID" ] && ok "Гостевая сессия" || bad "Гостевой вход: $RESP"

RESP=$(curl -s -X POST "$API/auth/login" -H "Content-Type: application/json" \
  -d '{"email":"admin@heatcalc.io","password":"admin"}')
TOK=$(_json_field "$RESP" "access_token")
[ -n "$TOK" ] && ok "Логин admin@heatcalc.io" || bad "Админ логин: $RESP"

RESP=$(curl -s -X POST "$API/auth/login" -H "Content-Type: application/json" \
  -d '{"email":"petrov@heatcalc.io","password":"Employee1!"}')
ETOK=$(_json_field "$RESP" "access_token")
[ -n "$ETOK" ] && ok "Логин petrov@heatcalc.io" || bad "Сотрудник логин: $RESP"

# --- Справочники ---
echo ""
echo "[Справочники]"
CNT=$(_json_len "$(curl -s -H "X-Session-Id: $SID" $API/references/climate)")
[ "${CNT:-0}" -ge 500 ] && ok "Климат: $CNT городов (ожидается 536)" || bad "Климат: $CNT"

CNT=$(_json_len "$(curl -s -H "X-Session-Id: $SID" $API/references/cables)")
[ "${CNT:-0}" = "10" ] && ok "Кабели ТЛТ: 10 марок" || bad "Кабелей: $CNT"

CNT=$(_json_len "$(curl -s -H "X-Session-Id: $SID" $API/references/insulation)")
[ "${CNT:-0}" -ge 6 ] && ok "Материалы изоляции: $CNT (≥6)" || bad "Изоляция: $CNT"

# --- Бизнес-сценарий ---
echo ""
echo "[Бизнес-сценарий]"
PID=$(_json_first_field "$(curl -s -H "X-Session-Id: $SID" $API/projects)" "id")
[ -n "$PID" ] && ok "Гостевой авто-проект доступен" || bad "Гостевой авто-проект не найден"

PAYLOAD='{"object_type":"pipe","params":{"outer_diameter":0.108,"insulation_thickness":0.05,"insulation_material":"mineral_wool","ambient_temperature":-30,"process_temperature":80,"pipe_length":50,"installation":"outdoor"}}'
RESP=$(curl -s -X POST "$API/projects/$PID/objects" \
  -H "Content-Type: application/json" -H "X-Session-Id: $SID" -d "$PAYLOAD")
HL=$(python3 -c "import sys,json;print(round(json.loads(sys.argv[1])['results']['heat_loss_per_meter'],2))" "$RESP" 2>/dev/null)
[ -n "$HL" ] && ok "Теплопотери трубы = $HL Вт/м" || bad "Расчёт трубы"

RESP=$(curl -s -X POST "$API/calc/electrical/batch?project_id=$PID" -H "X-Session-Id: $SID")
CABLE=$(python3 -c "import sys,json;print(json.loads(sys.argv[1])['results'][0]['cable_mark'])" "$RESP" 2>/dev/null)
[ -n "$CABLE" ] && ok "Автоподбор кабеля: $CABLE" || bad "Электрорасчёт сломан"

# --- Экспорт отчётов ---
echo ""
echo "[Экспорт]"
EPID=$(_json_field "$(curl -s -X POST $API/projects \
  -H "Content-Type: application/json" -H "Authorization: Bearer $ETOK" \
  -d '{"name":"Report"}')" "id")
curl -s -X POST "$API/projects/$EPID/objects" \
  -H "Content-Type: application/json" -H "Authorization: Bearer $ETOK" \
  -d "$PAYLOAD" > /dev/null
curl -s -X POST "$API/calc/electrical/batch?project_id=$EPID" \
  -H "Authorization: Bearer $ETOK" > /dev/null

for fmt in pdf docx xlsx; do
  TMP="/tmp/smoke-report.$fmt"
  code=$(curl -s -o "$TMP" -w "%{http_code}" \
    -H "Authorization: Bearer $ETOK" "$API/reports/$EPID/export/$fmt")
  SIZE=$(wc -c < "$TMP" 2>/dev/null)
  if [ "$code" = "200" ] && [ "${SIZE:-0}" -gt 1000 ]; then
    ok "Экспорт $fmt ($SIZE байт)"
  else
    bad "$fmt: code=$code size=$SIZE"
  fi
  rm -f "$TMP"
done

# --- RBAC ---
echo ""
echo "[RBAC]"
code=$(curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $TOK" $API/admin/users)
[ "$code" = "200" ] && ok "Admin → /admin/users" || bad "/admin/users=$code"

code=$(curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $ETOK" $API/admin/users)
[ "$code" = "403" ] && ok "Employee → /admin = 403" || bad "Employee→admin=$code (ожидается 403)"

# --- Сиды ---
echo ""
echo "[Сиды]"
PCNT=$(_json_len "$(curl -s -H "Authorization: Bearer $ETOK" $API/projects)")
[ "${PCNT:-0}" -ge 10 ] && ok "Демо-проектов: $PCNT (≥10)" || bad "Проектов: $PCNT"

UCNT=$(_json_len "$(curl -s -H "Authorization: Bearer $TOK" $API/admin/users)")
[ "${UCNT:-0}" -ge 2 ] && ok "Пользователей: $UCNT (≥2)" || bad "Пользователей: $UCNT"

# --- Итог ---
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if [ "$fail" = "0" ]; then
  echo "  ✅ ВСЁ ЗЕЛЁНОЕ · $pass проверок"
  exit 0
else
  echo "  ❌ $fail из $((pass+fail)) проверок упали"
  exit 1
fi
