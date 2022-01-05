# Detection of Dark Patterns

This thesis is based on research conducted by researchers at Princeton University. The source code is also based on their work.

This repository contains several crawlers that are stored in the `src/crawler` directory abd a classifier inside `src/classifier`. Source codes for the steps that are needed to be done for analysis are inside `src/analysis` folder.

## Requirements:
- Python 3 and Python 2:
- Operating System: Ubuntu 20.04 LTS
- Docker
- Xvfb
- Celery
- RabbitMQ
- Jupyter Notebook
- Firefox

## How to run crawlers:
It is important to set up RabbitMQ, install Celery framework and install `requirements.txt`. Then, inside the crawler's folder is a file `run.sh`, that needs to be run to start the Celery framework. To add work inside RabbitMQ, use this command inside crawler's folder:

```bat
python3 *NAME_OF_THE_CELERY_WORKER*.py *FILENAME*.csv
```

To start `extract_textual_segments` crawler, the `run.sh` expect a CSV file with product page URLs.

## Dataset
There are output datasets and temporary datasets inside `data` folder. The output datasets, can be analysed even more, than it was done in the thesis. The temporary datasets are includes, to know what datasets to expect, if anyone would like to extend this work. They were made during a process of cleansing and preprocessing. 

## Contact
If anyone would like to do more studies on the data, that were gathered by the crawlers. Contact me on hanzlpe@icloud.com.