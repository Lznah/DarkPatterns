#!/bin/bash

echo "Initializing docker network SWARM"
docker network create swarm --subnet=172.18.0.0/16 &> /dev/null

name="rabbitmq"

echo "Running RabbitMQ container"
if ! docker ps -a --format '{{.Names}}' | grep -w "$name" &> /dev/null; then
    echo "Creating a rabbitmq container"
    docker run \
    -it --net swarm \
    --ip 172.18.0.2 \
    --name "${name}" \
    -p 5672:5672 \
    -p 15672:15672 \
    rabbitmq:3-management
else 
    docker start "${name}" -a
fi