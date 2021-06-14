# Use this script to concatenate all the products links from the ouput folder into a single CSV file

for f in $(find ./output -name "product_links_*.txt" -type f -printf '%TY:%Tm:%Td %TH:%Tm %h/%f\n' |  sort | sed "s/.*:.*:.* .*:.* //" ); do
    cat "$f" >> concatenated_product_links.csv;
    echo >> concatenated_product_links.csv;
done