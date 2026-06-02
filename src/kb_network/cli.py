import os
import sys
import json
import time
import secrets
import signal
import subprocess
import logging
from pathlib import Path
from typing import Optional
import typer
import paramiko
from rich.console import Console
from rich.table import Table
import psutil

from kb_core.config import Config
from kb_network.db import init_db

app = typer.Typer(help="kb-network Central Server and Management CLI.")
server_app = typer.Typer(help="Manage the central monitoring relay server.")
agents_app = typer.Typer(help="Manage and interact with remote network agents.")

app.add_typer(server_app, name="server")
app.add_typer(agents_app, name="agents")

console = Console()
PID_FILE = Config.root / "kb-network_server.pid"
LOG_FILE = Config.root / "kb-network_server.log"

def load_server_config() -> dict:
    config_file = Config.configs_dir / "kb-network.json"
    if config_file.exists():
        try:
            with open(config_file, "r") as f:
                return json.load(f)
        except Exception:
            pass
    return {
        "host": "0.0.0.0",
        "port": 8082,
        "gotify_url": "",
        "gotify_token": "",
        "ollama_host": "http://localhost:11434"
    }

def save_server_config(config: dict):
    Config.configs_dir.mkdir(parents=True, exist_ok=True)
    config_file = Config.configs_dir / "kb-network.json"
    with open(config_file, "w") as f:
        json.dump(config, f, indent=2)

def is_pid_running(pid: int) -> bool:
    return psutil.pid_exists(pid)

