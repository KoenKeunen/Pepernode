import { useState, useEffect, useRef } from "react";
import { io, Socket } from "socket.io-client";
import { motion, AnimatePresence } from "motion/react";
import { Terminal as TerminalIcon, Play, AlertCircle, CheckCircle2, Download, Settings, X, Terminal, Cpu } from "lucide-react";

interface TerminalLine {
  type: "stdout" | "stderr" | "info" | "error" | "system";
  content: string;
}

interface Step {
  id: string;
  label: string;
  status: "idle" | "running" | "success" | "error";
  description: string;
}

export default function App() {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [terminalLines, setTerminalLines] = useState<TerminalLine[]>([]);
  const [steps, setSteps] = useState<Step[]>([
    { id: "check", label: "Check Dependencies", status: "idle", description: "Verify Git, Rust, Cargo, and libraries" },
    { id: "install", label: "Install Missing", status: "idle", description: "Fetch required system packages" },
    { id: "clone", label: "Setup Syntherklaas", status: "idle", description: "Download repo and build binaries" },
    { id: "run", label: "Run Pepernode Engine", status: "idle", description: "Execute the synth wrapper" },
  ]);
  const [activeActionId, setActiveActionId] = useState<string | null>(null);
  const terminalEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const newSocket = io();
    setSocket(newSocket);

    newSocket.on("terminal-data", (data: { actionId: string; type: string; content?: string; code?: number }) => {
      if (data.type === "stdout" || data.type === "stderr") {
        setTerminalLines((prev) => [...prev, { type: data.type as any, content: data.content || "" }]);
      } else if (data.type === "exit") {
        setTerminalLines((prev) => [...prev, { type: "system", content: `Process exited with code ${data.code}` }]);
        setSteps((prev) => 
          prev.map((s) => s.id === data.actionId ? { ...s, status: data.code === 0 ? "success" : "error" } : s)
        );
        setActiveActionId(null);
      }
    });

    return () => {
      newSocket.disconnect();
    };
  }, []);

  useEffect(() => {
    terminalEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [terminalLines]);

  const addInfo = (msg: string) => setTerminalLines(prev => [...prev, { type: "info", content: msg }]);

  const runStep = async (stepId: string) => {
    if (!socket) return;

    setSteps(prev => prev.map(s => s.id === stepId ? { ...s, status: "running" } : s));
    setActiveActionId(stepId);

    switch (stepId) {
      case "check":
        addInfo("Scanning system environment...");
        const res = await fetch("/api/check-deps");
        const results = await res.json();
        const missing = results.filter((r: any) => !r.installed);
        
        results.forEach((r: any) => {
          setTerminalLines(prev => [...prev, { 
            type: r.installed ? "info" : "error", 
            content: `${r.installed ? "✓" : "✗"} ${r.name}: ${r.installed ? "Found" : "Missing"}` 
          }]);
        });

        if (missing.length === 0) {
          setSteps(prev => prev.map(s => s.id === "check" ? { ...s, status: "success" } : s));
          setSteps(prev => prev.map(s => s.id === "install" ? { ...s, status: "success" } : s));
          setActiveActionId(null);
        } else {
          setSteps(prev => prev.map(s => s.id === "check" ? { ...s, status: "error" } : s));
          setActiveActionId(null);
        }
        break;

      case "install":
        addInfo("Initiating package installation (apt-get)...");
        socket.emit("run-command", {
          actionId: "install",
          command: "sudo apt-get update && sudo apt-get install -y git rustc cargo pkg-config libasound2-dev",
          args: []
        });
        break;

      case "clone":
        addInfo("Cloning Syntherklaas repository...");
        socket.emit("run-command", {
          actionId: "clone",
          command: "if [ ! -d \"syntherklaas\" ]; then git clone https://github.com/erikvalkering/syntherklaas.git; fi && cd syntherklaas && cargo build",
          args: []
        });
        break;

      case "run":
        addInfo("Starting Pepernode wrapper...");
        socket.emit("run-command", {
          actionId: "run",
          command: "cd syntherklaas && cargo run",
          args: []
        });
        break;
    }
  };

  const killProcess = () => {
    if (socket && activeActionId) {
      socket.emit("kill-process", activeActionId);
    }
  };

  return (
    <div className="h-screen bg-app-bg text-zinc-400 font-sans flex flex-col overflow-hidden border-[12px] border-frame-bg">
      {/* Header */}
      <header className="h-16 border-b border-zinc-800 flex items-center justify-between px-8 bg-nav-bg shrink-0">
        <div className="flex items-center space-x-4">
          <div className="w-3 h-3 rounded-full bg-accent shadow-[0_0_10px_rgba(249,115,22,0.4)]"></div>
          <h1 className="font-serif text-xl italic text-zinc-100 tracking-tight">
            Pepernode <span className="text-zinc-500 font-sans not-italic text-xs ml-2 font-mono">v1.0.4-beta</span>
          </h1>
        </div>
        <div className="hidden md:flex items-center space-x-6 text-[11px] font-mono uppercase tracking-widest">
          <div className="flex flex-col items-end">
            <span className="text-zinc-600">Environment</span>
            <span className="text-accent">{activeActionId ? "Executing Task" : "Standby"}</span>
          </div>
          <div className="w-[1px] h-8 bg-zinc-800"></div>
          <div className="flex flex-col items-end">
            <span className="text-zinc-600">Runtime</span>
            <span className="text-zinc-300">Cloud-Run</span>
          </div>
        </div>
      </header>

      <main className="flex-1 flex overflow-hidden">
        {/* Terminal Area - Main Section */}
        <section className="flex-1 flex flex-col p-6 space-y-4 overflow-hidden">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-mono text-zinc-500 uppercase tracking-widest flex items-center gap-2">
              <TerminalIcon className="w-3 h-3" /> System Output
            </h2>
            <span className="text-[10px] font-mono text-zinc-600">syntherklaas.sh — {terminalLines.length} events logged</span>
          </div>
          
          <div className="flex-1 bg-black border border-zinc-800 rounded-lg p-6 font-mono text-sm leading-relaxed overflow-hidden relative group">
            {/* Background SVG Decoration */}
            <div className="absolute top-0 right-0 p-8 opacity-5 pointer-events-none group-hover:opacity-10 transition-opacity">
              <Cpu className="w-48 h-48" />
            </div>

            <div className="h-full overflow-y-auto custom-scrollbar pr-2 space-y-1">
              <div className="text-zinc-500 mb-2">[system] bootstrapping pepernode environment...</div>
              <div className="text-zinc-100 italic font-serif text-base mb-4">Pepernode Virtual Terminal</div>
              
              <AnimatePresence mode="popLayout">
                {terminalLines.map((line, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, x: -2 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.1 }}
                    className={`whitespace-pre-wrap ${
                      line.type === "stderr" || line.type === "error" ? "text-red-400" :
                      line.type === "system" ? "text-accent italic opacity-70" :
                      line.type === "info" ? "text-zinc-500" :
                      "text-zinc-300"
                    }`}
                  >
                    <span className="text-zinc-700 mr-3 select-none">[{new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}]</span>
                    {line.content}
                  </motion.div>
                ))}
              </AnimatePresence>
              
              {activeActionId && (
                <div className="text-accent animate-pulse font-bold mt-2">_</div>
              )}
              
              <div ref={terminalEndRef} />
            </div>
            
            {!activeActionId && terminalLines.length > 0 && (
              <div className="absolute bottom-6 left-6 flex items-center gap-2 pointer-events-none">
                <span className="text-green-500 font-bold">$</span>
                <div className="w-2 h-4 bg-zinc-800 animate-pulse" />
              </div>
            )}
          </div>
        </section>

        {/* Sidebar Controls */}
        <aside className="w-80 border-l border-zinc-800 bg-nav-bg p-6 flex flex-col space-y-8 overflow-y-auto custom-scrollbar">
          <div>
            <h3 className="text-[10px] font-mono text-zinc-500 uppercase tracking-[0.2em] mb-6">Sequence Status</h3>
            <ul className="space-y-6">
              {steps.map((step) => (
                <li key={step.id} className="relative group">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`w-1.5 h-1.5 rounded-full ${
                          step.status === "success" ? "bg-green-500" :
                          step.status === "running" ? "bg-accent animate-pulse" :
                          step.status === "error" ? "bg-red-500" :
                          "bg-zinc-700"
                        }`} />
                        <h4 className={`text-xs font-bold uppercase tracking-tight ${
                          step.status === "success" ? "text-zinc-100" : "text-zinc-400"
                        }`}>{step.label}</h4>
                      </div>
                      <p className="text-[10px] text-zinc-600 leading-relaxed capitalize">{step.description}</p>
                    </div>
                    <button 
                      onClick={() => runStep(step.id)}
                      disabled={activeActionId !== null || step.status === "success"}
                      className={`p-2 transition-all rounded ${
                        step.status === "success" ? "text-green-500 cursor-default" :
                        activeActionId ? "text-zinc-800 cursor-not-allowed" :
                        "text-zinc-500 hover:text-zinc-100 hover:bg-white/5 active:scale-95"
                      }`}
                    >
                      {step.status === "success" ? <CheckCircle2 className="w-4 h-4" /> : 
                       step.status === "running" ? <Settings className="w-4 h-4 animate-spin text-accent" /> :
                       <Play className="w-4 h-4" />}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <div className="pt-6 border-t border-zinc-800">
            <h3 className="text-[10px] font-mono text-zinc-500 uppercase tracking-[0.2em] mb-4">Node Config</h3>
            <div className="p-4 bg-black border border-zinc-800 rounded-lg">
              <p className="text-[10px] text-zinc-600 mb-1 font-mono uppercase tracking-widest">Repository</p>
              <p className="text-xs text-zinc-300 truncate font-mono">erikvalkering/syntherklaas</p>
              <div className="mt-4 flex items-center justify-between text-[10px] text-zinc-500">
                <span className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-zinc-700"></span>
                  Main Branch
                </span>
                <span className="text-zinc-700">0x62A...</span>
              </div>
            </div>
          </div>

          <div className="mt-auto pt-6 border-t border-zinc-800 space-y-3">
             {activeActionId && (
               <button 
                onClick={killProcess}
                className="w-full py-4 border border-zinc-800 text-zinc-300 text-[10px] font-mono uppercase tracking-[0.3em] hover:bg-zinc-900 transition-all bg-zinc-900/40 active:scale-[0.98]"
               >
                 Abort Execution
               </button>
             )}
             <button 
              onClick={() => steps.some(s => s.status !== "success") && runStep(steps.find(s => s.status === "idle")?.id || "check")}
              className="w-full py-4 bg-accent text-white text-[10px] font-mono uppercase tracking-[0.3em] hover:brightness-110 transition-all active:scale-[0.98] disabled:opacity-50 disabled:grayscale"
              disabled={activeActionId !== null || steps.every(s => s.status === "success")}
             >
               Run Automation
             </button>
          </div>
        </aside>
      </main>

      {/* Footer */}
      <footer className="h-10 border-t border-zinc-800 px-8 flex items-center justify-between text-[10px] font-mono text-zinc-600 shrink-0">
        <div className="flex items-center space-x-4">
          <span>Session: <span className="text-zinc-400">0x7F2A...E901</span></span>
          <span className="hidden md:inline">|</span>
          <span className="hidden md:inline">Buffer: <span className="text-zinc-400">{terminalLines.length * 12}B</span></span>
        </div>
        <div className="flex items-center space-x-2">
          <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></div>
          <span className="uppercase tracking-widest">Terminal Sync Enabled</span>
        </div>
      </footer>
    </div>
  );
}
