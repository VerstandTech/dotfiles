---
name: infra-cost-audit
description: Audit DigitalOcean and Kubernetes infrastructure costs, resource utilization, and compare with AWS alternatives. Use when the user says "infra audit", "check DO costs", "infrastructure costs", "how much are we spending", "compare AWS", "optimize infra", or wants to review cloud spending.
---

# Infrastructure Cost Audit

Audit the olhaminha.bio DigitalOcean + Kubernetes infrastructure to produce a cost breakdown, utilization analysis, and optimization recommendations.

## Prerequisites

Verify CLI tools are available:
```bash
doctl version
kubectl version --client
```

If either is missing, inform the user and stop.

## Step 1 — Gather DigitalOcean Resources

Run these commands in parallel to collect all billable resources:

```bash
# Kubernetes clusters
doctl kubernetes cluster list --format ID,Name,Region,Version,NodePools,Status

# Droplets (includes K8s nodes)
doctl compute droplet list --format ID,Name,Memory,VCPUs,Disk,Region,Image,Status,Size

# Node pool details (per cluster)
doctl kubernetes cluster node-pool list <CLUSTER_ID> --format ID,Name,Size,Count,AutoScale,MinNodes,MaxNodes

# Load balancers
doctl compute load-balancer list --format ID,Name,Region,Size,Status

# Managed databases
doctl databases list --format ID,Name,Engine,Version,Size,Region,Status,NumNodes

# Block storage volumes
doctl compute volume list --format ID,Name,Size,Region,DropletIDs

# Container registry
doctl registry get --format Name,Region,StorageUsageBytes

# Account balance & invoices
doctl balance get
doctl invoice list
```

## Step 2 — Gather Kubernetes Workloads

```bash
# Namespaces
kubectl get namespaces

# Node capacity
kubectl get nodes -o custom-columns='NAME:.metadata.name,CPU:.status.capacity.cpu,MEM:.status.capacity.memory,ALLOC_CPU:.status.allocatable.cpu,ALLOC_MEM:.status.allocatable.memory'

# Actual usage (if metrics-server available)
kubectl top nodes

# All deployments with resource requests/limits
kubectl get deployments --all-namespaces -o custom-columns='NAMESPACE:.metadata.namespace,NAME:.metadata.name,REPLICAS:.spec.replicas,CPU_REQ:.spec.template.spec.containers[*].resources.requests.cpu,MEM_REQ:.spec.template.spec.containers[*].resources.requests.memory,CPU_LIM:.spec.template.spec.containers[*].resources.limits.cpu,MEM_LIM:.spec.template.spec.containers[*].resources.limits.memory'

# Statefulsets
kubectl get statefulsets --all-namespaces -o custom-columns='NAMESPACE:.metadata.namespace,NAME:.metadata.name,REPLICAS:.spec.replicas'

# Daemonsets (runs on every node, scales with node count)
kubectl get daemonsets --all-namespaces -o custom-columns='NAMESPACE:.metadata.namespace,NAME:.metadata.name,DESIRED:.status.desiredNumberScheduled'

# PVCs (persistent volume claims)
kubectl get pvc --all-namespaces -o custom-columns='NAMESPACE:.metadata.namespace,NAME:.metadata.name,SIZE:.spec.resources.requests.storage,STATUS:.status.phase'

# Pod-level resource requests (actual running pods)
kubectl get pods --all-namespaces -o jsonpath='{range .items[*]}{.metadata.namespace}{"\t"}{.metadata.name}{"\t"}{range .spec.containers[*]}{.resources.requests.cpu}{"\t"}{.resources.requests.memory}{"\n"}{end}{end}'
```

## Step 3 — Calculate Costs

### DigitalOcean Pricing Reference (verify with `doctl compute size list`)

| Resource | Approx Monthly |
|----------|---------------|
| `s-2vcpu-4gb` node | $24 |
| `lb-small` | $12 |
| `db-s-1vcpu-1gb` Postgres | $15 |
| Block Storage | $0.10/GiB |
| DOKS control plane | Free |
| Container Registry (Starter) | $5 |

### Build Cost Table
1. List every billable resource with its monthly cost
2. Sum to get total monthly spend
3. Compare with last 6 months of invoices (`doctl invoice list`) to identify trends

## Step 4 — Resource Utilization Analysis

Calculate:
- **Total allocatable** CPU and memory across all nodes
- **Total requested** by app workloads (production + staging)
- **Total requested** by platform/infra (ArgoCD, ingress, observability, vault, cert-manager)
- **Utilization %** = (total requested / total allocatable) * 100
- **Headroom** = what's left for scaling

Flag if:
- Utilization > 85% (risk of eviction/scheduling failures)
- Utilization < 50% (over-provisioned, wasting money)
- Any single namespace consumes > 40% of cluster resources

## Step 5 — AWS Cost Comparison

Compare equivalent setups:

### EKS Vanilla
- EKS control plane: $73/mo
- Equivalent EC2 instances (on-demand and Spot pricing for t4g/t3 family)
- ALB: ~$22/mo base + LCU
- RDS equivalent to managed DB
- EBS gp3 for storage
- NAT Gateway: $32/mo + $0.045/GB data processed

### EKS + Karpenter Spot
- Same as above but with Spot instances managed by Karpenter
- Estimate 60-70% discount on compute

### k3s on EC2 Spot (no EKS fee)
- Self-managed K8s, saves $73 control plane
- Adds operational burden (etcd, upgrades, HA)

### Key AWS Cost Gotchas
- NAT Gateway is expensive ($32+ base)
- Cross-AZ data transfer adds up
- ALB base cost higher than DO LB
- EKS control plane fee has no DO equivalent (DO is free)

## Step 6 — Optimization Recommendations

Evaluate and recommend:

### Quick Wins (no migration)
- Can observability be offloaded to Grafana Cloud Free? (50GB logs, 10k metrics series)
- Can node count be reduced if utilization allows?
- Are any staging workers scaled to 0 that should be permanently removed?
- Can Vault be replaced with simpler secret management?
- Are PVC sizes right-sized or over-allocated?

### Medium-Term
- Enable node autoscaling (MinNodes/MaxNodes) if not set
- Right-size resource requests (are any pods requesting much more than they use?)
- Consider smaller node sizes if fragmentation is an issue

### Present Results As
1. Current monthly cost breakdown table
2. Cost trend chart (last 6-12 months)
3. Resource utilization summary
4. AWS comparison table
5. Ranked optimization recommendations with estimated savings

## Known Infrastructure State

Read the memory file for last-known state:
```
memory/project_do_infrastructure.md
```

After running the audit, update this memory file with new findings if costs or architecture have changed.

## Checklist

- [ ] All DO resources inventoried (clusters, droplets, LBs, DBs, volumes, registry)
- [ ] All K8s workloads cataloged with resource requests
- [ ] Cost breakdown computed with per-resource pricing
- [ ] Invoice history reviewed for trends
- [ ] Utilization % calculated (CPU and memory)
- [ ] AWS alternatives priced (EKS vanilla, EKS+Spot, k3s)
- [ ] Optimization recommendations with estimated savings
- [ ] Memory updated if state changed
