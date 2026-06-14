output "droplet_ip" {
  description = "Public IPv4 address of the BenchMark platform VM"
  value       = digitalocean_droplet.benchmark.ipv4_address
}

output "platform_url" {
  description = "URL to access the platform"
  value       = "http://${digitalocean_droplet.benchmark.ipv4_address}"
}

output "ssh_command" {
  description = "SSH command to connect to the VM"
  value       = "ssh root@${digitalocean_droplet.benchmark.ipv4_address}"
}
