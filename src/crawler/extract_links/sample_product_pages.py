# Add pages not passing is_product_page test in the crawler
# Need to have visited_pages.csv and found_product_pages.csv generated insite ../crawler/extract_links
# generate them from log file with extract_visited_pages.sh and extract_found_product_pages.csv
# saves into dataset_product_pages.csv - need to manually verify if they are links of product pages

import pandas as pd
import glob

filename = "dataset_product_pages.csv"
file_present = glob.glob(filename)

colnames = ['url','label']
links_df = pd.read_csv("found_product_pages.csv", delimiter=";", header=None, names=colnames)

are_pp = len(links_df[links_df['label'] == 1])
are_not_pp = len(links_df[links_df['label'] == 0])
diff = are_pp-are_not_pp
colnames2 = ['url', 'score']
visited_df = pd.read_csv("visited_pages.csv", delimiter=" ", header=None, names=colnames2)

sampled = visited_df.sample(n=int(diff*1.5), weights='score')
concatenated = pd.concat([links_df,sampled]).drop_duplicates().reset_index(drop=True)
del concatenated['score']
print(f'Are product pages: {are_pp}')
print(f'Are not product pages: {are_not_pp}')
print(f'Difference: {diff}')
print(f'Links that have been sampled: {len(sampled)}')
print(f'New dataset has {len(concatenated)}')
if not file_present:
    concatenated.to_csv(filename)
else:
    print('WARNING: File dataset_product_pages.csv already exists! Delete it at first if you want to create a new one!') 