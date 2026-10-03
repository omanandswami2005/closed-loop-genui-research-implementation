#!/usr/bin/env bash
# Grants the kill switch its permissions and deploys it. Run once in Cloud
# Shell from this folder: ./setup.sh
# The Pub/Sub topic "budget-alerts" and the service account "budget-guard"
# already exist. Then create the budget in the console (see README.md).
set -euo pipefail
P="${PROJECT_ID:-omni-505707}"
SA="budget-guard@${P}.iam.gserviceaccount.com"

# Remove the project's billing link, and receive the Pub/Sub trigger.
for role in roles/billing.projectManager roles/run.invoker roles/eventarc.eventReceiver; do
  gcloud projects add-iam-policy-binding "$P" --member "serviceAccount:${SA}" --role "$role" --condition None --quiet >/dev/null
done

gcloud functions deploy budget-guard --project "$P" --gen2 --region us-central1 \
  --runtime python312 --source . --entry-point stop_billing \
  --trigger-topic budget-alerts --service-account "$SA" --trigger-service-account "$SA" \
  --max-instances 1 --memory 256Mi --quiet
echo "Kill switch deployed. Now create the budget in the console and connect it to the budget-alerts topic."
