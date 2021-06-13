from ...MPLogger import loggingclient
from utils import close_dialog
from time import sleep


def close_dialogs(**kwargs):
    """Interact with the product page."""
    driver = kwargs['driver']
    visit_id = kwargs.get('visit_id', -1)
    manager_params = kwargs['manager_params']
    logger = loggingclient(*manager_params['logger_address'])
    try:
        logger.debug("Will close dialogs on %s Visit ID: %d"
                     % (driver.current_url, visit_id))
        n_closed_dialog_elements = close_dialog(driver)
        if n_closed_dialog_elements:
            logger.info("Closed %d dialogs on %s" % (
                n_closed_dialog_elements, driver.current_url))
        sleep(10)  # leave time for segmentaion
    except Exception:
        logger.exception("Error while closing dialog on %s Visit ID: %d"
                         % (driver.current_url, visit_id))
