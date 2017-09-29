#!/usr/bin/env bash

### Alternatively: docker run --rm node:alpine sh -c 'npm install --global bcrypt-cli && bcrypt-cli "seekrits" 10'

plaintext_password=''
bcrypt_rounds=12

echo 'Calculates the bcrypt hash of a password, suitable for use in the "authentication.passwordHash" config option.'
# echo
# echo 'Note: the same password will generate a different hash every time you run this'
# echo 'script. This is normal; bcrypt encodes a random salt in each hash. These'
# echo 'different hashes will all match the same plaintext password.'
echo
echo

cd "$(dirname "$0")"
cd ".."

if [[ ! -e node_modules/bcrypt ]]; then
    echo 'Error: can not find the "bcrypt" npm module. You must `npm install` pivot-app before running this script.' >&2
    exit 9
fi

prompt_for_password() {
    read -e -p 'Enter the password: ' -s password_a
    echo
    read -e -p "Verify the password: " -s password_b
    echo
    echo

    if [[ "$password_a" != "$password_b" ]]; then
        echo "Error: passwords do not match." >&2
        exit 10
    fi

    plaintext_password="$password_a"
}


make_hash() {
    if [[ -z $plaintext_password ]]; then
        echo "Error: password can not be blank" >&2
        exit 11
    fi

    node -p "require('bcrypt').hashSync('$plaintext_password', $bcrypt_rounds)"
}


prompt_for_password
make_hash

unset plaintext_password
