#!/bin/bash

# Grab an events.csv and put on a server . 

# Ex: Dump ./events.csv to staging
#   ./upload_events.sh 

# Ex: Dump ./events.csv to staging 
#   ./upload_events.sh "./events.csv" "user:password" "https://splunk.graphistry.com:8089" "pivotapp_imports" "my_upload2" 

# Ex: Dump folder csvs to staging
# for i in `find csvs/  | grep events.csv `; do ./upload_events.sh "$i" "MY_USER:MY_PASSWORD" "https://splunk.graphistry.com:8089" "pivotapp_imports" "my_upload3" ; done;



CSV=${1:-./events.csv}
USER_PASS=${2:-admin:`cat ../../../wholly-innocuous/files/internalsplunk/adminpassword`}
SERVER=${3:-https://splunk.graphistry.com:8089}
INDEX=${4:-pivotapp_imports}
SOURCE=${5:-user_import}

echo UPLOAD EVENTS: $CSV to $SERVER at  index=$INDEX source=$SOURCE 

echo JQ $CSV
./node_modules/csvtojson/bin/csvtojson $CSV | jq .[] > small.json && \
echo curl && \
curl -k -H "Accept: application/json" -u "$USER_PASS" -d "@small.json" "$SERVER/services/receivers/stream?index=$INDEX&sourcetype=_json&source=$SOURCE" && \
echo success

echo done




