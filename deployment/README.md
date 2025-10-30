# AION - Multi-Cloud Deployment Guide

Complete guide for deploying AION to Google Cloud Run and AWS Fargate with automatic failover.

## 📋 Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Prerequisites](#prerequisites)
3. [Database Setup (Neon)](#database-setup-neon)
4. [API Keys Setup](#api-keys-setup)
5. [Google Cloud Run Deployment](#google-cloud-run-deployment)
6. [AWS Fargate Deployment](#aws-fargate-deployment)
7. [Multi-Cloud Synchronization](#multi-cloud-synchronization)
8. [Monitoring & Failover](#monitoring--failover)
9. [Cost Optimization](#cost-optimization)
10. [Troubleshooting](#troubleshooting)

---

## 🏗️ Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     Client Applications                      │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
         ┌─────────────────────────────┐
         │  DNS / Load Balancer        │
         │  (Automatic Failover)       │
         └──────┬──────────────┬───────┘
                │              │
       ┌────────▼─────┐   ┌───▼────────┐
       │ GCP Cloud    │   │ AWS        │
       │ Run          │   │ Fargate    │
       │ (Primary)    │   │ (Backup)   │
       └──────┬───────┘   └───┬────────┘
              │               │
              └───────┬───────┘
                      ▼
              ┌──────────────┐
              │ Neon         │
              │ PostgreSQL   │
              │ (Shared DB)  │
              └──────────────┘
```

**Key Features:**
- ✅ **Shared Database**: Both clouds use the same Neon PostgreSQL instance (no replication needed)
- ✅ **Health Monitoring**: Automatic health checks every 30 seconds
- ✅ **Auto-Failover**: Switches to backup cloud after 3 consecutive failures
- ✅ **Zero Downtime**: Seamless failover with no data loss
- ✅ **Cost Optimized**: Uses free tiers on both clouds

---

## 📦 Prerequisites

### Required Software

1. **Docker** (v20+)
   ```bash
   # Install Docker
   curl -fsSL https://get.docker.com -o get-docker.sh
   sudo sh get-docker.sh
   ```

2. **Google Cloud SDK**
   ```bash
   # Install gcloud CLI
   curl https://sdk.cloud.google.com | bash
   exec -l $SHELL
   
   # Initialize
   gcloud init
   ```

3. **AWS CLI** (v2)
   ```bash
   # Install AWS CLI
   curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
   unzip awscliv2.zip
   sudo ./aws/install
   
   # Configure
   aws configure
   ```

### Required Accounts

- **Google Cloud Platform** (Free tier: $300 credits)
- **AWS** (Free tier: 12 months)
- **Neon** (Free tier: 0.5GB storage, 10GB egress/month)

---

## 💾 Database Setup (Neon)

### Step 1: Create Neon Account

1. Go to [neon.tech](https://neon.tech)
2. Sign up with GitHub/Google
3. Create a new project: `aion-production`

### Step 2: Get Connection String

```sql
-- Copy from Neon dashboard
postgresql://user:password@ep-xxx.us-east-2.aws.neon.tech/aion?sslmode=require
```

### Step 3: Initialize Database

```bash
# Set DATABASE_URL
export DATABASE_URL="postgresql://user:password@..."

# Push schema to database
npm run db:push
```

---

## 🔑 API Keys Setup

### OpenAI (Optional - Last Resort)
```bash
# Get from: https://platform.openai.com/api-keys
export OPENAI_API_KEY="sk-..."
```

### Groq (Free - 14.4k req/day)
```bash
# Get from: https://console.groq.com/keys
export GROQ_API_KEY="gsk_..."
```

### Gemini (Free - 1.5k req/day)
```bash
# Get from: https://aistudio.google.com/app/apikey
export GEMINI_API_KEY="AIza..."
```

### HuggingFace (Free - 720 req/day)
```bash
# Get from: https://huggingface.co/settings/tokens
export HUGGINGFACE_API_KEY="hf_..."
```

### OpenRouter (Free - 50-1000 req/day)
```bash
# Get from: https://openrouter.ai/keys
export OPEN_ROUTER_API_KEY="sk-or-v1-..."
```

### Session Secret
```bash
# Generate random secret
export SESSION_SECRET=$(openssl rand -hex 32)
```

---

## ☁️ Google Cloud Run Deployment

### Step 1: Set Environment Variables

```bash
export GCP_PROJECT_ID="aion-ai-prod"
export GCP_REGION="us-central1"
```

### Step 2: Deploy

```bash
# Make script executable
chmod +x deployment/gcp/deploy-gcp.sh

# Deploy
./deployment/gcp/deploy-gcp.sh
```

### Step 3: Verify Deployment

```bash
# Get service URL
gcloud run services describe aion-ai \
  --region=us-central1 \
  --format='value(status.url)'

# Test health check
curl https://your-service-url.run.app/health
```

### Expected Output:
```json
{
  "status": "healthy",
  "timestamp": "2025-10-30T12:00:00.000Z",
  "uptime": 42
}
```

---

## ☁️ AWS Fargate Deployment

### Step 1: Set Environment Variables

```bash
export AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
export AWS_REGION="us-east-1"
export ECS_CLUSTER="aion-cluster"
```

### Step 2: Deploy

```bash
# Make script executable
chmod +x deployment/aws/deploy-aws.sh

# Deploy
./deployment/aws/deploy-aws.sh
```

### Step 3: Get Public IP

```bash
# List running tasks
aws ecs list-tasks \
  --cluster aion-cluster \
  --service-name aion-ai \
  --region us-east-1

# Get task details (replace TASK_ARN)
aws ecs describe-tasks \
  --cluster aion-cluster \
  --tasks TASK_ARN \
  --region us-east-1
```

### Step 4: Test

```bash
# Test health check
curl http://PUBLIC_IP:5000/health
```

---

## 🔄 Multi-Cloud Synchronization

### Enable Multi-Cloud Monitoring

```bash
# Set environment variables on both clouds
export ENABLE_MULTI_CLOUD=true
export GCP_ENDPOINT="https://your-gcp-service.run.app"
export AWS_ENDPOINT="http://your-aws-ip:5000"
```

### Update Deployments

**GCP:**
```bash
# Add to cloud-run.yaml
- name: ENABLE_MULTI_CLOUD
  value: "true"
- name: AWS_ENDPOINT
  value: "http://AWS_IP:5000"

# Redeploy
gcloud run services replace deployment/gcp/cloud-run.yaml --region=us-central1
```

**AWS:**
```bash
# Add to task-definition.json environment section
{
  "name": "ENABLE_MULTI_CLOUD",
  "value": "true"
},
{
  "name": "GCP_ENDPOINT",
  "value": "https://your-gcp-service.run.app"
}

# Redeploy
./deployment/aws/deploy-aws.sh
```

### Verify Sync Status

```bash
# Check multi-cloud status
curl https://your-service/health/multi-cloud
```

### Expected Output:
```json
{
  "endpoints": [
    {
      "name": "GCP Cloud Run",
      "url": "https://...",
      "isPrimary": true,
      "isHealthy": true,
      "consecutiveFailures": 0
    },
    {
      "name": "AWS Fargate",
      "url": "http://...",
      "isPrimary": false,
      "isHealthy": true,
      "consecutiveFailures": 0
    }
  ],
  "activeEndpoint": "GCP Cloud Run"
}
```

---

## 📊 Monitoring & Failover

### Health Check Endpoints

| Endpoint | Purpose | Response Time |
|----------|---------|---------------|
| `/health` | Basic health (for load balancers) | < 100ms |
| `/health/detailed` | Detailed service status | < 500ms |
| `/health/ready` | Readiness probe | < 200ms |
| `/health/live` | Liveness probe | < 50ms |
| `/health/multi-cloud` | Multi-cloud status | < 1s |

### Failover Process

1. **Detection**: Health check fails 3 consecutive times (90 seconds)
2. **Switch**: Traffic routes to backup cloud
3. **Notification**: Logs failover event (can add webhooks/emails)
4. **Recovery**: Primary cloud comes back online
5. **Failback**: (Optional) Switch back to primary

### Monitoring Best Practices

```bash
# GCP - View logs
gcloud run services logs read aion-ai --region=us-central1 --limit=50

# AWS - View logs
aws logs tail /ecs/aion-ai --follow --region us-east-1

# Set up alerts (GCP)
gcloud alpha monitoring policies create \
  --notification-channels=CHANNEL_ID \
  --display-name="AION Health Alert" \
  --condition-threshold-value=1 \
  --condition-threshold-duration=180s

# Set up alerts (AWS)
aws cloudwatch put-metric-alarm \
  --alarm-name aion-health-check \
  --alarm-description "AION health check failed" \
  --metric-name HealthCheckFailed \
  --threshold 3 \
  --comparison-operator GreaterThanThreshold
```

---

## 💰 Cost Optimization

### Free Tier Limits

**Google Cloud Run:**
- ✅ 2 million requests/month
- ✅ 360,000 vCPU-seconds/month
- ✅ 180,000 GiB-seconds/month
- 💰 Scale to zero when idle (no charge)

**AWS Fargate:**
- ✅ 12 months free trial
- ✅ Not eligible after trial ends
- 💰 $0.04/hour for 0.25 vCPU + 0.5GB RAM = ~$30/month

**Neon Database:**
- ✅ 0.5 GB storage
- ✅ 10 GB egress/month
- ✅ Auto-suspend after 5 minutes idle
- 💰 Additional storage: $0.16/GB/month

### Recommendations

1. **Use GCP as Primary**: Better free tier for long-term use
2. **AWS as Backup Only**: Keep minimal instance count
3. **Enable Auto-Scaling**: Scale to zero when idle
4. **Monitor Costs**: Set billing alerts

```bash
# GCP - Set billing budget
gcloud billing budgets create \
  --billing-account=BILLING_ACCOUNT_ID \
  --display-name="AION Budget" \
  --budget-amount=10USD

# AWS - Set billing alarm
aws budgets create-budget \
  --account-id AWS_ACCOUNT_ID \
  --budget file://budget.json
```

---

## 🔧 Troubleshooting

### Common Issues

#### 1. Container Won't Start

**Symptom**: Service shows `FAILED` status

**Solution**:
```bash
# Check logs
gcloud run services logs read aion-ai --region=us-central1 --limit=100

# Verify environment variables
gcloud run services describe aion-ai --region=us-central1 --format=yaml
```

#### 2. Database Connection Fails

**Symptom**: `Error: DATABASE_URL must be set`

**Solution**:
```bash
# Verify secret exists (GCP)
gcloud secrets versions access latest --secret=database-url

# Verify secret exists (AWS)
aws secretsmanager get-secret-value \
  --secret-id aion/database-url \
  --query SecretString \
  --output text
```

#### 3. Health Check Timeout

**Symptom**: Container restart loop

**Solution**:
```bash
# Increase startup timeout in cloud-run.yaml
startupProbe:
  initialDelaySeconds: 30  # Increase this
  failureThreshold: 10
```

#### 4. Out of Memory

**Symptom**: Container killed with OOMKilled

**Solution**:
```bash
# Increase memory limit
# cloud-run.yaml
resources:
  limits:
    memory: "1Gi"  # Increase from 512Mi
```

#### 5. Rate Limit Exceeded

**Symptom**: Free API quota exceeded

**Solution**:
- Reduce usage or add OpenAI API key as fallback
- Monitor usage in `/health/detailed` endpoint
- Implement request caching

---

## 📈 Scaling & Performance

### Auto-Scaling Configuration

**GCP Cloud Run:**
```yaml
# cloud-run.yaml
autoscaling.knative.dev/minScale: "0"
autoscaling.knative.dev/maxScale: "100"
autoscaling.knative.dev/target: "80"  # 80% CPU
```

**AWS Fargate:**
```bash
# Update service auto-scaling
aws application-autoscaling register-scalable-target \
  --service-namespace ecs \
  --resource-id service/aion-cluster/aion-ai \
  --scalable-dimension ecs:service:DesiredCount \
  --min-capacity 1 \
  --max-capacity 10
```

### Performance Monitoring

```bash
# GCP - View metrics
gcloud monitoring dashboards create \
  --config-from-file=monitoring-dashboard.json

# AWS - View metrics
aws cloudwatch get-metric-statistics \
  --namespace AWS/ECS \
  --metric-name CPUUtilization \
  --dimensions Name=ServiceName,Value=aion-ai \
  --start-time 2025-10-30T00:00:00Z \
  --end-time 2025-10-30T23:59:59Z \
  --period 3600 \
  --statistics Average
```

---

## 🎯 Next Steps

1. ✅ **Custom Domain**: Set up custom domain with automatic HTTPS
2. ✅ **CDN**: Add Cloudflare for caching and DDoS protection
3. ✅ **Monitoring**: Set up Prometheus/Grafana dashboards
4. ✅ **Backup Strategy**: Automate database backups
5. ✅ **CI/CD**: Set up GitHub Actions for automatic deployments

---

## 📞 Support

For issues or questions:
- 📧 Email: support@aion.ai
- 🐛 GitHub Issues: [github.com/aion-ai/aion/issues](https://github.com/aion-ai/aion/issues)
- 📖 Docs: [docs.aion.ai](https://docs.aion.ai)

---

**Last Updated**: October 30, 2025  
**Version**: 1.0.0
