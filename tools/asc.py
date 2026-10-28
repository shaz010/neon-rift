#!/usr/bin/env python3
"""App Store Connect helpers for the nrl1 TestFlight workflow.

Registers com.shaz010.nrl1, finds or creates that app record, and picks the
next build number. Signing replaces only the profile named "nrl1 CI". It does
not revoke Neon Rift 2 distribution certificates.

Commands:
  self-test     offline checks
  install-key   write ASC_KEY_P8 to the paths Transporter and xcodebuild read
  prepare       bundle id, app record, next build number
  provision     distribution certificate and App Store profile for nrl1
  note          What to Test, export compliance, and the internal test group
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

BUNDLE_ID = "com.shaz010.nrl1"
APP_NAME = "nrl1"
SKU = "nrl1"
LOCALE = "en-US"
API = "https://api.appstoreconnect.apple.com"

WHATS_NEW = (
    "nrls-1. Draw a circle for a bubble, a zigzag for a bolt, a spiral for a well, or a line to dash. "
    "The hull still turns ultraviolet on a streak or a prize, and deep red "
    "when you are on your last life with no shield and something is close. "
    "The flywheel, the knot, the controls, and the enemies stay as they were. "
    "This is the lab game, separate from Neon Rift 2."
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


def create_is_forbidden(err: ASCError) -> bool:
    if err.status == 403:
        return True
    blob = error_text(err.payload).lower()
    return "not allow" in blob and "create" in blob


def app_record_instructions(reason: str) -> str:
    return f"""Stop. nrl1 has no App Store Connect app record, and the API cannot create one.
Reason: {reason}

Shahbaz has to create the record once. The workflow already tried to register the bundle id com.shaz010.nrl1. Do not reuse Neon Rift 2 (com.shaz010.neonrift2) or the original Neon Rift app.

1. Open https://appstoreconnect.apple.com/apps
2. If the page asks you to review agreements, or the + button is missing, open https://appstoreconnect.apple.com/agreements and accept the latest Paid Applications agreement (Apple requires this even for a free app). The Account Holder has to do that.
3. Back on Apps, click the + button at the top left.
4. Click New App.
5. Platforms: check iOS only.
6. Name: nrl1
7. Primary language: English (U.S.)
8. Bundle ID: choose com.shaz010.nrl1 from the menu.
   If that identifier is not listed:
     a. Open https://developer.apple.com/account/resources/identifiers/list
     b. Click the + button.
     c. Select App IDs, then Continue.
     d. Select App, then Continue.
     e. Description: nrl1
     f. Bundle ID: select Explicit, then type com.shaz010.nrl1
     g. Leave the extra capabilities off. Click Continue, then Register.
     h. Return to App Store Connect and open New App again. Choose com.shaz010.nrl1.
9. SKU: nrl1
10. User Access: Full Access.
11. Click Create.

When that record exists, push any commit to the neon-rift-lab branch (or re-run the TestFlight workflow). It will archive the next build and upload it. No screenshots are required for this internal TestFlight build.
"""


def bundle_id_instructions(reason: str) -> str:
    return f"""Stop. The bundle id com.shaz010.nrl1 is not registered, and the API key could not register it.
Reason: {reason}

Shahbaz has to register the identifier, then create the app record. Do not reuse Neon Rift 2 (com.shaz010.neonrift2).

1. Open https://developer.apple.com/account/resources/identifiers/list
2. Click the + button.
3. Select App IDs, then Continue.
4. Select App, then Continue.
5. Description: nrl1
6. Bundle ID: select Explicit, then type com.shaz010.nrl1
7. Leave the extra capabilities off. Click Continue, then Register.

Then create the app record:

1. Open https://appstoreconnect.apple.com/apps
2. If agreements are pending, open https://appstoreconnect.apple.com/agreements and accept the Paid Applications agreement first.
3. Click the + button, then New App.
4. Platforms: iOS. Name: nrl1. Primary language: English (U.S.).
5. Bundle ID: com.shaz010.nrl1. SKU: nrl1. User Access: Full Access.
6. Click Create.

