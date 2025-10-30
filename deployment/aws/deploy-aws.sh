#!/bin/bash

# ========================================
# AWS Fargate Deployment Script
# AION - AI System
# ========================================

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}AION - AWS Fargate Deployment${NC}"
echo -e "${GREEN}========================================${NC}"

# Configuration
AWS_ACCOUNT_ID="${AWS_ACCOUNT_ID:-$(aws sts get-caller-identity --query Account --output text)}"
AWS_REGION="${AWS_REGION:-us-east-1}"
CLUSTER_NAME="${ECS_CLUSTER:-aion-cluster}"
SERVICE_NAME="aion-ai"
TASK_FAMILY="aion-ai"
ECR_REPO="${SERVICE_NAME}"
IMAGE_TAG="latest"

echo "AWS Account ID: ${AWS_ACCOUNT_ID}"
echo "Region: ${AWS_REGION}"
echo "Cluster: ${CLUSTER_NAME}"

# Check if AWS CLI is installed
if ! command -v aws &> /dev/null; then
    echo -e "${RED}Error: AWS CLI not installed${NC}"
    echo "Install from: https://aws.amazon.com/cli/"
    exit 1
fi

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo -e "${RED}Error: Docker not installed${NC}"
    exit 1
fi

echo -e "${YELLOW}Step 1: Creating ECR repository...${NC}"
aws ecr describe-repositories --repository-names ${ECR_REPO} --region ${AWS_REGION} || \
  aws ecr create-repository \
    --repository-name ${ECR_REPO} \
    --region ${AWS_REGION} \
    --image-scanning-configuration scanOnPush=true

echo -e "${YELLOW}Step 2: Authenticating Docker to ECR...${NC}"
aws ecr get-login-password --region ${AWS_REGION} | \
  docker login --username AWS --password-stdin ${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com

echo -e "${YELLOW}Step 3: Building Docker image...${NC}"
docker build -t ${ECR_REPO}:${IMAGE_TAG} -f Dockerfile .

echo -e "${YELLOW}Step 4: Tagging image for ECR...${NC}"
docker tag ${ECR_REPO}:${IMAGE_TAG} \
  ${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/${ECR_REPO}:${IMAGE_TAG}

echo -e "${YELLOW}Step 5: Pushing image to ECR...${NC}"
docker push ${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/${ECR_REPO}:${IMAGE_TAG}

echo -e "${YELLOW}Step 6: Creating/updating secrets in AWS Secrets Manager...${NC}"

# Function to create or update secret
create_or_update_secret() {
  local secret_name=$1
  local secret_value=$2
  
  if aws secretsmanager describe-secret --secret-id ${secret_name} --region ${AWS_REGION} &> /dev/null; then
    echo "Updating existing secret: ${secret_name}"
    aws secretsmanager update-secret \
      --secret-id ${secret_name} \
      --secret-string "${secret_value}" \
      --region ${AWS_REGION}
  else
    echo "Creating new secret: ${secret_name}"
    aws secretsmanager create-secret \
      --name ${secret_name} \
      --secret-string "${secret_value}" \
      --region ${AWS_REGION}
  fi
}

# Create secrets
if [ -n "$DATABASE_URL" ]; then
  create_or_update_secret "aion/database-url" "$DATABASE_URL"
else
  echo -e "${RED}Warning: DATABASE_URL not set${NC}"
fi

if [ -n "$OPENAI_API_KEY" ]; then
  create_or_update_secret "aion/openai-api-key" "$OPENAI_API_KEY"
fi

if [ -n "$GROQ_API_KEY" ]; then
  create_or_update_secret "aion/groq-api-key" "$GROQ_API_KEY"
fi

if [ -n "$GEMINI_API_KEY" ]; then
  create_or_update_secret "aion/gemini-api-key" "$GEMINI_API_KEY"
fi

if [ -n "$HUGGINGFACE_API_KEY" ]; then
  create_or_update_secret "aion/huggingface-api-key" "$HUGGINGFACE_API_KEY"
fi

if [ -n "$OPEN_ROUTER_API_KEY" ]; then
  create_or_update_secret "aion/openrouter-api-key" "$OPEN_ROUTER_API_KEY"
fi

if [ -n "$SESSION_SECRET" ]; then
  create_or_update_secret "aion/session-secret" "$SESSION_SECRET"
else
  SESSION_SECRET=$(openssl rand -hex 32)
  create_or_update_secret "aion/session-secret" "$SESSION_SECRET"
fi

echo -e "${YELLOW}Step 7: Creating IAM roles...${NC}"

# Create ECS Task Execution Role (if not exists)
if ! aws iam get-role --role-name ecsTaskExecutionRole &> /dev/null; then
  aws iam create-role \
    --role-name ecsTaskExecutionRole \
    --assume-role-policy-document '{
      "Version": "2012-10-17",
      "Statement": [{
        "Effect": "Allow",
        "Principal": {"Service": "ecs-tasks.amazonaws.com"},
        "Action": "sts:AssumeRole"
      }]
    }'
  
  aws iam attach-role-policy \
    --role-name ecsTaskExecutionRole \
    --policy-arn arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy
fi

# Create AION Task Role (if not exists)
if ! aws iam get-role --role-name aion-task-role &> /dev/null; then
  aws iam create-role \
    --role-name aion-task-role \
    --assume-role-policy-document '{
      "Version": "2012-10-17",
      "Statement": [{
        "Effect": "Allow",
        "Principal": {"Service": "ecs-tasks.amazonaws.com"},
        "Action": "sts:AssumeRole"
      }]
    }'
  
  # Attach policy for Secrets Manager access
  aws iam put-role-policy \
    --role-name aion-task-role \
    --policy-name SecretsManagerAccess \
    --policy-document '{
      "Version": "2012-10-17",
      "Statement": [{
        "Effect": "Allow",
        "Action": [
          "secretsmanager:GetSecretValue",
          "kms:Decrypt"
        ],
        "Resource": "*"
      }]
    }'
