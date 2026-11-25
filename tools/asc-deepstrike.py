#!/usr/bin/env python3
"""App Store Connect helpers for DEEP STRIKE.

Lookup only. This file does not register a bundle id, does not create an app
record, and does not create or revoke a certificate. The only profile it can
create is one App Store profile for com.shaz010.deepstrike on certificate
TB4K2QATUT, and only when the upload job calls fixed-profile.
"""

from __future__ import annotations

import base64
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request

BUNDLE_ID = "com.shaz010.deepstrike"
APP_NAME = "DEEP STRIKE"
SKU = "deepstrike"
LOCALE = "en-US"
API = "https://api.appstoreconnect.apple.com"
FIXED_CERT_ID = "TB4K2QATUT"
PROFILE_NAME = "DEEP STRIKE App Store"
# Never select, create, or revoke this certificate. It belongs to another app.
FORBIDDEN_CERT_ID = "FST4V622A2"

WHATS_NEW = (
    "DEEP STRIKE 17x30. The locked web build, bundled so it plays offline. "
    "Same flight as strike-17. Build 1."
)


class ASCError(Exception):
    def __init__(self, status: int, payload: dict):
        self.status = status
        self.payload = payload
        super().__init__(f"App Store Connect HTTP {status}: {error_text(payload)}")


def error_text(payload: dict) -> str:
    parts = []
    for err in payload.get("errors") or []:
        bits = [err.get("status"), err.get("code"), err.get("title"), err.get("detail")]
        parts.append(" ".join(str(b) for b in bits if b))
    if not parts and payload.get("raw"):
        parts.append(str(payload["raw"])[:400])
    return " | ".join(parts) or "empty error"


def emit(name: str, value: str) -> None:
    if "\n" in value or "\r" in value:
        sys.exit(f"Refusing to write a multi-line value for {name}.")
    path = os.environ.get("GITHUB_ENV", "")
    if not path:
        print(f"{name}={value}")
        return
    with open(path, "a", encoding="utf-8") as handle:
        handle.write(f"{name}={value}\n")


def require_env(name: str) -> str:
    value = os.environ.get(name, "")
    if not value.strip():
        sys.exit(f"{name} is not set.")
    return value


def normalize_p8(raw: str) -> str:
    text = raw.strip().strip('"').strip("'")
    if text.startswith("\ufeff"):
        text = text.lstrip("\ufeff")
    if "\\n" in text and "BEGIN" in text:
        text = text.replace("\\r\\n", "\n").replace("\\n", "\n")
    if "BEGIN" not in text:
        compact = "".join(text.split())
        try:
            decoded = base64.b64decode(compact, validate=True)
        except Exception:
            decoded = b""
        if b"BEGIN" in decoded:
            text = decoded.decode("utf-8")
    if "BEGIN" not in text or "END" not in text:
        raise ValueError("ASC_KEY_P8 is not a PEM private key.")
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    if not text.endswith("\n"):
        text += "\n"
    return text


def instructions() -> str:
    return f"""Stop. DEEP STRIKE has no bundle id or no App Store Connect app record.
This workflow will not create either one.

Shahbaz, do this once. Do not open any other app, and do not revoke any certificate.

1. Open https://developer.apple.com/account/resources/identifiers/list
2. Click the + button.
3. Select App IDs, then Continue.
4. Select App, then Continue.
5. Description: DEEP STRIKE
6. Bundle ID: Explicit, then type {BUNDLE_ID}
7. Leave every capability off. Continue, then Register.
8. Open https://appstoreconnect.apple.com/apps
9. If the + button is missing, open https://appstoreconnect.apple.com/agreements and accept the Paid Applications agreement. The Account Holder has to do that. Apple asks for it even when the app is free.
10. Click +, then New App.
11. Platforms: iOS only.
12. Name: {APP_NAME}
13. Primary language: English (U.S.)
14. Bundle ID: {BUNDLE_ID}
15. SKU: {SKU}
16. User Access: Full Access.
17. Click Create.

Then run TestFlight deepstrike again with upload set to true.
"""


def stop(message: str) -> None:
    print("::error title=Shahbaz must create the DEEP STRIKE record::See the log for the clicks.")
    print(message)
    sys.exit(2)