# ----------------------------------------------------
# Server Service Management Commands
# ----------------------------------------------------
@server_app.command(name="start")
def server_start():
    """Starts the central monitoring server in the background."""
    if PID_FILE.exists():
        try:
            pid = int(PID_FILE.read_text().strip())
            if is_pid_running(pid):
                console.print(f"[yellow]Server is already running (PID: {pid}).[/yellow]")
                raise typer.Exit()
        except ValueError:
            pass

    console.print("Starting kb-network central server...")
    python_exe = sys.executable
    
    if sys.platform == "win32":
        # Resolve pythonw from virtual environment prefix first
        venv_pythonw = Path(sys.prefix) / "Scripts" / "pythonw.exe"
        venv_python = Path(sys.prefix) / "Scripts" / "python.exe"
        if venv_pythonw.exists():
            pythonw = str(venv_pythonw)
        elif venv_python.exists():
            pythonw = str(venv_python)
        else:
            pythonw = sys.executable.replace("python.exe", "pythonw.exe")
            if not os.path.exists(pythonw):
                pythonw = sys.executable
        
        DETACHED_PROCESS = 0x00000008
        startup_log = open(Config.root / "kb-network_startup_error.log", "w", encoding="utf-8")
        proc = subprocess.Popen(
            [pythonw, "-m", "kb_network.cli", "run-server-foreground"],
            stdout=startup_log,
            stderr=startup_log,
            creationflags=DETACHED_PROCESS
        )
        pid = proc.pid
    else:
        proc = subprocess.Popen(
            [python_exe, "-m", "kb_network.cli", "run-server-foreground"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            preexec_fn=os.setpgrp,
            close_fds=True
        )
        pid = proc.pid

    PID_FILE.write_text(str(pid))
    console.print(f"[green]Central server started in background (PID: {pid}).[/green]")

@server_app.command(name="stop")
def server_stop():
    """Stops the background central monitoring server."""
    if not PID_FILE.exists():
        console.print("[yellow]No server PID file found. Is it running?[/yellow]")
        return
        
    try:
        pid = int(PID_FILE.read_text().strip())
        if is_pid_running(pid):
            console.print(f"Stopping server (PID: {pid})...")
            if sys.platform == "win32":
                subprocess.run(["taskkill", "/F", "/PID", str(pid)], capture_output=True)
            else:
                os.kill(pid, signal.SIGTERM)
            
            # Wait for shutdown
            for _ in range(5):
                if not is_pid_running(pid):
                    break
                time.sleep(0.5)
            console.print("[green]Server stopped.[/green]")
        else:
            console.print("[yellow]Server process not active.[/yellow]")
    except Exception as e:
        console.print(f"[red]Error stopping server: {e}[/red]")
    finally:
        if PID_FILE.exists():
            PID_FILE.unlink()

@server_app.command(name="restart")
def server_restart():
    """Restarts the central monitoring server."""
    server_stop()
    time.sleep(1)
    server_start()

@server_app.command(name="status")
def server_status():
    """Checks the status of the central server."""
    if PID_FILE.exists():
        try:
            pid = int(PID_FILE.read_text().strip())
            if is_pid_running(pid):
                console.print(f"[green]kb-network server is running (PID: {pid}).[/green]")
                return
        except ValueError:
            pass
    console.print("[red]kb-network server is stopped.[/red]")

@server_app.command(name="logs")
def server_logs(lines: int = typer.Option(50, help="Number of lines to show.")):
    """Shows the central server log output."""
    if not LOG_FILE.exists():
        console.print("[yellow]No log file found.[/yellow]")
        return
    with open(LOG_FILE, "r") as f:
        log_lines = f.readlines()
        for line in log_lines[-lines:]:
            print(line, end="")

@app.command(hidden=True)
def run_server_foreground():
    """Runs the central server in the foreground. Logging output is piped to LOG_FILE."""
    log_formatter = logging.Formatter("%(asctime)s [%(levelname)s] %(message)s")
    file_handler = logging.FileHandler(LOG_FILE)
    file_handler.setFormatter(log_formatter)
    
    root_logger = logging.getLogger()
    root_logger.setLevel(logging.INFO)
    root_logger.addHandler(file_handler)
    
    config = load_server_config()
    import uvicorn
    logger = logging.getLogger("uvicorn")
    logger.addHandler(file_handler)
    
    uvicorn.run("kb_network.server:app", host=config["host"], port=config["port"], log_level="info")

# ----------------------------------------------------
# Desktop Command
# ----------------------------------------------------
@app.command()
def desktop():
    """Launches the Electron desktop application as a separate background process."""
    desktop_dir = Path(__file__).resolve().parent.parent.parent / "desktop"
    if not desktop_dir.exists():
        console.print("[red]Electron desktop source directory not found.[/red]")
        raise typer.Exit(1)
        
    console.print("Launching desktop client...")
    if sys.platform == "win32":
        # Launch using npm start, fully detached
        proc = subprocess.Popen(
            ["npm", "start"],
            cwd=str(desktop_dir),
            shell=True,
            creationflags=subprocess.CREATE_NEW_PROCESS_GROUP
        )
    else:
        proc = subprocess.Popen(
            ["npm", "start"],
            cwd=str(desktop_dir),
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            preexec_fn=os.setpgrp
        )
    console.print("[green]Desktop process detached.[/green]")

# ----------------------------------------------------
# Agents Management Commands
# ----------------------------------------------------
@agents_app.command(name="ls")
def agents_list():
    """Lists all configured agents."""
    init_db()
    db = Config().get_db()
    if "network_hosts" not in db.table_names():
        console.print("No agents configured yet.")
        return
        
    hosts = list(db["network_hosts"].rows)
    if not hosts:
        console.print("No agents configured yet.")
        return

    table = Table(title="Configured Network Agents")
    table.add_column("Hostname", style="cyan")
    table.add_column("IP Address", style="magenta")
    table.add_column("OS", style="green")
    table.add_column("Status")
    table.add_column("Last Heartbeat")
    
    for h in hosts:
        status_style = "green" if h["status"] == "active" else ("yellow" if h["status"] == "stalled" else "red")
        table.add_row(
            h["hostname"],
            f"{h['ip_address']}:{h['port']}",
            h["os_name"],
            f"[{status_style}]{h['status']}[/{status_style}]",
            h["last_heartbeat"] or "Never"
        )
    console.print(table)

@agents_app.command(name="add")
def agents_add(
    remote_host: str = typer.Argument(..., help="Format: [user]@[ip_address]"),
    password: str = typer.Argument(..., help="SSH Password for bootstrapping agent"),
    port: int = typer.Option(8081, help="Local agent port"),
    server_ip: Optional[str] = typer.Option(None, help="IP address of this server visible to the agent")
):
    """Bootstraps a remote agent via SSH, configures it, and registers it locally."""
    if "@" not in remote_host:
        console.print("[red]Format must be user@ip_address[/red]")
        raise typer.Exit(1)
        
    user, ip = remote_host.split("@", 1)
    api_token = secrets.token_hex(16)
    
    # Resolve server IP
    if not server_ip:
        import socket
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            s.connect(("8.8.8.8", 80))
            server_ip = s.getsockname()[0]
            s.close()
        except Exception:
            server_ip = "localhost"

    server_config = load_server_config()
    server_url = f"http://{server_ip}:{server_config['port']}"
    
    console.print(f"Connecting to {remote_host} via SSH...")
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    try:
        ssh.connect(ip, username=user, password=password, timeout=15)
    except Exception as e:
        console.print(f"[red]SSH connection failed: {e}[/red]")
        raise typer.Exit(1)

    # 1. Install check
    console.print("Checking if kb-network-agent is installed...")
    stdin, stdout, stderr = ssh.exec_command("kb-network-agent --help")
    exit_status = stdout.channel.recv_exit_status()
    
    if exit_status != 0:
        console.print("Installing kb-network-agent via uv...")
        # Check if uv is present, otherwise fallback to pip
        stdin, stdout, stderr = ssh.exec_command("uv --version")
        uv_status = stdout.channel.recv_exit_status()
        if uv_status == 0:
            cmd = "uv tool install git+https://github.com/Willmo103/kb-network-agent.git --force"
        else:
            cmd = "pip install git+https://github.com/Willmo103/kb-network-agent.git --break-system-packages"
        
        stdin, stdout, stderr = ssh.exec_command(cmd)
        install_status = stdout.channel.recv_exit_status()
        if install_status != 0:
            console.print(f"[red]Installation failed:\n{stderr.read().decode()}[/red]")
            ssh.close()
            raise typer.Exit(1)
        console.print("[green]kb-network-agent successfully installed.[/green]")

    # 2. Run config installer on agent
    console.print("Configuring agent settings...")
    install_cmd = f"kb-network-agent install --server-url {server_url} --api-token {api_token} --port {port} --interval 60"
    stdin, stdout, stderr = ssh.exec_command(install_cmd)
    config_status = stdout.channel.recv_exit_status()
    if config_status != 0:
        console.print(f"[red]Failed to configure agent:\n{stderr.read().decode()}[/red]")
        ssh.close()
        raise typer.Exit(1)

    # 3. Start daemon
    console.print("Starting agent background daemon...")
    stdin, stdout, stderr = ssh.exec_command("kb-network-agent start")
    start_status = stdout.channel.recv_exit_status()
    if start_status != 0:
        console.print(f"[red]Failed to start agent background service:\n{stderr.read().decode()}[/red]")
        ssh.close()
        raise typer.Exit(1)
        
    # Get hostname
    stdin, stdout, stderr = ssh.exec_command("hostname")
    hostname = stdout.read().decode().strip() or ip

    ssh.close()
    
    # 4. Save to central server DB
    init_db()
    db = Config().get_db()
    db["network_hosts"].upsert({
        "hostname": hostname,
        "ip_address": ip,
        "mac_address": "",
        "user": user,
        "os_name": "Unknown",
        "os_version": "Unknown",
        "cpu_percent": 0.0,
        "cpu_cores": 1,
        "ram_total": 0,
        "ram_used": 0,
        "ram_free": 0,
        "last_heartbeat": None,
        "api_token": api_token,
        "port": port,
        "status": "active"
    }, pk="hostname")
    
    console.print(f"[green]Successfully added agent '{hostname}' ({ip}:{port})![/green]")

@agents_app.command(name="exec")
def agents_exec(
    hostname: str = typer.Argument(..., help="Name of agent to run command on"),
    cmd: str = typer.Argument(..., help="Command string to run")
):
    """Executes a command on the remote agent host via SSH."""
    db = Config().get_db()
    rows = list(db["network_hosts"].rows_where("hostname = ?", [hostname]))
    if not rows:
        console.print(f"[red]Agent host '{hostname}' not found in database.[/red]")
        raise typer.Exit(1)
    host = rows[0]
    
    console.print(f"Connecting to {host['user']}@{host['ip_address']}...")
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    try:
        # Prompt for password or use keys
        password = typer.prompt("Enter SSH Password", hide_input=True)
        ssh.connect(host["ip_address"], username=host["user"], password=password, timeout=15)
        
        console.print(f"Running command: {cmd}")
        stdin, stdout, stderr = ssh.exec_command(cmd)
        exit_status = stdout.channel.recv_exit_status()
        
        console.print("Output:")
        print(stdout.read().decode())
        if exit_status != 0:
            console.print("Errors:")
            console.print(stderr.read().decode(), style="red")
        
        ssh.close()
    except Exception as e:
        console.print(f"[red]Execution failed: {e}[/red]")
        raise typer.Exit(1)

@agents_app.command(name="update")
def agents_update(hostname: str):
    """Forces the remote agent to perform an update and restart."""
    db = Config().get_db()
    rows = list(db["network_hosts"].rows_where("hostname = ?", [hostname]))
    if not rows:
        console.print(f"[red]Agent host '{hostname}' not found in database.[/red]")
        raise typer.Exit(1)
    host = rows[0]
    
    console.print(f"Connecting to {host['user']}@{host['ip_address']} to update...")
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    try:
        password = typer.prompt("Enter SSH Password", hide_input=True)
        ssh.connect(host["ip_address"], username=host["user"], password=password, timeout=15)
        
        console.print("Running agent update...")
        stdin, stdout, stderr = ssh.exec_command("kb-network-agent update")
        exit_status = stdout.channel.recv_exit_status()
        if exit_status == 0:
            console.print("Restarting agent daemon...")
            ssh.exec_command("kb-network-agent restart")
            console.print("[green]Agent updated successfully.[/green]")
        else:
            console.print(f"[red]Update failed:\n{stderr.read().decode()}[/red]")
        ssh.close()
    except Exception as e:
        console.print(f"[red]Update failed: {e}[/red]")
        raise typer.Exit(1)

if __name__ == "__main__":
    app()
