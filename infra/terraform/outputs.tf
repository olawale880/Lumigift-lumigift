output "app_url" {
  description = "App Runner service URL"
  value       = aws_apprunner_service.app.service_url
}

output "db_endpoint" {
  description = "RDS endpoint"
  value       = aws_db_instance.postgres.endpoint
  sensitive   = true
}

output "redis_endpoint" {
  description = "ElastiCache Redis endpoint"
  value       = aws_elasticache_cluster.redis.cache_nodes[0].address
  sensitive   = true
}

output "backup_bucket_name" {
  description = "S3 bucket for DB backups"
  value       = aws_s3_bucket.backup.bucket
}

output "backup_iam_role_arn" {
  description = "IAM role ARN for the GitHub Actions backup job"
  value       = aws_iam_role.backup.arn
}