#!/bin/bash

# kdyz dostavas error o exception flat https://stackoverflow.com/questions/50217214/import-error-for-icu-in-mac-and-ubuntu-although-pyicu-is-installed-correctly
celery -A celery_extract_eshop_links worker --loglevel=info -Ofair