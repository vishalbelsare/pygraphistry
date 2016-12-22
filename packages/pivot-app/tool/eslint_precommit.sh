#!/bin/bash
cd "$(git rev-parse --show-toplevel)"
ESLINT="./node_modules/eslint/bin/eslint.js"
pwd

if [[ ! -x "$ESLINT" ]]; then
  printf "\t\033[41mPlease install ESlint\033[0m (npm install eslint)\n"
  exit 1
fi

STAGED_FILES=($(git diff --cached --name-only --diff-filter=ACM | grep ".jsx\{0,1\}$"))

echo "ESLint'ing ${#STAGED_FILES[@]} files"

if [ $STAGED_FILES ]; then $ESLINT -c .eslintrc.json --quiet $STAGED_FILES; fi
