#!/bin/bash
# if you get an exception flat error, follow steps on https://stackoverflow.com/questions/50217214/import-error-for-icu-in-mac-and-ubuntu-although-pyicu-is-installed-correctly

celery -A celery_extract_links worker --loglevel=info -Ofair --detach