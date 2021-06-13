from __future__ import absolute_import

from . import utilities as util
from ..automation.utilities import db_utils
from .openwpmtest import OpenWPMTest


NON_PRODUCT_PAGE_URL = u"%s/segment_non_product_page.html" % util.BASE_TEST_URL
NON_PRODUCT_FRAME_URL = u"%s/segment_test_page2.html" % util.BASE_TEST_URL
PRODUCT_PAGE_URL = u"%s/segment_product_page.html" % util.BASE_TEST_URL

NON_PRODUCT_TEXT = "This test page doesn't contain any product information and should not be segmented."  # noqa
DIV_TEXT = "This paragraphs is in a div this text is in span which continues here."  # noqa


class TestJSInstrument(OpenWPMTest):

    def get_config(self, data_dir=""):
        manager_params, browser_params = self.get_test_config(data_dir)
        browser_params[0]['js_instrument'] = True
        manager_params['testing'] = True
        return manager_params, browser_params

    def test_should_segment_product_and_non_product_pages(self):

        db = self.visit(PRODUCT_PAGE_URL, sleep_after=1)
        rows = db_utils.query_db(db, "SELECT inner_text from segments")
        segment_text = [row["inner_text"] for row in rows]
        assert NON_PRODUCT_TEXT in segment_text
        assert DIV_TEXT in segment_text
