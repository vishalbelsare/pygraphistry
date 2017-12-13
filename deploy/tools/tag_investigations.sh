#!/bin/bash

### ./tag_investigations.sh investigationsFolder  mytag
### ./tag_investigations.sh out NVDA

SRC=${1:-out}
TAG=${2:-IMPORT}

for i in `find $SRC/investigations | grep json$`; do 
  jq ".name = (\"[$TAG] \" + .name)" $i | sponge $i
done;
