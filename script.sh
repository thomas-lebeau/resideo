#!/bin/sh
. $(dirname "$0")/.env

TOKEN_A=$(echo -n "${API_KEY}:${API_SECRET}" | base64)
TOKEN_B=$(curl -X POST "https://api.honeywell.com/oauth2/accesstoken" \
  -H  "Authorization: Basic ${TOKEN_A}" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d 'grant_type=client_credentials' | jq -r ".access_token")
JSON=$(curl -X GET "https://api.honeywell.com/v2/devices/thermostats/${DEVICE_ID}?apikey=${API_KEY}&locationId=${LOCATION_ID}" \
  -H "Authorization: Bearer ${TOKEN_B}" \
  -H "UserRefID: ${USER_REF_ID}")
ROW=$(echo $JSON | jq -r "[.changeableValues.mode,.changeableValues.heatSetpoint,.operationStatus.mode,.outdoorTemperature,.indoorTemperature] | @tsv")

echo $ROW

curl -X POST "https://http-intake.logs.datadoghq.eu/api/v2/logs?ddsource=resideo-gh-action&ddtags=version:1" \
  -H "Accept: application/json" \
  -H "Content-Type: text/plain" \
  -H "DD-API-KEY: ${DD_API_KEY}" \
  -d "${ROW}"
