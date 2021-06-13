from __future__ import absolute_import

from urlparse import urlparse
from . import utilities as util
from ..automation.utilities import db_utils
from .openwpmtest import OpenWPMTest
from ..automation import CommandSequence, TaskManager
from ..automation.Commands.utils.screen_capture import interact_with_the_product_page


PRODUCT_PAGE_URL_1 = u"%s/atc_cart_checkout_flow.html" % util.BASE_TEST_URL
PRODUCT_PAGE_URL_2 = u"%s/product_page_2.html" % util.BASE_TEST_URL

NON_PRODUCT_TEXT = "This test page doesn't contain any product information and should not be segmented."  # noqa
DIV_TEXT = "This paragraphs is in a div this text is in span which continues here."  # noqa

TIME_ON_PAGE = 500  # product interaction = 125, initial wait 10


class TestPhaseIsolationInstrument(OpenWPMTest):

    def get_config(self, data_dir=""):
        manager_params, browser_params = self.get_test_config(data_dir)
        browser_params[0]['js_instrument'] = True
        manager_params['testing'] = True
        return manager_params, browser_params

    def test_should_segment_product_and_non_product_pages(self):
        manager_params, browser_params = self.get_config()
        manager = TaskManager.TaskManager(manager_params, browser_params)
        cs = CommandSequence.CommandSequence(PRODUCT_PAGE_URL_1, reset=True)
        cs.get(sleep=0, timeout=60)
        hostname = urlparse(PRODUCT_PAGE_URL_1).hostname
        cs.dump_page_source(hostname, timeout=TIME_ON_PAGE + 5)
        cs.run_custom_function(interact_with_the_product_page, (TIME_ON_PAGE,),
                               timeout=TIME_ON_PAGE + 5)
        manager.execute_command_sequence(cs)
        manager.close()
        rows = db_utils.query_db(manager_params['db'],
                                 "SELECT time_stamp, inner_text from segments")
        segment_text = [row["inner_text"] for row in rows]
        for row in rows:
            print (row["time_stamp"], row["inner_text"])