def install_key() -> None:
    text = normalize_p8(require_env("ASC_KEY_P8"))
    key_id = require_env("ASC_KEY_ID").strip()
    if not re.fullmatch(r"[A-Z0-9]{10}", key_id):
        sys.exit("ASC_KEY_ID does not look like an App Store Connect key id.")
    destinations = [
        os.path.expanduser(f"~/.appstoreconnect/private_keys/AuthKey_{key_id}.p8"),
        os.path.expanduser(f"~/private_keys/AuthKey_{key_id}.p8"),
        os.path.join(os.environ.get("RUNNER_TEMP", "/tmp"), "private_keys", f"AuthKey_{key_id}.p8"),
    ]
    primary = ""
    for path in destinations:
        os.makedirs(os.path.dirname(path), mode=0o700, exist_ok=True)
        with open(path, "w", encoding="utf-8") as handle:
            handle.write(text)
        os.chmod(path, 0o600)
        primary = path
    emit("ASC_KEY_PATH", primary)
    print(f"Installed API key {key_id}.")


def make_token() -> str:
    import jwt
    from cryptography.hazmat.primitives.serialization import load_pem_private_key

    key_id = require_env("ASC_KEY_ID").strip()
    issuer = require_env("ASC_ISSUER_ID").strip()
    pem = normalize_p8(require_env("ASC_KEY_P8"))
    key = load_pem_private_key(pem.encode("utf-8"), password=None)
    now = int(time.time())
    token = jwt.encode(
        {"iss": issuer, "iat": now, "exp": now + 15 * 60, "aud": "appstoreconnect-v1"},
        key,
        algorithm="ES256",
        headers={"kid": key_id, "typ": "JWT"},
    )
    return token if isinstance(token, str) else token.decode("ascii")


def api(method: str, path: str, body: dict | None = None, token: str | None = None) -> dict:
    if method in ("POST", "DELETE", "PATCH"):
        allowed = (
            method == "POST" and path == "/v1/profiles",
            method == "POST" and path == "/v1/betaBuildLocalizations",
            method == "PATCH" and path.startswith("/v1/builds/"),
        )
        if not any(allowed):
            sys.exit(f"Refusing {method} {path}.")
    token = token or make_token()
    url = path if path.startswith("https://") else API + path
    data = None if body is None else json.dumps(body).encode("utf-8")
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Authorization", f"Bearer {token}")
    req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=60) as res:
            raw = res.read().decode("utf-8")
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode("utf-8", "replace")
        try:
            payload = json.loads(raw)
        except json.JSONDecodeError:
            payload = {"raw": raw[:400]}
        raise ASCError(exc.code, payload) from None


def find_bundle(token: str) -> dict | None:
    data = api("GET", f"/v1/bundleIds?filter[identifier]={BUNDLE_ID}&limit=5", token=token)
    rows = data.get("data") or []
    return rows[0] if rows else None


def find_app(token: str) -> dict | None:
    data = api("GET", f"/v1/apps?filter[bundleId]={BUNDLE_ID}&limit=5", token=token)
    rows = data.get("data") or []
    return rows[0] if rows else None


def next_build_number(token: str, app_id: str) -> int:
    best = 0
    url = f"/v1/builds?filter[app]={app_id}&fields[builds]=version&limit=200"
    for _ in range(10):
        data = api("GET", url, token=token)
        for item in data.get("data") or []:
            try:
                number = int(str((item.get("attributes") or {}).get("version") or "0"))
            except ValueError:
                continue
            best = max(best, number)
        url = (data.get("links") or {}).get("next") or ""
        if not url:
            break
    return max(1, best + 1) if best else 1


def lookup() -> None:
    """Read the bundle id and the app record. Create neither."""
    team = require_env("APPLE_TEAM_ID").strip()
    if not re.fullmatch(r"[A-Z0-9]{10}", team):
        sys.exit("APPLE_TEAM_ID must be the 10-character Apple Team ID.")
    token = make_token()
    bundle = find_bundle(token)
    app = find_app(token)
    if not bundle or not app:
        stop(instructions())
    number = next_build_number(token, app["id"])
    emit("BUILD_NUMBER", str(number))
    emit("ASC_APP_ID", str(app["id"]))
    emit("MARKETING_VERSION", "1.0")
    print(f"App record exists for {BUNDLE_ID}. Next build number is {number}.")


