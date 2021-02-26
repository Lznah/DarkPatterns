import logging
import multiprocessing_logging

logger = logging.getLogger(__name__)
lf_handler = logging.FileHandler('crawling.log')
lf_format = logging.Formatter('%(asctime)s - %(levelname)s - %(message)s')
lf_handler.setFormatter(lf_format)
logger.addHandler(lf_handler)
logger.setLevel(logging.INFO)
multiprocessing_logging.install_mp_handler()