variable "do_token" {
  description = "DigitalOcean API token"
  type        = string
  sensitive   = true
}

variable "region" {
  description = "DigitalOcean region"
  type        = string
  default     = "nyc3"
}

variable "droplet_size" {
  description = "Droplet size slug (4 vCPU / 8 GB RAM recommended for concurrent benchmark runs)"
  type        = string
  default     = "s-4vcpu-8gb"
}

variable "ssh_key_fingerprint" {
  description = "Fingerprint of an SSH key already uploaded to DigitalOcean"
  type        = string
}

variable "repo_url" {
  description = "Git repository URL to clone on the provisioned VM"
  type        = string
  default     = "https://github.com/your-org/BenchMark.git"
}

variable "repo_branch" {
  description = "Branch to check out"
  type        = string
  default     = "main"
}

variable "caddy_host" {
  description = "Public domain for Caddy auto-HTTPS (leave empty to use :80 with no TLS)"
  type        = string
  default     = ""
}
