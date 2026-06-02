import os
import json
import logging
from datetime import datetime, timedelta
from typing import Dict, Any, List, Optional
from fastapi import FastAPI, Depends, HTTPException, Security, status, Header
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import httpx

from kb_core.config import Config
from kb_network.db import init_db, record_telemetry, log_task_execution

logger = logging.getLogger("kb-network")

app = FastAPI(title="kb-network Central Server", version="0.1.0")
security = HTTPBearer()

def get_agent_by_token(token: str) -> Optional[Dict[str, Any]]:
    db = Config().get_db()
    if "network_hosts" not in db.table_names():
        return None
    rows = list(db["network_hosts"].rows_where("api_token = ?", [token]))
    return rows[0] if rows else None

def verify_agent_token(credentials: HTTPAuthorizationCredentials = Security(security)) -> Dict[str, Any]:
    agent = get_agent_by_token(credentials.credentials)
    if not agent:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Unauthorized agent token"
        )
    return agent

# ----------------------------------------------------
# Agent Endpoints
# ----------------------------------------------------
@app.post("/telemetry")
def receive_telemetry(data: Dict[str, Any], agent: Dict[str, Any] = Depends(verify_agent_token)):
    try:
        record_telemetry(data, agent["api_token"], agent["port"])
        return {"status": "success"}
    except Exception as e:
        logger.error(f"Error recording telemetry from {agent['hostname']}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/heartbeat")
def receive_heartbeat(agent: Dict[str, Any] = Depends(verify_agent_token)):
    db = Config().get_db()
    db["network_hosts"].update(agent["hostname"], {
        "last_heartbeat": datetime.now().isoformat(),
        "status": "active"
    })
    return {"status": "success"}

# ----------------------------------------------------
# UI / Dashboard Endpoints
# ----------------------------------------------------
@app.get("/hosts")
def list_hosts():
    init_db()
    db = Config().get_db()
    
    # Check for stalled hosts (heartbeat older than 3 minutes)
    now = datetime.now()
    hosts = list(db["network_hosts"].rows)
    
    updated_hosts = []
    for host in hosts:
        last_hb = host.get("last_heartbeat")
        current_status = host.get("status", "offline")
        
        if last_hb:
            try:
                hb_time = datetime.fromisoformat(last_hb)
                if now - hb_time > timedelta(minutes=3):
                    current_status = "stalled"
                    db["network_hosts"].update(host["hostname"], {"status": "stalled"})
            except Exception:
                pass
                
        host["status"] = current_status
        updated_hosts.append(host)
        
    return {"hosts": updated_hosts}

@app.get("/hosts/{hostname}/telemetry")
def get_host_telemetry(hostname: str):
    db = Config().get_db()
    host_rows = list(db["network_hosts"].rows_where("hostname = ?", [hostname]))
    if not host_rows:
        raise HTTPException(status_code=404, detail="Host not found")
        
    # Query current services
    services = list(db["network_services"].rows_where("hostname = ?", [hostname]))
    
    # Query last 30 metrics entries
    history = list(db["network_telemetry_history"].rows_where(
        "hostname = ?", [hostname], order_by="timestamp DESC", limit=30
    ))
    
    return {
        "host": host_rows[0],
        "services": services,
        "history": history
    }

@app.get("/alerts")
def list_alerts(limit: int = 50):
    db = Config().get_db()
    if "network_alerts" not in db.table_names():
        return {"alerts": []}
    alerts = list(db["network_alerts"].rows_where(order_by="timestamp DESC", limit=limit))
    return {"alerts": alerts}

# ----------------------------------------------------
# Remote Task Proxy Endpoints (Server -> Agent API)
# ----------------------------------------------------
async def get_agent_client(hostname: str) -> tuple[str, str]:
    db = Config().get_db()
    rows = list(db["network_hosts"].rows_where("hostname = ?", [hostname]))
    if not rows:
        raise HTTPException(status_code=404, detail="Agent host not found")
    host = rows[0]
    agent_url = f"http://{host['ip_address']}:{host['port']}"
    return agent_url, host["api_token"]

@app.post("/hosts/{hostname}/tasks/run/{name}")
async def proxy_run_task(hostname: str, name: str, params: Dict[str, Any] = {}):
    agent_url, token = await get_agent_client(hostname)
    headers = {"Authorization": f"Bearer {token}"}
    
    async with httpx.AsyncClient() as client:
        try:
            r = await client.post(f"{agent_url}/tasks/run/{name}", json=params, headers=headers, timeout=65.0)
            result = r.json()
            status_str = "success" if r.status_code == 200 else "failed"
            logs = result.get("logs", [result.get("detail", "Unknown error")])
            
            # Log to DB
            log_task_execution(hostname, name, status_str, logs)
            
            if r.status_code != 200:
                raise HTTPException(status_code=r.status_code, detail=result)
            return result
        except httpx.RequestError as e:
            err_msg = f"Failed to connect to agent: {e}"
            log_task_execution(hostname, name, "failed", [err_msg])
            raise HTTPException(status_code=502, detail=err_msg)

@app.post("/hosts/{hostname}/tasks/import")
async def proxy_import_task(hostname: str, payload: Dict[str, Any]):
    agent_url, token = await get_agent_client(hostname)
    headers = {"Authorization": f"Bearer {token}"}
    async with httpx.AsyncClient() as client:
        try:
            r = await client.post(f"{agent_url}/tasks/import", json=payload, headers=headers, timeout=5.0)
            if r.status_code != 200:
                raise HTTPException(status_code=r.status_code, detail=r.json())
            return r.json()
        except httpx.RequestError as e:
            raise HTTPException(status_code=502, detail=f"Failed to connect to agent: {e}")

@app.get("/hosts/{hostname}/tasks/export/{name}")
async def proxy_export_task(hostname: str, name: str):
    agent_url, token = await get_agent_client(hostname)
    headers = {"Authorization": f"Bearer {token}"}
    async with httpx.AsyncClient() as client:
        try:
            r = await client.get(f"{agent_url}/tasks/export/{name}", headers=headers, timeout=5.0)
            if r.status_code != 200:
                raise HTTPException(status_code=r.status_code, detail=r.json())
            return r.json()
        except httpx.RequestError as e:
            raise HTTPException(status_code=502, detail=f"Failed to connect to agent: {e}")

@app.delete("/hosts/{hostname}/tasks/remove/{name}")
async def proxy_remove_task(hostname: str, name: str):
    agent_url, token = await get_agent_client(hostname)
    headers = {"Authorization": f"Bearer {token}"}
    async with httpx.AsyncClient() as client:
        try:
            r = await client.delete(f"{agent_url}/tasks/remove/{name}", headers=headers, timeout=5.0)
            if r.status_code != 200:
                raise HTTPException(status_code=r.status_code, detail=r.json())
            return r.json()
        except httpx.RequestError as e:
            raise HTTPException(status_code=502, detail=f"Failed to connect to agent: {e}")

@app.get("/hosts/{hostname}/tasks")
async def proxy_list_tasks(hostname: str):
    agent_url, token = await get_agent_client(hostname)
    headers = {"Authorization": f"Bearer {token}"}
    async with httpx.AsyncClient() as client:
        try:
            r = await client.get(f"{agent_url}/tasks", headers=headers, timeout=5.0)
            if r.status_code != 200:
                raise HTTPException(status_code=r.status_code, detail=r.json())
            return r.json()
        except httpx.RequestError as e:
            raise HTTPException(status_code=502, detail=f"Failed to connect to agent: {e}")
