#!/usr/bin/env bash
# =============================================================================
# Piece of Cake — Automated GCP + GitHub Setup Script
# =============================================================================
# This script creates all required GCP infrastructure and sets all GitHub
# Actions secrets automatically. Run it once before your first deployment.
#
# Prerequisites:
#   - gcloud CLI installed and logged in  (https://cloud.google.com/sdk/docs/install)
#   - gh CLI installed and authenticated  (https://cli.github.com)
#   - A GCP project already created
#   - This repo already pushed to GitHub
# =============================================================================

set -euo pipefail

# --- Colors ------------------------------------------------------------------
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
RESET='\033[0m'

log_step()  { echo -e "\n${BLUE}${BOLD}▶ $1${RESET}"; }
log_ok()    { echo -e "  ${GREEN}✓${RESET} $1"; }
log_warn()  { echo -e "  ${YELLOW}⚠${RESET}  $1"; }
log_info()  { echo -e "  ${CYAN}ℹ${RESET}  $1"; }
log_error() { echo -e "  ${RED}✗${RESET} $1"; }

# --- Banner ------------------------------------------------------------------
echo -e "${BOLD}"
echo "  ╔══════════════════════════════════════════════════════╗"
echo "  ║       🧁  Piece of Cake — GCP Setup Wizard           ║"
echo "  ╚══════════════════════════════════════════════════════╝"
echo -e "${RESET}"

# --- Check prerequisites -----------------------------------------------------
log_step "Checking prerequisites"

if ! command -v gcloud &>/dev/null; then
  log_error "gcloud CLI not found. Install it: https://cloud.google.com/sdk/docs/install"
  exit 1
fi
log_ok "gcloud CLI found"

if ! command -v gh &>/dev/null; then
  log_error "gh CLI not found. Install it: https://cli.github.com"
  exit 1
fi
log_ok "gh CLI found"

if ! gh auth status &>/dev/null; then
  log_error "gh CLI not authenticated. Run: gh auth login"
  exit 1
fi
log_ok "gh CLI authenticated"

if ! gcloud auth list --filter=status:ACTIVE --format="value(account)" | grep -q "@"; then
  log_error "gcloud not authenticated. Run: gcloud auth login"
  exit 1
fi
log_ok "gcloud authenticated as $(gcloud config get-value account 2>/dev/null)"

# --- Collect inputs ----------------------------------------------------------
echo ""
echo -e "${BOLD}Please provide the following information:${RESET}"
echo ""

# GCP Project ID
read -rp "  GCP Project ID (e.g. my-project-123456): " GCP_PROJECT_ID
if [ -z "$GCP_PROJECT_ID" ]; then
  log_error "Project ID cannot be empty."
  exit 1
fi

# GCP Region
read -rp "  GCP Region [southamerica-east1]: " GCP_REGION
GCP_REGION="${GCP_REGION:-southamerica-east1}"

# GitHub repo — detect or create
DETECTED_REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner 2>/dev/null || echo "")
if [ -n "$DETECTED_REPO" ]; then
  read -rp "  GitHub repo [$DETECTED_REPO]: " GITHUB_REPO
  GITHUB_REPO="${GITHUB_REPO:-$DETECTED_REPO}"
else
  echo ""
  echo -e "  ${YELLOW}No GitHub repo detected for this directory.${RESET}"
  read -rp "  Create a new GitHub repo now? [Y/n]: " CREATE_REPO
  if [[ ! "$CREATE_REPO" =~ ^[Nn]$ ]]; then
    read -rp "  Repo name [the-cake-tutorial]: " REPO_NAME
    REPO_NAME="${REPO_NAME:-the-cake-tutorial}"
    read -rp "  Make it private? [y/N]: " REPO_PRIVATE
    REPO_VISIBILITY="--public"
    if [[ "$REPO_PRIVATE" =~ ^[Yy]$ ]]; then
      REPO_VISIBILITY="--private"
    fi
    gh repo create "$REPO_NAME" $REPO_VISIBILITY --source=. --remote=origin --push
    GITHUB_REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner)
    log_ok "Created and pushed to GitHub repo: $GITHUB_REPO"
  else
    read -rp "  GitHub repo (e.g. username/the-cake-tutorial): " GITHUB_REPO
  fi
fi

# Service name
read -rp "  Cloud Run service name [piece-of-cake]: " SERVICE_NAME
SERVICE_NAME="${SERVICE_NAME:-piece-of-cake}"

