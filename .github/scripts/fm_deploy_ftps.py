#!/usr/bin/env python3
"""Publish built FM files to its proven Hoster directory; never execute site code."""

import argparse
import ftplib
import hashlib
from html.parser import HTMLParser
import io
import json
import os
from pathlib import Path, PurePosixPath
import re
import secrets
import ssl
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

SITE_HOST = "fm.floorstock.by"
HTTPS_ORIGIN = "https://" + SITE_HOST
FTP_SERVER = "vh108.hoster.by"
FTP_CERT_SHA256 = "25327D62994712DD70353A3F2C3B7F35666073CCC950A04785A37D4E5E8EC9BB"
FTP_CANDIDATES = ("/fm.floorstock.by/", "/www/fm.floorstock.by/")
ROOT_NAMES = {"index.html", "favicon.svg", "robots.txt", "manifest.webmanifest", "version.json"}
ASSET_SUFFIXES = {".js", ".css", ".json", ".svg", ".png", ".jpg", ".jpeg", ".webp", ".gif", ".avif", ".ico", ".woff", ".woff2", ".ttf", ".otf", ".wasm", ".mp4", ".webm"}
MAX_FILE_BYTES = 32 * 1024 * 1024
MAX_TOTAL_BYTES = 100 * 1024 * 1024


class DeployError(Exception):
    pass


def allowed_path(name):
    path = PurePosixPath(name)
    if path.is_absolute() or path.as_posix() != name or "\\" in name or any(ord(c) < 32 for c in name):
        return False
    if any(part in {"", ".", ".."} or part.startswith(".") for part in path.parts):
        return False
    return name in ROOT_NAMES or (
        len(path.parts) > 1 and path.parts[0] == "assets" and path.suffix.lower() in ASSET_SUFFIXES
    )


class Page(HTMLParser):
    def __init__(self):
        super().__init__()
        self.canonical = []
        self.references = []

    def handle_starttag(self, tag, attributes):
        attributes = dict(attributes)
        relations = attributes.get("rel", "").lower().split()
        if tag == "link" and "canonical" in relations:
            self.canonical.append(attributes.get("href"))
        if tag == "script" and attributes.get("src"):
            self.references.append(attributes["src"])
        if tag == "link" and any(x in relations for x in ("stylesheet", "manifest", "icon", "modulepreload")):
            if attributes.get("href"):
                self.references.append(attributes["href"])


def validate(source):
    if source.is_symlink():
        raise DeployError("The built source directory must not be a symbolic link")
    source = source.resolve()
    if not source.is_dir():
        raise DeployError("Built source directory does not exist")
    files = []
    total = 0
    for path in sorted(source.rglob("*")):
        if path.is_symlink():
            raise DeployError("Symbolic links are not allowed in the built site")
        if not path.is_file():
            continue
        name = path.relative_to(source).as_posix()
        if not allowed_path(name):
            raise DeployError("Unexpected file in the built site: " + name)
        size = path.stat().st_size
        if size > MAX_FILE_BYTES:
            raise DeployError("A built file exceeds the size limit")
        total += size
        files.append(path)
    if total > MAX_TOTAL_BYTES or len(files) > 500:
        raise DeployError("Built site exceeds deployment limits")
    if not ROOT_NAMES.issubset({p.relative_to(source).as_posix() for p in files}):
        raise DeployError("The build must contain index.html, favicon.svg, robots.txt, manifest.webmanifest and version.json")
    page = Page()
    page.feed((source / "index.html").read_text(encoding="utf-8-sig"))
    if page.canonical != [HTTPS_ORIGIN + "/"]:
        raise DeployError("The build must declare canonical https://fm.floorstock.by/")
    for reference in page.references:
        url = urllib.parse.urlsplit(reference)
        if url.scheme or url.netloc:
            continue
        relative = urllib.parse.unquote(url.path).lstrip("/")
        path = (source / relative).resolve()
        if not path.is_relative_to(source) or not path.is_file():
            raise DeployError("The homepage references a missing or unsafe local file")
    for name in ("manifest.webmanifest", "version.json"):
        value = json.loads((source / name).read_text(encoding="utf-8"))
        if not isinstance(value, dict) or not value:
            raise DeployError(name + " must contain a non-empty JSON object")
    # Resources first, HTML next; version.json is the final success marker.
    return sorted(files, key=lambda p: (
        2 if p.relative_to(source).as_posix() == "version.json" else
        1 if p.relative_to(source).as_posix() == "index.html" else 0,
        p.relative_to(source).as_posix()
    ))


