import sys
import celery
import csv
import os
# import pymongo
from celery.exceptions import TimeLimitExceeded, MaxRetriesExceededError
from logger import logger
from crawler import crawl

#BROKER_NETWORK="pyamqp://guest@172.18.0.2//"
BROKER_NETWORK="pyamqp://guest@localhost//"
# BROKER_NETWORK="redis://localhost:6379/0"
BACKEND='redis://localhost:6379/0'
# BACKEND='mysql://root:root@localhost/darkpatterns'
# BACKEND = 'mongodb://mongoadmin:secret@localhost:27888/admin'
# mongodb_backend_settings = {
#     'database': 'dp',
#     'taskmeta_collection': 'eshops',
# }
MAX_RETRIES = 3
HARD_TIMEOUT = 30
BASIC_URL = "https://obchody.heureka.cz/?f="
OUTPUT_FOLDER = 'output'
app = celery.Celery('celery_extract_eshops', broker=BROKER_NETWORK)

@app.task(name="extract_eshops", max_retries=MAX_RETRIES, time_limit=HARD_TIMEOUT, ignore_result=True)
def call_crawl(page):
    url = BASIC_URL + page
    try:
        eshops = crawl(url)
        write_to_file(page, eshops)
    except MaxRetriesExceededError:
        logger.error("MaxRetriesExceededError while crawling %s" % url)
    except TimeLimitExceeded:
        logger.error("TimeLimitExceeded while crawling %s" % url)
    except Exception:
        logger.exception("Exception while crawling %s" % url)
    finally:
        pass

def write_to_file(page, eshops):
    try:
        path = os.path.join(OUTPUT_FOLDER, page+'.csv')
        csv_columns = ['name', 'href']
        with open(path, 'w') as csvfile:
            writer = csv.DictWriter(csvfile, fieldnames=csv_columns)
            for data in eshops:
                writer.writerow(data)
    except IOError:
        logger.error("I/O error")

def main(n_pages):
    n_links = 0
    for page in range(int(n_pages)):
        n_links += 1
        call_crawl.delay(str(page+1))
    logger.info("Finished adding %d URLs to celery queue" % n_links)

if __name__ == '__main__':
    main(sys.argv[1])