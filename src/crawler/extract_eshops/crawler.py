from logger import logger
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
import os
import csv

PAGE_LOAD_TIMEOUT = 60
BASIC_URL = "https://obchody.heureka.cz/?f="
OUTPUT_FOLDER = 'output'
DEBUG = False

def crawl(page):
    create_output_folders()

    url = BASIC_URL + page
    data = []
    try:
        chrome_options = Options()
        chrome_options.add_argument("--headless")
        chrome_options.add_argument("--no-sandbox")
        chrome_options.add_argument("--disable-dev-shm-usage")
        driver = webdriver.Chrome(options=chrome_options)
        driver.set_page_load_timeout(PAGE_LOAD_TIMEOUT)
        logger.info("Starting to crawl " + url)
        driver.get(url)
        save_html(page, driver.page_source)
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
    write_to_file(page, data)

def write_to_file(page, eshops):
    logger.info("Saving page %s with %d links" % (page, len(eshops)))
    try:
        path = os.path.join(OUTPUT_FOLDER, 'csv', page+'.csv')
        csv_columns = ['name', 'href']
        with open(path, 'w') as csvfile:
            writer = csv.DictWriter(csvfile, fieldnames=csv_columns)
            for data in eshops:
                writer.writerow(data)
    except IOError:
        logger.error("I/O error")

def save_html(page,html):
    try:
        path = os.path.join(OUTPUT_FOLDER, 'html' ,page+".html")
        logger.info("Saving html of page %a" % page)
        f = open(path, "w")
        f.write(html)
        f.close()
    except IOError:
        logger.error("I/O error")
    
def create_output_folders():
    try:
        path = os.path.join(OUTPUT_FOLDER, 'html')
        os.makedirs(path)
    except FileExistsError:
        pass
    try:
        path = os.path.join(OUTPUT_FOLDER, 'csv')
        os.makedirs(path)
    except FileExistsError:
        pass