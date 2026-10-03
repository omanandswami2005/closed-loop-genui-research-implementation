#!/usr/bin/env bash
# One-time, idempotent GCP setup: APIs, Artifact Registry, service accounts,
# and keyless GitHub Actions deploys via Workload Identity Federation.
# Usage: PROJECT_ID=my-project [REGION=us-central1] ./infra/gcp/bootstrap.sh
set -euo pipefail

PROJECT_ID="${PROJECT_ID:?set PROJECT_ID}"
REGION="${REGION:-us-central1}"
REPO="${GITHUB_REPO:-omanandswami2005/closed-loop-genui-research-implementation}"
AR_REPO="genui"
POOL="github"
PROVIDER="github-oidc"
RUNTIME_SA="genui-backend@${PROJECT_ID}.iam.gserviceaccount.com"
DEPLOY_SA="gh-deployer@${PROJECT_ID}.iam.gserviceaccount.com"

gc() { gcloud --project "$PROJECT_ID" --quiet "$@"; }

gc services enable run.googleapis.com artifactregistry.googleapis.com \
  aiplatform.googleapis.com iam.googleapis.com iamcredentials.googleapis.com \
  sts.googleapis.com cloudbuild.googleapis.com

PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"

gc artifacts repositories describe "$AR_REPO" --location "$REGION" >/dev/null 2>&1 ||
  gc artifacts repositories create "$AR_REPO" --location "$REGION" --repository-format docker

gc iam service-accounts describe "$RUNTIME_SA" >/dev/null 2>&1 ||
  gc iam service-accounts create genui-backend --display-name "GenUI backend runtime"
gc iam service-accounts describe "$DEPLOY_SA" >/dev/null 2>&1 ||
  gc iam service-accounts create gh-deployer --display-name "GitHub Actions deployer"

# Runtime: call Gemini on Vertex AI.
gc projects add-iam-policy-binding "$PROJECT_ID" \
  --member "serviceAccount:${RUNTIME_SA}" --role roles/aiplatform.user --condition None >/dev/null

# Deployer: push images, deploy Cloud Run, act as the runtime SA.
for role in roles/run.admin roles/artifactregistry.writer; do
  gc projects add-iam-policy-binding "$PROJECT_ID" \
    --member "serviceAccount:${DEPLOY_SA}" --role "$role" --condition None >/dev/null
done
gc iam service-accounts add-iam-policy-binding "$RUNTIME_SA" \
  --member "serviceAccount:${DEPLOY_SA}" --role roles/iam.serviceAccountUser >/dev/null

# Workload Identity Federation for this repository only.
gc iam workload-identity-pools describe "$POOL" --location global >/dev/null 2>&1 ||
  gc iam workload-identity-pools create "$POOL" --location global --display-name "GitHub"
gc iam workload-identity-pools providers describe "$PROVIDER" \
  --location global --workload-identity-pool "$POOL" >/dev/null 2>&1 ||
  gc iam workload-identity-pools providers create-oidc "$PROVIDER" \
    --location global --workload-identity-pool "$POOL" \
    --issuer-uri "https://token.actions.githubusercontent.com" \
    --attribute-mapping "google.subject=assertion.sub,attribute.repository=assertion.repository" \
    --attribute-condition "assertion.repository == '${REPO}'"

gc iam service-accounts add-iam-policy-binding "$DEPLOY_SA" \
  --role roles/iam.workloadIdentityUser \
  --member "principalSet://iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL}/attribute.repository/${REPO}" >/dev/null

cat <<OUT
GitHub repository variables:
  GCP_PROJECT_ID=${PROJECT_ID}
  GCP_REGION=${REGION}
  GCP_WIF_PROVIDER=projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL}/providers/${PROVIDER}
  GCP_DEPLOY_SA=${DEPLOY_SA}
  GCP_RUNTIME_SA=${RUNTIME_SA}
OUT
