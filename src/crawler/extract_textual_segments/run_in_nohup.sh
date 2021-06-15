#!/bin/bash
# this script creates a nohup process that keeps xvfb alive 
# to change number of parallel browsers, open segment_pilot_crawl.py and edit NUM_BROWSERS variable

nohup ./keep_xvfb_alive.sh > nohup.log 2>&1 &
echo $! > save_pid.txt

DISPLAY=:99 nohup python segment_pilot_crawl.py $1 &
echo $! >> save_pid.txt