def embedded_plist(blob: bytes) -> dict:
    start = blob.find(b"<?xml")
    end = blob.find(b"</plist>")
    if start < 0 or end < 0:
        sys.exit("Provisioning profile has no plist.")
    text = blob[start:end + len(b"</plist>")].decode("utf-8", "replace")
    # The keys this workflow reads are plain strings. Avoid pulling in a plist parser.
    def grab(key: str) -> str:
        match = re.search(rf"<key>{re.escape(key)}</key>\s*<string>([^<]*)</string>", text)
        return match.group(1) if match else ""
    return {"UUID": grab("UUID"), "Name": grab("Name")}


def write_export_plist(path: str, team: str, profile_name: str) -> None:
    text = f"""<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>method</key>
  <string>app-store-connect</string>
  <key>signingStyle</key>
  <string>manual</string>
  <key>teamID</key>
  <string>{team}</string>
  <key>uploadSymbols</key>
  <true/>
  <key>destination</key>
  <string>export</string>
  <key>stripSwiftSymbols</key>
  <true/>
  <key>manageAppVersionAndBuildNumber</key>
  <false/>
  <key>provisioningProfiles</key>
  <dict>
    <key>{BUNDLE_ID}</key>
    <string>{profile_name}</string>
  </dict>
</dict>
</plist>
"""
    with open(path, "w", encoding="utf-8") as handle:
        handle.write(text)


def confirm_cert(token: str) -> None:
    if FIXED_CERT_ID == FORBIDDEN_CERT_ID:
        sys.exit("Refusing to use the forbidden certificate.")
    try:
        row = api("GET", f"/v1/certificates/{FIXED_CERT_ID}", token=token)["data"]
    except ASCError as exc:
        sys.exit(f"Certificate {FIXED_CERT_ID} is not available ({exc}).")
    attrs = row.get("attributes") or {}
    print(
        f"Using existing certificate {FIXED_CERT_ID} "
        f"type={attrs.get('certificateType')} expires={attrs.get('expirationDate')}."
    )


def fixed_profile() -> None:
    """Reuse or create one App Store profile on TB4K2QATUT. No certificate changes."""
    team = require_env("APPLE_TEAM_ID").strip()
    token = make_token()
    confirm_cert(token)
    bundle = find_bundle(token)
    if not bundle:
        stop(instructions())
    chosen = None
    listed = api("GET", f"/v1/bundleIds/{bundle['id']}/profiles?limit=50", token=token)
    for row in listed.get("data") or []:
        attrs = row.get("attributes") or {}
        if attrs.get("profileType") != "IOS_APP_STORE" or attrs.get("profileState") != "ACTIVE":
            continue
        certs = api("GET", f"/v1/profiles/{row['id']}/certificates", token=token).get("data") or []
        ids = [c.get("id") for c in certs]
        if FORBIDDEN_CERT_ID in ids:
            continue
        if FIXED_CERT_ID in ids:
            chosen = api("GET", f"/v1/profiles/{row['id']}", token=token)["data"]
            print(f"Reusing profile {attrs.get('name')}.")
            break
    if chosen is None:
        body = {
            "data": {
                "type": "profiles",
                "attributes": {"name": PROFILE_NAME, "profileType": "IOS_APP_STORE"},
                "relationships": {
                    "bundleId": {"data": {"type": "bundleIds", "id": bundle["id"]}},
                    "certificates": {"data": [{"type": "certificates", "id": FIXED_CERT_ID}]},
                },
            }
        }
        try:
            chosen = api("POST", "/v1/profiles", body, token=token)["data"]
        except ASCError as exc:
            sys.exit(f"Could not create the DEEP STRIKE profile on {FIXED_CERT_ID} ({exc}).")
        print(f"Created profile {PROFILE_NAME} on certificate {FIXED_CERT_ID}.")
    attrs = chosen.get("attributes") or {}
    name = attrs.get("name") or PROFILE_NAME
    blob = base64.b64decode(attrs.get("profileContent") or "")
    info = embedded_plist(blob)
    uuid = info.get("UUID") or chosen["id"]
    out_dir = os.path.join(os.environ.get("RUNNER_TEMP", "/tmp"), "signing")
    os.makedirs(out_dir, mode=0o700, exist_ok=True)
    profile_path = os.path.join(out_dir, f"{uuid}.mobileprovision")
    with open(profile_path, "wb") as handle:
        handle.write(blob)
    os.chmod(profile_path, 0o600)
    plist_path = os.path.join(out_dir, "ExportOptions.plist")
    write_export_plist(plist_path, team, name)
    emit("SIGNING_PROFILE_PATH", profile_path)
    emit("SIGNING_PROFILE_UUID", str(uuid))
    emit("SIGNING_PROFILE_NAME", name)
    emit("SIGNING_IDENTITY", "Apple Distribution")
    emit("EXPORT_OPTIONS_PLIST", plist_path)