class SameOriginRedirect(urllib.request.HTTPRedirectHandler):
    def __init__(self, origin):
        self.origin = origin

    def redirect_request(self, request, response, code, message, headers, new_url):
        parsed = urllib.parse.urlsplit(new_url)
        if parsed.scheme + "://" + parsed.netloc != self.origin:
            raise DeployError("Public verification redirected away from the selected FM origin")
        return super().redirect_request(request, response, code, message, headers, new_url)


def public_bytes(origin, relative, limit):
    query = "?fm_deploy_check=" + secrets.token_hex(12)
    url = origin + "/" + urllib.parse.quote(relative, safe="/") + query
    request = urllib.request.Request(url, headers={
        "Cache-Control": "no-cache", "User-Agent": "Floorstock-FM-Publisher/1.0"
    })
    opener = urllib.request.build_opener(
        SameOriginRedirect(origin), urllib.request.HTTPSHandler(context=ssl.create_default_context())
    )
    with opener.open(request, timeout=25) as response:
        if response.status != 200:
            raise DeployError("Public FM verification did not return HTTP 200")
        return response.read(limit + 1)


def select_public_origin():
    try:
        public_bytes(HTTPS_ORIGIN, "", 1024)
        return HTTPS_ORIGIN
    except (urllib.error.URLError, TimeoutError, OSError, DeployError) as error:
        if os.environ.get("FM_ALLOW_HTTP_BOOTSTRAP") != "1":
            raise DeployError("HTTPS is unavailable or invalid; configure SSL for fm.floorstock.by before deployment") from None
        print("::warning::HTTPS verification is unavailable (" + type(error).__name__ +
              "). Explicit bootstrap mode uses public HTTP; FTPS authentication remains encrypted and verified.", flush=True)
    origin = "http://" + SITE_HOST
    public_bytes(origin, "", 1024)
    return origin


def trusted_ftps_context():
    result = subprocess.run(
        ["openssl", "s_client", "-connect", FTP_SERVER + ":21", "-starttls", "ftp",
         "-servername", FTP_SERVER, "-showcerts"], input=b"", capture_output=True, timeout=25
    )
    match = re.search(rb"-----BEGIN CERTIFICATE-----.*?-----END CERTIFICATE-----", result.stdout, re.S)
    if not match:
        raise DeployError("No FTPS certificate received; credentials were not sent")
    certificate = match.group().decode("ascii")
    fingerprint = hashlib.sha256(ssl.PEM_cert_to_DER_cert(certificate)).hexdigest().upper()
    if fingerprint != FTP_CERT_SHA256:
        raise DeployError("FTPS certificate fingerprint differs from the trusted Hoster certificate; credentials were not sent")
    return ssl.create_default_context(cadata=certificate)


def connect(context, target=None):
    password = os.environ.get("FTP_PASSWORD")
    if not password:
        raise DeployError("FTP_PASSWORD is missing from this repository's Actions secrets")
    ftp = ftplib.FTP_TLS(context=context, timeout=40)
    try:
        ftp.connect(FTP_SERVER, 21)
        ftp.auth()
        actual = hashlib.sha256(ftp.sock.getpeercert(binary_form=True)).hexdigest().upper()
        if actual != FTP_CERT_SHA256:
            raise DeployError("The authenticated FTPS connection has an unexpected certificate; credentials were not sent")
        ftp.login(os.environ.get("FTP_USERNAME") or "chatgpt", password)
        ftp.prot_p()
        if target:
            ftp.cwd(target)
        return ftp
    except BaseException:
        ftp.close()
        raise


def verify_destination(ftp, origin):
    for candidate in FTP_CANDIDATES:
        try:
            ftp.cwd(candidate)
        except ftplib.error_perm:
            continue
        marker = "fm-directory-proof-" + secrets.token_hex(16) + ".txt"
        body = secrets.token_hex(32).encode("ascii")
        ftp.storbinary("STOR " + marker, io.BytesIO(body))
        try:
            try:
                matches = public_bytes(origin, marker, len(body)) == body
            except urllib.error.HTTPError:
                matches = False
        finally:
            ftp.delete(marker)  # Only this run's newly created random proof file.
        if matches:
            print("Verified FM directory " + candidate + " at " + origin, flush=True)
            return candidate
    raise DeployError("No existing FTP directory was proven to serve fm.floorstock.by; no site files were changed")


