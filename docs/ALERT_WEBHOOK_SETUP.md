# Alert Webhook Setup Guide

## Overview
AION Alert Service sends critical notifications via webhooks and emails when manual intervention is required.

## Configuration

### 1. Environment Variable
Add to your `.env` file or Replit Secrets:

```bash
ALERT_WEBHOOK_URL=https://your-webhook-endpoint.com/alerts
```

### 2. Webhook Payload Format
The alert service sends POST requests with the following JSON payload:

```json
{
  "severity": "critical",
  "title": "CAPTCHA Detected - Manual Intervention Required",
  "message": "Google Colab worker 123 encountered CAPTCHA during automation. Manual login required.",
  "context": {
    "workerId": 123,
    "notebookUrl": "https://colab.research.google.com/drive/...",
    "provider": "colab",
    "action": "manual_intervention_required",
    "timestamp": "2025-11-10T12:34:56.789Z"
  },
  "timestamp": "2025-11-10T12:34:56.789Z",
  "source": "AION-GPU-Orchestration"
}
```

### 3. Severity Levels
- `info`: Informational alerts (FYI only)
- `warning`: Issues that need attention but not urgent
- `critical`: Requires immediate manual intervention (e.g., CAPTCHA)
- `emergency`: System-wide failures or security incidents

## Integration Examples

### Slack Webhook
```bash
ALERT_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/WEBHOOK/URL
```

Slack will automatically format the JSON payload as a message.

### Discord Webhook
```bash
ALERT_WEBHOOK_URL=https://discord.com/api/webhooks/YOUR_WEBHOOK_ID/YOUR_WEBHOOK_TOKEN
```

### Custom Webhook Server
Create a simple Express server:

```javascript
import express from 'express';
const app = express();
app.use(express.json());

app.post('/alerts', (req, res) => {
  const { severity, title, message, context } = req.body;
  
  console.log(`[${severity.toUpperCase()}] ${title}`);
  console.log(message);
  console.log('Context:', context);
  
  // Send email, SMS, Telegram, etc.
  // await sendEmail(title, message);
  
  res.status(200).json({ received: true });
});

app.listen(3000);
```

## Retry Logic
- Automatic retry on 5xx errors or connection failures
- Exponential backoff: 2s, 4s, 8s
- Max 3 retry attempts
- Fallback to structured logging if all retries fail

## Alert History
Access recent alerts via API (requires admin authentication):

```bash
GET /api/admin/alerts/recent?limit=50&severity=critical
```

Response:
```json
{
  "alerts": [
    {
      "severity": "critical",
      "title": "CAPTCHA Detected",
      "message": "...",
      "context": {},
      "timestamp": "2025-11-10T12:34:56.789Z"
    }
  ],
  "total": 15
}
```

## Testing
Test your webhook configuration (requires admin authentication):

```bash
curl -X POST https://your-aion-instance.repl.co/api/admin/alerts/test \
  -H "Content-Type: application/json" \
  -H "X-Requested-With: XMLHttpRequest" \
  -b "connect.sid=YOUR_SESSION_COOKIE" \
  -d '{
    "severity": "info",
    "title": "Test Alert",
    "message": "Testing webhook configuration"
  }'
```

## Troubleshooting

### Webhook Not Receiving Alerts
1. Check `ALERT_WEBHOOK_URL` is set correctly
2. Verify webhook endpoint is accessible
3. Check application logs for webhook send errors
4. Test with `curl` directly to webhook URL

### Alerts Only in Logs
If alerts only appear in logs but not in webhook:
- `ALERT_WEBHOOK_URL` not configured → Alerts logged only
- Webhook endpoint down → Retry exhausted, fallback to logging

### Alert Spam
To reduce noise, adjust severity thresholds in code or filter in webhook receiver.
