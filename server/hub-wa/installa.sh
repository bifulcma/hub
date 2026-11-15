#!/bin/bash
# Rende hub-wa un servizio fisso (riparte da solo e al riavvio del Mac).
pkill -f "hub-wa/server.mjs" 2>/dev/null; sleep 1
launchctl bootout gui/$(id -u)/com.marco.hub-wa 2>/dev/null
plutil -lint ~/Library/LaunchAgents/com.marco.hub-wa.plist >/dev/null && launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.marco.hub-wa.plist
sleep 4
if curl -s -m 5 http://127.0.0.1:8791/collega/stato | grep -q stato; then echo "OK: hub-wa attivo come servizio"; else echo "ERRORE: hub-wa non risponde"; fi
