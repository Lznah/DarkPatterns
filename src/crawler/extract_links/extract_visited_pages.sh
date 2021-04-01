#!/bin/bash
# Extracts visited pages that were test whether or not they are product pages from the log and saves it in a separate log and csv file

cat link_extraction_pilot.log | grep "INFO - is_product_page"| tee "visited_pages.log" | perl -nle'print $& while m{https*.*}g' > visited_pages.csv