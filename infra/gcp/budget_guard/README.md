# Budget kill switch

When the project's Cloud Billing budget is spent, this function removes the
billing account from project `omni-505707`, which stops every paid service in
it (Cloud Run, Vertex AI Gemini, Artifact Registry). Turn things back on by
re-linking the billing account under Billing > Account management.

Budget notifications reach the function a few hours after the spend happens,
so the stop is not instant and the final bill can go slightly over the budget.

## Setup (once)

1. In Cloud Shell, from a clone of this repo: `cd infra/gcp/budget_guard && ./setup.sh`
2. In the console, open Billing > Budgets & alerts > Create budget:
   - Scope: project `omni-505707`. Under credits, untick the credits options
     so the budget counts usage before credits are applied.
   - Amount: 100 USD (or the same amount in your billing currency).
   - Thresholds: 50%, 90% and 100% of actual spend. Emails go to billing
     admins and users, which includes you.
   - Under Manage notifications, tick "Connect a Pub/Sub topic to this
     budget" and pick `projects/omni-505707/topics/budget-alerts`.

## Test without stopping anything

Below the budget the function only logs. To check the wiring, publish a
fake notification under the budget:

```
gcloud pubsub topics publish budget-alerts --project omni-505707 \
  --message '{"costAmount": 1, "budgetAmount": 100, "currencyCode": "USD"}'
gcloud functions logs read budget-guard --project omni-505707 --region us-central1 --limit 5
```

The log line should show `"can_disable_billing": true`.