Push any commit to neon-rift-lab after that and the workflow will upload the build.
"""


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
        raise ValueError(
            "ASC_KEY_P8 is not a PEM private key. Paste the .p8 file contents, "
            "including the BEGIN and END lines."
        )
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    if not text.endswith("\n"):
        text += "\n"
    return text


def next_build_number(versions) -> int:
    best = 0
    for version in versions:
        try:
            number = int(str(version).strip())
        except (TypeError, ValueError):
            continue
        if number > best:
            best = number
    return best + 1


def require_env(name: str) -> str:
    value = os.environ.get(name, "")
    if not value.strip():
        sys.exit(f"Secret {name} is empty.")
    return value


def emit(name: str, value: str) -> None:
    print(f"{name}={value}")
    for key in ("GITHUB_ENV", "GITHUB_OUTPUT"):
        path = os.environ.get(key)
        if not path:
            continue
        with open(path, "a", encoding="utf-8") as handle:
            handle.write(f"{name}={value}\n")


def key_path() -> str:
    configured = os.environ.get("ASC_KEY_PATH", "")
    if configured and os.path.isfile(configured):
        return configured
    key_id = require_env("ASC_KEY_ID").strip()
    names = [
        os.path.join(os.environ.get("RUNNER_TEMP", "/tmp"), "private_keys", f"AuthKey_{key_id}.p8"),
        os.path.expanduser(f"~/.appstoreconnect/private_keys/AuthKey_{key_id}.p8"),
        os.path.expanduser(f"~/private_keys/AuthKey_{key_id}.p8"),
        os.path.expanduser(f"~/.private_keys/AuthKey_{key_id}.p8"),
    ]
    for path in names:
        if os.path.isfile(path):
            return path
    sys.exit("API key file was not installed. Run install-key first.")


def canonical_p8(text: str) -> str:
    """Rewrite the key as a 64-column PKCS#8 PEM.

    PyJWT accepts SEC1 keys and loosely wrapped PEM. xcodebuild's CryptoKit
    reader rejects those with invalidPEMDocument.
    """
    from cryptography.hazmat.primitives.serialization import (
        Encoding,
        NoEncryption,
        PrivateFormat,
        load_pem_private_key,
    )

    key = load_pem_private_key(text.encode("utf-8"), password=None)
    pem = key.private_bytes(Encoding.PEM, PrivateFormat.PKCS8, NoEncryption()).decode("ascii")
    if not pem.endswith("\n"):
        pem += "\n"
    return pem


def install_key() -> None:
    text = normalize_p8(require_env("ASC_KEY_P8"))
    try:
        text = canonical_p8(text)
    except ImportError:
        sys.exit("cryptography is not installed, so the API key cannot be rewritten for Xcode.")
    except Exception:
        sys.exit("ASC_KEY_P8 could not be read as a private key. Check the secret contents.")
    key_id = require_env("ASC_KEY_ID").strip()
    if not re.fullmatch(r"[A-Za-z0-9]{6,32}", key_id):
        sys.exit("ASC_KEY_ID does not look like an App Store Connect key id.")
    filename = f"AuthKey_{key_id}.p8"
    directories = [
        os.path.join(os.environ.get("RUNNER_TEMP", "/tmp"), "private_keys"),
        os.path.expanduser("~/.appstoreconnect/private_keys"),
        os.path.expanduser("~/private_keys"),
        os.path.expanduser("~/.private_keys"),
    ]
    primary = None
    for directory in directories:
        os.makedirs(directory, mode=0o700, exist_ok=True)
        path = os.path.join(directory, filename)
        with open(path, "w", encoding="utf-8") as handle:
            handle.write(text)
        os.chmod(path, 0o600)
        if primary is None:
            primary = path
    emit("ASC_KEY_PATH", primary or "")
    print("Installed App Store Connect API key.")


def make_token() -> str:
    import jwt

    now = int(time.time())
    with open(key_path(), encoding="utf-8") as handle:
        private_key = handle.read()
    token = jwt.encode(
        {
            "iss": require_env("ASC_ISSUER_ID").strip(),
            "iat": now,
            "exp": now + 15 * 60,
            "aud": "appstoreconnect-v1",
        },
        private_key,
        algorithm="ES256",
        headers={"kid": require_env("ASC_KEY_ID").strip(), "typ": "JWT"},
    )
    if isinstance(token, bytes):
        token = token.decode("ascii")
    return token


def api(method: str, path: str, body: dict | None = None, token: str | None = None) -> dict:
    token = token or make_token()
    url = path if path.startswith("http") else API + path
    data = None if body is None else json.dumps(body).encode("utf-8")
    last = None
    for attempt in range(4):
        request = urllib.request.Request(url, data=data, method=method)
        request.add_header("Authorization", "Bearer " + token)
        request.add_header("Accept", "application/json")
        if data is not None:
            request.add_header("Content-Type", "application/json")
        try:
            with urllib.request.urlopen(request, timeout=60) as response:
                raw = response.read()
                if not raw:
                    return {}
                return json.loads(raw.decode("utf-8"))
        except urllib.error.HTTPError as exc:
            raw = exc.read().decode("utf-8", "replace")
            try:
                payload = json.loads(raw)
            except json.JSONDecodeError:
                payload = {"raw": raw[:500]}
            last = ASCError(exc.code, payload)
            if exc.code in (429, 500, 502, 503) and attempt < 3:
                time.sleep(2 ** attempt)
                continue
            raise last
    if last:
        raise last
    return {}


def stop(message: str) -> None:
    print("::error title=Shahbaz must create the App Store Connect record::See the log for the exact clicks.")
    print(message)
    sys.exit(2)


def find_bundle(token: str) -> dict | None:
    data = api("GET", f"/v1/bundleIds?filter[identifier]={BUNDLE_ID}&limit=5", token=token)
    rows = data.get("data") or []
    return rows[0] if rows else None


def ensure_bundle(token: str) -> tuple[dict, bool]:
    existing = find_bundle(token)
    if existing:
        print(f"Bundle ID already registered: {BUNDLE_ID}")
        return existing, False
    attributes = {
        "identifier": BUNDLE_ID,
        "name": APP_NAME,
        "platform": "IOS",
    }
    team = os.environ.get("APPLE_TEAM_ID", "").strip()
    bodies = []
    if team:
        with_team = dict(attributes)
        with_team["seedId"] = team
        bodies.append(with_team)
    bodies.append(attributes)
    last = None
    for attrs in bodies:
        body = {"data": {"type": "bundleIds", "attributes": attrs}}
        try:
            created = api("POST", "/v1/bundleIds", body, token=token)
            print(f"Registered bundle ID {BUNDLE_ID}")
            return created["data"], True
        except ASCError as exc:
            last = exc
            if exc.status == 409:
                again = find_bundle(token)
                if again:
                    print(f"Bundle ID already registered: {BUNDLE_ID}")
                    return again, False
            if exc.status == 403:
                stop(bundle_id_instructions(error_text(exc.payload)))
            # A bad seedId is a 400. Try the next body.
            if exc.status not in (400, 409, 422):
                raise
    if last and last.status == 403:
        stop(bundle_id_instructions(error_text(last.payload)))
    if last:
        raise last
    sys.exit("Could not register the bundle id.")


def find_app(token: str) -> dict | None:
    data = api("GET", f"/v1/apps?filter[bundleId]={BUNDLE_ID}&limit=5", token=token)
    rows = data.get("data") or []
    return rows[0] if rows else None


def ensure_app(token: str, bundle: dict) -> dict:
    existing = find_app(token)
    if existing:
        name = (existing.get("attributes") or {}).get("name", "")
        print(f"App record exists: {name} ({BUNDLE_ID})")
        return existing
    bundle_resource = bundle.get("id", "")
    bodies = [
        {
            "data": {
                "type": "apps",
                "attributes": {
                    "bundleId": BUNDLE_ID,
                    "name": APP_NAME,
                    "primaryLocale": LOCALE,
                    "sku": SKU,
                },
            }
        },
        {
            "data": {
                "type": "apps",
                "attributes": {
                    "name": APP_NAME,
                    "primaryLocale": LOCALE,
                    "sku": SKU,
                },
                "relationships": {
                    "bundleId": {"data": {"type": "bundleIds", "id": bundle_resource}}
                },
            }
        },
    ]
    last = None
    for body in bodies:
        try:
            created = api("POST", "/v1/apps", body, token=token)
            print(f"Created App Store Connect app {APP_NAME}")
            return created["data"]
        except ASCError as exc:
            last = exc
            if exc.status == 409:
                again = find_app(token)
                if again:
                    print("App record already exists.")
                    return again
            if create_is_forbidden(exc):
                stop(app_record_instructions(error_text(exc.payload)))
            if exc.status not in (400, 404, 409, 422):
                raise
    again = find_app(token)
    if again:
        return again
    if last and create_is_forbidden(last):
        stop(app_record_instructions(error_text(last.payload)))
    if last:
        # Creating the record is not something we can finish. Hand Shahbaz the clicks
        # rather than archiving a build that has nowhere to go.
        stop(app_record_instructions(error_text(last.payload)))
    stop(app_record_instructions("the app lookup returned no record"))


def build_versions(token: str, app_id: str) -> list:
    versions = []
    url = f"/v1/builds?filter[app]={app_id}&fields[builds]=version&limit=200"
    for _ in range(30):
        data = api("GET", url, token=token)
        for item in data.get("data") or []:
            versions.append((item.get("attributes") or {}).get("version"))
        url = (data.get("links") or {}).get("next")
        if not url:
            break
    return versions


def prepare() -> None:
    team = require_env("APPLE_TEAM_ID").strip()
    if not re.fullmatch(r"[A-Z0-9]{10}", team):
        sys.exit("APPLE_TEAM_ID must be the 10-character Apple Team ID.")
    token = make_token()
    bundle, created = ensure_bundle(token)
    if created:
        # The developer portal needs a moment before automatic signing can see it.
        time.sleep(20)
    app = ensure_app(token, bundle)
    app_id = app["id"]
    number = next_build_number(build_versions(token, app_id))
    emit("BUILD_NUMBER", str(number))
    emit("ASC_APP_ID", str(app_id))
    emit("MARKETING_VERSION", "1.0")
    print(f"Next TestFlight build number is {number} for {APP_NAME} {BUNDLE_ID}.")


def find_build(token: str, app_id: str, version: str) -> dict | None:
    path = f"/v1/builds?filter[app]={app_id}&filter[version]={version}&limit=5"
    data = api("GET", path, token=token)
    rows = data.get("data") or []
    return rows[0] if rows else None


PROFILE_NAME = "nrl1 CI"


def export_legacy_p12(key_path: str, cert_path: str, p12_path: str, password_path: str) -> None:
    """Write a PKCS#12 file macOS `security import` will accept."""
    import subprocess

    base = [
        "openssl",
        "pkcs12",
        "-export",
        "-inkey",
        key_path,
        "-in",
        cert_path,
        "-out",
        p12_path,
        "-passout",
        f"file:{password_path}",
    ]
    attempts = [
        base + ["-legacy", "-keypbe", "PBE-SHA1-3DES", "-certpbe", "PBE-SHA1-3DES", "-macalg", "sha1"],
        base + ["-keypbe", "PBE-SHA1-3DES", "-certpbe", "PBE-SHA1-3DES", "-macalg", "sha1"],
        base,
    ]
    last = ""
    for command in attempts:
        result = subprocess.run(command, capture_output=True, text=True)
        if result.returncode == 0 and os.path.isfile(p12_path) and os.path.getsize(p12_path) > 0:
            return
        last = (result.stderr or result.stdout or "").strip().splitlines()[-1:] or [""]
        last = last[0][:200]
    sys.exit(f"openssl could not write a keychain-compatible p12 ({last})")


