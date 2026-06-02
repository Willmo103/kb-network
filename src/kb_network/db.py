import os
import json
import logging
import sqlite_utils
from datetime import datetime
from typing import List, Dict, Any, Optional
from kb_core.config import Config
from kb_core.notifier import Gotify

logger = logging.getLogger("kb-network")

# Gotify setup
def get_notifier() -> Gotify:
    # Load from environment variables or default central config
    url = os.environ.get("GOTIFY_URL")
    token = os.environ.get("GOTIFY_TOKEN")
    
    # Try reading from config file if environment vars are missing
    if not url or not token:
        config_path = Config.configs_dir / "kb-network.json"
        if config_path.exists():
            try:
                with open(config_path, "r") as f:
                    cfg = json.load(f)
                    url = url or cfg.get("gotify_url")
                    token = token or cfg.get("gotify_token")
            except Exception:
                pass
    return Gotify(token=token, url=url)


def init_db():
    db = Config().get_db()
    
    # 1. network_hosts
    if "network_hosts" not in db.table_names():
        db["network_hosts"].create({
            "hostname": str,
            "ip_address": str,
            "mac_address": str,
            "user": str,
            "os_name": str,
            "os_version": str,
            "cpu_percent": float,
            "cpu_cores": int,
            "ram_total": int,
            "ram_used": int,
            "ram_free": int,
            "last_heartbeat": str,
            "api_token": str,
            "port": int,
            "status": str
        }, pk="hostname")
        
    # 2. network_telemetry_history
    if "network_telemetry_history" not in db.table_names():
        db["network_telemetry_history"].create({
            "id": int,
            "hostname": str,
            "cpu_percent": float,
            "ram_percent": float,
            "disk_percent": float,
            "timestamp": str
        }, pk="id")
        
    # 3. network_services
    if "network_services" not in db.table_names():
        db["network_services"].create({
            "id": int,
            "hostname": str,
            "service_type": str,
            "name": str,
            "status": str,
            "details": str  # JSON string
        }, pk="id")
        
    # 4. network_tasks_log
    if "network_tasks_log" not in db.table_names():
        db["network_tasks_log"].create({
            "id": int,
            "hostname": str,
            "task_name": str,
            "status": str,
            "logs": str,
            "timestamp": str
        }, pk="id")
        
    # 5. network_alerts
    if "network_alerts" not in db.table_names():
        db["network_alerts"].create({
            "id": int,
            "hostname": str,
            "message": str,
            "severity": str,
            "timestamp": str
        }, pk="id")


def record_telemetry(data: Dict[str, Any], api_token: str, port: int):
    init_db()
    db = Config().get_db()
    
    hostname = data.get("hostname", "unknown")
    cpu_percent = data.get("cpu_percent", 0.0)
    
    ram_total = data.get("ram_total", 0)
    ram_used = data.get("ram_used", 0)
    ram_free = data.get("ram_free", 0)
    ram_percent = (ram_used / ram_total * 100.0) if ram_total > 0 else 0.0
    
    # Primary disk percent
    disks = data.get("disks", [])
    disk_percent = 0.0
    for disk in disks:
        if disk.get("path") in ["/", "C:\\"]:
            disk_percent = disk.get("percent", 0.0)
            break
    if not disk_percent and disks:
        disk_percent = disks[0].get("percent", 0.0)

    timestamp = data.get("timestamp", datetime.now().isoformat())

    # 1. Update host record
    host_record = {
        "hostname": hostname,
        "ip_address": data.get("ip_address"),
        "mac_address": data.get("mac_address"),
        "user": data.get("user"),
        "os_name": data.get("os_name"),
        "os_version": data.get("os_version"),
        "cpu_percent": cpu_percent,
        "cpu_cores": data.get("cpu_cores", 1),
        "ram_total": ram_total,
        "ram_used": ram_used,
        "ram_free": ram_free,
        "last_heartbeat": timestamp,
        "api_token": api_token,
        "port": port,
        "status": "active"
    }
    db["network_hosts"].upsert(host_record, pk="hostname")

    # 2. Insert telemetry history
    db["network_telemetry_history"].insert({
        "hostname": hostname,
        "cpu_percent": cpu_percent,
        "ram_percent": ram_percent,
        "disk_percent": disk_percent,
        "timestamp": timestamp
    })

    # 3. Clean and rebuild service records for this host
    db.execute("DELETE FROM network_services WHERE hostname = ?", (hostname,))

    # Docker containers
    docker = data.get("docker")
    if docker:
        db["network_services"].insert({
            "hostname": hostname,
            "service_type": "docker",
            "name": f"Docker Daemon v{docker.get('version', 'Unknown')}",
            "status": "running",
            "details": json.dumps(docker)
        })
        for c in docker.get("containers", []):
            db["network_services"].insert({
                "hostname": hostname,
                "service_type": "docker_container",
                "name": c.get("name"),
                "status": c.get("status"),
                "details": json.dumps(c)
            })

    # Ollama stats
    ollama = data.get("ollama")
    if ollama:
        db["network_services"].insert({
            "hostname": hostname,
            "service_type": "ollama",
            "name": f"Ollama v{ollama.get('version', 'Unknown')}",
            "status": "running",
            "details": json.dumps(ollama)
        })

    # Databases
    databases = data.get("databases", {})
    if databases:
        for db_status in databases.get("databases", []):
            db_type = db_status.get("type")
            is_running = db_status.get("running", False)
            db["network_services"].insert({
                "hostname": hostname,
                "service_type": "database",
                "name": db_type,
                "status": "running" if is_running else "stopped",
                "details": json.dumps(db_status)
            })

    # Trigger alerts/Gotify on anomaly
    notifier = get_notifier()
    
    # Simple alert thresholds
    if cpu_percent > 90.0:
        msg = f"Host {hostname} has high CPU usage: {cpu_percent}%"
        db["network_alerts"].insert({
            "hostname": hostname,
            "message": msg,
            "severity": "warning",
            "timestamp": timestamp
        })
        notifier.send_notification("High CPU Alert", msg)

    if ram_percent > 90.0:
        msg = f"Host {hostname} has high RAM usage: {ram_percent:.1f}%"
        db["network_alerts"].insert({
            "hostname": hostname,
            "message": msg,
            "severity": "warning",
            "timestamp": timestamp
        })
        notifier.send_notification("High RAM Alert", msg)


def log_task_execution(hostname: str, task_name: str, status: str, logs: List[str]):
    init_db()
    db = Config().get_db()
    db["network_tasks_log"].insert({
        "hostname": hostname,
        "task_name": task_name,
        "status": status,
        "logs": "\n".join(logs),
        "timestamp": datetime.now().isoformat()
    })
