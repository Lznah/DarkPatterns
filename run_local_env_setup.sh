#!/bin/bash

python3 -m venv "__venv__"

. "${n}"/bin/activate

pip install -r requirements.txt
