#!/usr/bin/env python3
"""Fetch only allowlisted dist bytes from one immutable public FM commit and publish them."""

import argparse
from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
import os
from pathlib import Path
import re
import sys
import tempfile
import urllib.error
import urllib.parse
import urllib.request

import fm_deploy_ftps as deploy

REPOSITORY = "orkesterro-collab/fm-floorstock"
API = "https://api.github.com/repos/" + REPOSITORY
RAW = "https://raw.githubusercontent.com/" + REPOSITORY
BUILD_WORKFLOW_PATH = ".github/workflows/deploy-hoster.yml"


def request_bytes(url, limit):
    origin = urllib.parse.urlsplit(url)
    canonical_origin = origin.scheme + "://" + origin.netloc
    if canonical_origin not in {"https://api.github.com", "https://raw.githubusercontent.com"}:
        raise deploy.DeployError("Only the fixed public GitHub source is permitted")
    opener = urllib.request.build_opener(deploy.SameOriginRedirect(canonical_origin))
    request = urllib.request.Request(url, headers={
        "User-Agent": "Floorstock-FM-Publisher/1.0", "Accept": "application/vnd.github+json"
    })
    with opener.open(request, timeout=40) as response:
        if response.status != 200:
            raise deploy.DeployError("GitHub source did not return HTTP 200")
        data = response.read(limit + 1)
        if len(data) > limit:
            raise deploy.DeployError("GitHub source exceeds its size limit")
        return data


def fixed_commit(requested=None):
    if requested:
        sha = requested
    else:
        reference = json.loads(request_bytes(API + "/git/ref/heads/main", 128 * 1024))
        if reference.get("ref") != "refs/heads/main" or reference.get("object", {}).get("type") != "commit":
            raise deploy.DeployError("The FM main reference is not a commit")
        sha = reference["object"]["sha"]
    if not isinstance(sha, str) or not re.fullmatch(r"[0-9a-f]{40}", sha):
        raise deploy.DeployError("An exact 40-character source commit SHA is required")
    return sha


def build_is_ready(sha):
    result = json.loads(request_bytes(API + "/actions/runs?head_sha=" + sha + "&per_page=100", 2 * 1024 * 1024))
    matches = [run for run in result.get("workflow_runs", [])
               if run.get("head_sha") == sha
               and run.get("head_branch") == "main"
               and run.get("event") in {"push", "workflow_dispatch"}
               and run.get("path", "").split("@", 1)[0] == BUILD_WORKFLOW_PATH
               and run.get("head_repository", {}).get("full_name") == REPOSITORY]
    latest = max(matches, key=lambda run: run.get("id", 0)) if matches else None
    if latest is None or latest.get("status") != "completed":
        message = "Deferred: the FM build/check workflow for this exact commit has not completed; no FTPS connection was attempted"
        print("::notice::" + message, flush=True)
        summary = os.environ.get("GITHUB_STEP_SUMMARY")
        if summary:
            with open(summary, "a", encoding="utf-8") as stream:
                stream.write("## FM: publication deferred\n\n" + message + ".\n")
        return False
    if latest.get("conclusion") != "success":
        raise deploy.DeployError("The FM build/check workflow did not succeed for the approved source commit; publication was not attempted")
    print("Successful FM build/check gate: run " + str(latest["id"]), flush=True)
    return True


