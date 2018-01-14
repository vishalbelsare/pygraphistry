#!/bin/bash

# Grab pivotdb files from a server and put them somewhere . This is really just scp.

# Ex: Dump staging to ./out
#   ./download_investigations.sh 

# Ex: Dump staging to ./out
#   ./download_investigations.sh "ec2-user@staging.graphistry.com" "/var/graphistry/.pivot-db/" "-i ../../../wholly-innocuous/files/aws/ansible_id_rsa.pem" "./out"
#   ./download_investigations.sh "root@10.32.134.13" "/althome/root/graphistry/graphistry/releases/.pivot-db" "-v" "./out"

# Ex: Dump staging to pivotapp's pivotdb
#   ./download_investigations.sh "ec2-user@staging.graphistry.com" "/var/graphistry/.pivot-db/*" "-i ../../../wholly-innocuous/files/aws/ansible_id_rsa.pem" "../../packages/pivot-app/test/appdata/"

SRC_SERVER=${1:-ec2-user@staging.graphistry.com} 
SRC_DB_PATH=${2:-/var/graphistry/.pivot-db/}
SRC_KEY=${3:-"-i ../../../wholly-innocuous/files/aws/ansible_id_rsa.pem"}
OUT_PATH=${4:-./out}


scp -Cr -i $SRC_KEY $SRC_SERVER:$SRC_DB_PATH $OUT_PATH

