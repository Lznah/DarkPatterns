from automation import TaskManager, CommandSequence
from automation.Errors import CommandExecutionError
import time
import os
from urlparse import urlparse

# The list of sites that we wish to crawl
NUM_BROWSERS = 10
NUM_BATCH = 5000
DATA_DIR = os.path.join(os.path.dirname(__file__), 'data')

manager_params, browser_params = TaskManager.load_default_params(NUM_BROWSERS)

date_prefix = 'XXX'  # Updated by deployment script
prefix = date_prefix + '_mutation_summary_pilot'
manager_params['database_name'] = prefix + '.sqlite'
manager_params['data_directory'] = '~/' + prefix
manager_params['log_directory'] = '~/' + prefix

# Read the site list
sites = open("prod_links.csv").readlines()

TOTAL_NUM_SITES = len(sites)

for i in xrange(NUM_BROWSERS):
    browser_params[i]['headless'] = True
    browser_params[i]['js_instrument'] = True
    browser_params[i]['cookie_instrument'] = True
    browser_params[i]['http_instrument'] = True

start_time = time.time()

# Manage control files
if not os.path.isdir(os.path.expanduser('~/.openwpm/')):
    os.mkdir(os.path.expanduser('~/.openwpm/'))
if os.path.isfile(os.path.expanduser('~/.openwpm/reboot')):
    os.remove(os.path.expanduser('~/.openwpm/reboot'))
if os.path.isfile(os.path.expanduser('~/.openwpm/current_site_index')):
    with open(os.path.expanduser('~/.openwpm/current_site_index'), 'r') as f:
        start_index = int(f.read()) + 1
    end_index = start_index + NUM_BATCH
else:
    start_index = 0
    end_index = NUM_BATCH + 1

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
        cs.get(sleep=20, timeout=120)
        cs.save_screenshot("%s_%s" % (urlparse(url).hostname, i))
        manager.execute_command_sequence(cs)
        with open(
                os.path.expanduser('~/.openwpm/current_site_index'),
                'w') as f:
            f.write(str(i))
    except CommandExecutionError:
        with open(os.path.expanduser('~/.openwpm/reboot'), 'w') as f:
            f.write(str(1))
        break

print "CLOSING TaskManager after batch"
manager.close()

# Remove index file if we are done
if current_index >= TOTAL_NUM_SITES:
    os.remove(os.path.expanduser('~/.openwpm/current_site_index'))
    with open(os.path.expanduser('~/.openwpm/crawl_done'), 'w') as f:
        f.write(str(1))
print "Total time: " + str(time.time() - start_time)
