#!/bin/sh
. $(dirname "$0")/.env

RES=$(curl -X GET "https://${HUE_HOST}/clip/v2/resource/light" \
  -H "Hue-Application-Key: ${HUE_USERNAME}" \
  -k)
DATA=$(echo $RES | jq -r 'reduce .data[] as $o ({}; .[$o.metadata.name] = { status: $o.on.on, brightness: $o.dimming.brightness })')

curl -X POST "https://http-intake.logs.datadoghq.eu/api/v2/logs?ddsource=raspberry-pi&ddtags=version:1" \
  -H "Accept: application/json" \
  -H "Content-Type: application/json" \
  -H "DD-API-KEY: ${DD_API_KEY}" \
  -d "${DATA}"