def ensure_parents(ftp, relative, known):
    target = ftp.pwd()
    for directory in reversed(relative.parents):
        name = directory.as_posix()
        if name == "." or name in known:
            continue
        try:
            ftp.mkd(name)
        except ftplib.error_perm:
            ftp.cwd(name)
            ftp.cwd(target)
        known.add(name)


def upload_atomic(ftp, path, relative):
    temporary = relative.parent / (".fm-upload-" + secrets.token_hex(16))
    try:
        with path.open("rb") as stream:
            ftp.storbinary("STOR " + temporary.as_posix(), stream, blocksize=131072)
        ftp.rename(temporary.as_posix(), relative.as_posix())
    finally:
        try:
            ftp.delete(temporary.as_posix())
        except ftplib.all_errors:
            pass


def verify_file(origin, source, path):
    expected = path.read_bytes()
    relative = path.relative_to(source).as_posix()
    if public_bytes(origin, relative, len(expected)) != expected:
        raise DeployError("Published bytes do not match the approved build: " + relative)


def publish(source, files=None, skip_if_current=False):
    source = source.resolve()
    files = files or validate(source)
    if not skip_if_current and not os.environ.get("FTP_PASSWORD"):
        raise DeployError("FTP_PASSWORD is missing from this repository's Actions secrets; no connection was attempted")
    origin = select_public_origin()
    print("Public verification origin: " + origin, flush=True)
    if skip_if_current:
        try:
            version = (source / "version.json").read_bytes()
            homepage = (source / "index.html").read_bytes()
            if (public_bytes(origin, "version.json", len(version)) == version and
                    public_bytes(origin, "", len(homepage)) == homepage):
                print("FM already serves this verified build; no FTPS connection or upload was needed", flush=True)
                write_summary(origin, "Already current", len(files))
                return
        except (urllib.error.URLError, TimeoutError, OSError, DeployError):
            pass
    if not os.environ.get("FTP_PASSWORD"):
        raise DeployError("FTP_PASSWORD is missing from this repository's Actions secrets; no FTP connection was attempted")
    context = trusted_ftps_context()
    ftp = connect(context)
    try:
        target = verify_destination(ftp, origin)
        known = set()
        for number, path in enumerate(files, 1):
            relative = path.relative_to(source)
            if relative.as_posix() == "version.json":
                # A version match may skip future scheduled runs only after all other bytes were verified.
                for uploaded in files:
                    if uploaded.name != "version.json" or uploaded.parent != source:
                        verify_file(origin, source, uploaded)
                homepage = (source / "index.html").read_bytes()
                if public_bytes(origin, "", len(homepage)) != homepage:
                    raise DeployError("The public FM root does not serve the approved homepage")
            for attempt in range(3):
                try:
                    ensure_parents(ftp, relative, known)
                    upload_atomic(ftp, path, relative)
                    break
                except ftplib.all_errors:
                    if attempt == 2:
                        raise
                    ftp.close()
                    time.sleep(2 * (attempt + 1))
                    ftp = connect(context, target)
            print(f"Published {number}/{len(files)}: {relative.as_posix()}", flush=True)
        verify_file(origin, source, source / "version.json")
    finally:
        try:
            ftp.quit()
        except ftplib.all_errors:
            ftp.close()
    write_summary(origin, "Published and verified", len(files))
    print("FM publication verified at " + origin + "/", flush=True)


def write_summary(origin, state, count):
    summary = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary:
        with open(summary, "a", encoding="utf-8") as stream:
            stream.write(f"## FM: {state}\n\n- Public origin: {origin}/\n- Built files: {count}\n")
            if origin.startswith("http:"):
                stream.write("- HTTPS is not yet available; this was an explicitly allowed public HTTP bootstrap. FTPS remained verified.\n")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-dir", type=Path, default=Path("dist"))
    parser.add_argument("--check", action="store_true", help="Validate locally without network or secrets")
    args = parser.parse_args()
    files = validate(args.source_dir)
    print(f"Validated {len(files)} built FM files", flush=True)
    if not args.check:
        publish(args.source_dir, files)


if __name__ == "__main__":
    try:
        main()
    except DeployError as error:
        print("::error::" + str(error), file=sys.stderr)
        sys.exit(1)
    except Exception as error:
        print("::error::FM deployment stopped: " + type(error).__name__ +
              ". Inspect host availability and configuration; credential values were not printed.", file=sys.stderr)
        sys.exit(1)