def embedded_plist(blob: bytes) -> dict:
    import plistlib

    start = blob.find(b"<?xml")
    end = blob.find(b"</plist>")
    if start < 0 or end < 0:
        raise ValueError("provisioning profile does not contain a plist")
    return plistlib.loads(blob[start : end + len(b"</plist>")])


def xml_escape(value: str) -> str:
    return (
        value.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
    )


def write_export_plist(path: str, team: str, identity: str, profile_name: str) -> None:
    # Manual signing. Automatic export uses cloud signing, and this API key
    # is not allowed to create the cloud-managed distribution certificate.
    text = f"""<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>method</key>
  <string>app-store-connect</string>
  <key>destination</key>
  <string>export</string>
  <key>signingStyle</key>
  <string>manual</string>
  <key>signingCertificate</key>
  <string>{xml_escape(identity)}</string>
  <key>teamID</key>
  <string>{xml_escape(team)}</string>
  <key>provisioningProfiles</key>
  <dict>
    <key>{xml_escape(BUNDLE_ID)}</key>
    <string>{xml_escape(profile_name)}</string>
  </dict>
  <key>uploadSymbols</key>
  <true/>
  <key>stripSwiftSymbols</key>
  <true/>
  <key>manageAppVersionAndBuildNumber</key>
  <false/>
</dict>
</plist>
"""
    with open(path, "w", encoding="utf-8") as handle:
        handle.write(text)


