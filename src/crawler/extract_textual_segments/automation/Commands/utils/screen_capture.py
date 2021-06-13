import os
import shutil
from os.path import join, isdir, isfile
from ...MPLogger import loggingclient

from time import sleep, time
from datetime import datetime
import binascii
import base64
from urlparse import urlparse
from selenium.common.exceptions import WebDriverException
from webdriver_extensions import click_to_element
from ...utilities.domain_utils import get_ps_plus_1
from selenium.webdriver.support.ui import Select

COMMON_JS = open('../extract_links/common.js').read()
EXTRACT_ADD_TO_CART = open('../extract_links/extract_add_to_cart.js').read()
EXTRACT_PRODUCT_OPTIONS = open('../extract_links/extract_product_options.js').read()
DISMISS_DIALOGS = open('../extract_links/dismiss_dialogs.js').read()

PHASE_ON_PRODUCT_PAGE = 0
PHASE_SEARCHING_VIEW_CART = 1
PHASE_SEARCHING_CHECKOUT = 2
PHASE_ON_CHECKOUT_PAGE = 3

SLEEP_AFTER_CLICK = 5
SLEEP_AFTER_CHECKOUT_CLICK = 30
SLEEP_UNTIL_DIALOG_DISMISSAL = 15

MAX_PROD_ATTR_INTERACTION = 125 + 10

MAX_CART_CHECKOUT_RETRIES = 3

# if positive, will limit the number of combinations to make it faster
LIMIT_PRODUCT_COMBOS = 0


def save_screenshot_b64(out_png_path, image_b64, logger):
    try:
        with open(out_png_path, 'wb') as f:
            f.write(base64.b64decode(image_b64.encode('ascii')))
    except Exception:
        logger.exception("Error while saving screenshot to %s"
                         % (out_png_path))
        return False
    return True


def remove_new_lines(html_str):
    return html_str.replace("\r\n", "").replace("\r", "").replace("\n", "")


