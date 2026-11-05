#!/usr/bin/env bash
# An n8n that has never seen our workflows: an empty database and the Reduck node from npm, on
# 127.0.0.1:5692 (the dev and the clean n8n of /init_n8n use other ports and session cookies).
#   fresh-n8n.sh up <node version>   start it; prints the editor URL and where the login is
#   fresh-n8n.sh import <file.json>  import a copy, with a Reduck credential set (its key is
#                                    $REDUCK_API_KEY, or empty), so the canvas shows no warning;
#                                    prints the workflow URL
#   fresh-n8n.sh down                stop it and delete its folder
set -euo pipefail
DIR=${FRESH_N8N_DIR:-${TMPDIR:-/tmp}/n8n-fresh}
PORT=5692 URL=http://127.0.0.1:5692
export N8N_USER_FOLDER=$DIR
source "${NVM_DIR:-$HOME/.nvm}/nvm.sh" >/dev/null
n8n() { nvm exec 24 n8n "$@"; }
api() { curl -sf -b "$DIR/cookies" -c "$DIR/cookies" -H 'browser-id: fresh' -H 'Content-Type: application/json' "$URL$1" "${@:2}"; }

case "${1:-}" in
up)
	[ -n "${2:-}" ] || { echo "Usage: $0 up <node version>" >&2; exit 1; }
	mkdir -p "$DIR/.n8n/nodes"
	# npm warns that isolated-vm's install scripts did not run: n8n does not need them here.
	(cd "$DIR/.n8n/nodes" && nvm exec 24 npm install --silent --prefer-online "@reduck-ai/n8n-nodes-reduck@$2" >/dev/null 2>&1)
	N8N_PORT=$PORT N8N_HOST=127.0.0.1 N8N_LISTEN_ADDRESS=127.0.0.1 N8N_EDITOR_BASE_URL=$URL \
		WEBHOOK_URL=$URL N8N_RUNNERS_BROKER_PORT=5693 N8N_SECURE_COOKIE=false \
		N8N_DIAGNOSTICS_ENABLED=false N8N_PERSONALIZATION_ENABLED=false \
		nohup bash -c "source ${NVM_DIR:-$HOME/.nvm}/nvm.sh; nvm exec 24 n8n start" >"$DIR/n8n.log" 2>&1 &
	echo $! >"$DIR/pid"
	for _ in $(seq 90); do curl -sf "$URL/healthz" >/dev/null && break; sleep 2; done
	PASSWORD="Fresh$(openssl rand -hex 6)!"
	printf 'email: fresh@reduck.local\npassword: %s\n' "$PASSWORD" >"$DIR/login.txt"
	BODY=$(python3 -c 'import json,sys;print(json.dumps({"email":"fresh@reduck.local","firstName":"Fresh","lastName":"Tester","password":sys.argv[1]}))' "$PASSWORD")
	# /healthz answers before the REST API does: try until the owner exists.
	for _ in $(seq 30); do api /rest/owner/setup -d "$BODY" >/dev/null && break; sleep 2; done
	api /rest/login -d "$(python3 -c 'import json,sys;print(json.dumps({"emailOrLdapLoginId":"fresh@reduck.local","password":sys.argv[1]}))' "$PASSWORD")" >/dev/null
	echo "$URL (login in $DIR/login.txt; the editor shows two onboarding dialogs first: close them)"
	;;
import)
	[ -f "${2:-}" ] || { echo "Usage: $0 import <file.json>" >&2; exit 1; }
	CRED=$(api /rest/credentials | python3 -c 'import json,sys;d=[c for c in json.load(sys.stdin)["data"] if c["type"]=="reduckApi"];print(d[0]["id"] if d else "")')
	[ -n "$CRED" ] || CRED=$(api /rest/credentials -d "$(python3 -c 'import json,os;print(json.dumps({"name":"Reduck account","type":"reduckApi","data":{"apiKey":os.environ.get("REDUCK_API_KEY","")}}))')" | python3 -c 'import json,sys;print(json.load(sys.stdin)["data"]["id"])')
	ID=fresh$(python3 -c 'import hashlib,sys;print(hashlib.md5(sys.argv[1].encode()).hexdigest()[:10])' "$(basename "$2")")
	python3 - "$2" "$DIR/import.json" "$ID" "$CRED" <<-'EOF'
		import json, sys
		src, out, wid, cred = sys.argv[1:]
		w = json.load(open(src)); w["id"] = wid; w["active"] = False
		for n in w["nodes"]:
		    if n["type"].endswith(".reduck"):
		        n["credentials"] = {"reduckApi": {"id": cred, "name": "Reduck account"}}
		json.dump([w], open(out, "w"))
	EOF
	# The CLI talks to the same database; its task broker needs a port the server does not hold.
	N8N_RUNNERS_BROKER_PORT=5694 n8n import:workflow --input="$DIR/import.json" >/dev/null 2>&1
	echo "$URL/workflow/$ID"
	;;
down)
	[ -f "$DIR/pid" ] && pkill -P "$(cat "$DIR/pid")" 2>/dev/null || true
	lsof -ti tcp:$PORT | xargs kill 2>/dev/null || true
	rm -rf "$DIR"
	echo "stopped, $DIR deleted"
	;;
*) sed -n '2,7p' "$0"; exit 1 ;;
esac
