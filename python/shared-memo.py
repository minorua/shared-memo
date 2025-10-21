# -*- coding: utf-8 -*-

"""
Shared memo downloader
"""

from datetime import datetime
import os
import argparse
import sys
import logging

import firebase_admin
from firebase_admin import credentials, firestore


def main(args):
    key_path = os.path.join(os.path.dirname(__file__), 'auth', 'firebase-adminsdk-fbsvc.json')
    if os.path.exists(key_path):
        logging.info('Firebase admin SDK key file found: {}'.format(key_path))
    else:
        logging.error('Firebase admin SDK key file not found: {}'.format(key_path))
        return 1

    cred = credentials.Certificate(key_path)
    firebase_admin.initialize_app(cred)

    logging.info('Downloading started.')

    db = firestore.client()
    docs = db.collection('shared_memo').get()

    logging.info('Downloading finished.')

    timestamp = datetime.now().strftime('%Y%m%d%H%M%S')

    for doc in docs:
        if doc.id != 'latest':
            continue

        d = doc.to_dict()
        memos = d.get('memos', [])

        if len(memos) == 0:
            logging.info('No memos found.')
            return 0

        logging.info('{} memos found.'.format(len(memos)))

        output_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'archives', f'{timestamp}.tsv')

        with open(output_path, 'w', encoding='utf-8') as f:
            for memo in memos:
                dt_local = datetime.fromtimestamp(memo.get('created', 0) / 1000)
                ts = dt_local.strftime('%Y-%m-%d %H:%M:%S')

                line = "{}\t{}\n".format(ts, memo.get('text', '').replace('\t', '\\t'))
                f.write(line)

        logging.info(f'Memo archive saved to: {output_path}')

    return 0


def setup_logging(verbose):
    log_level = logging.DEBUG if verbose else logging.INFO
    logging.basicConfig(
        level=log_level,
        format='%(asctime)s [%(levelname)s] %(message)s',
        datefmt='%Y-%m-%d %H:%M:%S',
    )


def parse_arguments():
    parser = argparse.ArgumentParser(
        description='Shared memo downloader'
    )

    # parser.add_argument(
    #     '-n', '--name',
    #     type=str,
    #     help=''
    # )

    parser.add_argument(
        '-v', '--verbose',
        action='store_true',
        help='詳細なログ(DEBUGレベル)を出力します。'
    )

    return parser.parse_args()


if __name__ == '__main__':
    exit_code = 1
    try:
        args = parse_arguments()

        setup_logging(args.verbose)

        exit_code = main(args)

    except Exception as e:
        logging.error('Unexpected error occurred:')
        logging.error(e, exc_info=True)

    finally:
        sys.exit(exit_code)