def signing_permission_instructions(reason: str) -> str:
    return f"""Stop. The API key cannot create the distribution signing assets nrl1 needs.
Reason: {reason}

Do not revoke Neon Rift 2's distribution certificate. This workflow only replaces the profile named nrl1 CI and the certificate that profile itself uses.

Shahbaz, do this:

1. Open https://appstoreconnect.apple.com/access/integrations/api
2. Confirm the existing API key has Admin access. If it does not, generate an API key named nrl1 CI with access Admin. Download the .p8. Apple shows that file only once.
3. Open https://github.com/shaz010/neon-rift/settings/secrets/actions
4. If you created a new key, replace ASC_KEY_ID with the new key id and ASC_KEY_P8 with the full .p8 file contents, including the BEGIN and END lines.
5. Leave ASC_ISSUER_ID and APPLE_TEAM_ID unchanged.
6. Tell me to re-run the upload.

If the error was that the team already has the maximum number of distribution certificates, open https://developer.apple.com/account/resources/certificates/list and revoke an Apple Distribution certificate that Neon Rift 2 is not using, then tell me to re-run.
"""


def collection(token: str, path: str) -> list:
    rows = []
    url = path
    for _ in range(10):
        data = api("GET", url, token=token)
        rows.extend(data.get("data") or [])
        url = (data.get("links") or {}).get("next")
        if not url:
            break
    return rows


