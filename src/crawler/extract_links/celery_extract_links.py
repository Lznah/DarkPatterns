import sys
import celery
import csv
from celery.exceptions import TimeLimitExceeded, MaxRetriesExceededError
from extract_links import logger, crawl, OUTDIR
from time import sleep

def get_host():
    import os
    host = os.environ.get('AMQP_HOST')
    if host is None:
        host = "127.0.0.1"
    return host

BROKER_NETWORK="pyamqp://guest@%s//" % get_host()
MAX_RETRIES = 3
MAX_SPIDERING_DURATION = 30*60
HARD_TIMEOUT = MAX_SPIDERING_DURATION+30

app = celery.Celery('celery_extract_eshop_links', broker=BROKER_NETWORK)

@app.task(name="celery_extract_eshop_links", max_retries=MAX_RETRIES, time_limit=HARD_TIMEOUT, ignore_result=True)
def call_crawl(page):
    try:
        crawl(page)
    except MaxRetriesExceededError:
        logger.error("MaxRetriesExceededError while crawling page %s" % page)
    except TimeLimitExceeded:
        logger.error("TimeLimitExceeded while crawling page %s" % page)
    except Exception:
        logger.exception("Exception while crawling page %s" % page)
    finally:
        pass

def main(domains_file):
    import os
    existing_folders = os.listdir(OUTDIR)

    with open(domains_file) as csv_file:
        csv_reader = csv.reader(csv_file, delimiter=',')
        for row in csv_reader:
            url_address = row[3]
            if url_address not in existing_folders:
                call_crawl.delay(url_address)
        logger.info("Finished adding %d URLs to celery queue" % len(list(csv_reader)))

if __name__ == '__main__':
    main(sys.argv[1])
