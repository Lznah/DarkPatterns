import sys
import celery
# import pymongo
from celery.exceptions import TimeLimitExceeded, MaxRetriesExceededError
from logger import logger
from crawler import crawl

def get_host():
    import os
    host = os.environ.get('AMQP_HOST')
    if host is None:
        host = "127.0.0.1"
    return host

BROKER_NETWORK="pyamqp://guest@%s//" % get_host()
MAX_RETRIES = 3
HARD_TIMEOUT = 30
app = celery.Celery('celery_extract_eshops', broker=BROKER_NETWORK)

@app.task(name="extract_eshops", max_retries=MAX_RETRIES, time_limit=HARD_TIMEOUT, ignore_result=True)
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

def main(n_pages):
    n_links = 0
    for page in range(int(n_pages)):
        n_links += 1
        call_crawl.delay(str(page+1))
    logger.info("Finished adding %d URLs to celery queue" % n_links)

if __name__ == '__main__':
    main(sys.argv[1])