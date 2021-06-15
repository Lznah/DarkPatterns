#!/bin/bash
# this script creates a nohup process that keeps xvfb alive 
# to change number of parallel browsers, open segment_pilot_crawl.py and edit NUM_BROWSERS variable

./keep_xvfb_alive.sh &

DISPLAY=:99 

python segment_pilot_crawl.py $1