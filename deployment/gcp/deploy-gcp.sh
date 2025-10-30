#!/bin/bash

# ========================================
# Google Cloud Run Deployment Script
# AION - AI System
# ========================================

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}AION - Google Cloud Run Deployment${NC}"
echo -e "${GREEN}========================================${NC}"

# Configuration
PROJECT_ID="${GCP_PROJECT_ID:-aion-ai-prod}"
REGION="${GCP_REGION:-us-central1}"
SERVICE_NAME="aion-ai"
IMAGE_NAME="gcr.io/${PROJECT_ID}/${SERVICE_NAME}"

# Check if gcloud is installed
if ! command -v gcloud &> /dev/null; then
    echo -e "${RED}Error: gcloud CLI not installed${NC}"
    echo "Install from: https://cloud.google.com/sdk/docs/install"
    exit 1
fi

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo -e "${RED}Error: Docker not installed${NC}"
    echo "Install from: https://docs.docker.com/get-docker/"
    exit 1
fi

echo -e "${YELLOW}Step 1: Setting GCP project...${NC}"
gcloud config set project ${PROJECT_ID}

echo -e "${YELLOW}Step 2: Enable required APIs...${NC}"
gcloud services enable \
  run.googleapis.com \
  containerregistry.googleapis.com \
  cloudbuild.googleapis.com \
  secretmanager.googleapis.com

echo -e "${YELLOW}Step 3: Building Docker image...${NC}"
docker build -t ${IMAGE_NAME}:latest -f Dockerfile .

echo -e "${YELLOW}Step 4: Pushing image to Google Container Registry...${NC}"
docker push ${IMAGE_NAME}:latest

echo -e "${YELLOW}Step 5: Creating/updating secrets in Secret Manager...${NC}"

# Function to create or update secret
create_or_update_secret() {
  local secret_name=$1
  local secret_value=$2
  
  if gcloud secrets describe ${secret_name} --project=${PROJECT_ID} &> /dev/null; then
    echo "Updating existing secret: ${secret_name}"
    echo -n "${secret_value}" | gcloud secrets versions add ${secret_name} --data-file=-
  else
    echo "Creating new secret: ${secret_name}"
    echo -n "${secret_value}" | gcloud secrets create ${secret_name} --data-file=-
  fi
}

# Create secrets (you should set these environment variables before running)
if [ -n "$DATABASE_URL" ]; then
  create_or_update_secret "database-url" "$DATABASE_URL"
else
  echo -e "${RED}Warning: DATABASE_URL not set${NC}"
fi

if [ -n "$OPENAI_API_KEY" ]; then
  create_or_update_secret "openai-api-key" "$OPENAI_API_KEY"
fi

if [ -n "$GROQ_API_KEY" ]; then
  create_or_update_secret "groq-api-key" "$GROQ_API_KEY"
fi

if [ -n "$GEMINI_API_KEY" ]; then
  create_or_update_secret "gemini-api-key" "$GEMINI_API_KEY"
fi

if [ -n "$HUGGINGFACE_API_KEY" ]; then
  create_or_update_secret "huggingface-api-key" "$HUGGINGFACE_API_KEY"
fi

if [ -n "$OPEN_ROUTER_API_KEY" ]; then
  create_or_update_secret "openrouter-api-key" "$OPEN_ROUTER_API_KEY"
fi

if [ -n "$SESSION_SECRET" ]; then
  create_or_update_secret "session-secret" "$SESSION_SECRET"
else
  # Generate random session secret
  SESSION_SECRET=$(openssl rand -hex 32)
  create_or_update_secret "session-secret" "$SESSION_SECRET"
fi

echo -e "${YELLOW}Step 6: Creating service account...${NC}"
SERVICE_ACCOUNT="aion-service-account@${PROJECT_ID}.iam.gserviceaccount.com"

if ! gcloud iam service-accounts describe ${SERVICE_ACCOUNT} &> /dev/null; then
  gcloud iam service-accounts create aion-service-account \
    --display-name="AION AI Service Account"
fi

# Grant access to secrets
gcloud projects add-iam-policy-binding ${PROJECT_ID} \
  --member="serviceAccount:${SERVICE_ACCOUNT}" \
  --role="roles/secretmanager.secretAccessor" \
  --quiet

echo -e "${YELLOW}Step 7: Deploying to Cloud Run...${NC}"

# Update cloud-run.yaml with project ID and endpoints
sed "s/PROJECT_ID/${PROJECT_ID}/g" deployment/gcp/cloud-run.yaml > /tmp/cloud-run-updated.yaml

# Replace AWS endpoint if provided
if [ -n "$AWS_ENDPOINT" ]; then
  sed -i "s|AWS_ENDPOINT_PLACEHOLDER|${AWS_ENDPOINT}|g" /tmp/cloud-run-updated.yaml
  echo "AWS endpoint configured: ${AWS_ENDPOINT}"
else
  echo -e "${YELLOW}Warning: AWS_ENDPOINT not set. Multi-cloud failover will be disabled.${NC}"
  echo "Set AWS_ENDPOINT environment variable and redeploy to enable multi-cloud."
fi

gcloud run services replace /tmp/cloud-run-updated.yaml \
  --region=${REGION} \
  --platform=managed

echo -e "${YELLOW}Step 8: Allow unauthenticated access...${NC}"
gcloud run services add-iam-policy-binding ${SERVICE_NAME} \
  --region=${REGION} \
  --member="allUsers" \
  --role="roles/run.invoker"

# Get service URL
SERVICE_URL=$(gcloud run services describe ${SERVICE_NAME} \
  --region=${REGION} \
  --format='value(status.url)')

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Deployment Successful!${NC}"
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Service URL: ${SERVICE_URL}${NC}"
echo -e "${GREEN}Health Check: ${SERVICE_URL}/health${NC}"
echo -e "${GREEN}Detailed Health: ${SERVICE_URL}/health/detailed${NC}"
echo ""
echo -e "${YELLOW}Test the deployment:${NC}"
echo "curl ${SERVICE_URL}/health"
echo ""
echo -e "${YELLOW}View logs:${NC}"
echo "gcloud run services logs read ${SERVICE_NAME} --region=${REGION} --limit=50"
echo ""
