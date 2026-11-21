#!/usr/bin/env python3
"""Verify Prioritet's new FTP-relative root after chatgpt's home changes to /www."""

import ftplib
import io
import secrets
import sys

import fm_deploy_ftps as deploy

TARGET = "/prioritetparket.by/"
ORIGIN = "https://prioritetparket.by"


def main():
    context = deploy.trusted_ftps_context()
    ftp = deploy.connect(context)
    try:
        # No fallback to '/', '/www', or any other website.
        ftp.cwd(TARGET)
        marker = "prioritet-root-proof-" + secrets.token_hex(16) + ".txt"
        body = secrets.token_hex(32).encode("ascii")
        ftp.storbinary("STOR " + marker, io.BytesIO(body))
        try:
            if deploy.public_bytes(ORIGIN, marker, len(body)) != body:
                raise deploy.DeployError("The new Prioritet FTP path does not serve prioritetparket.by")
        finally:
            ftp.delete(marker)
        print("Verified Prioritet server-dir /prioritetparket.by/", flush=True)
    finally:
        try:
            ftp.quit()
        except ftplib.all_errors:
            ftp.close()


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print("::error::Prioritet FTP-root verification failed: " + type(error).__name__ +
              ". Check that chatgpt's home is /www; no site files were changed.", file=sys.stderr)
        sys.exit(1)