fi

echo -e "${YELLOW}Step 8: Creating CloudWatch log group...${NC}"
aws logs create-log-group --log-group-name /ecs/aion-ai --region ${AWS_REGION} || true

echo -e "${YELLOW}Step 9: Creating ECS cluster...${NC}"
aws ecs describe-clusters --clusters ${CLUSTER_NAME} --region ${AWS_REGION} | grep ACTIVE || \
  aws ecs create-cluster --cluster-name ${CLUSTER_NAME} --region ${AWS_REGION}

echo -e "${YELLOW}Step 10: Updating task definition...${NC}"

# Update task definition with actual values
sed "s/AWS_ACCOUNT_ID/${AWS_ACCOUNT_ID}/g" deployment/aws/task-definition.json > /tmp/task-definition-updated.json

# Replace GCP endpoint if provided
if [ -n "$GCP_ENDPOINT" ]; then
  sed -i "s|GCP_ENDPOINT_PLACEHOLDER|${GCP_ENDPOINT}|g" /tmp/task-definition-updated.json
  echo "GCP endpoint configured: ${GCP_ENDPOINT}"
else
  echo -e "${YELLOW}Warning: GCP_ENDPOINT not set. Multi-cloud failover will be disabled.${NC}"
  echo "Set GCP_ENDPOINT environment variable and redeploy to enable multi-cloud."
fi

# Register task definition
TASK_DEFINITION_ARN=$(aws ecs register-task-definition \
  --cli-input-json file:///tmp/task-definition-updated.json \
  --region ${AWS_REGION} \
  --query 'taskDefinition.taskDefinitionArn' \
  --output text)

echo "Registered task definition: ${TASK_DEFINITION_ARN}"

