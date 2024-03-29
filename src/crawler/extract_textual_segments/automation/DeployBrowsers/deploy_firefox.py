from __future__ import absolute_import

import json
import os.path
import random

from pyvirtualdisplay import Display
from selenium import webdriver

from . import configure_firefox
from ..Commands.profile_commands import load_profile
from ..MPLogger import loggingclient
from ..utilities.platform_utils import (get_firefox_binary_path,
                                        get_geckodriver_exec_path)
from .selenium_firefox import (FirefoxBinary, FirefoxLogInterceptor,
                               FirefoxProfile, Options)

# DEFAULT_SCREEN_RES = (1600, 1200)
DEFAULT_SCREEN_RES = (1680, 1920)


def deploy_firefox(status_queue, browser_params, manager_params,
                   crash_recovery):
    """
    launches a firefox instance with parameters set by the input dictionary
    """
    firefox_binary_path = get_firefox_binary_path()
    geckodriver_executable_path = get_geckodriver_exec_path()

    root_dir = os.path.dirname(__file__)  # directory of this file
    logger = loggingclient(*manager_params['logger_address'])

    display_pid = None
    display_port = None
    fp = FirefoxProfile()
    browser_profile_path = fp.path + '/'
    status_queue.put(('STATUS', 'Profile Created', browser_profile_path))

    # Use Options instead of FirefoxProfile to set preferences since the
    # Options method has no "frozen"/restricted options.
    # https://github.com/SeleniumHQ/selenium/issues/2106#issuecomment-320238039
    fo = Options()

    profile_settings = None  # Imported browser settings
    if browser_params['profile_tar'] and not crash_recovery:
        logger.debug("BROWSER %i: Loading initial browser profile from: %s"
                     % (browser_params['crawl_id'],
                        browser_params['profile_tar']))
        load_flash = browser_params['disable_flash'] is False
        profile_settings = load_profile(browser_profile_path,
                                        manager_params,
                                        browser_params,
                                        browser_params['profile_tar'],
                                        load_flash=load_flash)
    elif browser_params['profile_tar']:
        logger.debug("BROWSER %i: Loading recovered browser profile from: %s"
                     % (browser_params['crawl_id'],
                        browser_params['profile_tar']))
        profile_settings = load_profile(browser_profile_path,
                                        manager_params,
                                        browser_params,
                                        browser_params['profile_tar'])
    status_queue.put(('STATUS', 'Profile Tar', None))

    if browser_params['random_attributes'] and profile_settings is None:
        logger.debug("BROWSER %i: Loading random attributes for browser"
                     % browser_params['crawl_id'])
        profile_settings = dict()

        # choose a random screen-res from list
        resolutions = list()
        with open(os.path.join(root_dir, 'screen_resolutions.txt'), 'r') as f:
            for line in f:
                resolutions.append(tuple(line.strip().split(',')))
        profile_settings['screen_res'] = random.choice(resolutions)

        # set a random user agent from list
        ua_strings = list()
        with open(os.path.join(root_dir, 'user_agent_strings.txt'), 'r') as f:
            for line in f:
                ua_strings.append(line.strip())
        profile_settings['ua_string'] = random.choice(ua_strings)

    # If profile settings still not set - set defaults
    if profile_settings is None:
        profile_settings = dict()
        profile_settings['screen_res'] = DEFAULT_SCREEN_RES
        profile_settings['ua_string'] = None

    if profile_settings['ua_string'] is not None:
        logger.debug("BROWSER %i: Overriding user agent string to '%s'"
                     % (browser_params['crawl_id'],
                        profile_settings['ua_string']))
        fo.set_preference("general.useragent.override",
                          profile_settings['ua_string'])

    if browser_params['headless']:
        display = Display(visible=0, size=profile_settings['screen_res'])
        display.start()
        display_pid = display.pid
        display_port = display.cmd_param[-1][1:]
    status_queue.put(('STATUS', 'Display', (display_pid, display_port)))

    # Write extension configuration
    if browser_params['extension_enabled']:
        ext_loc = os.path.join(root_dir, '../Extension/firefox/openwpm.xpi')
        ext_loc = os.path.normpath(ext_loc)
        fp.add_extension(extension=ext_loc)
        fo.set_preference("extensions.@openwpm.sdk.console.logLevel", "all")
        extension_config = dict()
        extension_config.update(browser_params)
        extension_config['logger_address'] = manager_params['logger_address']
        extension_config['sqlite_address'] = manager_params[
            'aggregator_address']
        if 'ldb_address' in manager_params:
            extension_config['leveldb_address'] = manager_params['ldb_address']
        else:
            extension_config['leveldb_address'] = None
        extension_config['testing'] = manager_params['testing']
        with open(browser_profile_path + 'browser_params.json', 'w') as f:
            json.dump(extension_config, f)
        logger.debug("BROWSER %i: OpenWPM Firefox extension loaded"
                     % browser_params['crawl_id'])

    # Disable flash
    if browser_params['disable_flash']:
        fo.set_preference('plugin.state.flash', 0)
    else:
        fo.set_preference('plugin.state.flash', 2)
        fo.set_preference('plugins.click_to_play', False)

    # Prevent e10s
    fo.set_preference("browser.tabs.remote.autostart.2", False)

    # Configure privacy settings
    configure_firefox.privacy(browser_params, fp, fo, root_dir,
                              browser_profile_path)

    # Set various prefs to improve speed and eliminate traffic to Mozilla
    configure_firefox.optimize_prefs(fo)

    # Intercept logging at the Selenium level and redirect it to the
    # main logger.  This will also inform us where the real profile
    # directory is hiding.
    interceptor = FirefoxLogInterceptor(
        browser_params['crawl_id'], logger, browser_profile_path)
    interceptor.start()

    # Set custom prefs. These are set after all of the default prefs to allow
    # our defaults to be overwritten.
    for name, value in browser_params['prefs'].items():
        logger.info(
            "BROWSER %i: Setting custom preference: %s = %s" %
            (browser_params['crawl_id'], name, value))
        fo.set_preference(name, value)

    # Launch the webdriver
    status_queue.put(('STATUS', 'Launch Attempted', None))
    fb = FirefoxBinary(firefox_path=firefox_binary_path)
    driver = webdriver.Firefox(firefox_profile=fp, firefox_binary=fb,
                               executable_path=geckodriver_executable_path,
                               firefox_options=fo, log_path=interceptor.fifo)

    # set window size
    driver.set_window_size(*profile_settings['screen_res'])

    # Get browser process pid
    if hasattr(driver, 'service') and hasattr(driver.service, 'process'):
        pid = driver.service.process.pid
    elif hasattr(driver, 'binary') and hasattr(driver.binary, 'process'):
        pid = driver.binary.process.pid
    else:
        raise RuntimeError("Unable to identify Firefox process ID.")

    status_queue.put(('STATUS', 'Browser Launched',
                      (int(pid), profile_settings)))

    return driver, interceptor.profile_path, profile_settings
