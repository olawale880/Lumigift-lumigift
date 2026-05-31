# Database Backup & Point-in-Time Recovery

## Overview

Daily `pg_dump` backups are stored in an encrypted S3 bucket with 30-day retention.
Backups run at **02:00 UTC** via GitHub Actions and are encrypted with a dedicated KMS key.

## Architecture

| Component | Detail |
|-----------|--------|
| Backup tool | `pg_dump` (custom format, compression level 9) |
| Storage | `lumigift-prod-db-backups` S3 bucket |
| Encryption | SSE-KMS (`alias/lumigift-prod-backup`) |
| Retention | 30 days (S3 lifecycle rule) |
| Schedule | Daily 02:00 UTC (`cron(0 2 * * *)`) |
| Auth | GitHub Actions OIDC → IAM role (no long-lived keys) |
| Alerts | CloudWatch → SNS email on failure or missing backup |

## Required GitHub Actions Secrets

| Secret | Value |
|--------|-------|
| `BACKUP_IAM_ROLE_ARN` | Output of `terraform output backup_iam_role_arn` |
| `BACKUP_S3_BUCKET` | Output of `terraform output backup_bucket_name` |

## Running a Manual Backup

```bash
# Trigger via GitHub Actions UI
gh workflow run db-backup.yml

# Or run locally (requires AWS credentials + pg_dump)
export DATABASE_URL="postgresql://..."
export BACKUP_S3_BUCKET="lumigift-prod-db-backups"
bash scripts/backup.sh
```

## Point-in-Time Recovery

### 1. Identify the target timestamp

Determine the latest safe point before the incident (ISO 8601 UTC):

```
2026-05-31T01:59:00Z
```

### 2. List available backups

```bash
aws s3 ls s3://lumigift-prod-db-backups/backups/ \
  | awk '{print $4}' | sort
```

### 3. Restore

```bash
export DATABASE_URL="postgresql://lumigift:<password>@<host>:5432/lumigift"
export BACKUP_S3_BUCKET="lumigift-prod-db-backups"

# Restore to the latest backup at or before the target timestamp
bash scripts/backup.sh --restore 2026-05-31T01:59:00Z
```

The script will:
1. Find the newest backup file with a timestamp ≤ the target.
2. Download it from S3.
3. Run `pg_restore --clean --if-exists` against `DATABASE_URL`.

### 4. Verify

```sql
-- Connect and spot-check critical tables
SELECT COUNT(*) FROM gifts;
SELECT MAX(created_at) FROM gifts;
```

### 5. Resume traffic

Once verified, re-enable the App Runner service or remove the maintenance page.

## Terraform Setup (first time)

```bash
cd infra/terraform

# Create the GitHub OIDC provider (once per AWS account)
aws iam create-open-id-connect-provider \
  --url https://token.actions.githubusercontent.com \
  --client-id-list sts.amazonaws.com \
  --thumbprint-list 6938fd4d98bab03faadb97b34396831e3780aea1

# Apply backup resources
terraform init
terraform apply -target=aws_s3_bucket.backup \
                -target=aws_iam_role.backup \
                -target=aws_cloudwatch_metric_alarm.backup_failure \
                -target=aws_cloudwatch_metric_alarm.backup_missing
```

After apply, copy the outputs into GitHub Actions secrets:

```bash
terraform output backup_iam_role_arn
terraform output backup_bucket_name
```

## Alerts

Two CloudWatch alarms notify `ops@lumigift.app` via SNS:

- **backup-failure** — fires when the log group receives an `ERROR` line.
- **backup-missing** — fires when no successful backup is recorded in a 24-hour window (treats missing data as breaching).

To subscribe additional emails:

```bash
aws sns subscribe \
  --topic-arn <sns_topic_arn> \
  --protocol email \
  --notification-endpoint you@example.com
```