class ShopBot(object):

    def __init__(self, driver, visit_id, manager_params,
                 logger, landing_page):
        self.visit_id = visit_id
        self.driver = driver
        self.js = self.driver.execute_script
        self.manager_params = manager_params
        self.logger = logger
        self.reason_to_quit = ""
        self.update_phase(PHASE_ON_PRODUCT_PAGE)
        self.landing_page = landing_page
        self.cart_checkout_retries = 0
        self.initial_checks_done = False

    def act(self, seconds_since_load):
        if seconds_since_load < SLEEP_UNTIL_DIALOG_DISMISSAL:
            return
        if self.phase == PHASE_ON_PRODUCT_PAGE:
            if not self.initial_checks_done:
                self.initial_checks_done = True
                if not self.can_execute_js():
                    return False
                if not self.is_product_page():
                    self.reason_to_quit = "not a product page"
                    return False

            self.dismiss_dialog()
            self.interact_with_product_attrs()
            sleep(SLEEP_AFTER_CLICK)
            self.dismiss_dialog()
            sleep(SLEEP_AFTER_CLICK)
            self.click_add_to_cart()
        elif self.phase == PHASE_SEARCHING_VIEW_CART:
            self.click_view_cart()
        elif self.phase == PHASE_SEARCHING_CHECKOUT:
            self.click_checkout()
        elif self.phase == PHASE_ON_CHECKOUT_PAGE:
            self.process_checkout()

    def can_execute_js(self):
        try:
            self.js(COMMON_JS + '\n' + EXTRACT_ADD_TO_CART +
                    ";return localStorage.keys")
            return True
        except WebDriverException as wexc:
            self.logger.error(
                "Exception while executing JS Visit Id: %d %s" % (
                    self.visit_id, wexc))
            self.reason_to_quit =\
                "Cannot execute JS from selenium (WebDriverException)"
            return False

    def is_product_page(self):
        try:
            return self.js(COMMON_JS + '\n' + EXTRACT_ADD_TO_CART +
                           ";return isProductPage();")
        except WebDriverException as wexc:
            self.logger.error(
                "Exception in isProductPage Visit Id: %d %s" % (
                    self.visit_id, wexc))
            self.reason_to_quit = "isProductPage error (WebDriverException)"
            return False

    def update_phase(self, phase):
        self.phase = phase
        # self.js('localStorage.setItem("openwpm-phase", %s)' % phase)

    def click_add_to_cart(self):
        button = self.js(COMMON_JS + ';' + EXTRACT_ADD_TO_CART +
                         ";return getAddToCartButton();")
        if not button:
            self.reason_to_quit = "No add to cart button"
            return

        self.logger.info("Add to cart button: %s Visit Id: %d" %
                         (remove_new_lines(button.get_attribute('outerHTML')),
                          self.visit_id))
        click_to_element(button)
        # move_to_and_click(self.driver, button)
        self.logger.info("Clicked to add to cart Visit Id: %d" % self.visit_id)
        sleep(SLEEP_AFTER_CLICK)
        self.update_phase(PHASE_SEARCHING_VIEW_CART)

    def click_view_cart(self):
        button = self.js(COMMON_JS + ';' + EXTRACT_ADD_TO_CART +
                         ";return getCartButton();")

        if not button:
            if not self.has_max_cart_checkouts_exhausted():
                self.logger.warning(
                    "Cannot find view cart, will try to "
                    "click checkout (retry %d) Visit Id: %d" % (
                        self.cart_checkout_retries, self.visit_id))
                self.cart_checkout_retries += 1
                return self.click_checkout()
            else:
                self.reason_to_quit = "No view cart button"
                return
            # self.reason_to_quit = "No view cart button"

        self.logger.info("View cart button: %s Visit Id: %d" %
                         (remove_new_lines(button.get_attribute('outerHTML')),
                          self.visit_id))
        click_to_element(button)
        self.logger.info("Clicked to view cart Visit Id: %d" % self.visit_id)
        sleep(SLEEP_AFTER_CLICK)
        self.update_phase(PHASE_SEARCHING_CHECKOUT)

    def click_checkout(self):
        button = self.js(COMMON_JS + ';' + EXTRACT_ADD_TO_CART +
                         ";return getCheckoutButton();")

        if not button:
            if not self.has_max_cart_checkouts_exhausted():
                self.logger.warning(
                    "Cannot find view checkout button, will try to "
                    "click cart (retry %d) Visit Id: %d" % (
                        self.cart_checkout_retries, self.visit_id))
                self.cart_checkout_retries += 1
                return self.click_view_cart()
            else:
                self.reason_to_quit = "No checkout button"
                return

        self.logger.info("Checkout button: %s Visit Id: %d" %
                         (remove_new_lines(button.get_attribute('outerHTML')),
                          self.visit_id))
        click_to_element(button)
        self.logger.info("Clicked to checkout Visit Id: %d" % self.visit_id)
        sleep(SLEEP_AFTER_CLICK)
        self.update_phase(PHASE_ON_CHECKOUT_PAGE)
        # quit after 10s
        self.time_to_quit = time() + SLEEP_AFTER_CHECKOUT_CLICK

    def interact_with_product_attrs(self):
        t_begin = time()
        driver = self.driver
        find_elements_by_xpath = driver.find_elements_by_xpath
        logger = self.logger
        logger.info(
            "Will start product interaction Visit Id: %d" % self.visit_id)
        random_combinations = self.js(
            COMMON_JS + ';' + EXTRACT_PRODUCT_OPTIONS +
            ";return playAttributes();")

        if LIMIT_PRODUCT_COMBOS:  # don't subsample if 0 !!!
            random_combinations = random_combinations[:LIMIT_PRODUCT_COMBOS]
        logger.info(
            "Product interaction len(random_combinations) %d Visit Id: %d" %
            (len(random_combinations), self.visit_id))
        logger.info(
            "Product interaction random_combinations %s Visit Id: %d" %
            (str(random_combinations), self.visit_id))
        PRODUCT_INTERACTION_TIMEOUT = 150
        if len(random_combinations) == 0:
            return
        else:
            for rc in random_combinations:
                if (time() - t_begin) > PRODUCT_INTERACTION_TIMEOUT:
                    logger.info(
                        "Product interaction timeout Visit Id: %d" %
                        self.visit_id)
                    break
                for el in rc:
                    try:
                        if isinstance(el, list):
                            select_el = find_elements_by_xpath(el[0])
                            option_el = find_elements_by_xpath(el[1])

                            if (len(select_el) == 1 and
                                    select_el[0].tag_name.lower() == 'select'):
                                select_el = Select(select_el[0])
                                select_el.select_by_visible_text(
                                    option_el[0].text)
                            elif len(select_el) == 1:
                                click_handler(select_el[0])
                                click_handler(option_el[0])
                        else:
                            element = find_elements_by_xpath(el)
                            if len(element) == 1 and element[0]:
                                click_handler(element[0])

                        sleep(SLEEP_AFTER_CLICK)
                    except Exception:
                        logger.exception(
                            "Error while interacting with product attributes "
                            "on %s Visit Id: %d" % (driver.current_url,
                                                    self.visit_id))

        logger.info("Will end product interaction Visit Id: %d" %
                    self.visit_id)
        return

    def process_checkout(self):
        """We stay on the checkout page for 10s, quit after 10s."""
        if self.time_to_quit > time():
            self.reason_to_quit = "Success"

    def has_max_cart_checkouts_exhausted(self):
        return self.cart_checkout_retries > MAX_CART_CHECKOUT_RETRIES

    def dismiss_dialog(self):
        self.js(COMMON_JS + ';' + DISMISS_DIALOGS +
                ";return dismissDialog();")