def delete_named_profiles(token: str, name: str) -> None:
    """Drop the CI profile and the distribution certificate it was issued for."""
    rows = collection(token, "/v1/profiles?filter[profileType]=IOS_APP_STORE&limit=200")
    for row in rows:
        attrs = row.get("attributes") or {}
        if attrs.get("name") != name:
            continue
        profile_id = row["id"]
        try:
            linked = api("GET", f"/v1/profiles/{profile_id}/certificates", token=token)
        except ASCError as exc:
            linked = {}
            print(f"Could not list certificates for profile {profile_id}: {exc}")
        print(f"Removing previous profile {name}")
        try:
            api("DELETE", f"/v1/profiles/{profile_id}", token=token)
        except ASCError as exc:
            print(f"Could not remove profile {profile_id}: {exc}")
        for cert in linked.get("data") or []:
            label = (cert.get("attributes") or {}).get("displayName") or cert.get("id")
            print(f"Revoking distribution certificate used by {name}: {label}")
            try:
                api("DELETE", f"/v1/certificates/{cert['id']}", token=token)
            except ASCError as exc:
                print(f"Could not revoke {cert.get('id')}: {exc}")


def provision() -> None:
    """Create an Apple Distribution cert and App Store profile with the API key.

    Cloud signing (-allowProvisioningUpdates at export) is denied for this key.
    The private key exists only on the runner.
    """
    import secrets

    from cryptography import x509
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric import rsa
    from cryptography.x509.oid import NameOID

    team = require_env("APPLE_TEAM_ID").strip()
    token = make_token()
    bundle = find_bundle(token)
    if not bundle:
        stop(bundle_id_instructions("the bundle id disappeared before signing"))
    private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    csr = (
        x509.CertificateSigningRequestBuilder()
        .subject_name(x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "nrl1 CI")]))
        .sign(private_key, hashes.SHA256())
    )
    csr_pem = csr.public_bytes(serialization.Encoding.PEM).decode("ascii")

    def at_cert_limit(err: ASCError) -> bool:
        blob = error_text(err.payload).lower()
        return any(word in blob for word in ("maximum", "limit", "already have", "exceed"))

    def request_cert():
        found = None
        failed = None
        for certificate_type in ("DISTRIBUTION", "IOS_DISTRIBUTION"):
            body = {
                "data": {
                    "type": "certificates",
                    "attributes": {"certificateType": certificate_type, "csrContent": csr_pem},
                }
            }
            try:
                found = api("POST", "/v1/certificates", body, token=token)
                print(f"Created {certificate_type} certificate.")
                return found, None
            except ASCError as exc:
                failed = exc
                if create_is_forbidden(exc) and not at_cert_limit(exc):
                    stop(signing_permission_instructions(error_text(exc.payload)))
                if exc.status not in (400, 403, 409, 422):
                    raise
        return None, failed

    created, last = request_cert()
    if created is None and last is not None and at_cert_limit(last):
        print("Distribution certificate limit reached. Replacing only the nrl1 CI certificate.")
        delete_named_profiles(token, PROFILE_NAME)
        created, last = request_cert()
    if created is None:
        stop(signing_permission_instructions(error_text(last.payload) if last else "no certificate was created"))
    # Drop a previous nrl1 profile so the name is free. This does not touch other apps.
    delete_named_profiles(token, PROFILE_NAME)

    cert_row = created["data"]
    encoded = (cert_row.get("attributes") or {}).get("certificateContent") or ""
    der = base64.b64decode(encoded)
    certificate = x509.load_der_x509_certificate(der)
    identity = certificate.subject.get_attributes_for_oid(NameOID.COMMON_NAME)[0].value
    print(f"Signing identity: {identity}")

    profile_body = {
        "data": {
            "type": "profiles",
            "attributes": {"name": PROFILE_NAME, "profileType": "IOS_APP_STORE"},
            "relationships": {
                "bundleId": {"data": {"type": "bundleIds", "id": bundle["id"]}},
                "certificates": {"data": [{"type": "certificates", "id": cert_row["id"]}]},
            },
        }
    }
    try:
        profile = api("POST", "/v1/profiles", profile_body, token=token)
    except ASCError as exc:
        if create_is_forbidden(exc):
            stop(signing_permission_instructions(error_text(exc.payload)))
        raise
    print(f"Created App Store profile {PROFILE_NAME}.")
    profile_blob = base64.b64decode((profile["data"].get("attributes") or {}).get("profileContent") or "")
    info = embedded_plist(profile_blob)
    profile_uuid = info.get("UUID") or profile["data"]["id"]

    out_dir = os.path.join(os.environ.get("RUNNER_TEMP", "/tmp"), "signing")
    os.makedirs(out_dir, mode=0o700, exist_ok=True)
    password = secrets.token_urlsafe(18)
    p12_path = os.path.join(out_dir, "distribution.p12")
    profile_path = os.path.join(out_dir, f"{profile_uuid}.mobileprovision")
    plist_path = os.path.join(out_dir, "ExportOptions.plist")
    password_path = os.path.join(out_dir, "password.txt")
    key_pem_path = os.path.join(out_dir, "key.pem")
    cert_pem_path = os.path.join(out_dir, "cert.pem")
    # The password stays in a 0600 file. Writing it to GITHUB_ENV prints it in the job log.
    with open(password_path, "w", encoding="utf-8") as handle:
        handle.write(password)
    os.chmod(password_path, 0o600)
    with open(key_pem_path, "wb") as handle:
        handle.write(
            private_key.private_bytes(
                serialization.Encoding.PEM,
                serialization.PrivateFormat.TraditionalOpenSSL,
                serialization.NoEncryption(),
            )
        )
    os.chmod(key_pem_path, 0o600)
    with open(cert_pem_path, "wb") as handle:
        handle.write(certificate.public_bytes(serialization.Encoding.PEM))
    # cryptography's default PKCS#12 uses a MAC that macOS `security import` rejects.
    export_legacy_p12(key_pem_path, cert_pem_path, p12_path, password_path)
    os.remove(key_pem_path)
    os.remove(cert_pem_path)
    os.chmod(p12_path, 0o600)
    with open(profile_path, "wb") as handle:
        handle.write(profile_blob)
    os.chmod(profile_path, 0o600)
    write_export_plist(plist_path, team, str(identity), PROFILE_NAME)
    emit("SIGNING_P12_PATH", p12_path)
    emit("SIGNING_PASSWORD_PATH", password_path)
    emit("SIGNING_PROFILE_PATH", profile_path)
    emit("SIGNING_PROFILE_UUID", str(profile_uuid))
    emit("SIGNING_PROFILE_NAME", PROFILE_NAME)
    emit("SIGNING_IDENTITY", str(identity))
    emit("EXPORT_OPTIONS_PLIST", plist_path)
    print("Distribution certificate and App Store profile are ready.")