# GCS bucket name
DEFAULT_BUCKET="${SERVICE_NAME}-images-${GCP_PROJECT_ID}"
read -rp "  GCS bucket name [$DEFAULT_BUCKET]: " GCS_BUCKET_NAME
GCS_BUCKET_NAME="${GCS_BUCKET_NAME:-$DEFAULT_BUCKET}"

# Artifact Registry repo name
read -rp "  Artifact Registry repo name [$SERVICE_NAME]: " ARTIFACT_REGISTRY_REPO
ARTIFACT_REGISTRY_REPO="${ARTIFACT_REGISTRY_REPO:-$SERVICE_NAME}"

# Firestore database
read -rp "  Firestore database ID [(default)]: " FIRESTORE_DATABASE
FIRESTORE_DATABASE="${FIRESTORE_DATABASE:-(default)}"

# Model names
read -rp "  Gemini text model [gemini-3.1-flash-lite]: " GEMINI_MODEL
GEMINI_MODEL="${GEMINI_MODEL:-gemini-3.1-flash-lite}"

read -rp "  Imagen model [gemini-3.1-flash-image-preview]: " IMAGEN_MODEL
IMAGEN_MODEL="${IMAGEN_MODEL:-gemini-3.1-flash-image-preview}"

# Gemini API key
read -rsp "  Gemini API Key (input hidden): " GEMINI_API_KEY
echo ""
if [ -z "$GEMINI_API_KEY" ]; then
  log_error "Gemini API Key cannot be empty."
  exit 1
fi

echo ""
echo -e "${BOLD}── Configuration Summary ──────────────────────────────────${RESET}"
echo "  Project ID         : $GCP_PROJECT_ID"
echo "  Region             : $GCP_REGION"
echo "  GitHub Repo        : $GITHUB_REPO"
echo "  Service Name       : $SERVICE_NAME"
echo "  GCS Bucket         : $GCS_BUCKET_NAME"
echo "  Artifact Registry  : $ARTIFACT_REGISTRY_REPO"
echo "  Firestore DB       : $FIRESTORE_DATABASE"
echo "  Gemini API Key     : ****${GEMINI_API_KEY: -4}"
echo -e "${BOLD}───────────────────────────────────────────────────────────${RESET}"
echo ""
read -rp "  Looks good? Proceed? [y/N]: " CONFIRM
if [[ ! "$CONFIRM" =~ ^[Yy]$ ]]; then
  echo "Aborted."
  exit 0
fi

# Set project
gcloud config set project "$GCP_PROJECT_ID" --quiet

# --- Enable required APIs ----------------------------------------------------
log_step "Enabling required GCP APIs (this may take a minute...)"

APIS=(
  "run.googleapis.com"
  "artifactregistry.googleapis.com"
  "cloudbuild.googleapis.com"
  "iam.googleapis.com"
  "iamcredentials.googleapis.com"
  "sts.googleapis.com"
  "secretmanager.googleapis.com"
  "storage.googleapis.com"
  "firestore.googleapis.com"
)

gcloud services enable "${APIS[@]}" --project="$GCP_PROJECT_ID" --quiet
log_ok "All APIs enabled"

# --- Get project number ------------------------------------------------------
PROJECT_NUMBER=$(gcloud projects describe "$GCP_PROJECT_ID" --format='value(projectNumber)')
log_info "Project number: $PROJECT_NUMBER"

# --- Create Service Account --------------------------------------------------
log_step "Creating service account"

SA_NAME="github-deployer"
SA_EMAIL="${SA_NAME}@${GCP_PROJECT_ID}.iam.gserviceaccount.com"

if gcloud iam service-accounts describe "$SA_EMAIL" --project="$GCP_PROJECT_ID" &>/dev/null; then
  log_warn "Service account already exists: $SA_EMAIL"
else
  gcloud iam service-accounts create "$SA_NAME" \
    --display-name="GitHub Actions Deployer" \
    --project="$GCP_PROJECT_ID" \
    --quiet
  log_ok "Created service account: $SA_EMAIL"
fi

# --- Grant IAM roles ---------------------------------------------------------
log_step "Granting IAM roles to service account"

ROLES=(
  "roles/run.admin"
  "roles/artifactregistry.writer"
  "roles/iam.serviceAccountUser"
  "roles/storage.objectAdmin"
  "roles/secretmanager.secretAccessor"
  "roles/datastore.user"
)

