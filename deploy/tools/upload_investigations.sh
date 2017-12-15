#!/bin/bash

# Grab pivotdb dump and put on a server . This is really just scp + chmod + pivotapp docker restart.

# Ex: Dump ./out to staging
#   ./upload_investigations.sh 

# Ex: Dump ./out
#   ./upload_investigations.sh "./out" "ec2-user@staging.graphistry.com" "/var/graphistry/.pivot-db" "../../../wholly-innocuous/files/aws/ansible_id_rsa.pem"


IN_PATH=${1:-./out}
DST_SERVER=${2:-ec2-user@staging.graphistry.com} 
DST_DB_PATH=${3:-/var/graphistry/.pivot-db}
DST_KEY=${4:-../../../wholly-innocuous/files/aws/ansible_id_rsa.pem}

echo "== Copying files and restarting pivotapp =="
echo " Copying.."
rsync -azPe "ssh -i $DST_KEY" --rsync-path="sudo rsync"   $IN_PATH/ $DST_SERVER:$DST_DB_PATH && \
echo " Fixing permissions: file rw, dir rwx" && \
ssh -i $DST_KEY $DST_SERVER sudo chmod -R a-x $DST_DB_PATH && \
ssh -i $DST_KEY $DST_SERVER sudo chmod -R a+rwX $DST_DB_PATH && \
echo " Restarting.." && \
ssh -i $DST_KEY $DST_SERVER "docker restart monolith-network-pivot"

