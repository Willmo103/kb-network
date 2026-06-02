import React, { useState, useEffect } from 'react';
import { 
  Server, Monitor, ShieldAlert, Settings, RefreshCw, Cpu, Database, HardDrive, 
  Terminal, Search, ChevronDown, ChevronUp, AlertCircle, Play, FileJson, 
  Trash2, Download, Upload, CheckCircle, XCircle, Info, Moon, Sun, X
} from 'lucide-react';

export default function App() {
  const [hosts, setHosts] = useState([]);
  const [selectedHost, setSelectedHost] = useState(null);
  const [hostTelemetry, setHostTelemetry] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [view, setView] = useState('dashboard'); // dashboard, settings, alerts
  
  // Sidebar Search
  const [searchQuery, setSearchQuery] = useState('');
  
  // Theme state
  const [darkMode, setDarkMode] = useState(false);
  
  // Service accordions toggle states
  const [openAccordion, setOpenAccordion] = useState({
    docker: true,
    ollama: true,
    databases: true
  });
  
  // Config state
  const [config, setConfig] = useState({
    host: '0.0.0.0',
    port: 8082,
    gotify_url: '',
    gotify_token: '',
    ollama_host: 'http://localhost:11434'
  });
  
  // Tasks management state
  const [remoteTasks, setRemoteTasks] = useState([]);
  const [selectedTask, setSelectedTask] = useState(null);
  const [taskParams, setTaskParams] = useState({});
  const [taskLogs, setTaskLogs] = useState([]);
  const [isExecutingTask, setIsExecutingTask] = useState(false);
  const [importJsonText, setImportJsonText] = useState('');
  const [importErrors, setImportErrors] = useState([]);
  const [importSuccess, setImportSuccess] = useState('');
  const [isRightBarOpen, setIsRightBarOpen] = useState(true);
  
  // Live polling timer
  const [pollingTimer, setPollingTimer] = useState(null);

  // Initialize UI & load lists
  useEffect(() => {
    loadHosts();
    loadAlerts();
    loadConfig();
    
    // Auto-poll hosts list every 10 seconds
    const interval = setInterval(() => {
      loadHosts();
      loadAlerts();
    }, 10000);
    
    return () => clearInterval(interval);
  }, []);

  // Poll selected host telemetry
  useEffect(() => {
    if (selectedHost) {
      loadHostDetails(selectedHost);
      loadRemoteTasks(selectedHost);
      
      if (pollingTimer) clearInterval(pollingTimer);
      
      const timer = setInterval(() => {
        loadHostDetails(selectedHost);
      }, 5000); // quick poll for details
      setPollingTimer(timer);
      
      return () => clearInterval(timer);
    }
  }, [selectedHost]);

  // Loaders
  const loadHosts = async () => {
    if (window.api && window.api.getHosts) {
      try {
        const list = await window.api.getHosts();
        setHosts(list || []);
        // Auto select first host if none selected
        if (list && list.length > 0 && !selectedHost) {
          setSelectedHost(list[0].hostname);
        }
      } catch (err) {
        console.error('Failed to load hosts:', err);
      }
    } else {
      // Mock data for dev server/browser mode
      const mockHosts = [
        { hostname: 'homeserver-01', ip_address: '192.168.1.100', status: 'active', os_name: 'Linux', os_version: 'Ubuntu 24.04', ram_total: 17179869184, ram_used: 8589934592, cpu_percent: 12.4, last_heartbeat: new Date().toISOString() },
        { hostname: 'nas-backup', ip_address: '192.168.1.105', status: 'stalled', os_name: 'Linux', os_version: 'Debian 12', ram_total: 8589934592, ram_used: 7100000000, cpu_percent: 85.1, last_heartbeat: new Date(Date.now() - 200000).toISOString() },
        { hostname: 'will-desktop', ip_address: '192.168.1.50', status: 'offline', os_name: 'Windows', os_version: 'Windows 11', ram_total: 34359738368, ram_used: 12000000000, cpu_percent: 0.0, last_heartbeat: new Date(Date.now() - 500000).toISOString() }
      ];
      setHosts(mockHosts);
      if (!selectedHost) setSelectedHost(mockHosts[0].hostname);
    }
  };

  const loadHostDetails = async (hostname) => {
    if (window.api && window.api.getHostTelemetry) {
      try {
        const details = await window.api.getHostTelemetry(hostname);
        setHostTelemetry(details);
      } catch (err) {
        console.error('Failed to load host details:', err);
      }
    } else {
      // Mock host details
      const mockHistory = Array.from({ length: 15 }, (_, i) => ({
        timestamp: new Date(Date.now() - i * 60000).toISOString(),
        cpu_percent: Math.random() * 30 + 10,
        ram_percent: 50 + Math.random() * 5,
        disk_percent: 64.2
      })).reverse();

      const mockServices = [
        { service_type: 'docker', name: 'Docker Daemon v27.0.2', status: 'running', details: JSON.stringify({ version: '27.0.2', active_count: 2, total_count: 3 }) },
        { service_type: 'docker_container', name: 'nginx-reverse-proxy', status: 'running', details: JSON.stringify({ image: 'nginx:alpine', status: 'running', state: 'running' }) },
        { service_type: 'docker_container', name: 'postgres-db', status: 'running', details: JSON.stringify({ image: 'postgres:15', status: 'running', state: 'running' }) },
        { service_type: 'docker_container', name: 'redis-cache', status: 'exited', details: JSON.stringify({ image: 'redis:latest', status: 'exited', state: 'exited' }) },
        { service_type: 'ollama', name: 'Ollama v0.1.48', status: 'running', details: JSON.stringify({ version: '0.1.48', models: [{ name: 'gemma4:latest', size: 5200000000, format: 'gguf', family: 'gemma' }] }) },
        { service_type: 'database', name: 'postgresql', status: 'running', details: JSON.stringify({ type: 'postgresql', running: true }) },
        { service_type: 'database', name: 'redis', status: 'stopped', details: JSON.stringify({ type: 'redis', running: false }) }
      ];

      setHostTelemetry({
        host: hosts.find(h => h.hostname === hostname) || hosts[0],
        services: mockServices,
        history: mockHistory
      });
    }
  };

  const loadAlerts = async () => {
    if (window.api && window.api.getAlerts) {
      try {
        const list = await window.api.getAlerts(50);
        setAlerts(list || []);
      } catch (err) {
        console.error('Failed to load alerts:', err);
      }
    } else {
      setAlerts([
        { hostname: 'nas-backup', message: 'Host nas-backup has high RAM usage: 88.5%', severity: 'warning', timestamp: new Date().toISOString() },
        { hostname: 'will-desktop', message: 'Agent disconnected: will-desktop', severity: 'critical', timestamp: new Date(Date.now() - 300000).toISOString() }
      ]);
    }
  };

  const loadConfig = async () => {
    if (window.api && window.api.getCentralConfig) {
      try {
        const cfg = await window.api.getCentralConfig();
        if (cfg) setConfig(cfg);
      } catch (err) {
        console.error('Failed to load config:', err);
      }
    }
  };

  const saveConfig = async () => {
    if (window.api && window.api.saveCentralConfig) {
      try {
        const res = await window.api.saveCentralConfig(config);
        if (res.status === 'success') {
          alert('Configuration saved successfully!');
        } else {
          alert(`Failed to save configuration: ${res.message}`);
        }
      } catch (err) {
        console.error('Failed to save config:', err);
      }
    }
  };

  // Remote Tasks commands
  const loadRemoteTasks = async (hostname) => {
    if (window.api && window.api.listRemoteTasks) {
      try {
        const res = await window.api.listRemoteTasks(hostname);
        setRemoteTasks(res.tasks || []);
      } catch (err) {
        console.error('Failed to load tasks:', err);
      }
    } else {
      setRemoteTasks([
        { name: 'update_nginx_port', version: '1.0.0', description: 'Updates the Nginx port on a specified host.', target: { type: 'host' } }
      ]);
    }
  };

  const executeTask = async () => {
    if (!selectedTask || !selectedHost) return;
    setIsExecutingTask(true);
    setTaskLogs(['[Client] Dispatching execution request to central server...']);
    
    if (window.api && window.api.runRemoteTask) {
      try {
        const res = await window.api.runRemoteTask(selectedHost, selectedTask.name, taskParams);
        setTaskLogs(res.logs || ['Task execution finished.']);
      } catch (err) {
        const errMsg = err.detail?.detail?.errors || err.message || JSON.stringify(err);
        setTaskLogs(prev => [...prev, `[ERROR] Execution failed: ${JSON.stringify(errMsg)}`]);
      }
    } else {
      setTimeout(() => {
        setTaskLogs([
          'Starting execution of task \'update_nginx_port\' (v1.0.0)',
          'Running Action 1/1 (script)',
          'Stdout:\nReplacement accomplished successfully.',
          'Running Validation Script...',
          'Validation Result (Exit code: 0):\nStdout:\nWelcome to Nginx on port 8080 verified.',
          'Task finished. Status: SUCCESS'
        ]);
      }, 1500);
    }
    setIsExecutingTask(false);
  };

  const importTask = async () => {
    setImportErrors([]);
    setImportSuccess('');
    if (!importJsonText.strip) return;
    
    try {
      const payload = JSON.parse(importJsonText);
      if (window.api && window.api.importRemoteTask) {
        const res = await window.api.importRemoteTask(selectedHost, payload);
        setImportSuccess('Task successfully validated and imported to remote agent!');
        setImportJsonText('');
        loadRemoteTasks(selectedHost);
      } else {
        setImportSuccess('Mock task successfully imported!');
        setImportJsonText('');
      }
    } catch (err) {
      if (err.detail?.detail?.errors) {
        setImportErrors(err.detail.detail.errors);
      } else {
        setImportErrors([err.message || 'JSON formatting error. Check syntax.']);
      }
    }
  };

  const deleteTask = async (taskName) => {
    if (!confirm(`Are you sure you want to delete task "${taskName}"?`)) return;
    if (window.api && window.api.removeRemoteTask) {
      try {
        await window.api.removeRemoteTask(selectedHost, taskName);
        loadRemoteTasks(selectedHost);
        if (selectedTask?.name === taskName) setSelectedTask(null);
      } catch (err) {
        alert(`Failed to delete task: ${err.message}`);
      }
    }
  };

  // UI Helpers
  const formatBytes = (bytes) => {
    if (!bytes || bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const filteredHosts = hosts.filter(h => 
    h.hostname.toLowerCase().includes(searchQuery.toLowerCase()) || 
    h.ip_address.includes(searchQuery)
  );

  return (
    <div className={`h-screen flex flex-col overflow-hidden transition-colors duration-200 ${darkMode ? 'dark bg-retro-bg-dark text-retro-text-dark' : 'bg-retro-bg-light text-retro-text-light'}`}>
      
      {/* Top Header */}
      <header className="h-14 border-b border-retro-border-light dark:border-retro-border-dark flex items-center justify-between px-6 bg-retro-panel-light dark:bg-retro-panel-dark select-none">
        <div className="flex items-center space-x-3">
          <Server className="h-6 w-6 text-retro-orange" />
          <h1 className="text-xl font-bold tracking-wide">kb-network</h1>
          <span className="text-xs bg-retro-border-light dark:bg-retro-border-dark px-2 py-0.5 rounded text-retro-text-light dark:text-retro-text-dark font-mono">v0.1.0</span>
        </div>
        
        <div className="flex items-center space-x-4">
          {view === 'dashboard' && selectedHost && (
            <button 
              onClick={() => setIsRightBarOpen(!isRightBarOpen)}
              className={`p-2 rounded transition-colors ${isRightBarOpen ? 'text-retro-orange bg-retro-border-light dark:bg-retro-border-dark' : 'hover:bg-retro-border-light dark:hover:bg-retro-border-dark'}`}
              title="Toggle Task Runner"
            >
              <Terminal className="h-5 w-5" />
            </button>
          )}
          <button 
            onClick={() => setDarkMode(!darkMode)}
            className="p-2 rounded hover:bg-retro-border-light dark:hover:bg-retro-border-dark transition-colors"
          >
            {darkMode ? <Sun className="h-5 w-5 text-retro-yellow" /> : <Moon className="h-5 w-5 text-retro-blue" />}
          </button>
          <button 
            onClick={() => { loadHosts(); loadAlerts(); if(selectedHost) loadHostDetails(selectedHost); }}
            className="p-2 rounded hover:bg-retro-border-light dark:hover:bg-retro-border-dark transition-colors"
          >
            <RefreshCw className="h-5 w-5" />
          </button>
        </div>
      </header>

      {/* Main Container */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* Left Sidebar */}
        <aside className="w-80 border-r border-retro-border-light dark:border-retro-border-dark flex flex-col bg-retro-panel-light dark:bg-retro-panel-dark">
          
          {/* View Selection tabs */}
          <div className="flex border-b border-retro-border-light dark:border-retro-border-dark text-sm">
            <button 
              onClick={() => setView('dashboard')}
              className={`flex-1 py-3 text-center font-medium border-b-2 transition-colors ${view === 'dashboard' ? 'border-retro-orange text-retro-orange bg-retro-bg-light dark:bg-retro-bg-dark' : 'border-transparent hover:bg-retro-border-light dark:hover:bg-retro-border-dark'}`}
            >
              Hosts
            </button>
            <button 
              onClick={() => setView('alerts')}
              className={`flex-1 py-3 text-center font-medium border-b-2 transition-colors flex items-center justify-center space-x-1 ${view === 'alerts' ? 'border-retro-orange text-retro-orange bg-retro-bg-light dark:bg-retro-bg-dark' : 'border-transparent hover:bg-retro-border-light dark:hover:bg-retro-border-dark'}`}
            >
              <span>Alerts</span>
              {alerts.length > 0 && (
                <span className="bg-retro-red text-white text-xxs px-1.5 py-0.5 rounded-full font-bold">{alerts.length}</span>
              )}
            </button>
            <button 
              onClick={() => setView('settings')}
              className={`flex-1 py-3 text-center font-medium border-b-2 transition-colors ${view === 'settings' ? 'border-retro-orange text-retro-orange bg-retro-bg-light dark:bg-retro-bg-dark' : 'border-transparent hover:bg-retro-border-light dark:hover:bg-retro-border-dark'}`}
            >
              Settings
            </button>
          </div>

          {/* Search Box */}
          <div className="p-3 border-b border-retro-border-light dark:border-retro-border-dark">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-retro-border-light dark:text-retro-border-dark" />
              <input 
                type="text"
                placeholder="Search hosts..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 text-sm rounded bg-retro-bg-light dark:bg-retro-bg-dark border border-retro-border-light dark:border-retro-border-dark focus:outline-none focus:border-retro-orange"
              />
            </div>
          </div>

          {/* Hosts List */}
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {filteredHosts.map((h) => {
              const isActive = selectedHost === h.hostname;
              let dotColor = 'bg-retro-red';
              if (h.status === 'active') dotColor = 'bg-retro-green';
              else if (h.status === 'stalled') dotColor = 'bg-retro-yellow';

              return (
                <button
                  key={h.hostname}
                  onClick={() => { setSelectedHost(h.hostname); setView('dashboard'); }}
                  className={`w-full flex items-center justify-between p-3 rounded transition-colors text-left ${isActive ? 'bg-retro-bg-light dark:bg-retro-bg-dark border-l-4 border-retro-orange' : 'hover:bg-retro-bg-light dark:hover:bg-retro-bg-dark border-l-4 border-transparent'}`}
                >
                  <div className="truncate pr-2">
                    <div className="font-bold truncate">{h.hostname}</div>
                    <div className="text-xs opacity-60 truncate">{h.ip_address}</div>
                  </div>
                  <div className="flex items-center space-x-2 flex-shrink-0">
                    <span className="text-xxs uppercase tracking-wider font-semibold opacity-60">{h.status}</span>
                    <span className={`h-2.5 w-2.5 rounded-full ${dotColor}`} />
                  </div>
                </button>
              );
            })}
            {filteredHosts.length === 0 && (
              <div className="text-center py-8 text-sm opacity-60">No hosts found</div>
            )}
          </div>
        </aside>

        {/* Center Panel (Host Details / Views) */}
        <main className="flex-1 flex flex-col overflow-hidden bg-retro-bg-light dark:bg-retro-bg-dark">
          
          {view === 'settings' && (
            <div className="flex-1 overflow-y-auto p-8 space-y-6">
              <h2 className="text-2xl font-bold border-b border-retro-border-light dark:border-retro-border-dark pb-2">Central Server Configuration</h2>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-2xl">
                <div>
                  <label className="block text-sm font-medium mb-1">Central Server Port</label>
                  <input 
                    type="number"
                    value={config.port}
                    onChange={(e) => setConfig({ ...config, port: parseInt(e.target.value) || 8080 })}
                    className="w-full p-2.5 rounded bg-retro-panel-light dark:bg-retro-panel-dark border border-retro-border-light dark:border-retro-border-dark focus:outline-none focus:border-retro-orange"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Ollama Host endpoint</label>
                  <input 
                    type="text"
                    value={config.ollama_host}
                    onChange={(e) => setConfig({ ...config, ollama_host: e.target.value })}
                    className="w-full p-2.5 rounded bg-retro-panel-light dark:bg-retro-panel-dark border border-retro-border-light dark:border-retro-border-dark focus:outline-none focus:border-retro-orange"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Gotify Notifications URL</label>
                  <input 
                    type="text"
                    placeholder="e.g. http://localhost:8088"
                    value={config.gotify_url}
                    onChange={(e) => setConfig({ ...config, gotify_url: e.target.value })}
                    className="w-full p-2.5 rounded bg-retro-panel-light dark:bg-retro-panel-dark border border-retro-border-light dark:border-retro-border-dark focus:outline-none focus:border-retro-orange"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Gotify App Token</label>
                  <input 
                    type="password"
                    placeholder="Gotify app credentials token"
                    value={config.gotify_token}
                    onChange={(e) => setConfig({ ...config, gotify_token: e.target.value })}
                    className="w-full p-2.5 rounded bg-retro-panel-light dark:bg-retro-panel-dark border border-retro-border-light dark:border-retro-border-dark focus:outline-none focus:border-retro-orange"
                  />
                </div>
              </div>
              
              <button 
                onClick={saveConfig}
                className="bg-retro-orange text-white px-5 py-2.5 rounded font-medium hover:opacity-90 transition-opacity"
              >
                Save Settings
              </button>
            </div>
          )}

          {view === 'alerts' && (
            <div className="flex-1 overflow-y-auto p-8 space-y-6">
              <div className="flex items-center space-x-2">
                <ShieldAlert className="h-6 w-6 text-retro-red" />
                <h2 className="text-2xl font-bold">Network Anomalies & Alerts</h2>
              </div>
              
              <div className="space-y-3 max-w-4xl">
                {alerts.map((alert, idx) => (
                  <div 
                    key={idx} 
                    className={`flex items-start space-x-3 p-4 rounded border ${alert.severity === 'critical' ? 'bg-retro-red/10 border-retro-red text-retro-red' : 'bg-retro-orange/10 border-retro-orange text-retro-orange'}`}
                  >
                    <AlertCircle className="h-5 w-5 mt-0.5 flex-shrink-0" />
                    <div className="flex-1">
                      <div className="font-bold flex items-center justify-between">
                        <span>{alert.hostname}</span>
                        <span className="text-xs font-mono opacity-80">{new Date(alert.timestamp).toLocaleTimeString()}</span>
                      </div>
                      <p className="text-sm mt-1">{alert.message}</p>
                    </div>
                  </div>
                ))}
                {alerts.length === 0 && (
                  <div className="text-center py-12 opacity-60">No active alerts logged. System is operating normally.</div>
                )}
              </div>
            </div>
          )}

          {view === 'dashboard' && hostTelemetry && (
            <div className="flex-1 flex overflow-hidden">
              
              {/* Central Telemetry pane */}
              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                
                {/* Host Title & Specs Grid */}
                <div className="bg-retro-panel-light dark:bg-retro-panel-dark p-6 rounded border border-retro-border-light dark:border-retro-border-dark shadow-sm">
                  <div className="flex items-center justify-between mb-4 border-b border-retro-border-light dark:border-retro-border-dark pb-2">
                    <h2 className="text-2xl font-bold flex items-center space-x-2">
                      <Monitor className="h-6 w-6 text-retro-blue" />
                      <span>{hostTelemetry.host.hostname}</span>
                    </h2>
                    <span className="text-sm font-mono opacity-80">Last update: {new Date(hostTelemetry.host.last_heartbeat).toLocaleTimeString()}</span>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <span className="opacity-60 block">IP Address</span>
                      <span className="font-semibold">{hostTelemetry.host.ip_address}</span>
                    </div>
                    <div>
                      <span className="opacity-60 block">OS / Kernel</span>
                      <span className="font-semibold">{hostTelemetry.host.os_name} ({hostTelemetry.host.os_version})</span>
                    </div>
                    <div>
                      <span className="opacity-60 block">Logical CPU Cores</span>
                      <span className="font-semibold flex items-center space-x-1">
                        <Cpu className="h-4 w-4 text-retro-orange inline" />
                        <span>{hostTelemetry.host.cpu_cores} cores</span>
                      </span>
                    </div>
                    <div>
                      <span className="opacity-60 block">System Memory (RAM)</span>
                      <span className="font-semibold">{formatBytes(hostTelemetry.host.ram_total)}</span>
                    </div>
                  </div>
                </div>

                {/* History Mini Graphs */}
                {hostTelemetry.history && hostTelemetry.history.length > 0 && (
                  <div className="bg-retro-panel-light dark:bg-retro-panel-dark p-6 rounded border border-retro-border-light dark:border-retro-border-dark shadow-sm">
                    <h3 className="font-bold text-lg mb-4 flex items-center space-x-2">
                      <Server className="h-5 w-5 text-retro-green" />
                      <span>Historical Telemetry Trends</span>
                    </h3>
                    <div className="flex items-end justify-between h-20 space-x-1 pt-4">
                      {hostTelemetry.history.map((metric, idx) => (
                        <div key={idx} className="flex-1 flex flex-col items-center group relative h-full">
                          {/* Mini Bar tooltip */}
                          <div className="absolute bottom-full mb-1 scale-0 group-hover:scale-100 bg-black text-white text-xxs p-1 rounded transition-transform pointer-events-none z-10 w-20 text-center font-mono">
                            CPU: {metric.cpu_percent.toFixed(1)}%<br/>
                            RAM: {metric.ram_percent.toFixed(1)}%
                          </div>
                          {/* CPU Bar */}
                          <div 
                            style={{ height: `${metric.cpu_percent}%` }}
                            className="w-full bg-retro-orange/60 rounded-t-sm hover:opacity-80"
                          />
                          {/* RAM Bar */}
                          <div 
                            style={{ height: `${metric.ram_percent}%` }}
                            className="w-full bg-retro-blue/60 rounded-t-sm hover:opacity-80 mt-0.5"
                          />
                        </div>
                      ))}
                    </div>
                    <div className="flex justify-between text-xxs opacity-60 mt-2 font-mono">
                      <span>{new Date(hostTelemetry.history[0].timestamp).toLocaleTimeString()}</span>
                      <span>Timeline (30 Samples)</span>
                      <span>{new Date(hostTelemetry.history[hostTelemetry.history.length - 1].timestamp).toLocaleTimeString()}</span>
                    </div>
                  </div>
                )}

                {/* Services Expandables */}
                <div className="space-y-3">
                  
                  {/* Docker Stats */}
                  <div className="border border-retro-border-light dark:border-retro-border-dark rounded overflow-hidden">
                    <button 
                      onClick={() => setOpenAccordion({ ...openAccordion, docker: !openAccordion.docker })}
                      className="w-full flex items-center justify-between p-4 bg-retro-panel-light dark:bg-retro-panel-dark font-bold text-sm"
                    >
                      <span className="flex items-center space-x-2">
                        <Database className="h-5 w-5 text-retro-blue" />
                        <span>Docker Container Engine</span>
                      </span>
                      {openAccordion.docker ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </button>
                    {openAccordion.docker && (
                      <div className="p-4 bg-retro-bg-light dark:bg-retro-bg-dark border-t border-retro-border-light dark:border-retro-border-dark space-y-3">
                        {hostTelemetry.services.filter(s => s.service_type === 'docker').map((s) => {
                          const det = JSON.parse(s.details || '{}');
                          return (
                            <div key={s.id} className="text-xs bg-retro-panel-light dark:bg-retro-panel-dark p-2 rounded flex justify-between font-mono">
                              <span>Docker Daemon v{det.version}</span>
                              <span className="text-retro-green font-bold">{det.active_count} / {det.total_count} active containers</span>
                            </div>
                          );
                        })}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                          {hostTelemetry.services.filter(s => s.service_type === 'docker_container').map((c) => {
                            const det = JSON.parse(c.details || '{}');
                            const isRunning = c.status === 'running' || det.state === 'running';
                            return (
                              <div key={c.id} className="p-3 bg-retro-panel-light dark:bg-retro-panel-dark rounded flex items-center justify-between">
                                <div>
                                  <div className="font-bold font-mono">{c.name}</div>
                                  <div className="text-xxs opacity-60 font-mono mt-0.5 truncate max-w-xs">{det.image}</div>
                                </div>
                                <span className={`px-2 py-0.5 rounded text-xxs font-mono ${isRunning ? 'bg-retro-green/10 text-retro-green border border-retro-green' : 'bg-retro-red/10 text-retro-red border border-retro-red'}`}>
                                  {c.status}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                        {hostTelemetry.services.filter(s => s.service_type.startsWith('docker')).length === 0 && (
                          <div className="text-center text-xs opacity-60 py-4">Docker engine not detected on host</div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Ollama Stats */}
                  <div className="border border-retro-border-light dark:border-retro-border-dark rounded overflow-hidden">
                    <button 
                      onClick={() => setOpenAccordion({ ...openAccordion, ollama: !openAccordion.ollama })}
                      className="w-full flex items-center justify-between p-4 bg-retro-panel-light dark:bg-retro-panel-dark font-bold text-sm"
                    >
                      <span className="flex items-center space-x-2">
                        <Terminal className="h-5 w-5 text-retro-orange" />
                        <span>Ollama Local AI Models</span>
                      </span>
                      {openAccordion.ollama ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </button>
                    {openAccordion.ollama && (
                      <div className="p-4 bg-retro-bg-light dark:bg-retro-bg-dark border-t border-retro-border-light dark:border-retro-border-dark space-y-3">
                        {hostTelemetry.services.filter(s => s.service_type === 'ollama').map((s) => {
                          const det = JSON.parse(s.details || '{}');
                          return (
                            <div key={s.id} className="space-y-2">
                              <div className="text-xs bg-retro-panel-light dark:bg-retro-panel-dark p-2 rounded flex justify-between font-mono">
                                <span>Ollama Service {det.version}</span>
                                <span className="text-retro-orange font-bold">{det.models?.length || 0} models downloaded</span>
                              </div>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                                {det.models?.map((m, idx) => (
                                  <div key={idx} className="p-3 bg-retro-panel-light dark:bg-retro-panel-dark rounded flex justify-between items-center font-mono">
                                    <div>
                                      <div className="font-bold">{m.name}</div>
                                      <div className="text-xxs opacity-60 mt-0.5">{m.family} | {m.format}</div>
                                    </div>
                                    <span className="text-xxs font-bold opacity-80">{formatBytes(m.size)}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                        {hostTelemetry.services.filter(s => s.service_type === 'ollama').length === 0 && (
                          <div className="text-center text-xs opacity-60 py-4">Ollama service not detected on host</div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Databases accordion */}
                  <div className="border border-retro-border-light dark:border-retro-border-dark rounded overflow-hidden">
                    <button 
                      onClick={() => setOpenAccordion({ ...openAccordion, databases: !openAccordion.databases })}
                      className="w-full flex items-center justify-between p-4 bg-retro-panel-light dark:bg-retro-panel-dark font-bold text-sm"
                    >
                      <span className="flex items-center space-x-2">
                        <Database className="h-5 w-5 text-retro-green" />
                        <span>Databases & Service Ports</span>
                      </span>
                      {openAccordion.databases ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </button>
                    {openAccordion.databases && (
                      <div className="p-4 bg-retro-bg-light dark:bg-retro-bg-dark border-t border-retro-border-light dark:border-retro-border-dark">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                          {hostTelemetry.services.filter(s => s.service_type === 'database').map((db) => {
                            const isRunning = db.status === 'running';
                            return (
                              <div key={db.id} className="p-3 bg-retro-panel-light dark:bg-retro-panel-dark rounded flex flex-col justify-between h-20">
                                <span className="font-bold font-mono capitalize">{db.name}</span>
                                <span className={`w-max px-2 py-0.5 rounded text-xxs font-mono ${isRunning ? 'bg-retro-green/10 text-retro-green border border-retro-green' : 'bg-retro-red/10 text-retro-red border border-retro-red'}`}>
                                  {db.status}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                        {hostTelemetry.services.filter(s => s.service_type === 'database').length === 0 && (
                          <div className="text-center text-xs opacity-60 py-4">No active database ports detected on host</div>
                        )}
                      </div>
                    )}
                  </div>

                </div>

              </div>

              {/* Right Panel (Task Runner & Imports) */}
              <div className={`border-l border-retro-border-light dark:border-retro-border-dark bg-retro-panel-light dark:bg-retro-panel-dark flex flex-col overflow-hidden transition-all duration-200 ${isRightBarOpen ? 'w-96' : 'w-0 border-l-0'}`}>
                <div className="w-96 flex flex-col h-full flex-shrink-0">
                  <div className="p-4 border-b border-retro-border-light dark:border-retro-border-dark flex items-center justify-between">
                    <h3 className="font-bold flex items-center space-x-2">
                      <Terminal className="h-5 w-5 text-retro-orange" />
                      <span>Agent Task Runner</span>
                    </h3>
                    <div className="flex items-center space-x-3">
                      <button 
                        onClick={() => { setSelectedTask(null); setImportJsonText(''); setImportSuccess(''); setImportErrors([]); }}
                        className="text-xs hover:text-retro-orange transition-colors flex items-center space-x-1"
                        title="Import Task Specification"
                      >
                        <Upload className="h-3 w-3" />
                        <span>Import</span>
                      </button>
                      <button 
                        onClick={() => setIsRightBarOpen(false)}
                        className="p-1 hover:bg-retro-border-light dark:hover:bg-retro-border-dark rounded transition-colors text-retro-text-light dark:text-retro-text-dark"
                        title="Collapse Sidebar"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                {/* Switch task view */}
                {!selectedTask ? (
                  /* Import & List View */
                  <div className="flex-1 overflow-y-auto p-4 space-y-4 flex flex-col">
                    <div>
                      <h4 className="text-xs font-semibold uppercase tracking-wider opacity-60 mb-2">Available Tasks</h4>
                      <div className="space-y-1">
                        {remoteTasks.map((t) => (
                          <div 
                            key={t.name} 
                            className="group p-3 bg-retro-bg-light dark:bg-retro-bg-dark rounded border border-retro-border-light dark:border-retro-border-dark hover:border-retro-orange transition-colors cursor-pointer flex justify-between items-center"
                            onClick={() => { setSelectedTask(t); setTaskParams({}); setTaskLogs([]); }}
                          >
                            <div className="truncate pr-2">
                              <div className="font-bold text-sm truncate">{t.name}</div>
                              <div className="text-xxs opacity-60 mt-0.5 truncate">{t.description}</div>
                            </div>
                            <div className="flex items-center space-x-2 flex-shrink-0">
                              <span className="text-xxs font-mono opacity-80 bg-retro-panel-light dark:bg-retro-panel-dark px-1 py-0.5 rounded">v{t.version}</span>
                              <Trash2 
                                className="h-4 w-4 text-retro-red opacity-0 group-hover:opacity-100 hover:scale-110 transition-all"
                                onClick={(e) => { e.stopPropagation(); deleteTask(t.name); }}
                              />
                            </div>
                          </div>
                        ))}
                        {remoteTasks.length === 0 && (
                          <div className="text-center py-6 text-xs opacity-60">No tasks configured on remote host</div>
                        )}
                      </div>
                    </div>

                    <div className="border-t border-retro-border-light dark:border-retro-border-dark pt-4 flex-1 flex flex-col">
                      <h4 className="text-xs font-semibold uppercase tracking-wider opacity-60 mb-2">Import New Task Specification</h4>
                      <textarea
                        placeholder='Paste task JSON specification here...'
                        value={importJsonText}
                        onChange={(e) => setImportJsonText(e.target.value)}
                        className="w-full flex-1 p-2 rounded bg-retro-bg-light dark:bg-retro-bg-dark border border-retro-border-light dark:border-retro-border-dark focus:outline-none focus:border-retro-orange font-mono text-xs resize-none"
                      />
                      
                      {importErrors.length > 0 && (
                        <div className="mt-3 bg-retro-red/10 border border-retro-red p-2.5 rounded text-retro-red text-xs space-y-1">
                          <div className="font-bold flex items-center space-x-1">
                            <XCircle className="h-4 w-4" />
                            <span>Programmatic Validation Failures:</span>
                          </div>
                          {importErrors.map((err, i) => (
                            <div key={i} className="font-mono text-xxs leading-tight break-all">- {err}</div>
                          ))}
                        </div>
                      )}

                      {importSuccess && (
                        <div className="mt-3 bg-retro-green/10 border border-retro-green p-2.5 rounded text-retro-green text-xs flex items-center space-x-2">
                          <CheckCircle className="h-4 w-4" />
                          <span>{importSuccess}</span>
                        </div>
                      )}

                      <button
                        onClick={importTask}
                        className="w-full mt-3 bg-retro-orange text-white py-2 rounded text-sm font-medium hover:opacity-90 transition-opacity"
                      >
                        Validate & Import
                      </button>
                    </div>
                  </div>
                ) : (
                  /* Task execution Panel */
                  <div className="flex-1 overflow-y-auto p-4 space-y-4 flex flex-col">
                    <div className="flex items-center justify-between border-b border-retro-border-light dark:border-retro-border-dark pb-2">
                      <button 
                        onClick={() => setSelectedTask(null)}
                        className="text-xs hover:text-retro-orange transition-colors"
                      >
                        &larr; Back to tasks
                      </button>
                      <span className="text-xxs font-mono bg-retro-bg-light dark:bg-retro-bg-dark px-1.5 py-0.5 rounded border border-retro-border-light dark:border-retro-border-dark">v{selectedTask.version}</span>
                    </div>

                    <div>
                      <h4 className="font-bold text-sm text-retro-orange">{selectedTask.name}</h4>
                      <p className="text-xs opacity-80 mt-1">{selectedTask.description}</p>
                    </div>

                    {/* Parameters Forms */}
                    {selectedTask.parameters && Object.keys(selectedTask.parameters).length > 0 && (
                      <div className="bg-retro-bg-light dark:bg-retro-bg-dark p-3 rounded border border-retro-border-light dark:border-retro-border-dark space-y-3">
                        <div className="text-xs font-semibold opacity-60">Task Parameters</div>
                        {Object.entries(selectedTask.parameters).map(([pName, pSpec]) => (
                          <div key={pName} className="space-y-1">
                            <label className="text-xxs font-bold block capitalize">
                              {pName} {pSpec.required && <span className="text-retro-red">*</span>}
                            </label>
                            <input 
                              type={pSpec.type === 'number' ? 'number' : 'text'}
                              placeholder={pSpec.description || `Enter ${pName}`}
                              value={taskParams[pName] || ''}
                              onChange={(e) => setTaskParams({ ...taskParams, [pName]: e.target.value })}
                              className="w-full p-2 text-xs rounded bg-retro-panel-light dark:bg-retro-panel-dark border border-retro-border-light dark:border-retro-border-dark focus:outline-none focus:border-retro-orange"
                            />
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Action Run */}
                    <button
                      onClick={executeTask}
                      disabled={isExecutingTask}
                      className="w-full bg-retro-green text-white py-2.5 rounded font-medium flex items-center justify-center space-x-2 hover:opacity-90 transition-opacity disabled:opacity-50"
                    >
                      <Play className="h-4 w-4" />
                      <span>{isExecutingTask ? 'Running...' : 'Execute Task'}</span>
                    </button>

                    {/* Logs output */}
                    <div className="flex-1 flex flex-col min-h-[200px]">
                      <div className="text-xs font-semibold opacity-60 mb-1">Execution Log</div>
                      <div className="flex-1 bg-black text-retro-green p-3 rounded font-mono text-xxs overflow-y-auto leading-relaxed border border-retro-border-light dark:border-retro-border-dark max-h-[300px]">
                        {taskLogs.map((log, i) => {
                          let colorClass = 'text-retro-green';
                          if (log.startsWith('[ERROR]')) colorClass = 'text-retro-red';
                          else if (log.startsWith('[Client]')) colorClass = 'text-retro-blue';
                          
                          return <div key={i} className={colorClass}>{log}</div>;
                        })}
                        {taskLogs.length === 0 && (
                          <div className="text-gray-500 italic">Logs will print here during task execution...</div>
                        )}
                      </div>
                    </div>

                  </div>
                )}

              </div>
            </div>

            </div>
          )}

          {!selectedHost && view === 'dashboard' && (
            <div className="flex-1 flex flex-col items-center justify-center space-y-2 opacity-60">
              <Server className="h-12 w-12 text-retro-orange animate-pulse" />
              <div>No registered agents found. Add an agent to start monitoring.</div>
            </div>
          )}

        </main>

      </div>
    </div>
  );
}