for ROLE in "${ROLES[@]}"; do
  gcloud projects add-iam-policy-binding "$GCP_PROJECT_ID" \
    --member="serviceAccount:$SA_EMAIL" \
    --role="$ROLE" \
    --quiet \
    --condition=None \
    2>/dev/null || true
  log_ok "$ROLE"
done

# --- Workload Identity Federation --------------------------------------------
log_step "Setting up Workload Identity Federation"

POOL_NAME="github-pool"
PROVIDER_NAME="github-provider"

# Create pool
if gcloud iam workload-identity-pools describe "$POOL_NAME" \
    --location="global" \
    --project="$GCP_PROJECT_ID" &>/dev/null; then
  log_warn "Workload identity pool already exists: $POOL_NAME"
else
  gcloud iam workload-identity-pools create "$POOL_NAME" \
    --project="$GCP_PROJECT_ID" \
    --location="global" \
    --display-name="GitHub Actions Pool" \
    --quiet
  log_ok "Created workload identity pool: $POOL_NAME"
fi

# Create provider
if gcloud iam workload-identity-pools providers describe "$PROVIDER_NAME" \
    --location="global" \
    --workload-identity-pool="$POOL_NAME" \
    --project="$GCP_PROJECT_ID" &>/dev/null; then
  log_warn "Workload identity provider already exists: $PROVIDER_NAME"
else
  gcloud iam workload-identity-pools providers create-oidc "$PROVIDER_NAME" \
    --project="$GCP_PROJECT_ID" \
    --location="global" \
    --workload-identity-pool="$POOL_NAME" \
    --display-name="GitHub Provider" \
    --issuer-uri="https://token.actions.githubusercontent.com" \
    --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository" \
    --attribute-condition="assertion.repository=='${GITHUB_REPO}'" \
    --quiet
  log_ok "Created workload identity provider: $PROVIDER_NAME"
fi

# Bind pool to service account
gcloud iam service-accounts add-iam-policy-binding "$SA_EMAIL" \
  --project="$GCP_PROJECT_ID" \
  --role="roles/iam.workloadIdentityUser" \
  --member="principalSet://iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL_NAME}/attribute.repository/${GITHUB_REPO}" \
  --quiet \
  2>/dev/null || true
log_ok "Bound pool to service account"

# Get provider full resource name
WIF_PROVIDER=$(gcloud iam workload-identity-pools providers describe "$PROVIDER_NAME" \
  --project="$GCP_PROJECT_ID" \
  --location="global" \
  --workload-identity-pool="$POOL_NAME" \
  --format="value(name)")
log_ok "Provider resource name retrieved"

# --- Artifact Registry -------------------------------------------------------
log_step "Creating Artifact Registry repository"

if gcloud artifacts repositories describe "$ARTIFACT_REGISTRY_REPO" \
    --location="$GCP_REGION" \
    --project="$GCP_PROJECT_ID" &>/dev/null; then
  log_warn "Artifact Registry repo already exists: $ARTIFACT_REGISTRY_REPO"
else
  gcloud artifacts repositories create "$ARTIFACT_REGISTRY_REPO" \
    --repository-format=docker \
    --location="$GCP_REGION" \
    --description="Piece of Cake Docker images" \
    --project="$GCP_PROJECT_ID" \
    --quiet
  log_ok "Created Artifact Registry repo: $ARTIFACT_REGISTRY_REPO"
fi

# --- GCS Bucket --------------------------------------------------------------
log_step "Creating GCS bucket for illustrations"

if gsutil ls "gs://$GCS_BUCKET_NAME" &>/dev/null; then
  log_warn "GCS bucket already exists: gs://$GCS_BUCKET_NAME"
else
  gsutil mb -p "$GCP_PROJECT_ID" -l "$GCP_REGION" "gs://$GCS_BUCKET_NAME"
  log_ok "Created bucket: gs://$GCS_BUCKET_NAME"
fi

# Make objects publicly readable (illustrations need to be served to users)
gsutil iam ch allUsers:objectViewer "gs://$GCS_BUCKET_NAME" 2>/dev/null || \
  log_warn "Could not set public access — you may need to disable 'Prevent public access' in the GCP console for this bucket."
log_ok "Bucket configured for public image serving"

# --- Firestore Database ------------------------------------------------------
log_step "Provisioning Firestore database"