def note() -> None:
    app_id = require_env("ASC_APP_ID").strip()
    version = require_env("BUILD_NUMBER").strip()
    token = make_token()
    build = None
    for _ in range(12):
        data = api(
            "GET",
            f"/v1/builds?filter[app]={app_id}&filter[version]={version}&limit=5",
            token=token,
        )
        rows = data.get("data") or []
        if rows:
            build = rows[0]
            break
        time.sleep(15)
    if not build:
        print(f"Build {version} is not visible yet. What to Test was not attached.")
        return
    build_id = build["id"]
    try:
        api(
            "PATCH",
            f"/v1/builds/{build_id}",
            {
                "data": {
                    "id": build_id,
                    "type": "builds",
                    "attributes": {"usesNonExemptEncryption": False},
                }
            },
            token=token,
        )
        print("Export compliance set from the binary: no non-exempt encryption.")
    except ASCError as exc:
        print(f"Export compliance was left for App Store Connect ({exc}).")
    try:
        api(
            "POST",
            "/v1/betaBuildLocalizations",
            {
                "data": {
                    "type": "betaBuildLocalizations",
                    "attributes": {"locale": LOCALE, "whatsNew": WHATS_NEW},
                    "relationships": {"build": {"data": {"type": "builds", "id": build_id}}},
                }
            },
            token=token,
        )
        print("What to Test attached.")
    except ASCError as exc:
        print(f"What to Test was not attached ({exc}).")


def self_test() -> None:
    source = open(__file__, encoding="utf-8").read().split("def self_test", 1)[0]
    if FIXED_CERT_ID != "TB4K2QATUT":
        sys.exit("The signing certificate is not TB4K2QATUT.")
    if FORBIDDEN_CERT_ID == FIXED_CERT_ID:
        sys.exit("Forbidden certificate matches the signing certificate.")
    if source.count('api("POST", "/v1/profiles"') != 1:
        sys.exit("Profile creation is not the single profile POST.")
    for banned in (
        'api("POST", "/v1/bundleIds"',
        'api("POST", "/v1/apps"',
        'api("POST", "/v1/certificates"',
        'api("DELETE"',
    ):
        if banned in source:
            sys.exit(f"self-test found a forbidden call: {banned}")
    if '"/v1/betaBuildLocalizations"' not in source:
        sys.exit("What to Test call is missing.")
    out = os.path.join(os.environ.get("RUNNER_TEMP", "/tmp"), "deepstrike-export-selftest.plist")
    write_export_plist(out, "TEAMID1234", PROFILE_NAME)
    text = open(out, encoding="utf-8").read()
    os.remove(out)
    for needle in ("manual", BUNDLE_ID, PROFILE_NAME, "app-store-connect"):
        if needle not in text:
            sys.exit(f"Export plist is missing {needle}.")
    print(f"self-test ok. Bundle {BUNDLE_ID}. Certificate {FIXED_CERT_ID}. No upload.")


def main(argv: list[str]) -> None:
    command = argv[1] if len(argv) > 1 else ""
    if command == "self-test":
        self_test()
    elif command == "install-key":
        install_key()
    elif command == "lookup":
        lookup()
    elif command == "fixed-profile":
        fixed_profile()
    elif command == "note":
        note()
    else:
        sys.exit("Use self-test, install-key, lookup, fixed-profile, or note.")


if __name__ == "__main__":
    main(sys.argv)
