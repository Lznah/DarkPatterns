#!/bin/bash

usage() {
    echo "Usage: $0 [-t <int> -d <string>]"
    echo "options:"
    echo "  -t       number of threads"
    echo "  -d       relative path to directory to mount"
    echo "  -h       Print this help."
    1>&2; exit 1; 
}

while getopts ":t:d:" o; do
    case "${o}" in
        t)
            t=${OPTARG}
            ;;
        d)
            d=${OPTARG}
            ;;
        *)
            usage
            ;;
    esac
done

shift $((OPTIND-1))

if [ -z "${t}" ] || [ -z "${d}" ]; then
    usage
fi

name="celery"

if ! docker ps -a --format '{{.Names}}' | grep -w $name &> /dev/null; then
    echo "Creating a celery container"
    docker run \
        -v `pwd`"/${d}":/mounted \
        --name=celery \
        --cpus=$t \
        --network="host" \
        -it -d celery /bin/bash
fi

docker start celery >> /dev/null
docker exec -it celery /bin/bash