echo -e "${YELLOW}Step 11: Creating/updating ECS service...${NC}"

# Get default VPC and subnets
VPC_ID=$(aws ec2 describe-vpcs --filters "Name=isDefault,Values=true" --query 'Vpcs[0].VpcId' --output text --region ${AWS_REGION})
SUBNET_IDS=$(aws ec2 describe-subnets --filters "Name=vpc-id,Values=${VPC_ID}" --query 'Subnets[*].SubnetId' --output text --region ${AWS_REGION})
SUBNET_1=$(echo $SUBNET_IDS | awk '{print $1}')
SUBNET_2=$(echo $SUBNET_IDS | awk '{print $2}')

# Create security group for AION
SG_ID=$(aws ec2 describe-security-groups --filters "Name=group-name,Values=aion-sg" "Name=vpc-id,Values=${VPC_ID}" --query 'SecurityGroups[0].GroupId' --output text --region ${AWS_REGION})

if [ "$SG_ID" == "None" ]; then
  echo "Creating security group..."
  SG_ID=$(aws ec2 create-security-group \
    --group-name aion-sg \
    --description "Security group for AION AI" \
    --vpc-id ${VPC_ID} \
    --region ${AWS_REGION} \
    --query 'GroupId' \
    --output text)
  
  # Allow inbound traffic on port 5000
  aws ec2 authorize-security-group-ingress \
    --group-id ${SG_ID} \
    --protocol tcp \
    --port 5000 \
    --cidr 0.0.0.0/0 \
    --region ${AWS_REGION}
fi

# Check if service exists
if aws ecs describe-services --cluster ${CLUSTER_NAME} --services ${SERVICE_NAME} --region ${AWS_REGION} | grep ACTIVE; then
  echo "Updating existing service..."
  aws ecs update-service \
    --cluster ${CLUSTER_NAME} \
    --service ${SERVICE_NAME} \
    --task-definition ${TASK_DEFINITION_ARN} \
    --region ${AWS_REGION}
else
  echo "Creating new service..."
  aws ecs create-service \
    --cluster ${CLUSTER_NAME} \
    --service-name ${SERVICE_NAME} \
    --task-definition ${TASK_DEFINITION_ARN} \
    --desired-count 1 \
    --launch-type FARGATE \
    --network-configuration "awsvpcConfiguration={subnets=[${SUBNET_1},${SUBNET_2}],securityGroups=[${SG_ID}],assignPublicIp=ENABLED}" \
    --region ${AWS_REGION}
fi

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Deployment Successful!${NC}"
echo -e "${GREEN}========================================${NC}"

# Get task public IP (may take a moment)
echo -e "${YELLOW}Waiting for task to start...${NC}"
sleep 30

TASK_ARN=$(aws ecs list-tasks --cluster ${CLUSTER_NAME} --service-name ${SERVICE_NAME} --region ${AWS_REGION} --query 'taskArns[0]' --output text)

if [ -n "$TASK_ARN" ]; then
  ENI_ID=$(aws ecs describe-tasks --cluster ${CLUSTER_NAME} --tasks ${TASK_ARN} --region ${AWS_REGION} --query 'tasks[0].attachments[0].details[?name==`networkInterfaceId`].value' --output text)
  PUBLIC_IP=$(aws ec2 describe-network-interfaces --network-interface-ids ${ENI_ID} --region ${AWS_REGION} --query 'NetworkInterfaces[0].Association.PublicIp' --output text)
  
  if [ -n "$PUBLIC_IP" ]; then
    echo -e "${GREEN}Service URL: http://${PUBLIC_IP}:5000${NC}"
    echo -e "${GREEN}Health Check: http://${PUBLIC_IP}:5000/health${NC}"
  fi
fi

echo ""
echo -e "${YELLOW}View logs:${NC}"
echo "aws logs tail /ecs/aion-ai --follow --region ${AWS_REGION}"
echo ""