def note() -> None:
    """Best-effort TestFlight notes. Upload has already succeeded."""
    app_id = require_env("ASC_APP_ID").strip()
    version = require_env("BUILD_NUMBER").strip()
    token = make_token()
    build = None
    for _ in range(48):
        build = find_build(token, app_id, version)
        if build:
            break
        time.sleep(15)
    if not build:
        print(
            f"Build {version} is not visible in the API yet. "
            "TestFlight will show it after Apple finishes processing. "
            "What to Test was not attached, and the build was not added to an internal group."
        )
        print(WHATS_NEW)
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
    except ASCError as exc:
        print(f"Export compliance was left for App Store Connect to read from the binary ({exc}).")
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
        print(f"Attached What to Test on build {version}.")
    except ASCError as exc:
        print(f"What to Test was not attached ({exc}).")
        print(WHATS_NEW)
    add_internal_group(token, app_id, build_id)


def add_internal_group(token: str, app_id: str, build_id: str) -> None:
    """Put the build on an internal TestFlight group. Upload has already succeeded."""
    try:
        groups = collection(token, f"/v1/apps/{app_id}/betaGroups?limit=50")
    except ASCError as exc:
        print(f"Could not list TestFlight groups ({exc}).")
        print("Add the build by hand: App Store Connect, nrl1, TestFlight, Internal Testing.")
        return
    internal = None
    for row in groups:
        attrs = row.get("attributes") or {}
        if not attrs.get("isInternalGroup"):
            continue
        internal = row
        if attrs.get("name") == "nrl1 Internal":
            break
    if internal is None:
        try:
            created = api(
                "POST",
                "/v1/betaGroups",
                {
                    "data": {
                        "type": "betaGroups",
                        "attributes": {"name": "nrl1 Internal", "isInternalGroup": True},
                        "relationships": {"app": {"data": {"type": "apps", "id": app_id}}},
                    }
                },
                token=token,
            )
            internal = created.get("data")
            print("Created internal group nrl1 Internal.")
        except ASCError as exc:
            print(f"Could not create an internal group ({exc}).")
            print("Add the build by hand: App Store Connect, nrl1, TestFlight, Internal Testing.")
            return
    if not internal:
        print("No internal group was available. Add the build by hand under TestFlight, Internal Testing.")
        return
    group_id = internal["id"]
    group_name = (internal.get("attributes") or {}).get("name") or group_id
    try:
        api(
            "POST",
            f"/v1/betaGroups/{group_id}/relationships/builds",
            {"data": [{"type": "builds", "id": build_id}]},
            token=token,
        )
        print(f"Added build {build_id} to internal group {group_name}.")
    except ASCError as exc:
        if exc.status == 409:
            print(f"Build is already in internal group {group_name}.")
        else:
            print(f"Could not add the build to internal group {group_name} ({exc}).")
            print("Add it by hand: App Store Connect, nrl1, TestFlight, Internal Testing.")
            return
    try:
        users = collection(token, "/v1/users?limit=50")
    except ASCError as exc:
        print(f"Could not list App Store Connect users ({exc}). Add a tester to {group_name} by hand if the group is empty.")
        return
    tester_ids = [row["id"] for row in users if row.get("id")]
    if not tester_ids:
        print(f"No App Store Connect users were listed. Add a tester to {group_name} by hand.")
        return
    try:
        api(
            "POST",
            f"/v1/betaGroups/{group_id}/relationships/betaTesters",
            {"data": [{"type": "betaTesters", "id": tester_id} for tester_id in tester_ids]},
            token=token,
        )
        print(f"Internal group {group_name} includes {len(tester_ids)} App Store Connect user(s).")
    except ASCError as exc:
        if exc.status == 409:
            print(f"Internal testers are already on {group_name}.")
        else:
            print(f"Could not add testers to {group_name} ({exc}). Add yourself under TestFlight, Internal Testing, if you are not already in that group.")


