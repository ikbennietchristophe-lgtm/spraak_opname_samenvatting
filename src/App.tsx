import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  Mic, 
  MicOff, 
  Pause, 
  Play, 
  RotateCcw, 
  FileSpreadsheet, 
  Sparkles, 
  History, 
  LogOut, 
  ExternalLink, 
  Loader2, 
  CheckCircle2, 
  AlertTriangle, 
  Copy, 
  Check, 
  FileText, 
  Folder 
} from "lucide-react";
import { initAuth, googleSignIn, logout, saveRecordingToGoogleSheets, fetchRecordingHistory } from "./lib/googleApi";
import { useSpeechToText } from "./hooks/useSpeechToText";
import { Recording, RecordingStatus } from "./types";
import { User } from "firebase/auth";

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [needsAuth, setNeedsAuth] = useState(true);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [showTroubleshoot, setShowTroubleshoot] = useState(false);
  
  // Recording & Transcription
  const speech = useSpeechToText();
  const [customTextInput, setCustomTextInput] = useState("");
  const [useManualInput, setUseManualInput] = useState(false);

  // Summarize & Save State
  const [summary, setSummary] = useState<string>("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [processStep, setProcessStep] = useState<string>("");
  const [savedSheetUrl, setSavedSheetUrl] = useState<string | null>(null);
  const [copiedText, setCopiedText] = useState<string | null>(null);

  // History Log
  const [history, setHistory] = useState<Recording[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  const transcriptEndRef = useRef<HTMLDivElement>(null);

  // Track Auth state
  useEffect(() => {
    const unsubscribe = initAuth(
      (currentUser, token) => {
        setUser(currentUser);
        setNeedsAuth(false);
        loadHistory();
      },
      () => {
        setUser(null);
        setNeedsAuth(true);
      }
    );
    return () => unsubscribe();
  }, []);

  // Auto-scroll transcription window
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [speech.transcript, customTextInput]);

  const loadHistory = async () => {
    setIsLoadingHistory(true);
    try {
      const records = await fetchRecordingHistory();
      setHistory(records);
    } catch (e) {
      console.error("Fout bij laden geschiedenis:", e);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  const handleLogin = async () => {
    setIsLoggingIn(true);
    setLoginError(null);
    try {
      const result = await googleSignIn();
      if (result) {
        setUser(result.user);
        setNeedsAuth(false);
        // Refresh history after login
        setTimeout(() => {
          loadHistory();
        }, 1000);
      }
    } catch (err: any) {
      console.error("Inloggen mislukt:", err);
      setLoginError(err?.message || "Onbekende fout bij inloggen met Google.");
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    if (window.confirm("Weet u zeker dat u wilt uitloggen?")) {
      await logout();
      setUser(null);
      setNeedsAuth(true);
      setHistory([]);
      setSummary("");
      speech.resetTranscript();
    }
  };

  // Get active text based on input mode (mic vs manual text)
  const activeText = useManualInput ? customTextInput : speech.transcript;

  const handleSaveAndSummarize = async () => {
    if (!activeText.trim()) {
      alert("Spreek eerst wat in of typ een tekst om op te slaan.");
      return;
    }

    setIsProcessing(true);
    setSummary("");
    setSavedSheetUrl(null);

    try {
      // Step 1: Request Summary from Gemini (Server-side API)
      setProcessStep("Gemini is een samenvatting aan het maken...");
      const sumResponse = await fetch("/api/summarize", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ text: activeText }),
      });

      if (!sumResponse.ok) {
        const errorData = await sumResponse.json();
        throw new Error(errorData.error || "Fout bij genereren samenvatting door de server.");
      }

      const sumData = await sumResponse.json();
      const generatedSummary = sumData.summary;
      setSummary(generatedSummary);

      // Step 2: Save to Google Sheets
      setProcessStep("Gegevens opslaan in Google Sheets...");
      const saveResult = await saveRecordingToGoogleSheets(activeText, generatedSummary);
      setSavedSheetUrl(saveResult.spreadsheetUrl);

      // Step 3: Refresh log history
      setProcessStep("Geschiedenis bijwerken...");
      await loadHistory();

      // Reset speech engine state
      speech.stopRecording();
    } catch (error: any) {
      console.error("Fout tijdens verwerking:", error);
      alert(`Er is een fout opgetreden: ${error.message}`);
    } finally {
      setIsProcessing(false);
      setProcessStep("");
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(id);
    setTimeout(() => setCopiedText(null), 2000);
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 font-sans selection:bg-indigo-100 selection:text-indigo-900 flex flex-col justify-between">
      <div>
        {/* Top Header Section */}
        <header className="sticky top-0 z-40 h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 sm:px-8 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center shadow-sm shadow-indigo-600/10">
              <Mic className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg sm:text-xl font-semibold tracking-tight text-slate-900 leading-none">
                VoiceScript Pro
              </h1>
              <p className="text-[10px] text-slate-400 font-medium hidden sm:block mt-0.5">
                Spraakopname & AI Samenvatting
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4 sm:gap-6">
            <div className="hidden md:flex items-center gap-2 text-xs font-semibold text-slate-500 bg-slate-50 border border-slate-200/40 py-1.5 px-3 rounded-lg">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              Cloudflare Worker: Online
            </div>
            <div className="hidden md:flex items-center gap-2 text-xs font-semibold text-slate-500 bg-slate-50 border border-slate-200/40 py-1.5 px-3 rounded-lg">
              <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
              Gemini-3.5-Flash
            </div>

            {user && (
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 bg-indigo-50/50 py-1 px-2.5 rounded-lg border border-indigo-100/30">
                  {user.photoURL ? (
                    <img src={user.photoURL} alt="profielfoto" referrerPolicy="no-referrer" className="h-5 w-5 rounded-full" />
                  ) : (
                    <div className="h-5 w-5 rounded-full bg-indigo-600 text-white flex items-center justify-center text-[10px] font-bold">
                      {user.displayName ? user.displayName[0] : "U"}
                    </div>
                  )}
                  <span className="text-xs font-bold text-slate-700 hidden sm:inline">
                    {user.displayName || user.email?.split("@")[0]}
                  </span>
                </div>
                
                <button
                  onClick={handleLogout}
                  className="flex items-center gap-1.5 py-1.5 px-2.5 text-xs font-semibold text-rose-600 hover:bg-rose-50 rounded-lg transition-colors border border-transparent hover:border-rose-100"
                  id="btn-logout"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Uitloggen</span>
                </button>
              </div>
            )}
          </div>
        </header>

        {/* Main Content Stage */}
        <main className="max-w-7xl mx-auto px-4 py-6 sm:px-6 lg:py-8">
          <AnimatePresence mode="wait">
            {needsAuth ? (
              /* Login Welcome Screen */
              <motion.div
                key="auth-screen"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                transition={{ duration: 0.35 }}
                className="max-w-md mx-auto text-center mt-12"
              >
                <div className="bg-white rounded-2xl p-8 shadow-sm border border-slate-200">
                  <div className="mx-auto w-12 h-12 bg-indigo-50 rounded-xl flex items-center justify-center mb-6">
                    <Sparkles className="h-6 w-6 text-indigo-600" />
                  </div>
                  
                  <h2 className="font-display font-bold text-2xl text-slate-900 mb-3">
                    Welkom bij VoiceScript Pro
                  </h2>
                  <p className="text-slate-500 text-sm mb-8 leading-relaxed">
                    Log in met je Google-account om spraakopnamen te starten. De tekst en een AI-samenvatting worden direct in een Google Sheet op jouw Google Drive gezet.
                  </p>

                  <div className="space-y-4 text-left">
                    <button
                      onClick={handleLogin}
                      disabled={isLoggingIn}
                      className="w-full flex items-center justify-center gap-3 bg-white hover:bg-slate-50 text-slate-700 font-semibold py-3 px-4 rounded-xl border border-slate-300 shadow-sm transition-all hover:shadow-md disabled:opacity-50 cursor-pointer"
                      id="btn-google-signin"
                    >
                      {isLoggingIn ? (
                        <Loader2 className="h-5 w-5 animate-spin text-slate-500" />
                      ) : (
                        <svg version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" className="h-5 w-5">
                          <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"></path>
                          <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"></path>
                          <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"></path>
                          <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"></path>
                        </svg>
                      )}
                      <span className="text-sm font-semibold">Inloggen met Google</span>
                    </button>

                    {loginError && (
                      <div className="p-3 bg-rose-50 border border-rose-100 rounded-xl text-rose-800 text-xs font-medium space-y-1">
                        <div className="flex items-center gap-1.5 font-bold">
                          <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0" />
                          <span>Inloggen mislukt</span>
                        </div>
                        <p className="leading-normal">{loginError}</p>
                      </div>
                    )}

                    <div className="pt-2">
                      <button
                        onClick={() => setShowTroubleshoot(!showTroubleshoot)}
                        className="w-full text-center text-xs text-indigo-600 hover:text-indigo-800 hover:underline font-semibold flex items-center justify-center gap-1 cursor-pointer py-1"
                      >
                        {showTroubleshoot ? "Verberg inlog hulp" : "Inlogproblemen? Klik hier voor de oplossing"}
                      </button>
                      
                      {showTroubleshoot && (
                        <div className="mt-3 bg-indigo-50/50 rounded-xl p-4 border border-indigo-100/50 text-xs text-slate-700 space-y-3 leading-relaxed">
                          <div>
                            <span className="font-bold text-indigo-900 block mb-1">1. Werk je in de AI Studio Preview?</span>
                            <p>
                              Browsers blokkeren pop-up vensters of cookies in een iframe. Klik op de knop om de app in een **nieuw tabblad** te openen en log daar in:
                            </p>
                            <a
                              href={window.location.origin}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 mt-1.5 font-bold text-indigo-600 hover:text-indigo-800 hover:underline bg-white px-2.5 py-1 rounded-md border border-indigo-100 shadow-xs"
                            >
                              Open in nieuw tabblad
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          </div>

                          <div className="border-t border-indigo-100/60 pt-2">
                            <span className="font-bold text-indigo-900 block mb-1">2. Domein toevoegen aan Firebase Console</span>
                            <p className="mb-1">
                              Voor de gepubliceerde cloud-versie moet je deze URL toevoegen als toegestaan domein:
                            </p>
                            <code className="block bg-indigo-100/50 p-1.5 rounded font-mono text-[10px] break-all select-all text-slate-800">
                              {window.location.hostname}
                            </code>
                            <p className="mt-1.5">
                              Ga naar de <a href="https://console.firebase.google.com/project/folkloric-glass-kgtt6/authentication/providers" target="_blank" rel="noreferrer" className="text-indigo-600 font-bold hover:underline">Firebase Console</a> → <strong>Settings</strong> → <strong>Authorized Domains</strong> en voeg dit domein toe.
                            </p>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center justify-center gap-2 text-[11px] text-slate-400 mt-4 pt-2 border-t border-slate-100">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
                      Beveiligde OAuth koppeling via Google
                    </div>
                  </div>
                </div>
              </motion.div>
            ) : (
              /* Logged in Workspace Dashboard */
              <motion.div
                key="workspace"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.3 }}
                className="space-y-6"
              >
                {/* Feature info & Alerts */}
                {!speech.isSupported && (
                  <div className="bg-amber-50 border border-amber-200/80 rounded-xl p-4 flex items-start gap-3 text-amber-800">
                    <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <h4 className="font-semibold text-sm">Spraakherkenning niet ondersteund</h4>
                      <p className="text-xs text-amber-700 mt-1 leading-relaxed">
                        Jouw browser ondersteunt de ingebouwde Spraakherkenning API niet (aanbevolen: Google Chrome of Microsoft Edge). 
                        Je kunt de applicatie testen door handmatig tekst in te typen met de knop hieronder.
                      </p>
                    </div>
                  </div>
                )}

                {/* Main functional workspace (Grid) */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
                  
                  {/* LEFT: Voice Control & Realtime Stream */}
                  <div className="lg:col-span-7 flex flex-col gap-6">
                    
                    {/* Speech Dictation Core Card */}
                    <div className="bg-white rounded-xl border border-slate-200 flex flex-col shadow-sm relative overflow-hidden flex-1 min-h-[420px] justify-between">
                      <div>
                        {/* Header Controls */}
                        <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                          <div className="flex items-center gap-2">
                            <span className={`h-2 h-2 rounded-full ${
                              speech.status === "recording" ? "bg-red-500 animate-pulse" : 
                              speech.status === "paused" ? "bg-amber-500" : "bg-slate-300"
                            }`} />
                            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                              {speech.status === "recording" ? "Opnemen..." : 
                               speech.status === "paused" ? "Gepauzeerd" : "Klaar voor start"}
                            </span>
                          </div>

                          {/* Manual / Auto Input Switcher */}
                          <button
                            onClick={() => {
                              setUseManualInput(!useManualInput);
                              speech.stopRecording();
                            }}
                            className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 bg-indigo-50 hover:bg-indigo-100/65 px-2.5 py-1 rounded-md transition-colors cursor-pointer"
                          >
                            {useManualInput ? "Gebruik Microfoon" : "Typ handmatig"}
                          </button>
                        </div>

                        {/* Dictation Viewer Stage */}
                        <div className="p-6 h-[260px] overflow-y-auto relative">
                          {useManualInput ? (
                            <textarea
                              value={customTextInput}
                              onChange={(e) => setCustomTextInput(e.target.value)}
                              placeholder="Typ of plak hier uw tekst..."
                              className="w-full h-full bg-transparent resize-none border-none outline-none text-slate-700 text-base leading-relaxed"
                            />
                          ) : (
                            <div className="h-full overflow-y-auto pr-1">
                              {activeText ? (
                                <p className="text-slate-800 text-base sm:text-lg leading-relaxed font-normal whitespace-pre-wrap">
                                  {activeText}
                                </p>
                              ) : (
                                <div className="h-full flex flex-col items-center justify-center text-center text-slate-400 py-12">
                                  <Mic className="h-10 w-10 text-slate-300 mb-2" />
                                  <p className="text-xs font-medium max-w-xs">
                                    Druk op de knop hieronder of begin te spreken om realtime transcriptie te starten.
                                  </p>
                                </div>
                              )}
                              <div ref={transcriptEndRef} />
                            </div>
                          )}

                          {/* Beautiful gradient fadeout at bottom */}
                          <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-white to-transparent pointer-events-none"></div>

                          {/* Microphone Pulsing Wave indicator */}
                          {speech.status === "recording" && (
                            <div className="absolute bottom-4 left-6 flex items-center gap-2">
                              <div className="w-1 h-3.5 bg-indigo-500 rounded-full animate-pulse"></div>
                              <div className="w-1 h-5.5 bg-indigo-500 rounded-full animate-pulse"></div>
                              <div className="w-1 h-3 bg-indigo-500 rounded-full animate-pulse"></div>
                              <span className="text-xs italic text-slate-400 ml-2">Luisteren naar invoer...</span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Controls Bar */}
                      <div className="p-4 bg-slate-50/50 border-t border-slate-100 flex items-center justify-between gap-4">
                        
                        {/* Audio Controls Buttons */}
                        {!useManualInput ? (
                          <div className="flex items-center gap-2.5">
                            {speech.status === "idle" ? (
                              <button
                                onClick={speech.startRecording}
                                disabled={!speech.isSupported}
                                className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2 px-4 rounded-lg shadow-sm text-xs cursor-pointer transition-colors"
                                id="btn-start-record"
                              >
                                <Mic className="h-3.5 w-3.5" />
                                Start Opname
                              </button>
                            ) : (
                              <>
                                {speech.status === "recording" ? (
                                  <button
                                    onClick={speech.pauseRecording}
                                    className="flex items-center gap-2 bg-red-50 text-red-600 rounded-lg font-semibold py-2 px-4 border border-red-100 text-xs cursor-pointer hover:bg-red-100/60 transition-colors"
                                    id="btn-pause-record"
                                  >
                                    <div className="w-2 h-2 bg-red-600 rounded-full"></div>
                                    Pauzeer
                                  </button>
                                ) : (
                                  <button
                                    onClick={speech.startRecording}
                                    className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2 px-4 rounded-lg shadow-sm text-xs cursor-pointer"
                                    id="btn-resume-record"
                                  >
                                    <Play className="h-3.5 w-3.5" />
                                    Hervat
                                  </button>
                                )}

                                <button
                                  onClick={speech.stopRecording}
                                  className="flex items-center gap-2 bg-slate-900 text-white rounded-lg font-semibold py-2 px-4 text-xs cursor-pointer hover:bg-slate-800 transition-colors"
                                  id="btn-stop-record"
                                >
                                  <MicOff className="h-3.5 w-3.5" />
                                  Stop
                                </button>
                              </>
                            )}

                            {activeText && (
                              <button
                                onClick={speech.resetTranscript}
                                className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                                title="Tekst wissen"
                                id="btn-reset-record"
                              >
                                <RotateCcw className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        ) : (
                          <div className="flex items-center gap-2.5">
                            {activeText && (
                              <button
                                onClick={() => setCustomTextInput("")}
                                className="flex items-center gap-1.5 py-2 px-3 text-xs font-semibold text-slate-500 hover:text-slate-800 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors cursor-pointer"
                                id="btn-clear-manual"
                              >
                                <RotateCcw className="h-3.5 w-3.5" />
                                Wissen
                              </button>
                            )}
                          </div>
                        )}

                        {/* Main Action Call to Action: Summarize & Save */}
                        <button
                          onClick={handleSaveAndSummarize}
                          disabled={isProcessing || !activeText.trim()}
                          className="flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2.5 px-5 rounded-lg shadow-sm disabled:opacity-50 text-xs cursor-pointer transition-colors"
                          id="btn-save-summarize"
                        >
                          {isProcessing ? (
                            <>
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              Verwerken...
                            </>
                          ) : (
                            <>
                              <FileSpreadsheet className="h-3.5 w-3.5" />
                              Stop & Verwerk
                            </>
                          )}
                        </button>

                      </div>

                      {/* Micro Interaction Error Logs */}
                      {speech.error && (
                        <div className="p-3 bg-rose-50 text-rose-700 text-xs font-semibold border-t border-rose-100 flex items-center gap-2">
                          <AlertTriangle className="h-4 w-4 text-rose-500 shrink-0" />
                          {speech.error}
                        </div>
                      )}
                    </div>

                    {/* Processing Status Steps Overlay */}
                    <AnimatePresence>
                      {isProcessing && (
                        <motion.div
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: 10 }}
                          className="bg-indigo-50 border border-indigo-100 rounded-xl p-4 flex items-center gap-3.5 text-indigo-900 shadow-sm"
                        >
                          <Loader2 className="h-5 w-5 animate-spin text-indigo-600 shrink-0" />
                          <div>
                            <p className="text-[10px] font-bold text-indigo-500 uppercase tracking-wider">Actieve cloud verwerking</p>
                            <p className="text-xs font-semibold text-slate-700 mt-0.5">{processStep}</p>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>

                  </div>

                  {/* RIGHT: Gemini AI Output Viewer */}
                  <div className="lg:col-span-5 flex flex-col gap-6">
                    
                    {/* Summary Core Card */}
                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col flex-1 justify-between">
                      <div>
                        <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50 rounded-t-xl">
                          <div className="flex items-center gap-2">
                            <Sparkles className="w-4 h-4 text-indigo-500" />
                            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Gemini AI Samenvatting</span>
                          </div>
                          {summary && (
                            <button
                              onClick={() => copyToClipboard(summary, "summary")}
                              className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-md transition-colors cursor-pointer"
                              title="Kopieer samenvatting"
                            >
                              {copiedText === "summary" ? (
                                <Check className="h-3.5 w-3.5 text-emerald-500" />
                              ) : (
                                <Copy className="h-3.5 w-3.5" />
                              )}
                            </button>
                          )}
                        </div>

                        <div className="p-5">
                          {isProcessing && !summary ? (
                            <div className="space-y-3 py-2">
                              <div className="h-3 bg-slate-100 rounded animate-pulse w-3/4"></div>
                              <div className="h-3 bg-slate-100 rounded animate-pulse"></div>
                              <div className="h-3 bg-slate-100 rounded animate-pulse w-5/6"></div>
                              <div className="h-3 bg-slate-100 rounded animate-pulse w-2/3"></div>
                            </div>
                          ) : summary ? (
                            <div className="p-4 bg-indigo-50/50 rounded-lg border border-indigo-100/30">
                              <p className="text-sm font-medium text-slate-800 leading-relaxed whitespace-pre-wrap">
                                {summary}
                              </p>
                            </div>
                          ) : (
                            <div className="text-center text-slate-400 py-12">
                              <Sparkles className="h-8 w-8 text-slate-300 mx-auto mb-2" />
                              <p className="text-xs font-medium">
                                AI-samenvatting verschijnt hier direct na het opslaan.
                              </p>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Storage Export Status Card inside column */}
                      <div className="p-5 bg-slate-900 rounded-b-xl text-white flex flex-col gap-4 border-t border-slate-800">
                        <div className="flex items-center justify-between">
                          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Export Status</h3>
                          {savedSheetUrl && (
                            <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-400 text-[10px] font-bold uppercase rounded border border-emerald-500/30 animate-pulse">
                              Nieuw Opgeslagen
                            </span>
                          )}
                        </div>
                        
                        <div className="space-y-3">
                          <div className="flex items-center justify-between text-xs">
                            <div className="flex items-center gap-2.5">
                              <div className="w-8 h-8 rounded bg-emerald-500/20 flex items-center justify-center">
                                <Folder className="w-4 h-4 text-emerald-400" />
                              </div>
                              <div>
                                <p className="font-semibold">Spraakopname App Map</p>
                                <p className="text-[10px] text-slate-400">Google Drive / Root</p>
                              </div>
                            </div>
                            <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-400 text-[10px] rounded border border-emerald-500/20 font-medium">Actief</span>
                          </div>

                          <div className="flex items-center justify-between text-xs">
                            <div className="flex items-center gap-2.5">
                              <div className="w-8 h-8 rounded bg-blue-500/20 flex items-center justify-center">
                                <FileSpreadsheet className="w-4 h-4 text-blue-400" />
                              </div>
                              <div>
                                <p className="font-semibold">Spraakopnamen en Samenvattingen</p>
                                <p className="text-[10px] text-slate-400">Google Sheets / Database</p>
                              </div>
                            </div>
                            {savedSheetUrl ? (
                              <a
                                href={savedSheetUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 text-[10px] font-bold text-indigo-400 hover:text-indigo-300 transition-colors"
                              >
                                Openen
                                <ExternalLink className="h-3 w-3" />
                              </a>
                            ) : (
                              <span className="px-2 py-0.5 bg-blue-500/10 text-blue-400 text-[10px] rounded border border-blue-500/20 font-medium">Gesynchroniseerd</span>
                            )}
                          </div>
                        </div>
                      </div>

                    </div>

                  </div>

                </div>

                {/* SECTION: History / Log overview directly from the actual Google Sheet! */}
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
                  <div className="flex items-center justify-between mb-6 border-b border-slate-100 pb-4">
                    <div className="flex items-center gap-2">
                      <History className="h-4 w-4 text-indigo-500" />
                      <h3 className="font-display font-semibold text-base text-slate-900">
                        Geschiedenis uit Google Sheets
                      </h3>
                    </div>

                    <button
                      onClick={loadHistory}
                      disabled={isLoadingHistory}
                      className="text-xs font-semibold text-slate-600 hover:text-indigo-600 hover:bg-slate-50 rounded-lg py-1.5 px-3 border border-slate-200 transition-all flex items-center gap-1.5 cursor-pointer"
                      id="btn-refresh-history"
                    >
                      {isLoadingHistory ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-500" />
                      ) : (
                        <RotateCcw className="h-3.5 w-3.5" />
                      )}
                      Vernieuwen
                    </button>
                  </div>

                  {isLoadingHistory && history.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                      <Loader2 className="h-7 w-7 animate-spin mb-3 text-indigo-500" />
                      <p className="text-xs font-medium">Gegevens ophalen uit Google Drive...</p>
                    </div>
                  ) : history.length > 0 ? (
                    <div className="space-y-4">
                      {history.map((record, index) => (
                        <div 
                          key={index}
                          className="p-5 rounded-xl bg-slate-50/50 border border-slate-200 hover:border-slate-300 transition-all space-y-3 relative group"
                        >
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 border-b border-slate-100 pb-2">
                            <span className="text-xs font-semibold text-slate-500">
                              {record.timestamp}
                            </span>
                            
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => copyToClipboard(record.text, `text-${index}`)}
                                className="text-xs font-semibold text-slate-500 hover:text-slate-800 py-1 px-2 rounded hover:bg-slate-100 transition-colors inline-flex items-center gap-1 cursor-pointer"
                                title="Kopieer transcript"
                              >
                                {copiedText === `text-${index}` ? (
                                  <Check className="h-3 w-3 text-emerald-500" />
                                ) : (
                                  <Copy className="h-3 w-3" />
                                )}
                                Transcript
                              </button>
                              <button
                                onClick={() => copyToClipboard(record.summary, `sum-${index}`)}
                                className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 py-1 px-2 rounded hover:bg-indigo-50 transition-colors inline-flex items-center gap-1 cursor-pointer"
                                title="Kopieer samenvatting"
                              >
                                {copiedText === `sum-${index}` ? (
                                  <Check className="h-3 w-3 text-emerald-500" />
                                ) : (
                                  <Copy className="h-3 w-3" />
                                )}
                                Samenvatting
                              </button>
                            </div>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
                            <div>
                              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">Volledige Uitgesproken Tekst</span>
                              <p className="text-xs text-slate-600 leading-relaxed max-h-24 overflow-y-auto whitespace-pre-wrap font-medium">
                                {record.text}
                              </p>
                            </div>
                            <div className="bg-indigo-50/30 p-3.5 rounded-lg border border-indigo-100/20">
                              <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-600 flex items-center gap-1 mb-1 font-sans">
                                <Sparkles className="h-3 w-3" /> Gemini Samenvatting
                              </span>
                              <p className="text-xs text-slate-800 leading-relaxed font-semibold">
                                {record.summary}
                              </p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center text-slate-400 py-10">
                      <FileText className="h-10 w-10 text-slate-200 mx-auto mb-2" />
                      <p className="text-xs font-medium">Nog geen opnamen opgeslagen in Google Sheets.</p>
                    </div>
                  )}
                </div>

              </motion.div>
            )}
          </AnimatePresence>
        </main>
      </div>

      {/* Footer Status Bar */}
      <footer className="h-10 bg-slate-100 border-t border-slate-200 px-6 sm:px-8 flex items-center justify-between text-[11px] font-medium text-slate-500 mt-8 shrink-0">
        <div className="flex gap-6">
          <span>DISK: 1.2GB Vrij</span>
          <span>LATENCY: 42ms</span>
        </div>
        <div className="flex gap-4">
          <span className="uppercase tracking-tighter">Versie 1.0.0-stable</span>
          <span className="text-indigo-600 hidden sm:inline">● Verbonden met Cloudflare Edge</span>
        </div>
      </footer>
    </div>
  );
}