if gcloud firestore databases describe --database="$FIRESTORE_DATABASE" \
    --project="$GCP_PROJECT_ID" &>/dev/null; then
  log_warn "Firestore database already exists: $FIRESTORE_DATABASE"
else
  gcloud firestore databases create \
    --database="$FIRESTORE_DATABASE" \
    --location="$GCP_REGION" \
    --type=firestore-native \
    --project="$GCP_PROJECT_ID" \
    --quiet
  log_ok "Created Firestore database: $FIRESTORE_DATABASE"
fi

# --- Secret Manager (Gemini API Key) ----------------------------------------
log_step "Storing Gemini API Key in Secret Manager"

if gcloud secrets describe "GEMINI_API_KEY" \
    --project="$GCP_PROJECT_ID" &>/dev/null; then
  echo -n "$GEMINI_API_KEY" | gcloud secrets versions add "GEMINI_API_KEY" \
    --data-file=- \
    --project="$GCP_PROJECT_ID" \
    --quiet
  log_warn "Secret already existed — added a new version"
else
  echo -n "$GEMINI_API_KEY" | gcloud secrets create "GEMINI_API_KEY" \
    --data-file=- \
    --project="$GCP_PROJECT_ID" \
    --quiet
  log_ok "Created secret: GEMINI_API_KEY"
fi

gcloud secrets add-iam-policy-binding "GEMINI_API_KEY" \
  --member="serviceAccount:$SA_EMAIL" \
  --role="roles/secretmanager.secretAccessor" \
  --project="$GCP_PROJECT_ID" \
  --quiet \
  2>/dev/null || true
log_ok "Granted secret access to service account"

# --- Set GitHub Secrets ------------------------------------------------------
log_step "Setting GitHub Actions secrets"

gh secret set "GCP_PROJECT_ID"                  --body "$GCP_PROJECT_ID"           --repo "$GITHUB_REPO"
log_ok "GCP_PROJECT_ID"

gh secret set "GCP_REGION"                      --body "$GCP_REGION"               --repo "$GITHUB_REPO"
log_ok "GCP_REGION"

gh secret set "GCP_SERVICE_ACCOUNT"             --body "$SA_EMAIL"                 --repo "$GITHUB_REPO"
log_ok "GCP_SERVICE_ACCOUNT"

gh secret set "GCP_WORKLOAD_IDENTITY_PROVIDER"  --body "$WIF_PROVIDER"             --repo "$GITHUB_REPO"
log_ok "GCP_WORKLOAD_IDENTITY_PROVIDER"

gh secret set "ARTIFACT_REGISTRY_REPO"          --body "$ARTIFACT_REGISTRY_REPO"   --repo "$GITHUB_REPO"
log_ok "ARTIFACT_REGISTRY_REPO"

gh secret set "SERVICE_NAME"                    --body "$SERVICE_NAME"             --repo "$GITHUB_REPO"
log_ok "SERVICE_NAME"

gh secret set "GCS_BUCKET_NAME"                 --body "$GCS_BUCKET_NAME"          --repo "$GITHUB_REPO"
log_ok "GCS_BUCKET_NAME"

gh secret set "FIRESTORE_DATABASE"              --body "$FIRESTORE_DATABASE"       --repo "$GITHUB_REPO"
log_ok "FIRESTORE_DATABASE"

gh secret set "GEMINI_MODEL"                    --body "$GEMINI_MODEL"             --repo "$GITHUB_REPO"
log_ok "GEMINI_MODEL"

gh secret set "IMAGEN_MODEL"                    --body "$IMAGEN_MODEL"             --repo "$GITHUB_REPO"
log_ok "IMAGEN_MODEL"

# --- Done! -------------------------------------------------------------------
echo ""
echo -e "${GREEN}${BOLD}"
echo "  ╔══════════════════════════════════════════════════════╗"
echo "  ║          ✅  Setup complete! You're ready.           ║"
echo "  ╚══════════════════════════════════════════════════════╝"
echo -e "${RESET}"
echo -e "  Next steps:"
echo -e "  1. Push to ${BOLD}main${RESET} branch to trigger your first deployment"
echo -e "  2. Monitor progress at: ${CYAN}https://github.com/$GITHUB_REPO/actions${RESET}"
echo -e "  3. Once deployed, your app will be live on Cloud Run 🚀"
echo ""
