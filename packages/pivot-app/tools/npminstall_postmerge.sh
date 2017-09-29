#!/bin/bash
# MIT © Sindre Sorhus - sindresorhus.com

changed_files="$(git diff-tree -r --name-only --no-commit-id ORIG_HEAD HEAD)"

check_run() {
	TRIGGER=$(echo "$changed_files" | grep --quiet "$1")
	if [ ! -z "$TRIGGER" ] ; then
		eval "$2"
	fi
}

# Example usage
# In this example it's used to run `npm install` if package.json changed and `bower install` if `bower.json` changed.
check_run package.json "npm install"
