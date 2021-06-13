from __future__ import absolute_import

from six.moves import range

from automation import CommandSequence, TaskManager

# The list of sites that we wish to crawl
NUM_BROWSERS = 1
sites = ['https://www.macys.com/shop/product/i.n.c.-fawne-riding-boots-created-for-macys?ID=4828742']

# Loads the manager preference and 3 copies of the default browser dictionaries
manager_params, browser_params = TaskManager.load_default_params(NUM_BROWSERS)

# Update browser configuration (use this for per-browser settings)
for i in range(NUM_BROWSERS):
    # Record HTTP Requests and Responses
    browser_params[i]['http_instrument'] = True
    # Enable flash for all three browsers
    browser_params[i]['disable_flash'] = False
    browser_params[i]["js_instrument"] = True

browser_params[0]['headless'] = False  # Launch only browser 0 headless

# Update TaskManager configuration (use this for crawl-wide settings)
manager_params['data_directory'] = '~/openwpm-mutation-t3/'
manager_params['log_directory'] = '~/openwpm-mutation-t3/'
manager_params['testing'] = True

# Instantiates the measurement platform
# Commands time out by default after 60 seconds
manager = TaskManager.TaskManager(manager_params, browser_params)

# Visits the sites with all browsers simultaneously
for site in sites:
    command_sequence = CommandSequence.CommandSequence(site)

    # Start by visiting the page
    command_sequence.get(sleep=900, timeout=900)

    # index='**' synchronizes visits between the three browsers
    manager.execute_command_sequence(command_sequence, index='**')

# Shuts down the browsers and waits for the data to finish logging
manager.close()
