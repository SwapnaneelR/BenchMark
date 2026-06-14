terraform {
  required_version = ">= 1.5.0"
  required_providers {
    digitalocean = {
      source  = "digitalocean/digitalocean"
      version = "~> 2.36"
    }
  }
  # Uncomment to store state remotely (recommended for teams):
  # backend "s3" {
  #   bucket = "your-tf-state-bucket"
  #   key    = "benchmark/terraform.tfstate"
  #   region = "us-east-1"
  # }
}

provider "digitalocean" {
  token = var.do_token
}

# ── Firewall ──────────────────────────────────────────────────────────────────

resource "digitalocean_firewall" "benchmark" {
  name        = "benchmark-platform"
  droplet_ids = [digitalocean_droplet.benchmark.id]

  inbound_rule {
    protocol         = "tcp"
    port_range       = "22"
    source_addresses = ["0.0.0.0/0", "::/0"]
  }

  inbound_rule {
    protocol         = "tcp"
    port_range       = "80"
    source_addresses = ["0.0.0.0/0", "::/0"]
  }

  inbound_rule {
    protocol         = "tcp"
    port_range       = "443"
    source_addresses = ["0.0.0.0/0", "::/0"]
  }

  outbound_rule {
    protocol              = "tcp"
    port_range            = "1-65535"
    destination_addresses = ["0.0.0.0/0", "::/0"]
  }

  outbound_rule {
    protocol              = "udp"
    port_range            = "1-65535"
    destination_addresses = ["0.0.0.0/0", "::/0"]
  }
}

# ── Droplet ───────────────────────────────────────────────────────────────────

resource "digitalocean_droplet" "benchmark" {
  name      = "benchmark-platform"
  region    = var.region
  size      = var.droplet_size
  image     = "ubuntu-22-04-x64"
  ssh_keys  = [var.ssh_key_fingerprint]
  user_data = templatefile("${path.module}/user_data.sh", {
    repo_url    = var.repo_url
    repo_branch = var.repo_branch
    caddy_host  = var.caddy_host != "" ? var.caddy_host : ":80"
  })
  tags = ["benchmark", "iicpc-2026"]
}

# ── Optional: DNS record if domain managed on DigitalOcean ───────────────────
# resource "digitalocean_domain" "benchmark" {
#   name       = var.caddy_host
#   ip_address = digitalocean_droplet.benchmark.ipv4_address
# }
