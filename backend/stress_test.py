#!/usr/bin/env python3
import argparse
import json
import random
import string
import ssl
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed


def build_url(base_url, path):
    return urllib.parse.urljoin(base_url.rstrip("/") + "/", path.lstrip("/"))


def random_email(prefix="stress"):
    token = "".join(random.choices(string.ascii_lowercase + string.digits, k=8))
    return f"{prefix}-{int(time.time() * 1000)}-{token}@example.com"


class StressResult:
    def __init__(self):
        self.lock = threading.Lock()
        self.total = 0
        self.success = 0
        self.failures = 0
        self.duration_sum = 0.0
        self.codes = {}

    def record(self, elapsed, status_code=None, ok=True):
        with self.lock:
            self.total += 1
            self.duration_sum += elapsed
            if ok:
                self.success += 1
            else:
                self.failures += 1
            if status_code is not None:
                self.codes[status_code] = self.codes.get(status_code, 0) + 1

    def summary(self):
        avg = self.duration_sum / self.total if self.total else 0.0
        return {
            "total": self.total,
            "success": self.success,
            "failures": self.failures,
            "avg_ms": round(avg * 1000, 2),
            "codes": self.codes,
        }


class BackendStressTester:
    def __init__(self, base_url, timeout=10):
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout

    def http_request(self, method, path, data=None, token=None):
        url = build_url(self.base_url, path)
        body = None
        headers = {
            "Accept": "application/json",
        }
        if data is not None:
            body = json.dumps(data).encode("utf-8")
            headers["Content-Type"] = "application/json"
        if token:
            headers["Authorization"] = f"Bearer {token}"

        request = urllib.request.Request(url, data=body, headers=headers, method=method)
        context = ssl.create_default_context()
        try:
            start = time.perf_counter()
            with urllib.request.urlopen(
                request, timeout=self.timeout, context=context
            ) as response:
                payload = response.read().decode("utf-8")
                elapsed = time.perf_counter() - start
                return elapsed, response.status, payload
        except urllib.error.HTTPError as exc:
            elapsed = time.perf_counter() - start
            payload = exc.read().decode("utf-8", errors="ignore")
            return elapsed, exc.code, payload
        except Exception as exc:
            elapsed = time.perf_counter() - start
            return elapsed, None, str(exc)

    def health_check(self):
        return self.http_request("GET", "/health")

    def register(self, email, password, name="Stress Test"):
        return self.http_request(
            "POST",
            "/auth/register",
            {
                "email": email,
                "password": password,
                "name": name,
            },
        )

    def login(self, email, password):
        return self.http_request(
            "POST",
            "/auth/login",
            {
                "email": email,
                "password": password,
            },
        )

    def me(self, token):
        return self.http_request("GET", "/auth/me", token=token)

    def list_news(self):
        return self.http_request("GET", "/news")

    def create_share(self, token, read_only=True):
        return self.http_request(
            "POST", "/share/create", {"readOnly": read_only}, token=token
        )


def worker(fn, result, *args, **kwargs):
    elapsed, code, payload = fn(*args, **kwargs)
    ok = code is not None and 200 <= code < 300
    result.record(elapsed, status_code=code, ok=ok)
    return code, payload


def run_load_test(tester, target, args):
    result = StressResult()
    futures = []
    with ThreadPoolExecutor(max_workers=args.concurrency) as executor:
        for _ in range(args.requests):
            futures.append(executor.submit(worker, target, result))
        for future in as_completed(futures):
            future.result()
    return result.summary()


def run_generic_test(tester, args):
    result = StressResult()
    tasks = []
    with ThreadPoolExecutor(max_workers=args.concurrency) as executor:
        if args.test == "health":
            target = tester.health_check
        elif args.test == "list-news":
            target = tester.list_news
        elif args.test == "register":
            target = lambda: tester.register(random_email(), args.password)
        elif args.test == "login":
            target = lambda: tester.login(args.email, args.password)
        else:
            raise ValueError(f"Unknown test type: {args.test}")

        for _ in range(args.requests):
            tasks.append(executor.submit(worker, target, result))
        for task in as_completed(tasks):
            task.result()
    return result.summary()


def main():
    parser = argparse.ArgumentParser(description="Backend stress test for WebSH")
    parser.add_argument(
        "--base-url", default="http://127.0.0.1:5151", help="Backend base URL"
    )
    parser.add_argument(
        "--requests", type=int, default=100, help="Total requests to send"
    )
    parser.add_argument(
        "--concurrency", type=int, default=20, help="Concurrent worker threads"
    )
    parser.add_argument(
        "--test",
        choices=["health", "register", "login", "me", "list-news", "share"],
        default="health",
    )
    parser.add_argument(
        "--email", default="stress@example.com", help="Email for login/me/share tests"
    )
    parser.add_argument(
        "--password", default="StressTest123!", help="Password for login/register tests"
    )
    parser.add_argument(
        "--register-random",
        action="store_true",
        help="Generate unique emails for each register request",
    )
    parser.add_argument(
        "--share-read-only",
        action="store_true",
        help="Create share sessions in read-only mode",
    )
    args = parser.parse_args()

    tester = BackendStressTester(args.base_url)

    print(f"Running stress test: {args.test}")
    print(f"Base URL: {args.base_url}")
    print(f"Requests: {args.requests}, Concurrency: {args.concurrency}")

    if args.test == "me" or args.test == "share":
        login_elapsed, login_code, login_payload = tester.login(
            args.email, args.password
        )
        if login_code != 200:
            print(
                f"Unable to login before running {args.test}: {login_code} {login_payload}"
            )
            return
        auth = json.loads(login_payload)
        token = auth["token"]
        if args.test == "me":
            target = lambda: tester.me(token)
        else:
            target = lambda: tester.create_share(token, read_only=args.share_read_only)
    elif args.test == "login":
        target = lambda: tester.login(args.email, args.password)
    elif args.test == "register":
        if args.register_random:
            target = lambda: tester.register(random_email(), args.password)
        else:
            target = lambda: tester.register(args.email, args.password)
    elif args.test == "health":
        target = tester.health_check
    elif args.test == "list-news":
        target = tester.list_news
    else:
        raise ValueError(f"Unknown test type: {args.test}")

    summary = StressResult()
    futures = []
    with ThreadPoolExecutor(max_workers=args.concurrency) as executor:
        for _ in range(args.requests):
            futures.append(executor.submit(worker, target, summary))
        for future in as_completed(futures):
            future.result()

    stats = summary.summary()
    print("--- Stress test result ---")
    print(f"Total requests: {stats['total']}")
    print(f"Success: {stats['success']}")
    print(f"Failures: {stats['failures']}")
    print(f"Average latency: {stats['avg_ms']} ms")
    print("Status codes:")
    for code, count in sorted(stats["codes"].items()):
        print(f"  {code}: {count}")


if __name__ == "__main__":
    main()