def dump_har(driver, logger, out_har_path, visit_id):
    """Use har-export-trigger extension to dump HAR content.

    https://github.com/firebug/har-export-trigger
    """
    ext_har_path = "export"
    profile_path = driver.capabilities["moz:profile"]
    ext_har_full_path = join(profile_path, "har", "logs",
                             ext_har_path + ".har")
    rv = False
    try:
        rv = driver.execute_script("""
        var options = {
          token: "test",
          fileName: "%s"
        };
        setTimeout(function(){
            ("HAR" in window) && HAR.triggerExport(options).then(result => {
              console.log("Exported HAR");
            });
        }, 10);
        return ("HAR" in window);
        """ % ext_har_path)
    except Exception:
        pass
    # JS call is async, wait until the har dump appears
    if rv is False:
        logger.warning("HAR export is not available %s Visit Id: %d" %
                       (rv, visit_id))
        return
    MAX_HAR_EXPORT_WAIT = 20
    waited = 0
    while not isfile(ext_har_full_path):
        if waited > MAX_HAR_EXPORT_WAIT:
            logger.warning("HAR export timed out %d" % visit_id)
            return
        sleep(1)
        waited += 1
    logger.info("HAR export successful after waiting %ds Visit Id: %d" %
                (waited, visit_id))
    sleep(3)  # in case it takes a while to update
    # copy from extension profile dir to crawl dir
    shutil.copy2(ext_har_full_path, out_har_path)


def interact_with_the_product_page(hostname, visit_duration, **kwargs):
    """Capture screenshots every second."""
    driver = kwargs['driver']
    visit_id = kwargs['visit_id']
    manager_params = kwargs['manager_params']
    data_dir = join(manager_params['data_directory'], "output")
    visit_dir = join(data_dir, "%s_%s" % (visit_id, hostname))
    logger = loggingclient(*manager_params['logger_address'])
    landing_url = driver.current_url
    landing_ps1 = get_ps_plus_1(landing_url)
    shop_bot = ShopBot(driver, visit_id, manager_params, logger, landing_url)
    screenshot_base_path = join(visit_dir, "%d_%s" % (visit_id, hostname))

    if not isdir(visit_dir):
        os.makedirs(visit_dir)

    last_image_crc = 0
    t_begin = time()
    for idx in xrange(0, visit_duration):
        if (time() - t_begin) > visit_duration:  # timeout
            logger.info("Timeout in interact_with_the_product_page on %s "
                        "Visit Id: %d Loop: %d Phase: %s"
                        % (driver.current_url, visit_id, idx,
                           shop_bot.phase))
            break

        t0 = time()
        try:
            current_ps1 = get_ps_plus_1(driver.current_url)
            if current_ps1 != landing_ps1:
                logger.error(
                    "Will quit on %s Visit Id: %d "
                    "Phase: %s Reason: %s landing_url: %s" %
                    (driver.current_url, visit_id, shop_bot.phase,
                     "off-domain navigation", landing_url))
                break
            shop_bot.act(t0-t_begin)
            if shop_bot.reason_to_quit:
                logger.info(
                    "Will quit on %s Visit Id: %d "
                    "Phase: %s Reason: %s cart_checkout_retries %d"
                    " landing_url: %s"
                    % (driver.current_url, visit_id, shop_bot.phase,
                       shop_bot.reason_to_quit,
                       shop_bot.cart_checkout_retries, landing_url))
                break
            timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
            try:
                img_b64 = driver.get_screenshot_as_base64()
            except Exception:
                logger.exception(
                    "Error while taking screenshot on %s Visit Id: %d"
                    % (driver.current_url, visit_id))
                sleep(max([0, 1-(time() - t0)]))  # try to spend 1s on each loop
                continue

            new_image_crc = binascii.crc32(img_b64)
            # check if the image has changed
            if new_image_crc == last_image_crc:
                sleep(max([0, 1-(time() - t0)]))  # try to spend 1s on each loop
                continue

            out_png_path = "%s_%d_%s_%d.png" % (
                screenshot_base_path, shop_bot.phase, timestamp, idx)
            save_screenshot_b64(out_png_path, img_b64, logger)
            last_image_crc = new_image_crc
            loop_duration = time() - t0
            logger.info(
                "Saved screenshot on %s Visit Id: %d Loop: %d Phase: %s"
                % (driver.current_url,
                   visit_id, idx, shop_bot.phase))

            sleep(max([0, 1-loop_duration]))
        except Exception as _:
            try:
                url = driver.current_url
            except Exception as _:
                url = "unknown"

            logger.exception(
                "Will quit on %s Visit Id: %d "
                "Phase: %s Reason: %s landing_url: %s" %
                (url, visit_id, shop_bot.phase,
                 "unhandled error", landing_url))
            break
    else:
        logger.info("Loop is over on %s "
                    "Visit Id: %d Loop: %d Phase: %s"
                    % (driver.current_url, visit_id, idx, shop_bot.phase))

    har_path = join(visit_dir, "%d_%s.har" % (visit_id, hostname))
    dump_har(driver, logger, har_path, visit_id)


