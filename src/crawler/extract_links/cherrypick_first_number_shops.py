import pandas as pd

df1 = pd.read_csv('../reveal_true_domains/clean_eshop_list_manually_edited.csv', delimiter=",", header=None, encoding='utf-8')

links=[]
with open("concatenated_product_links.csv","r") as r:
    links=r.readlines()
links = [x.replace("\n","") for x in links]

#get first 10000 rows
domains = df1[3].head(10000).to_list()

for i in links:
    if any(i for j in domains if str(j) in i):
        print(i)