def source_files(sha):
    tree = json.loads(request_bytes(API + "/git/trees/" + sha + "?recursive=1", 2 * 1024 * 1024))
    if tree.get("truncated") or not isinstance(tree.get("tree"), list):
        raise deploy.DeployError("The GitHub source tree is incomplete")
    entries = []
    total = 0
    for item in tree["tree"]:
        path = item.get("path", "")
        if not path.startswith("dist/") or item.get("type") == "tree":
            continue
        relative = path[len("dist/"):]
        if item.get("type") != "blob" or item.get("mode") not in {"100644", "100755"} or not deploy.allowed_path(relative):
            raise deploy.DeployError("FM dist contains an unapproved file")
        size = item.get("size")
        if not isinstance(size, int) or size < 0 or size > deploy.MAX_FILE_BYTES:
            raise deploy.DeployError("FM dist file size is invalid")
        if not re.fullmatch(r"[0-9a-f]{40}", item.get("sha", "")):
            raise deploy.DeployError("FM dist blob identity is invalid")
        entries.append({"path": path, "relative": relative, "size": size, "sha": item["sha"]})
        total += size
    names = {item["relative"] for item in entries}
    if not deploy.ROOT_NAMES.issubset(names) or len(names) != len(entries):
        raise deploy.DeployError("The FM commit does not contain a complete built dist directory")
    if len(entries) > 500 or total > deploy.MAX_TOTAL_BYTES:
        raise deploy.DeployError("FM dist exceeds deployment limits")
    return entries


def fetch_file(sha, item, destination):
    url = RAW + "/" + sha + "/" + urllib.parse.quote(item["path"], safe="/")
    data = request_bytes(url, item["size"])
    digest = hashlib.sha1(b"blob " + str(len(data)).encode("ascii") + b"\0" + data).hexdigest()
    if len(data) != item["size"] or digest != item["sha"]:
        raise deploy.DeployError("Downloaded bytes do not match the immutable Git blob")
    path = destination / item["relative"]
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-sha", help="Optional exact commit for an explicitly requested release/rollback")
    parser.add_argument("--force", action="store_true", help="Republish even if version.json and the homepage already match")
    args = parser.parse_args()
    sha = fixed_commit(args.source_sha)
    print("Approved public source: " + REPOSITORY + " at " + sha, flush=True)
    summary = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary:
        with open(summary, "a", encoding="utf-8") as stream:
            stream.write("Source: https://github.com/" + REPOSITORY + "/commit/" + sha + "\n\n")
    if not build_is_ready(sha):
        return
    entries = source_files(sha)
    with tempfile.TemporaryDirectory(prefix="fm-public-dist-") as temporary:
        destination = Path(temporary)
        # Cheap polling: inspect the immutable build marker and HTML before fetching other assets.
        initial = [item for item in entries if item["relative"] in {"index.html", "version.json"}]
        for item in initial:
            fetch_file(sha, item, destination)
        origin = deploy.select_public_origin()
        if not args.force:
            try:
                version = (destination / "version.json").read_bytes()
                homepage = (destination / "index.html").read_bytes()
                if (deploy.public_bytes(origin, "version.json", len(version)) == version and
                        deploy.public_bytes(origin, "", len(homepage)) == homepage):
                    print("FM already serves this build; no FTPS connection was attempted", flush=True)
                    deploy.write_summary(origin, "Already current", len(entries))
                    return
            except (urllib.error.URLError, TimeoutError, OSError, deploy.DeployError):
                pass
        if not os.environ.get("FTP_PASSWORD"):
            raise deploy.DeployError("The central publisher has no FTP_PASSWORD; no FTPS connection was attempted")
        remaining = [item for item in entries if item["relative"] not in {"index.html", "version.json"}]
        with ThreadPoolExecutor(max_workers=6) as pool:
            list(pool.map(lambda item: fetch_file(sha, item, destination), remaining))
        files = deploy.validate(destination)
        print(f"Verified {len(files)} allowlisted dist files against immutable Git blobs", flush=True)
        # No source repository scripts, npm commands, or downloaded Python are executed.
        deploy.publish(destination, files)


if __name__ == "__main__":
    try:
        main()
    except deploy.DeployError as error:
        print("::error::" + str(error), file=sys.stderr)
        sys.exit(1)
    except Exception as error:
        print("::error::Central FM publication stopped: " + type(error).__name__ +
              ". No credential values are included in this message.", file=sys.stderr)
        sys.exit(1)
