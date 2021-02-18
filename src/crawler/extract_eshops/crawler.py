from logger import logger
from selenium import webdriver
from selenium.webdriver.chrome.options import Options

PAGE_LOAD_TIMEOUT = 60
DEBUG = False

def crawl(url):
    try:
        chrome_options = Options()
        chrome_options.add_argument("--headless")
        chrome_options.add_argument("--no-sandbox")
        chrome_options.add_argument("--disable-dev-shm-usage")
        chrome_prefs = {}
        driver = webdriver.Chrome(options=chrome_options)
        driver.set_page_load_timeout(PAGE_LOAD_TIMEOUT)
        logger.info("Crawls " + url)
        driver.get(url)
        data = []
        eshops = driver.find_elements_by_css_selector(".c-shops-table .c-shops-table__name")
        for eshop in eshops:
            name = eshop.text
            attribute = eshop.get_attribute('href')
            data.append({'name':name, 'href':attribute})
            if DEBUG:
                break
        driver.quit()
        logger.info('Page ' + url + ' returned ' + str(len(data)) + ' shop links')
    except Exception:
        logger.exception("Exception while crawling %s" % url)    
    return data
