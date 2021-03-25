import sys
import celery
from celery.exceptions import TimeLimitExceeded, MaxRetriesExceededError
from logger import logger
import os
import requests
import pandas
import time

def get_host():
    import os
    host = os.environ.get('AMQP_HOST')
    if host is None:
        host = "127.0.0.1"
    return host

BROKER_NETWORK="pyamqp://guest@%s//" % get_host()
INPUT_FOLDER = os.path.join('input')
OUTPUT_FOLDER = os.path.join('output')
MAX_RETRIES = 1
app = celery.Celery('celery_reveal_true_domains', broker=BROKER_NETWORK)

@app.task(name="celery_reveal_true_domains", max_retries=MAX_RETRIES, ignore_result=True)
def call_crawl(filename):
    try:
        task(filename)
    except Exception:
        logger.exception("Exception while crawling filename %s" % filename)
    finally:
        pass

def task(filename):
    df = pandas.read_csv(os.path.join(INPUT_FOLDER, filename), header=None)
    df[2] = None
    for index, row in df.iterrows():
        try:
            r = requests.get(row[1], timeout=10)
            if r.status_code != 200:
                logger.warning(f"Got bad status code for {index}. Original url {row[1]}")
                row[2] = r.status_code
                continue
            row[2] = r.url
            time.sleep(0.5)
            logger.info(f"Doing request no. {index} for {row[0]}. Got {row[2]}. Original is {row[1]}")
        except requests.exceptions.ConnectionError:
            row[2] = "Connection refused"
            logger.warning(f"Connection refused at index no.{index}. Original url is {row[1]}")
        except Exception as exception:
            name = type(exception).__name__
            row[2] = f"Got Exception named {name}"
            logger.warning(f"Got exception named {name} at index no.{index}. Original url is {row[1]}")
    path = os.path.join(OUTPUT_FOLDER, filename)
    df.to_csv(path, header=False, index=False)

def main():
    path = os.path.join(INPUT_FOLDER)
    filenames = os.listdir(path)
    for filename in filenames:
        call_crawl.delay(filename)
    logger.info(f"Finished adding {filename} CSV file to crawl into a celery queue")
    
if __name__ == '__main__':
    main()