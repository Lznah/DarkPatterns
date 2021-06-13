from ...MPLogger import loggingclient
from ...SocketInterface import clientsocket


class Shopper(object):

    def __init__(self, driver, visit_id, manager_params, browser_params,
                 logger):
        self.driver = driver
        self.browser_params = browser_params
        self.manager_params = manager_params
        self.logger = logger
        self.visit_id = visit_id
        self.page_url = self.driver.current_url
        self.setup_table()

    def __del__(self):
        self.sock.close()

    def setup_table(self):
        self.sock = clientsocket()
        self.sock.connect(*self.manager_params['aggregator_address'])
        # we can use this connection to store things in DB

    def start_shopping(self):
        self.logger.info("Will visit %s %s" % (self.page_url, self.visit_id))
        # self.driver is available


def visit_shopping_page(**kwargs):
    """Interact with the product page."""
    driver = kwargs['driver']
    visit_id = kwargs.get('visit_id', -1)
    manager_params = kwargs['manager_params']
    browser_params = kwargs['browser_params']
    logger = loggingclient(*manager_params['logger_address'])
    shopper = Shopper(driver, visit_id, manager_params, browser_params, logger)
    shopper.start_shopping()
