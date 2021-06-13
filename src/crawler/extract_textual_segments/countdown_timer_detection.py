import sys
import time
import os
from urlparse import urlparse
from datetime import datetime
from os.path import expanduser, isfile
from automation.Commands.utils.screen_capture import capture_screenshots
from automation import TaskManager, CommandSequence
from automation.Errors import CommandExecutionError
from automation.utilities.domain_utils import get_ps_plus_1

CURRENT_SITE_INDEX_FILE = expanduser('~/.openwpm/current_site_index')
REBOOT_FILE = expanduser('~/.openwpm/reboot')
CRAWL_DONE_FILE = expanduser('~/.openwpm/crawl_done')

DEBUG = False


def print_usage():
    print("Usage: python screenshot_crawl.py path/to/urls.csv")


if len(sys.argv) != 2:
    print_usage()
    sys.exit(1)

if sys.argv[1] == "--debug":
    print "DEBUG mode enabled"
    DEBUG = True
elif isfile(sys.argv[1]):
    csv_path = sys.argv[1]
    print "Will crawl urls in ", csv_path
else:
    print_usage()
    sys.exit(1)


def write_to_file(file_path, data):
    with open(expanduser(file_path), 'w') as f:
        f.write(str(data))


# The list of sites that we wish to crawl
USE_SINGLE_BROWSER = False
if USE_SINGLE_BROWSER or DEBUG:
    NUM_BROWSERS = 1
else:
    NUM_BROWSERS = 7
NUM_BATCH = 100000
DATA_DIR = os.path.join(os.path.dirname(__file__), 'data')

manager_params, browser_params = TaskManager.load_default_params(NUM_BROWSERS)

date_prefix = datetime.now().strftime("%Y%m%d-%H%M%S")
if DEBUG:
    date_prefix = 'debug-' + date_prefix

prefix = date_prefix + '_countdown_detection_crawl'
manager_params['database_name'] = prefix + '.sqlite'
manager_params['data_directory'] = '~/' + prefix
manager_params['log_directory'] = '~/' + prefix
manager_params['testing'] = DEBUG
# Read the site list


def read_urls_from_csv(csv_path, add_home_pages=False):
    urls = set()
    added_domains = set()
    for l in open(csv_path):
        url = l.rstrip()
        urls.add(url)
        if not add_home_pages:
            continue
        domain = get_ps_plus_1(url)
        if domain not in added_domains:
            added_domains.add(domain)
            homepage = "http://" + urlparse(url).hostname
            urls.add(homepage)
    return list(urls)


sites = []


if DEBUG:
    sites = [
        'https://www.thertastore.com/kitchen-cabinets/rta-kitchen-cabinets/dakota-white.html'
        ]
else:
    sites = read_urls_from_csv(csv_path, True)

TOTAL_NUM_SITES = len(sites)

print "TOTAL_NUM_SITES", TOTAL_NUM_SITES

for i in xrange(NUM_BROWSERS):
    browser_params[i]['headless'] = True
    if DEBUG:
        browser_params[i]['headless'] = False
    browser_params[i]['js_instrument'] = True
    browser_params[i]['cookie_instrument'] = True
    browser_params[i]['http_instrument'] = True
    browser_params[i]['save_javascript'] = True
    browser_params[i]['har-export'] = True

start_time = time.time()

# Manage control files
if DEBUG:
    start_index = 0
    end_index = NUM_BATCH + 1
else:
    if not os.path.isdir(expanduser('~/.openwpm/')):
        os.mkdir(expanduser('~/.openwpm/'))
    if os.path.isfile(REBOOT_FILE):
        os.remove(REBOOT_FILE)
    if os.path.isfile(CURRENT_SITE_INDEX_FILE):
        with open(CURRENT_SITE_INDEX_FILE, 'r') as f:
            start_index = int(f.read()) + 1
        end_index = start_index + NUM_BATCH
    else:
        start_index = 0
        end_index = NUM_BATCH + 1

print "Will start from index %s" % start_index


manager = TaskManager.TaskManager(manager_params, browser_params,
                                  process_watchdog=True)
current_index = 0
for i in range(start_index, end_index):
    current_index = i
    if current_index >= TOTAL_NUM_SITES:
        break
    try:
        url = sites[i]
        cs = CommandSequence.CommandSequence(
            url, reset=True)
        N_SCREENSHOTS = 10
        TIME_ON_PAGE = 45  # product interaction = 125, initial wait 10
        # + time for click to addtocart,viewcart,checkout
        GET_TIMEOUT = 75  # must be longer than the TIME_ON_PAGE
        cs.get(sleep=1, timeout=GET_TIMEOUT)
        # cs.run_custom_function(close_dialogs, ())
        hostname = urlparse(url).hostname
        cs.dump_page_source(hostname, timeout=TIME_ON_PAGE+5)
        cs.run_custom_function(capture_screenshots, (url, N_SCREENSHOTS, True),
                               timeout=TIME_ON_PAGE)  # 15 until dialog dismissal + 3 for screenshots + 3+ for har
        manager.execute_command_sequence(cs)
        if not DEBUG:
            write_to_file(CURRENT_SITE_INDEX_FILE, str(i))
    except CommandExecutionError:
        if not DEBUG:
            write_to_file(REBOOT_FILE, str(1))
        break

print "CLOSING TaskManager after batch"
manager.close()


# Remove index file if we are done
if not DEBUG and current_index >= TOTAL_NUM_SITES:
    os.remove(CURRENT_SITE_INDEX_FILE)
    write_to_file(CRAWL_DONE_FILE, str(1))

print "Total time: " + str(time.time() - start_time)