def self_test() -> None:
    source = open(__file__, encoding="utf-8").read()
    needle = "def revoke_ci_" + "distribution_certs("
    if needle in source:
        raise AssertionError("nrl1 must not revoke other apps' distribution certificates")
    assert next_build_number([]) == 1
    assert next_build_number(["1", "2", "10"]) == 11
    assert next_build_number(["3", "04", "nope", None]) == 5
    pem = "-----BEGIN PRIVATE KEY-----\nQUJD\n-----END PRIVATE KEY-----\n"
    assert normalize_p8(pem) == pem
    assert normalize_p8(pem.replace("\n", "\\n")) == pem
    encoded = base64.b64encode(pem.encode("utf-8")).decode("ascii")
    assert normalize_p8(encoded) == pem
    try:
        normalize_p8("not a key")
    except ValueError:
        pass
    else:
        raise AssertionError("junk key was accepted")
    text = app_record_instructions("example")
    for needle in (
        "https://appstoreconnect.apple.com/apps",
        "New App",
        "nrl1",
        "com.shaz010.nrl1",
        "com.shaz010.neonrift2",
        "English (U.S.)",
        "Full Access",
    ):
        if needle not in text:
            raise AssertionError(f"instructions missing {needle}")
    bundle = bundle_id_instructions("example")
    if "https://developer.apple.com/account/resources/identifiers/list" not in bundle:
        raise AssertionError("bundle instructions missing the identifier page")
    try:
        from cryptography.hazmat.primitives.asymmetric import ec
        from cryptography.hazmat.primitives.serialization import Encoding, NoEncryption, PrivateFormat
    except ImportError:
        print("asc.py self-test passed")
        return
    raw = ec.generate_private_key(ec.SECP256R1()).private_bytes(
        Encoding.PEM, PrivateFormat.TraditionalOpenSSL, NoEncryption()
    ).decode("ascii")
    # One long line, the shape CryptoKit rejects and PyJWT still loads.
    loose = raw.replace("\n", "")
    loose = loose.replace("-----BEGIN EC PRIVATE KEY-----", "-----BEGIN EC PRIVATE KEY-----\n")
    loose = loose.replace("-----END EC PRIVATE KEY-----", "\n-----END EC PRIVATE KEY-----\n")
    cleaned = canonical_p8(loose)
    if not cleaned.startswith("-----BEGIN PRIVATE KEY-----\n"):
        raise AssertionError("canonical key is not PKCS#8")
    body = cleaned.split("\n")[1:-2]
    if any(len(line) > 64 for line in body):
        raise AssertionError("canonical key lines are longer than 64 characters")
    wrapped = b"junk<?xml version=\"1.0\" encoding=\"UTF-8\"?><!DOCTYPE plist PUBLIC \"-//Apple//DTD PLIST 1.0//EN\" \"http://www.apple.com/DTDs/PropertyList-1.0.dtd\"><plist version=\"1.0\"><dict><key>UUID</key><string>ABC-123</string><key>Name</key><string>nrl1 CI</string></dict></plist>tail"
    info = embedded_plist(wrapped)
    if info.get("UUID") != "ABC-123" or info.get("Name") != "nrl1 CI":
        raise AssertionError("profile plist was not extracted")
    import tempfile
    with tempfile.TemporaryDirectory() as directory:
        path = os.path.join(directory, "ExportOptions.plist")
        write_export_plist(path, "TEAMID1234", 'Apple Distribution: Example (TEAMID1234)', PROFILE_NAME)
        text = open(path, encoding="utf-8").read()
    if "manual" not in text or BUNDLE_ID not in text or PROFILE_NAME not in text:
        raise AssertionError("export plist is missing the manual profile")
    if "Admin" not in signing_permission_instructions("example"):
        raise AssertionError("signing instructions do not mention an Admin key")
    print("asc.py self-test passed")


def main(argv: list[str]) -> None:
    command = argv[1] if len(argv) > 1 else ""
    if command == "self-test":
        self_test()
    elif command == "install-key":
        install_key()
    elif command == "prepare":
        prepare()
    elif command == "provision":
        provision()
    elif command == "note":
        note()
    else:
        sys.exit("usage: asc.py self-test|install-key|prepare|provision|note")


if __name__ == "__main__":
    main(sys.argv)