REMOVE_DUPLICATE_IMAGES = True  # !!!


def capture_screenshots(url, n_screenshots,
                        use_visit_id_in_filenames, **kwargs):
    """Capture screenshots every second."""
    driver = kwargs['driver']
    visit_id = kwargs['visit_id']
    hostname = urlparse(url).hostname
    manager_params = kwargs['manager_params']
    data_dir = join(manager_params['data_directory'], "output")
    if use_visit_id_in_filenames:
        visit_dir = join(data_dir, "%s_%s" % (visit_id, hostname))
    else:
        # We add a checksum derived from the page URL to the visit_dir to have
        # unique visit_dir paths for each page..
        # To store screenshots from the same page in the same folder we don't
        # use visit_id in the path. To prevent mixing screenshots from
        # different URLs of the same site, we add a
        # checksum derived from the URL to the hostname.
        checksum = hex(binascii.crc32(url)).split('x')[-1]
        visit_dir = join(data_dir, "%s_%s" % (hostname, checksum))
    logger = loggingclient(*manager_params['logger_address'])
    landing_url = driver.current_url

    if not isdir(visit_dir):
        os.makedirs(visit_dir)

    if use_visit_id_in_filenames:
        screenshot_base_path = join(visit_dir, "%d_%s" % (
            visit_id, hostname))
    else:
        screenshot_base_path = join(visit_dir, "%s" % (hostname))

    sleep(SLEEP_UNTIL_DIALOG_DISMISSAL)
    last_image_crc = 0

    for idx in xrange(0, n_screenshots):
        t0 = time()
        try:
            try:
                img_b64 = driver.get_screenshot_as_base64()
            except Exception:
                logger.exception(
                    "Error while taking screenshot on %s Visit Id: %d"
                    % (driver.current_url, visit_id))
                sleep(max([0, 1-(time() - t0)]))  # spend 1s on each loop
                continue
            new_image_crc = binascii.crc32(img_b64)
            # check if the image has changed
            if REMOVE_DUPLICATE_IMAGES and new_image_crc == last_image_crc:
                sleep(max([0, 1-(time() - t0)]))  # try to spend 1s on each it.
                continue
            timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
            out_png_path = "%s_%s_%d.png" % (
                screenshot_base_path, timestamp, idx)
            save_screenshot_b64(out_png_path, img_b64, logger)
            last_image_crc = new_image_crc
            loop_duration = time() - t0
            logger.info(
                "Saved screenshot on %s Visit Id: %d Loop: %d"
                % (driver.current_url,
                   visit_id, idx))

            sleep(max([0, 1-loop_duration]))
        except Exception as _:
            try:
                url = driver.current_url
            except Exception as _:
                url = "unknown"

            logger.exception(
                "Will quit on %s Visit Id: %d Reason: %s landing_url: %s" %
                (url, visit_id, "unhandled error", landing_url))
            break
    else:
        logger.info("Loop is over on %s Visit Id: %d Loop: %d"
                    % (driver.current_url, visit_id, idx))

    har_path = join(visit_dir, "%d_%s.har" % (visit_id, hostname))
    dump_har(driver, logger, har_path, visit_id)


def click_handler(element):
    if element is not None:
        ase = element.find_elements_by_tag_name('a')
        if ase and len(ase) != 0:
            click_to_element(ase[0])
            return

        buttons = element.find_elements_by_tag_name('button')
        if buttons and len(buttons) != 0:
            click_to_element(buttons[0])
            return

        children = element.find_elements_by_xpath("*")
        if len(children) > 0:

            visible_child = None
            for child in children:
                if child.is_displayed():
                    visible_child = child
                    break

            if visible_child:
                click_to_element(visible_child)
            else:
                click_to_element(children[0])
        else:
            click_to_element(element)

        return
