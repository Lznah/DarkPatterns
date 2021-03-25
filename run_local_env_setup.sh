#!/bin/bash

usage() {
    echo "Usage: $0 [-n <string>]"
    echo "options:"
    echo "  -n       name of newly created virtualenv directory"
    echo "  -h       Print this help."
    1>&2; exit 1; 
}

while getopts ":n:" o; do
    case "${o}" in
        n)
            n=${OPTARG}
            ;;
        *)
            usage
            ;;
    esac
done

shift $((OPTIND-1))

if [ -z "${n}" ]; then
    usage
fi

python3 -m venv "${n}"

. "${n}"/bin/activate

pip install -r requirements.txt
