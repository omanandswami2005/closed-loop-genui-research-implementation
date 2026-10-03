"""Budget kill switch: unlinks billing from the project once the budget is spent.

Triggered by the Cloud Billing budget's Pub/Sub notifications. Below the
budget it only logs (and checks it still has the permission to act). At or
above it, it removes the project's billing account, which stops every paid
service in the project. Re-link billing in the console to turn things back on.
"""

import base64
import json
import os

import functions_framework
import google.auth
import google.auth.transport.requests

PROJECT = os.environ.get("TARGET_PROJECT", "omni-505707")
DRY_RUN = os.environ.get("DRY_RUN", "") == "1"
_BILLING = f"https://cloudbilling.googleapis.com/v1/projects/{PROJECT}/billingInfo"
_TEST = f"https://cloudresourcemanager.googleapis.com/v1/projects/{PROJECT}:testIamPermissions"
_PERMISSION = "resourcemanager.projects.deleteBillingAssignment"


def _session():
    credentials, _ = google.auth.default(scopes=["https://www.googleapis.com/auth/cloud-platform"])
    return google.auth.transport.requests.AuthorizedSession(credentials)


@functions_framework.cloud_event
def stop_billing(event):
    data = json.loads(base64.b64decode(event.data["message"]["data"]))
    cost, budget = float(data["costAmount"]), float(data["budgetAmount"])
    session = _session()
    granted = session.post(_TEST, json={"permissions": [_PERMISSION]}).json().get("permissions", [])
    print(json.dumps({"cost": cost, "budget": budget, "currency": data.get("currencyCode"),
                      "can_disable_billing": _PERMISSION in granted, "dry_run": DRY_RUN}))
    if cost < budget:
        return
    info = session.get(_BILLING).json()
    if not info.get("billingEnabled"):
        print("billing already disabled")
        return
    if DRY_RUN:
        print("DRY_RUN: would disable billing now")
        return
    r = session.put(_BILLING, json={"billingAccountName": ""})
    r.raise_for_status()
    print(f"budget reached: billing disabled for {PROJECT}")
