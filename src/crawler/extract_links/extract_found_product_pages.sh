#!/bin/bash
# Extracts found products pages from the log and saves it in a separate log and csv file

cat link_extraction_pilot.log | grep "INFO - Found a product page nProdPages:"| tee "found_product_pages.log" | perl -nle'print $& while m{https*.*}g' > found_product_pages.csv